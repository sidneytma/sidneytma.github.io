var ctx = new (window.AudioContext || window.webkitAudioContext)();
var gainNode = ctx.createGain();
gainNode.connect(ctx.destination);
gainNode.gain.value = 0.3;

var analyser = ctx.createAnalyser();
analyser.fftSize = 8192;
analyser.smoothingTimeConstant = 0.8;
gainNode.connect(analyser);

var freqData = new Uint8Array(analyser.frequencyBinCount);

var source = null;
var playing = false;
var beta = 0;
var buffers = {};
var animationId = null;
var waveformOffset = 0;
var lightOpacity = 0;

var cieData = [
    [380, 0.0014, 0.0000, 0.0065], [385, 0.0022, 0.0001, 0.0105],
    [390, 0.0042, 0.0001, 0.0201], [395, 0.0076, 0.0002, 0.0362],
    [400, 0.0143, 0.0004, 0.0679], [405, 0.0232, 0.0006, 0.1102],
    [410, 0.0435, 0.0012, 0.2074], [415, 0.0776, 0.0022, 0.3713],
    [420, 0.1344, 0.0040, 0.6456], [425, 0.2148, 0.0073, 1.0391],
    [430, 0.2839, 0.0116, 1.3856], [435, 0.3285, 0.0168, 1.6230],
    [440, 0.3483, 0.0230, 1.7471], [445, 0.3481, 0.0298, 1.7826],
    [450, 0.3362, 0.0380, 1.7721], [455, 0.3187, 0.0480, 1.7441],
    [460, 0.2908, 0.0600, 1.6692], [465, 0.2511, 0.0739, 1.5281],
    [470, 0.1954, 0.0910, 1.2876], [475, 0.1421, 0.1126, 1.0419],
    [480, 0.0956, 0.1390, 0.8130], [485, 0.0580, 0.1693, 0.6162],
    [490, 0.0320, 0.2080, 0.4652], [495, 0.0147, 0.2586, 0.3533],
    [500, 0.0049, 0.3230, 0.2720], [505, 0.0024, 0.4073, 0.2123],
    [510, 0.0093, 0.5030, 0.1582], [515, 0.0291, 0.6082, 0.1117],
    [520, 0.0633, 0.7100, 0.0782], [525, 0.1096, 0.7932, 0.0573],
    [530, 0.1655, 0.8620, 0.0422], [535, 0.2257, 0.9149, 0.0298],
    [540, 0.2904, 0.9540, 0.0203], [545, 0.3597, 0.9803, 0.0134],
    [550, 0.4334, 0.9950, 0.0087], [555, 0.5121, 1.0000, 0.0057],
    [560, 0.5945, 0.9950, 0.0039], [565, 0.6784, 0.9786, 0.0027],
    [570, 0.7621, 0.9520, 0.0021], [575, 0.8425, 0.9154, 0.0018],
    [580, 0.9163, 0.8700, 0.0017], [585, 0.9786, 0.8163, 0.0014],
    [590, 1.0263, 0.7570, 0.0011], [595, 1.0567, 0.6949, 0.0010],
    [600, 1.0622, 0.6310, 0.0008], [605, 1.0456, 0.5668, 0.0006],
    [610, 1.0026, 0.5030, 0.0003], [615, 0.9384, 0.4412, 0.0002],
    [620, 0.8544, 0.3810, 0.0002], [625, 0.7514, 0.3210, 0.0001],
    [630, 0.6424, 0.2650, 0.0000], [635, 0.5419, 0.2170, 0.0000],
    [640, 0.4479, 0.1750, 0.0000], [645, 0.3608, 0.1382, 0.0000],
    [650, 0.2835, 0.1070, 0.0000], [655, 0.2187, 0.0816, 0.0000],
    [660, 0.1649, 0.0610, 0.0000], [665, 0.1212, 0.0446, 0.0000],
    [670, 0.0874, 0.0320, 0.0000], [675, 0.0636, 0.0232, 0.0000],
    [680, 0.0468, 0.0170, 0.0000], [685, 0.0329, 0.0119, 0.0000],
    [690, 0.0227, 0.0082, 0.0000], [695, 0.0158, 0.0057, 0.0000],
    [700, 0.0114, 0.0041, 0.0000], [705, 0.0081, 0.0029, 0.0000],
    [710, 0.0058, 0.0021, 0.0000], [715, 0.0041, 0.0015, 0.0000],
    [720, 0.0029, 0.0010, 0.0000], [725, 0.0020, 0.0007, 0.0000],
    [730, 0.0014, 0.0005, 0.0000], [735, 0.0010, 0.0004, 0.0000],
    [740, 0.0007, 0.0002, 0.0000], [745, 0.0005, 0.0002, 0.0000],
    [750, 0.0003, 0.0001, 0.0000], [755, 0.0002, 0.0001, 0.0000],
    [760, 0.0002, 0.0001, 0.0000], [765, 0.0001, 0.0000, 0.0000],
    [770, 0.0001, 0.0000, 0.0000], [775, 0.0001, 0.0000, 0.0000],
    [780, 0.0000, 0.0000, 0.0000]
];

