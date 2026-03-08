// ── Utility ───────────────────────────────────────────────────────────────
function getN() {
    return parseInt(document.getElementById('n-input').value);
}

// ── Seeded RNG (Mulberry32) ───────────────────────────────────────────────
let rng = Math.random;

function initRNG() {
    const seedVal = document.getElementById('seed-input').value;
    if (seedVal === '') {
    rng = Math.random;
    } else {
    let s = parseInt(seedVal) >>> 0;
    rng = function() {
        s += 0x6d2b79f5;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    }
}

// ── Tokenizer ─────────────────────────────────────────────────────────────
function tokenize(text) {
    return text
    .toLowerCase()
    .replace(/([.,!?;:()\[\]"'\u201c\u201d\u2018\u2019])/g, ' $1 ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
}

// ── Table builders ────────────────────────────────────────────────────────
let table = {};
let tables = {};

function buildTableForN(n) {
    if (tables[n]) return tables[n];
    const t = {};
    if (n === 1) {
    for (const token of tokens) {
        t[token] = (t[token] || 0) + 1;
    }
    } else {
    for (let i = 0; i <= tokens.length - n; i++) {
        const ctx = tokens.slice(i, i + n - 1).join('|');
        const next = tokens[i + n - 1];
        if (!t[ctx]) t[ctx] = {};
        t[ctx][next] = (t[ctx][next] || 0) + 1;
    }
    }
    tables[n] = t;
    return t;
}

function buildTable(n) {
    const t0 = performance.now();
    tables = {};
    table = buildTableForN(n);
    const elapsed = (performance.now() - t0).toFixed(1);
    document.getElementById('stats-buildtime').textContent = elapsed + ' ms';
    document.getElementById('stat-buildtime').textContent = elapsed + ' ms';

    // unique contexts
    const uniqueContexts = Object.keys(table).length;
    document.getElementById('stats-contexts').textContent = uniqueContexts.toLocaleString();

    // average continuations
    if (n === 1) {
    document.getElementById('stats-avgcont').textContent = 'N/A';
    } else {
    const counts = Object.values(table).map(c => Object.keys(c).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    document.getElementById('stats-avgcont').textContent = avg.toFixed(2);
    }
}

// ── Corpus processing ─────────────────────────────────────────────────────
let rawText = '';
let uploadedText = '';
let tokens = [];

function processCorpus() {
    tokens = tokenize(rawText);
    const uniqueCount = new Set(tokens).size;
    document.getElementById('stats-tokens').textContent = tokens.length.toLocaleString();
    document.getElementById('stats-unique').textContent = uniqueCount.toLocaleString();
    document.getElementById('stat-tokens').textContent = tokens.length.toLocaleString();
    document.getElementById('stat-unique').textContent = uniqueCount.toLocaleString();
    buildTable(getN());
    context = null;
    output = [];
    renderOutput();
    updateTopWords();
}

function updateTopWords() {
    const unigrams = buildTableForN(1);
    const sorted = Object.entries(unigrams)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
    const list = document.getElementById('stats-topwords-list');
    list.innerHTML = sorted.map(([word, count]) =>
    `<li>${word} <span style="color:#aaa">(${count})</span></li>`
    ).join('');
}

async function loadDefaultCorpus() {
const res = await fetch('text/philosophy.txt');
rawText = await res.text();
processCorpus();
}

// ── Sampler ───────────────────────────────────────────────────────────────
function sample(candidates) {
    const words = Object.keys(candidates);
    const counts = Object.values(candidates);
    const total = counts.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < words.length; i++) {
    r -= counts[i];
    if (r <= 0) return words[i];
    }
    return words[words.length - 1];
}

function getNextWord(context, n) {
    const backoff = document.getElementById('backoff-toggle').checked;
    if (n === 1) return sample(table);
    for (let level = n; level >= 1; level--) {
    const t = buildTableForN(level);
    if (level === 1) return sample(t);
    const key = context.slice(context.length - (level - 1)).join('|');
    if (key in t) return sample(t[key]);
    if (!backoff) break;
    }
    return null;
}

// ── Generation state ──────────────────────────────────────────────────────
let context = [];
let output = [];

function randomContext(n) {
    if (n === 1) return [];
    const keys = Object.keys(table);
    const key = keys[Math.floor(rng() * keys.length)];
    return key.split('|');
}

function slideContext(ctx, newWord, n) {
    if (n === 1) return [];
    return ctx.slice(1).concat(newWord);
}

function generateOne() {
    const n = getN();
    const nextWord = getNextWord(context, n);
    if (nextWord === null) {
    context = randomContext(n);
    output.push(null);
    return;
    }
    output.push(nextWord);
    context = slideContext(context, nextWord, n);
}

// ── Render ────────────────────────────────────────────────────────────────
const PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', ')', ']', '"', '\u201d', '\u2019']);

function joinTokens(toks) {
    let result = '';
    for (const token of toks) {
    if (token === null) {
        result += ' <span class="restart-marker">|</span> ';
    } else if (PUNCTUATION.has(token)) {
        result += token;
    } else {
        result += (result ? ' ' : '') + token;
    }
    }
    return result;
}

function renderAnalysis() {
    const n = getN();
    const candidatesDiv = document.getElementById('analysis-candidates');
    const unseenMsg = document.getElementById('analysis-unseen-msg');

    // context display
    if (n === 1 || context === null) {
    document.getElementById('context-display').textContent = '___';
    } else {
    document.getElementById('context-display').innerHTML = joinTokens(context) + ' <span style="color:#aaa">___</span>';
    }

    // get candidates
    let candidates = {};
    if (n === 1) {
    candidates = table;
    } else if (context !== null) {
    const key = context.join('|');
    if (key in table) candidates = table[key];
    }

    // if no candidates found
    if (Object.keys(candidates).length === 0) {
    candidatesDiv.hidden = true;
    unseenMsg.hidden = false;
    const backoff = document.getElementById('backoff-toggle').checked;
    unseenMsg.textContent = backoff
        ? 'Unseen context.'
        : 'Unseen context.';
    return;
    }

    unseenMsg.hidden = true;
    candidatesDiv.hidden = false;

    // sort and take top 5
    const total = Object.values(candidates).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(candidates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

    // render rows
    candidatesDiv.innerHTML = sorted.map(([word, count]) => {
    const prob = count / total;
    const pct = (prob * 100).toFixed(1) + '%';
    return `
        <div class="candidate">
        <span class="candidate-word">${word}</span>
        <div class="candidate-bar-wrap">
            <div class="candidate-bar" style="width:${pct}"></div>
        </div>
        <span class="candidate-prob">${pct}</span>
        </div>`;
    }).join('');
}

function renderOutput() {
    const div = document.getElementById('output-text');
    div.innerHTML = joinTokens(output);
    setTimeout(() => { div.scrollTop = div.scrollHeight; }, 0);
    renderAnalysis();
}

function getMaxLength() {
    return parseInt(document.getElementById('length-input').value);
}

function wordCount() {
    return output.filter(t => t !== null).length;
}
let autoplayInterval = null;

function setAutoplay(on) {
    if (on) {
    initRNG();
    if (output.length === 0) context = randomContext(getN());
    autoplayInterval = setInterval(() => {
        generateOne();
        renderOutput();
        if (wordCount() >= getMaxLength()) setAutoplay(false);
    }, 1000);
    document.getElementById('btn-autoplay').textContent = 'Stop';
    } else {
    clearInterval(autoplayInterval);
    autoplayInterval = null;
    document.getElementById('btn-autoplay').textContent = 'Autoplay';
    }
}

// ── Event handlers ────────────────────────────────────────────────────────
function onNextWord() {
    if (autoplayInterval !== null) setAutoplay(false);
    if (output.length === 0) {
    initRNG();
    context = randomContext(getN());
    }
    generateOne();
    renderOutput();
}

function onAutoplay() {
    setAutoplay(autoplayInterval === null);
}

function onReset() {
    setAutoplay(false);
    initRNG();
    context = randomContext(getN());
    output = [];
    renderOutput();
}

function onNChange() {
    setAutoplay(false);
    buildTable(getN());
    context = null;
    output = [];
    renderOutput();
}

function onCorpusSourceChange(radio) {
    const isUpload = radio.value === 'upload';
    document.getElementById('file-upload').disabled = !isUpload;
    document.getElementById('view-source-link').hidden = isUpload;
    if (!isUpload) {
    loadDefaultCorpus();
    } else if (uploadedText) {
    rawText = uploadedText;
    processCorpus();
    }
}

function onFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
    uploadedText = ev.target.result;
    rawText = uploadedText;
    processCorpus();
    };
    reader.readAsText(file);
}

// ── Init ──────────────────────────────────────────────────────────────────
loadDefaultCorpus();