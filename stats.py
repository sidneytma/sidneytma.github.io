"""
Run the full statistical analysis on the afterimage experiment data.

Requires:
    pip install numpy pandas scipy

Usage:
    Place this file in the same directory as data.csv, then run:
        python run_analysis.py

The script prints a structured report to stdout, organized into five sections:
  1. Data summary
  2. Inversion test (vs. 180° flip)
  3. Model fits and comparison
  4. Variance partitioning
  5. Involution test (skipped if no second-pass trials are present)
"""

import numpy as np
import pandas as pd
from scipy import stats, optimize


# =============================================================================
# Color models
# =============================================================================

D65_XYZ = np.array([95.047, 100.000, 108.883])

# Hunt-Pointer-Estevez normalized to D65 (LMS cone fundamentals)
M_XYZ_to_LMS = np.array([
    [ 0.4002, 0.7076, -0.0808],
    [-0.2263, 1.1653,  0.0457],
    [ 0.0000, 0.0000,  0.9182],
])
M_LMS_to_XYZ = np.linalg.inv(M_XYZ_to_LMS)

L_STAR, C_STAR = 50.0, 39.0


def _f_uv(XYZ):
    X, Y, Z = XYZ[..., 0], XYZ[..., 1], XYZ[..., 2]
    denom = X + 15 * Y + 3 * Z
    denom = np.where(denom == 0, 1e-12, denom)
    return 4 * X / denom, 9 * Y / denom


def XYZ_to_Luv(XYZ, white=D65_XYZ):
    Y = XYZ[..., 1]
    Yn = white[1]
    yr = Y / Yn
    L = np.where(yr > (6 / 29) ** 3, 116 * np.cbrt(yr) - 16, (29 / 3) ** 3 * yr)
    u_p, v_p = _f_uv(XYZ)
    un_p, vn_p = _f_uv(white[None, :])
    u = 13 * L * (u_p - un_p)
    v = 13 * L * (v_p - vn_p)
    return np.stack([L, u, v], axis=-1)


def Luv_to_XYZ(Luv, white=D65_XYZ):
    L, u, v = Luv[..., 0], Luv[..., 1], Luv[..., 2]
    Yn = white[1]
    un_p, vn_p = _f_uv(white[None, :])
    un_p, vn_p = un_p[0], vn_p[0]
    Y = np.where(L > 8, Yn * ((L + 16) / 116) ** 3, Yn * L * (3 / 29) ** 3)
    L_safe = np.where(L == 0, 1e-12, L)
    u_p = u / (13 * L_safe) + un_p
    v_p = v / (13 * L_safe) + vn_p
    X = Y * (9 * u_p) / (4 * v_p)
    Z = Y * (12 - 3 * u_p - 20 * v_p) / (4 * v_p)
    return np.stack([X, Y, Z], axis=-1)


def hue_to_Luv(hue_deg, L=L_STAR, C=C_STAR):
    h = np.deg2rad(np.atleast_1d(np.asarray(hue_deg, dtype=float)))
    u = C * np.cos(h)
    v = C * np.sin(h)
    L_arr = np.full_like(h, L)
    return np.stack([L_arr, u, v], axis=-1)


def circular_diff(a, b):
    """Signed difference a - b on the hue circle, in [-180, 180]."""
    return (a - b + 180) % 360 - 180


def circ_mean(angles):
    rad = np.deg2rad(angles)
    return np.rad2deg(np.arctan2(np.mean(np.sin(rad)), np.mean(np.cos(rad)))) % 360


def circ_sd(angles):
    """Circular SD in degrees."""
    rad = np.deg2rad(angles)
    R = np.sqrt(np.mean(np.cos(rad)) ** 2 + np.mean(np.sin(rad)) ** 2)
    if R <= 0:
        return float('nan')
    return np.rad2deg(np.sqrt(-2 * np.log(R)))


def model_180_flip(hue_in):
    return np.mod(hue_in + 180, 360)