var xyzToRgb = [
    [ 3.2406, -1.5372, -0.4986],
    [-0.9689,  1.8758,  0.0415],
    [ 0.0557, -0.2040,  1.0570]
];

var labels = {
    '-4': '',
    '-3': '',
    '-2': 'Violet Noise',
    '-1': 'Blue Noise',
    '0': 'White Noise',
    '1': 'Pink Noise',
    '2': 'Brown Noise',
    '3': '',
    '4': ''
};

var labelColors = {
    '-2': '#9333ea',
    '-1': '#3b82f6',
    '0': '#ffffff',
    '1': '#ec4899',
    '2': '#a16207'
};

function gammaCorrect(val) {
    if (val <= 0.0031308) {
    return 12.92 * val;
    } else {
    return 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
    }
}

function calculateLightSpectrum(b) {
    var wavelengths = [];
    var XYZ = [];
    
    for (var i = 0; i < cieData.length; i++) {
    wavelengths.push(cieData[i][0]);
    XYZ.push([cieData[i][1], cieData[i][2], cieData[i][3]]);
    }
    
    var powerWeights = [];
    for (var i = 0; i < wavelengths.length; i++) {
    var freq = 299792458 / (wavelengths[i] * 1e-9);
    powerWeights.push(Math.pow(freq, -b));
    }
    
    var weightedXYZ = [];
    for (var i = 0; i < XYZ.length; i++) {
    weightedXYZ.push([
        XYZ[i][0] * powerWeights[i],
        XYZ[i][1] * powerWeights[i],
        XYZ[i][2] * powerWeights[i]
    ]);
    }
    
    var RGB = [];
    for (var i = 0; i < weightedXYZ.length; i++) {
    var r = xyzToRgb[0][0] * weightedXYZ[i][0] + xyzToRgb[0][1] * weightedXYZ[i][1] + xyzToRgb[0][2] * weightedXYZ[i][2];
    var g = xyzToRgb[1][0] * weightedXYZ[i][0] + xyzToRgb[1][1] * weightedXYZ[i][1] + xyzToRgb[1][2] * weightedXYZ[i][2];
    var b2 = xyzToRgb[2][0] * weightedXYZ[i][0] + xyzToRgb[2][1] * weightedXYZ[i][1] + xyzToRgb[2][2] * weightedXYZ[i][2];
    RGB.push([r, g, b2]);
    }
    
    var globalMax = 0;
    for (var i = 0; i < RGB.length; i++) {
    for (var j = 0; j < 3; j++) {
        if (RGB[i][j] > globalMax) globalMax = RGB[i][j];
    }
    }
    
    var RGBdisplay = [];
    for (var i = 0; i < RGB.length; i++) {
    var r = Math.max(0, Math.min(1, RGB[i][0] / globalMax));
    var g = Math.max(0, Math.min(1, RGB[i][1] / globalMax));
    var b2 = Math.max(0, Math.min(1, RGB[i][2] / globalMax));
    
    r = gammaCorrect(r);
    g = gammaCorrect(g);
    b2 = gammaCorrect(b2);
    
    RGBdisplay.push([r, g, b2]);
    }
    
    var sumXYZ = [0, 0, 0];
    for (var i = 0; i < weightedXYZ.length; i++) {
    sumXYZ[0] += weightedXYZ[i][0];
    sumXYZ[1] += weightedXYZ[i][1];
    sumXYZ[2] += weightedXYZ[i][2];
    }
    
    var sumRGB = [
    xyzToRgb[0][0] * sumXYZ[0] + xyzToRgb[0][1] * sumXYZ[1] + xyzToRgb[0][2] * sumXYZ[2],
    xyzToRgb[1][0] * sumXYZ[0] + xyzToRgb[1][1] * sumXYZ[1] + xyzToRgb[1][2] * sumXYZ[2],
    xyzToRgb[2][0] * sumXYZ[0] + xyzToRgb[2][1] * sumXYZ[1] + xyzToRgb[2][2] * sumXYZ[2]
    ];
    
    var maxChannel = Math.max(sumRGB[0], sumRGB[1], sumRGB[2]);
    sumRGB[0] = Math.max(0, sumRGB[0] / maxChannel);
    sumRGB[1] = Math.max(0, sumRGB[1] / maxChannel);
    sumRGB[2] = Math.max(0, sumRGB[2] / maxChannel);
    
    sumRGB[0] = gammaCorrect(sumRGB[0]);
    sumRGB[1] = gammaCorrect(sumRGB[1]);
    sumRGB[2] = gammaCorrect(sumRGB[2]);
    
    return {
    spectrum: RGBdisplay,
    summated: sumRGB,
    wavelengths: wavelengths
    };
}