def model_von_kries(hue_in, alpha=1.0, L=L_STAR, C=C_STAR, white=D65_XYZ):
    Luv_in = hue_to_Luv(hue_in, L=L, C=C)
    XYZ_in = Luv_to_XYZ(Luv_in)
    LMS_in = XYZ_in @ M_XYZ_to_LMS.T
    LMS_white = white @ M_XYZ_to_LMS.T
    LMS_after = LMS_white * (LMS_white / LMS_in) ** alpha
    XYZ_after = LMS_after @ M_LMS_to_XYZ.T
    Luv_after = XYZ_to_Luv(XYZ_after)
    return np.mod(np.rad2deg(np.arctan2(Luv_after[..., 2], Luv_after[..., 1])), 360)


def model_opponent_independent(hue_in, g_rg=1.0, g_yb=1.0, L=L_STAR, C=C_STAR):
    Luv_in = hue_to_Luv(hue_in, L=L, C=C)
    u, v = Luv_in[..., 1], Luv_in[..., 2]
    return np.mod(np.rad2deg(np.arctan2(-g_yb * v, -g_rg * u)), 360)


def model_two_stage(hue_in, alpha=1.0, g_rg=1.0, g_yb=1.0, L=L_STAR, C=C_STAR, white=D65_XYZ):
    """Two-stage model: von Kries cone adaptation, then opponent gain in CIELUV."""
    Luv_in = hue_to_Luv(hue_in, L=L, C=C)
    XYZ_in = Luv_to_XYZ(Luv_in)
    LMS_in = XYZ_in @ M_XYZ_to_LMS.T
    LMS_white = white @ M_XYZ_to_LMS.T
    LMS_after = LMS_white * (LMS_white / LMS_in) ** alpha
    XYZ_after = LMS_after @ M_LMS_to_XYZ.T
    Luv_after = XYZ_to_Luv(XYZ_after)
    u, v = Luv_after[..., 1], Luv_after[..., 2]
    return np.mod(np.rad2deg(np.arctan2(g_yb * v, g_rg * u)), 360)


# =============================================================================
# Helpers
# =============================================================================

def section(title):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def subsection(title):
    print()
    print(title)
    print("-" * len(title))


def is_integer_hue(h):
    """Return True if h is (approximately) a whole degree."""
    return abs(h - round(h)) < 1e-6


# =============================================================================
# Load and split data
# =============================================================================

df = pd.read_csv('data.csv')

# Heuristic: the "main cohort" is the 12 evenly-spaced integer hues at 30° intervals.
# The "involution cohort" is anything else (typically non-integer afterimage hues).
EVENLY = [float(h) for h in range(0, 360, 30)]
main = df[df['inducer_huv_deg'].isin(EVENLY)].copy().reset_index(drop=True)
involution = df[~df['inducer_huv_deg'].isin(EVENLY)].copy().reset_index(drop=True)

inducers = main['inducer_huv_deg'].values
responses = main['response_huv_deg'].values
n_main = len(main)


# =============================================================================
# Section 1 — Data summary
# =============================================================================

section("1. DATA SUMMARY")

print(f"Total trials in file:          {len(df)}")
print(f"Main-cohort trials (12 hues):  {n_main}")
print(f"Involution-cohort trials:      {len(involution)}")
if len(involution) > 0:
    inv_hues = sorted(involution['inducer_huv_deg'].unique())
    print(f"Involution inducer hues:       {len(inv_hues)} distinct values")
    print(f"  example: {inv_hues[0]:.2f}, {inv_hues[1]:.2f}, ...")
else:
    print("Involution cohort: NOT PRESENT (section 5 will be skipped)")

subsection("Per-hue response statistics (main cohort)")
print(f"{'hue':>6}  {'n':>3}  {'mean resp':>10}  {'circ SD':>8}")
within_cell_devs = []
for h in EVENLY:
    sub = main.loc[main['inducer_huv_deg'] == h, 'response_huv_deg'].values
    mr = circ_mean(sub)
    sd = circ_sd(sub)
    print(f"{h:6.1f}  {len(sub):3d}  {mr:10.2f}  {sd:8.2f}")
    # Collect within-cell deviations for the noise-floor estimate
    within_cell_devs.extend(circular_diff(sub, mr))

within_cell_devs = np.array(within_cell_devs)
noise_floor = np.std(within_cell_devs, ddof=1)
print(f"\nNoise floor (pooled within-condition SD): {noise_floor:.2f}°")


# =============================================================================
# Section 2 — Inversion test
# =============================================================================

section("2. INVERSION TEST (deviation from 180° flip)")

main['pred_180'] = (main['inducer_huv_deg'] + 180) % 360
main['dev_from_180'] = circular_diff(main['response_huv_deg'].values,
                                     main['pred_180'].values)

subsection("Per-hue signed deviation from 180° (with 95% CI and t-test vs. 0)")
print(f"{'hue':>6}  {'mean dev':>9}  {'sd':>6}  {'95% CI':>20}  {'t':>7}  {'p':>10}")
per_hue = []
for h in EVENLY:
    devs = main.loc[main['inducer_huv_deg'] == h, 'dev_from_180'].values
    m, sd, n = np.mean(devs), np.std(devs, ddof=1), len(devs)
    ci_lo, ci_hi = stats.t.interval(0.95, n - 1, loc=m, scale=stats.sem(devs))
    t, p = stats.ttest_1samp(devs, 0.0)
    per_hue.append({'hue': h, 'mean': m, 'sd': sd, 'ci_lo': ci_lo, 'ci_hi': ci_hi,
                    't': t, 'p': p})
    print(f"{h:6.1f}  {m:9.2f}  {sd:6.2f}  [{ci_lo:7.2f},{ci_hi:7.2f}]  "
          f"{t:7.2f}  {p:10.4f}")

all_dev = main['dev_from_180'].values
overall_signed = np.mean(all_dev)
overall_abs = np.mean(np.abs(all_dev))
print(f"\nOverall mean signed deviation: {overall_signed:+.2f}°")
print(f"Overall mean ABSOLUTE deviation: {overall_abs:.2f}°")
print(f"  (compare to noise floor {noise_floor:.2f}° — bias is "
      f"{'larger than' if overall_abs > noise_floor else 'within'} noise)")

# Identify max overshoot and undershoot
max_over = max(per_hue, key=lambda r: r['mean'])
max_under = min(per_hue, key=lambda r: r['mean'])
print(f"\nMax overshoot:  hue {max_over['hue']:.0f}°  "
      f"({max_over['mean']:+.2f}°, p = {max_over['p']:.4f})")
print(f"Max undershoot: hue {max_under['hue']:.0f}°  "
      f"({max_under['mean']:+.2f}°, p = {max_under['p']:.4f})")

# One-way ANOVA: is deviation systematically dependent on hue?
groups = [main.loc[main['inducer_huv_deg'] == h, 'dev_from_180'].values
          for h in EVENLY]
F, p_anova = stats.f_oneway(*groups)
ss_between = sum(len(g) * (np.mean(g) - np.mean(all_dev)) ** 2 for g in groups)
ss_total = np.sum((all_dev - np.mean(all_dev)) ** 2)
eta_sq = ss_between / ss_total
print(f"\nOne-way ANOVA (deviation-from-180 ~ inducer hue):")
print(f"  F({len(groups) - 1}, {n_main - len(groups)}) = {F:.2f}, "
      f"p = {p_anova:.3g}")
print(f"  η² = {eta_sq:.3f}  ({100 * eta_sq:.1f}% of variance explained by hue)")


# =============================================================================
# Section 3 — Model fits and comparison
# =============================================================================

section("3. MODEL FITS AND COMPARISON")

# --- Fits ---
def loss_opp(params):
    g_rg, g_yb = params
    if g_rg <= 0 or g_yb <= 0:
        return 1e10
    pred = model_opponent_independent(inducers, g_rg=g_rg, g_yb=g_yb)
    return np.mean(circular_diff(responses, pred) ** 2)

g_rg_opp, g_yb_opp = optimize.minimize(
    loss_opp, x0=[1, 1], method='Nelder-Mead',
    options={'xatol': 1e-7, 'fatol': 1e-9}
).x


def loss_two_stage(params):
    g_rg, g_yb = params
    if g_rg <= 0 or g_yb <= 0:
        return 1e10
    pred = model_two_stage(inducers, alpha=1.0, g_rg=g_rg, g_yb=g_yb)
    return np.mean(circular_diff(responses, pred) ** 2)