function makeNoise(dur, sr, b) {
    var n = Math.floor(sr * dur);
    var out = new Float32Array(n);
    
    for (var i = 0; i < n; i++) {
    out[i] = Math.random() * 2 - 1;
    }
    
    var size = 1;
    while (size < n) size *= 2;
    
    var real = new Float32Array(size);
    var imag = new Float32Array(size);
    
    for (var i = 0; i < n; i++) {
    real[i] = out[i];
    }
    
    fft(real, imag);
    
    var filter = new Float32Array(size / 2 + 1);
    filter[0] = 0;
    
    for (var i = 1; i <= size / 2; i++) {
    var freq = i * sr / size;
    if (freq >= 20 && freq <= 20000) {
        filter[i] = 1 / Math.pow(freq, b / 2);
    } else {
        filter[i] = 0;
    }
    }
    
    var sumSq = 0;
    var count = 0;
    for (var i = 0; i <= size / 2; i++) {
    if (filter[i] > 0) {
        sumSq += filter[i] * filter[i];
        count++;
    }
    }
    var rms = Math.sqrt(sumSq / count);
    if (rms > 0) {
    for (var i = 0; i <= size / 2; i++) {
        filter[i] /= rms;
    }
    }
    
    for (var i = 1; i < size / 2; i++) {
    real[i] *= filter[i];
    imag[i] *= filter[i];
    real[size - i] *= filter[i];
    imag[size - i] *= filter[i];
    }
    
    ifft(real, imag);
    
    for (var i = 0; i < n; i++) {
    out[i] = real[i];
    }
    
    var sumSq = 0;
    for (var i = 0; i < n; i++) {
    sumSq += out[i] * out[i];
    }
    var rms = Math.sqrt(sumSq / n);
    if (rms > 0) {
    for (var i = 0; i < n; i++) {
        out[i] /= rms;
    }
    }
    
    var max = 0;
    for (var i = 0; i < n; i++) {
    if (Math.abs(out[i]) > max) max = Math.abs(out[i]);
    }
    if (max > 1) {
    for (var i = 0; i < n; i++) {
        out[i] /= max;
    }
    }
    
    return out;
}

function fft(re, im) {
    var n = re.length;
    if (n === 1) return;
    
    for (var i = 0, j = 0; i < n; i++) {
    if (j > i) {
        var temp = re[i];
        re[i] = re[j];
        re[j] = temp;
        temp = im[i];
        im[i] = im[j];
        im[j] = temp;
    }
    var m = n / 2;
    while (m >= 1 && j >= m) {
        j -= m;
        m /= 2;
    }
    j += m;
    }
    
    for (var s = 2; s <= n; s *= 2) {
    var half = s / 2;
    var angle = -2 * Math.PI / s;
    var wReal = Math.cos(angle);
    var wImag = Math.sin(angle);
    
    for (var i = 0; i < n; i += s) {
        var wr = 1;
        var wi = 0;
        
        for (var j = 0; j < half; j++) {
        var k = i + j;
        var l = k + half;
        
        var tReal = wr * re[l] - wi * im[l];
        var tImag = wr * im[l] + wi * re[l];
        
        re[l] = re[k] - tReal;
        im[l] = im[k] - tImag;
        re[k] += tReal;
        im[k] += tImag;
        
        var temp = wr;
        wr = temp * wReal - wi * wImag;
        wi = temp * wImag + wi * wReal;
        }
    }
    }
}

function ifft(re, im) {
    var n = re.length;
    for (var i = 0; i < n; i++) {
    im[i] = -im[i];
    }
    fft(re, im);
    for (var i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
    }
}