g_rg_ts, g_yb_ts = optimize.minimize(
    loss_two_stage, x0=[1, 1], method='Nelder-Mead',
    options={'xatol': 1e-7, 'fatol': 1e-9}
).x


# Bootstrap CIs (1000 resamples)
def bootstrap_gains(loss_fn, x0, n_boot=1000, seed=42):
    rng = np.random.default_rng(seed)
    boot = []
    for _ in range(n_boot):
        idx = rng.integers(0, n_main, n_main)
        inds_b, resps_b = inducers[idx], responses[idx]

        def loss_b(params):
            g_rg, g_yb = params
            if g_rg <= 0 or g_yb <= 0:
                return 1e10
            # Reconstruct loss using the same model identity as the outer function
            return loss_fn(params, inds_b, resps_b)

        o = optimize.minimize(loss_b, x0=x0, method='Nelder-Mead',
                              options={'xatol': 1e-4, 'fatol': 1e-6, 'maxiter': 500})
        boot.append(o.x)
    return np.array(boot)


def loss_opp_data(params, inds, resps):
    g_rg, g_yb = params
    if g_rg <= 0 or g_yb <= 0:
        return 1e10
    pred = model_opponent_independent(inds, g_rg=g_rg, g_yb=g_yb)
    return np.mean(circular_diff(resps, pred) ** 2)


def loss_ts_data(params, inds, resps):
    g_rg, g_yb = params
    if g_rg <= 0 or g_yb <= 0:
        return 1e10
    pred = model_two_stage(inds, alpha=1.0, g_rg=g_rg, g_yb=g_yb)
    return np.mean(circular_diff(resps, pred) ** 2)


print("Bootstrapping 95% CIs (1000 resamples)...")
boot_opp = bootstrap_gains(loss_opp_data, x0=[g_rg_opp, g_yb_opp])
boot_ts = bootstrap_gains(loss_ts_data, x0=[g_rg_ts, g_yb_ts])

opp_ci = np.percentile(boot_opp, [2.5, 97.5], axis=0)
ts_ci = np.percentile(boot_ts, [2.5, 97.5], axis=0)

subsection("Fitted parameters")
print(f"Opponent (independent gains):")
print(f"  g_rg = {g_rg_opp:.3f}  95% CI [{opp_ci[0,0]:.3f}, {opp_ci[1,0]:.3f}]")
print(f"  g_yb = {g_yb_opp:.3f}  95% CI [{opp_ci[0,1]:.3f}, {opp_ci[1,1]:.3f}]")
print(f"Two-stage model (α=1, opp gains fitted):")
print(f"  g_rg = {g_rg_ts:.3f}  95% CI [{ts_ci[0,0]:.3f}, {ts_ci[1,0]:.3f}]")
print(f"  g_yb = {g_yb_ts:.3f}  95% CI [{ts_ci[0,1]:.3f}, {ts_ci[1,1]:.3f}]")
print(f"  (CIs not including 1.0 indicate gains differ from pure von Kries)")

# --- Predictions and residuals ---
pred_180 = model_180_flip(inducers)
pred_opp = model_opponent_independent(inducers, g_rg=g_rg_opp, g_yb=g_yb_opp)
pred_vk = model_von_kries(inducers, alpha=1.0)
pred_ts = model_two_stage(inducers, alpha=1.0, g_rg=g_rg_ts, g_yb=g_yb_ts)

res_180 = circular_diff(responses, pred_180)
res_opp = circular_diff(responses, pred_opp)
res_vk = circular_diff(responses, pred_vk)
res_ts = circular_diff(responses, pred_ts)

subsection("Residuals (degrees)")
print(f"{'model':35} {'k':>3}  {'mean abs':>9}  {'RMS':>7}  {'median abs':>11}")
for name, r, k in [
    ('180° flip',                       res_180, 0),
    ('Opponent (fitted)',               res_opp, 2),
    ('von Kries (α=1)',                 res_vk,  0),
    ('Two-stage (α=1, opp fitted)',     res_ts,  2),
]:
    print(f"{name:35} {k:3d}  {np.mean(np.abs(r)):9.3f}  "
          f"{np.sqrt(np.mean(r**2)):7.3f}  {np.median(np.abs(r)):11.3f}")

# --- Paired tests ---
subsection("Paired tests of |residual| (lower is better)")

def paired_test(label, r1, r2):
    a1, a2 = np.abs(r1), np.abs(r2)
    diff = a1 - a2
    t, pt = stats.ttest_rel(a1, a2)
    try:
        _, pw = stats.wilcoxon(a1, a2)
    except ValueError:
        pw = float('nan')
    print(f"  {label}")
    print(f"    mean |residual| diff: {np.mean(diff):+.3f}°    "
          f"paired t = {t:6.2f}  p = {pt:.3g}    Wilcoxon p = {pw:.3g}")

paired_test("180° flip  vs  von Kries",         res_180, res_vk)
paired_test("Opponent   vs  von Kries",         res_opp, res_vk)
paired_test("Opponent   vs  Two-stage",         res_opp, res_ts)
paired_test("von Kries  vs  Two-stage",         res_vk,  res_ts)

# --- Information criteria ---
subsection("Information criteria (Gaussian residuals)")
print(f"{'model':35} {'k':>3}  {'logL':>10}  {'AIC':>10}  {'BIC':>10}")
for name, r, k in [
    ('180° flip',                       res_180, 0),
    ('Opponent (fitted)',               res_opp, 2),
    ('von Kries (α=1)',                 res_vk,  0),
    ('Two-stage (α=1, opp fitted)',     res_ts,  2),
]:
    sigma2 = np.sum(r**2) / n_main
    ll = -0.5 * n_main * (np.log(2 * np.pi * sigma2) + 1)
    aic = 2 * k - 2 * ll
    bic = np.log(n_main) * k - 2 * ll
    print(f"{name:35} {k:3d}  {ll:10.1f}  {aic:10.1f}  {bic:10.1f}")

# --- Nested F-tests ---
subsection("Nested F-tests")
def f_test(name, ss_red, k_red, ss_full, k_full):
    df1 = k_full - k_red
    df2 = n_main - k_full
    F = ((ss_red - ss_full) / df1) / (ss_full / df2)
    p = 1 - stats.f.cdf(F, df1, df2)
    print(f"  {name}")
    print(f"    F({df1}, {df2}) = {F:.2f}, p = {p:.3g}")

ss_180 = np.sum(res_180**2)
ss_opp = np.sum(res_opp**2)
ss_vk  = np.sum(res_vk**2)
ss_ts  = np.sum(res_ts**2)

f_test("Pure von Kries → Two-stage (does the opponent stage help?)",
       ss_vk, 0, ss_ts, 2)
# Note: a nested F-test of Opponent vs. Two-stage is not valid here because both
# models have k=2 free parameters; they are not nested. Use the paired tests above
# and the AIC/BIC differences instead.


# =============================================================================
# Section 4 — Variance partitioning
# =============================================================================

section("4. VARIANCE PARTITIONING")

total = ss_180 - ss_ts
opp_alone = ss_180 - ss_opp
vk_alone = ss_180 - ss_vk
opp_marginal = ss_vk - ss_ts
vk_marginal = ss_opp - ss_ts

print(f"Residual sum of squares (lower = better fit):")
print(f"  180° flip baseline:                 SSR = {ss_180:8.1f}")
print(f"  Opponent only (fitted):             SSR = {ss_opp:8.1f}")
print(f"  von Kries only (α=1):               SSR = {ss_vk:8.1f}")
print(f"  Two-stage (α=1, opp fitted):        SSR = {ss_ts:8.1f}")

print(f"\nImprovements relative to 180° flip baseline:")
print(f"  Total improvement (180° → two-stage):  {total:.1f}")
print(f"  Opponent stage ALONE:                  {opp_alone:.1f}  "
      f"({100*opp_alone/total:.1f}% of total)")
print(f"  von Kries stage ALONE:                 {vk_alone:.1f}  "
      f"({100*vk_alone/total:.1f}% of total)")