function generate() {
    var sr = ctx.sampleRate;
    var vals = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    var idx = 0;
    
    function next() {
    if (idx >= vals.length) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        update();
        return;
    }
    
    var b = vals[idx];
    var data = makeNoise(5, sr, b);
    var buf = ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    buffers[b] = buf;
    
    var pct = ((idx + 1) / vals.length) * 100;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressText').textContent = Math.round(pct) + '%';
    
    idx++;
    setTimeout(next, 10);
    }
    
    next();
}

function play() {
    if (source) source.stop();
    
    source = ctx.createBufferSource();
    source.buffer = buffers[beta];
    source.loop = true;
    source.connect(gainNode);
    source.start(0);
    
    playing = true;
    document.getElementById('playButton').textContent = '⏸ Pause';
    
    if (!animationId) {
    animate();
    }
}

function stop() {
    if (source) {
    source.stop();
    source = null;
    }
    playing = false;
    document.getElementById('playButton').textContent = '▶ Play';
}

function drawWaveform() {
    var canvas = document.getElementById('waveformCanvas');
    var ctx2d = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    
    ctx2d.fillStyle = '#0f172a';
    ctx2d.fillRect(0, 0, width, height);
    
    if (!buffers[beta]) return;
    
    var data = buffers[beta].getChannelData(0);
    var sr = buffers[beta].sampleRate;
    
    var displayDuration = 0.05;
    var samplesPerFrame = Math.floor(sr * displayDuration);
    
    if (playing) {
    waveformOffset += sr / 60 * 0.1;
    if (waveformOffset >= data.length) {
        waveformOffset = 0;
    }
    }
    
    var startSample = Math.floor(waveformOffset) % data.length;
    
    ctx2d.strokeStyle = '#3b82f6';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    
    for (var i = 0; i < width; i++) {
    var sampleIndex = startSample + Math.floor((i / width) * samplesPerFrame);
    if (sampleIndex >= data.length) {
        sampleIndex = sampleIndex % data.length;
    }
    
    var sample = data[sampleIndex];
    var x = i;
    var y = height / 2 - (sample * height / 2 * 0.8);
    
    if (i === 0) {
        ctx2d.moveTo(x, y);
    } else {
        ctx2d.lineTo(x, y);
    }
    }
    
    ctx2d.stroke();
    
    ctx2d.strokeStyle = '#374151';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, height / 2);
    ctx2d.lineTo(width, height / 2);
    ctx2d.stroke();
}