print(f"  Marginal opponent (over von Kries):    {opp_marginal:.1f}  "
      f"({100*opp_marginal/total:.1f}% of total)")
print(f"  Marginal von Kries (over opponent):    {vk_marginal:.1f}  "
      f"({100*vk_marginal/total:.1f}% of total)")

print(f"\nInterpretation: the cone stage explains roughly "
      f"{vk_alone/(opp_alone):.1f}× as much as the opponent stage on its own.")


# =============================================================================
# Section 5 — Involution test (only if data present)
# =============================================================================

section("5. INVOLUTION TEST (afterimage of afterimage)")

if len(involution) == 0:
    print("No involution-cohort trials in this dataset. Section skipped.")
else:
    # For each main-cohort hue, find the matching second-pass inducer (the closest
    # involution-cohort hue to the main cohort's mean response).
    mean_response_by_hue = {
        h: circ_mean(main.loc[main['inducer_huv_deg'] == h, 'response_huv_deg'].values)
        for h in EVENLY
    }
    inv_inducers = involution['inducer_huv_deg'].unique()

    subsection("Per-original-hue: does the second-pass return to the original?")
    print(f"{'orig':>6}  {'AI (2nd inducer)':>17}  {'2nd response':>14}  "
          f"{'dist to orig':>13}  n")

    rows = []
    all_inv_devs = []  # per-trial deviations of 2nd response from original
    for orig in EVENLY:
        ai = mean_response_by_hue[orig]
        closest = inv_inducers[np.argmin(np.abs(circular_diff(inv_inducers, ai)))]
        if abs(circular_diff(closest, ai)) > 5:
            # No matching inducer in the involution data — skip this hue
            continue
        sub = involution[involution['inducer_huv_deg'] == closest]
        second_resp = circ_mean(sub['response_huv_deg'].values)
        dist = circular_diff(second_resp, orig)
        rows.append({'orig': orig, 'ai': ai, 'second': second_resp, 'dist': dist,
                     'n': len(sub)})
        all_inv_devs.extend(circular_diff(sub['response_huv_deg'].values, orig))
        print(f"{orig:6.1f}  {ai:17.2f}  {second_resp:14.2f}  "
              f"{dist:+13.2f}  {len(sub):d}")

    if rows:
        all_inv_devs = np.array(all_inv_devs)
        mean_abs_dist = np.mean([abs(r['dist']) for r in rows])
        median_abs_dist = np.median([abs(r['dist']) for r in rows])
        print(f"\nMean |distance from original| (across hues):   {mean_abs_dist:.2f}°")
        print(f"Median |distance from original| (across hues): {median_abs_dist:.2f}°")
        print(f"  (compare to noise floor {noise_floor:.2f}°)")

        # Per-trial t-test: are the 2nd-pass responses systematically displaced from origs?
        t_inv, p_inv = stats.ttest_1samp(all_inv_devs, 0.0)
        print(f"\nPer-trial deviation of 2nd response from original:")
        print(f"  signed mean = {np.mean(all_inv_devs):+.2f}°  "
              f"sd = {np.std(all_inv_devs, ddof=1):.2f}°  n = {len(all_inv_devs)}")
        print(f"  one-sample t-test vs. 0: t = {t_inv:.2f}, p = {p_inv:.3g}")
        print(f"  mean |deviation| = {np.mean(np.abs(all_inv_devs)):.2f}°")

        # Same-bias test: is the second-pass deviation correlated with first-pass deviation?
        first_devs = np.array([circular_diff(r['ai'], (r['orig'] + 180) % 360)
                               for r in rows])
        second_devs = np.array([r['dist'] for r in rows])
        if len(first_devs) >= 3:
            corr, p_corr = stats.pearsonr(first_devs, second_devs)
            print(f"\nIs the 'warm-overshoots, cool-undershoots' bias preserved on the 2nd pass?")
            print(f"  Pearson r between 1st-pass deviation and 2nd-pass deviation: "
                  f"r = {corr:+.3f}, p = {p_corr:.3g}")
            print(f"  (positive r means the same hues over/undershoot on both passes)")
    else:
        print("Could not match any involution inducers to main-cohort response means.")


print()
print("=" * 78)