function drawSpectrum() {
    var canvas = document.getElementById('spectrumCanvas');
    var ctx2d = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    
    ctx2d.fillStyle = '#0f172a';
    ctx2d.fillRect(0, 0, width, height);
    
    if (playing && analyser) {
    analyser.getByteFrequencyData(freqData);
    }
    
    var sr = ctx.sampleRate;
    var binCount = analyser.frequencyBinCount;
    var nyquist = sr / 2;
    
    var minFreq = 20;
    var maxFreq = 20000;
    var minLog = Math.log10(minFreq);
    var maxLog = Math.log10(maxFreq);
    
    var numBars = 100;
    var barWidth = width / numBars;
    
    var maxValue = 0;
    var values = [];
    for (var i = 0; i < numBars; i++) {
    var logFreq = minLog + (i / numBars) * (maxLog - minLog);
    var freq = Math.pow(10, logFreq);
    var bin = Math.floor((freq / nyquist) * binCount);
    
    if (bin >= binCount) bin = binCount - 1;
    
    var value = playing ? freqData[bin] : 0;
    values.push(value);
    if (value > maxValue) maxValue = value;
    }
    
    for (var i = 0; i < numBars; i++) {
    var value = values[i];
    var normalizedValue = maxValue > 0 ? value / maxValue : 0;
    var logValue = normalizedValue > 0 ? Math.log10(normalizedValue * 9 + 1) : 0;
    var barHeight = logValue * height * 0.9;
    
    var hue = 200 + (i / numBars) * 60;
    ctx2d.fillStyle = 'hsl(' + hue + ', 70%, 50%)';
    ctx2d.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
    
    ctx2d.fillStyle = '#9ca3af';
    ctx2d.font = '12px Arial';
    ctx2d.fillText('20 Hz', 10, height - 10);
    ctx2d.fillText('20 kHz', width - 50, height - 10);
    
    var freqLabels = [100, 1000, 10000];
    for (var i = 0; i < freqLabels.length; i++) {
    var f = freqLabels[i];
    var logPos = (Math.log10(f) - minLog) / (maxLog - minLog);
    var x = logPos * width;
    
    ctx2d.strokeStyle = '#374151';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(x, 0);
    ctx2d.lineTo(x, height);
    ctx2d.stroke();
    
    var label = f >= 1000 ? (f / 1000) + 'k' : f + '';
    ctx2d.fillStyle = '#9ca3af';
    ctx2d.fillText(label, x - 15, height - 10);
    }
}

function drawLightSpectrum() {
    var canvas = document.getElementById('lightCanvas');
    var ctx2d = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    
    ctx2d.fillStyle = '#0f172a';
    ctx2d.fillRect(0, 0, width, height);
    
    if (lightOpacity === 0) return;
    
    var lightData = calculateLightSpectrum(beta);
    var spectrum = lightData.spectrum;
    var barWidth = width / spectrum.length;
    
    ctx2d.globalAlpha = lightOpacity;
    
    for (var i = 0; i < spectrum.length; i++) {
    var flippedIndex = spectrum.length - 1 - i;
    var r = Math.round(spectrum[flippedIndex][0] * 255);
    var g = Math.round(spectrum[flippedIndex][1] * 255);
    var b = Math.round(spectrum[flippedIndex][2] * 255);
    
    ctx2d.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx2d.fillRect(i * barWidth, 0, barWidth, height);
    }
    
    var wavelengths = lightData.wavelengths;
    var c = 299792458;
    var powerCurve = [];
    var maxPower = 0;
    
    for (var i = 0; i < wavelengths.length; i++) {
    var freq = c / (wavelengths[i] * 1e-9);
    var power = Math.pow(freq, -beta);
    powerCurve.push(power);
    if (power > maxPower) maxPower = power;
    }
    
    ctx2d.strokeStyle = '#ffffff';
    ctx2d.lineWidth = 3;
    ctx2d.beginPath();
    
    for (var i = 0; i < powerCurve.length; i++) {
    var flippedIndex = powerCurve.length - 1 - i;
    var x = i * barWidth + barWidth / 2;
    var normalizedPower = powerCurve[flippedIndex] / maxPower;
    var y = height - (normalizedPower * height * 0.9);
    
    if (i === 0) {
        ctx2d.moveTo(x, y);
    } else {
        ctx2d.lineTo(x, y);
    }
    }
    
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;
}

function drawSummatedColor() {
    var canvas = document.getElementById('colorCanvas');
    var ctx2d = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    
    ctx2d.fillStyle = '#0f172a';
    ctx2d.fillRect(0, 0, width, height);
    
    if (lightOpacity === 0) return;
    
    var lightData = calculateLightSpectrum(beta);
    var sumRGB = lightData.summated;
    
    var r = Math.round(sumRGB[0] * 255);
    var g = Math.round(sumRGB[1] * 255);
    var b = Math.round(sumRGB[2] * 255);
    
    ctx2d.globalAlpha = lightOpacity;
    ctx2d.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx2d.fillRect(0, 0, width, height);
    ctx2d.globalAlpha = 1;
}

function animate() {
    if (playing) {
    lightOpacity = Math.min(1, lightOpacity + 0.05);
    } else {
    lightOpacity = Math.max(0, lightOpacity - 0.05);
    }
    
    drawWaveform();
    drawSpectrum();
    drawLightSpectrum();
    drawSummatedColor();
    animationId = requestAnimationFrame(animate);
}

function stopAnimation() {
    if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
    }
}

function update() {
    document.getElementById('betaValue').textContent = beta;
    var nameElement = document.getElementById('noiseName');
    nameElement.textContent = labels[beta] || '';
    nameElement.style.color = labelColors[beta] || '#60a5fa';
    
    waveformOffset = 0;
    if (!playing) {
    drawWaveform();
    drawSpectrum();
    drawLightSpectrum();
    drawSummatedColor();
    }
}

document.getElementById('betaSlider').addEventListener('input', function(e) {
    var was = playing;
    var newBeta = parseInt(e.target.value);
    
    if (was && newBeta !== beta) {
    gainNode.gain.setValueAtTime(gainNode.gain.value, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    
    setTimeout(function() {
        stop();
        beta = newBeta;
        update();
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        play();
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    }, 50);
    } else {
    beta = newBeta;
    update();
    }
});

document.getElementById('playButton').addEventListener('click', function() {
    if (playing) stop();
    else play();
});

generate();
