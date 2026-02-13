// Configuration
const RESOLUTION = 256;
const DISPLAY_SIZE = 512;

// State
let metaballs = [];
let p = 2;
let threshold = 2.5;
let mode = 'continuous';
let colormap = 'hot';
let colorLow = 0;
let colorHigh = 1;
let audioEnabled = false;
let animationId = null;

// Audio
let audioContext = null;
let oscillator = null;
let filter = null;
let gainNode = null;
let smoothedColor = 0.5;

// Canvas references
const canvas = document.getElementById('metaballCanvas');
const ctx = canvas.getContext('2d');
const unitCircleCanvas = document.getElementById('unitCircleCanvas');
const unitCircleCtx = unitCircleCanvas.getContext('2d');
const gradientCanvas = document.getElementById('gradientPreview');
const gradientCtx = gradientCanvas.getContext('2d');

// Colormaps
const colormaps = {
  hot: [
    [0, 0, 0], [50, 0, 0], [100, 0, 0], [150, 0, 0], [200, 0, 0],
    [255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [255, 255, 255]
  ],
  cool: [
    [0, 255, 255], [64, 191, 255], [128, 128, 255], [191, 64, 255], [255, 0, 255]
  ],
  grayscale: [
    [0, 0, 0], [64, 64, 64], [128, 128, 128], [191, 191, 191], [255, 255, 255]
  ],
  picnic: [
    [0, 0, 255], [51, 153, 255], [102, 204, 255], [153, 255, 255],
    [204, 255, 204], [255, 255, 153], [255, 204, 102], [255, 153, 51], [255, 0, 0]
  ],
  rainbow: [
    [255, 0, 0], [255, 127, 0], [255, 255, 0], [127, 255, 0], [0, 255, 0],
    [0, 255, 127], [0, 255, 255], [0, 127, 255], [0, 0, 255], [127, 0, 255], [255, 0, 255]
  ],
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 73, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
    [180, 222, 44], [253, 231, 37]
  ],
  plasma: [
    [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137],
    [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33]
  ]
};

// Interpolate color from colormap
function getColor(t, mapName) {
  const map = colormaps[mapName];
  if (t <= 0) return map[0];
  if (t >= 1) return map[map.length - 1];
  
  const scaledT = t * (map.length - 1);
  const idx = Math.floor(scaledT);
  const frac = scaledT - idx;
  
  const c1 = map[idx];
  const c2 = map[Math.min(idx + 1, map.length - 1)];
  
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * frac),
    Math.round(c1[1] + (c2[1] - c1[1]) * frac),
    Math.round(c1[2] + (c2[2] - c1[2]) * frac)
  ];
}

// Initialize metaballs
function initMetaballs() {
  const numBalls = parseInt(document.getElementById('numBallsSlider').value);
  metaballs = [];
  for (let i = 0; i < numBalls; i++) {
    metaballs.push({
      x: Math.random() * RESOLUTION,
      y: Math.random() * RESOLUTION,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: 40
    });
  }
}

// Calculate Lp distance
function lpDistance(dx, dy, pValue) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  if (pValue < 0.01) return Infinity;
  if (pValue >= 10) return Math.max(absDx, absDy);
  
  const sum = Math.pow(absDx, pValue) + Math.pow(absDy, pValue);
  return Math.pow(sum, 1.0 / pValue);
}

// Calculate metaball field value at a point
function calculateField(x, y) {
  let sum = 0;
  for (const ball of metaballs) {
    const dx = x - ball.x;
    const dy = y - ball.y;
    const dist = lpDistance(dx, dy, p);
    const epsilon = 0.1;
    const influence = ball.radius / (dist + epsilon);
    sum += influence;
  }
  return sum;
}

// Update metaball positions
function updateMetaballs() {
  metaballs.forEach(ball => {
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    if (ball.x < 0 || ball.x > RESOLUTION) {
      ball.vx *= -1;
      ball.x = Math.max(0, Math.min(RESOLUTION, ball.x));
    }
    if (ball.y < 0 || ball.y > RESOLUTION) {
      ball.vy *= -1;
      ball.y = Math.max(0, Math.min(RESOLUTION, ball.y));
    }
  });
}

// Render frame
function render() {
  const imageData = ctx.createImageData(RESOLUTION, RESOLUTION);
  const data = imageData.data;
  
  let totalColorValue = 0;
  
  for (let y = 0; y < RESOLUTION; y++) {
    for (let x = 0; x < RESOLUTION; x++) {
      const field = calculateField(x, y);
      const idx = (y * RESOLUTION + x) * 4;
      
      let t;
      let color;
      
      if (mode === 'discrete') {
        const isOn = field > threshold;
        t = isOn ? colorHigh : colorLow;
        color = getColor(t, colormap);
      } else {
        let normalizedField = field / threshold;
        normalizedField = Math.max(0, Math.min(1, normalizedField));
        t = colorLow + (colorHigh - colorLow) * normalizedField;
        const clampedT = Math.max(0, Math.min(1, t));
        color = getColor(clampedT, colormap);
        t = clampedT;
      }
      
      totalColorValue += t;
      
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const avgColorValue = totalColorValue / (RESOLUTION * RESOLUTION);
  updateAudio(avgColorValue);
}

// Animation loop
function animate() {
  updateMetaballs();
  render();
  animationId = requestAnimationFrame(animate);
}

// Audio functions
function initAudio() {
  if (audioContext) return;
  
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  oscillator = audioContext.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 110;
  
  filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.value = 1000;
  
  gainNode = audioContext.createGain();
  gainNode.gain.value = 0;
  
  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.start();
  
  const now = audioContext.currentTime;
  gainNode.gain.setTargetAtTime(0.15, now, 0.03);
}

function stopAudio() {
  if (gainNode && audioContext) {
    const now = audioContext.currentTime;
    gainNode.gain.setTargetAtTime(0, now, 0.03);
    
    setTimeout(() => {
      if (oscillator) {
        oscillator.stop();
        oscillator = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
      filter = null;
      gainNode = null;
    }, 150);
  }
}

function updateAudio(avgColor) {
  if (!filter || !audioContext || !oscillator) return;
  
  const smoothing = 0.85;
  smoothedColor = smoothing * smoothedColor + (1 - smoothing) * avgColor;
  
  const now = audioContext.currentTime;
  
  const minFreq = 20;
  const maxFreq = 10000;
  const cutoff = minFreq * Math.pow(maxFreq / minFreq, smoothedColor);
  
  const basePitch = 110;
  const pitch = basePitch * Math.pow(2, smoothedColor);
  
  filter.frequency.setTargetAtTime(cutoff, now, 0.02);
  oscillator.frequency.setTargetAtTime(pitch, now, 0.02);
}

// Draw unit circle
function drawUnitCircle() {
  const size = 200;
  const center = size / 2;
  const scale = size * 0.4;
  
  unitCircleCtx.fillStyle = '#1f2937';
  unitCircleCtx.fillRect(0, 0, size, size);
  
  unitCircleCtx.strokeStyle = '#4b5563';
  unitCircleCtx.lineWidth = 1;
  unitCircleCtx.beginPath();
  unitCircleCtx.moveTo(center, 0);
  unitCircleCtx.lineTo(center, size);
  unitCircleCtx.moveTo(0, center);
  unitCircleCtx.lineTo(size, center);
  unitCircleCtx.stroke();
  
  unitCircleCtx.strokeStyle = '#60a5fa';
  unitCircleCtx.lineWidth = 2;
  unitCircleCtx.beginPath();
  
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    
    let r;
    if (p < 0.01) {
      r = 0;
    } else if (p >= 10) {
      r = 1 / Math.max(Math.abs(x), Math.abs(y));
    } else {
      r = Math.pow(Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p), -1/p);
    }
    
    const px = center + r * x * scale;
    const py = center - r * y * scale;
    
    if (i === 0) {
      unitCircleCtx.moveTo(px, py);
    } else {
      unitCircleCtx.lineTo(px, py);
    }
  }
  unitCircleCtx.closePath();
  unitCircleCtx.stroke();
}

// Draw gradient preview
function drawGradientPreview() {
  const width = 300;
  const height = 30;
  
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const color = getColor(t, colormap);
    gradientCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    gradientCtx.fillRect(x, 0, 1, height);
  }
}

// Slider mapping for p-value
function sliderToP(sliderValue) {
  if (sliderValue <= 30) {
    return sliderValue / 30;
  } else if (sliderValue <= 70) {
    return 1 + ((sliderValue - 30) / 40) * 2;
  } else {
    return 3 + ((sliderValue - 70) / 30) * 7;
  }
}

function pToSlider(pValue) {
  if (pValue <= 1) {
    return pValue * 30;
  } else if (pValue <= 3) {
    return 30 + ((pValue - 1) / 2) * 40;
  } else {
    return 70 + ((pValue - 3) / 7) * 30;
  }
}

// Event listeners
document.getElementById('audioToggle').addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  const btn = document.getElementById('audioToggle');
  
  if (audioEnabled) {
    initAudio();
    btn.textContent = '🔊';
    btn.className = 'audio-toggle active';
  } else {
    stopAudio();
    btn.textContent = '🔇';
    btn.className = 'audio-toggle inactive';
  }
});

document.getElementById('discreteBtn').addEventListener('click', () => {
  mode = 'discrete';
  document.getElementById('discreteBtn').className = 'mode-button active';
  document.getElementById('continuousBtn').className = 'mode-button inactive';
  document.getElementById('thresholdHelper').textContent = 'Binary cutoff';
});

document.getElementById('continuousBtn').addEventListener('click', () => {
  mode = 'continuous';
  document.getElementById('continuousBtn').className = 'mode-button active';
  document.getElementById('discreteBtn').className = 'mode-button inactive';
  document.getElementById('thresholdHelper').textContent = 'Falloff rate';
});

document.getElementById('pSlider').addEventListener('input', (e) => {
  p = sliderToP(parseFloat(e.target.value));
  document.getElementById('pValue').textContent = p.toFixed(2) + (p >= 10 ? ' (∞)' : p < 0.01 ? ' (0)' : '');
  
  let helper = 'Circle-ish';
  if (p < 0.5) helper = 'Blank';
  else if (p < 1.5) helper = 'Diamond-ish';
  else if (p < 2.5) helper = 'Circle-ish';
  else if (p < 10) helper = 'Square-ish';
  else helper = 'Square';
  document.getElementById('pHelper').textContent = helper;
  
  drawUnitCircle();
});

document.getElementById('thresholdSlider').addEventListener('input', (e) => {
  threshold = parseFloat(e.target.value);
  document.getElementById('thresholdValue').textContent = threshold.toFixed(2);
});

document.getElementById('numBallsSlider').addEventListener('input', (e) => {
  document.getElementById('numBallsValue').textContent = e.target.value;
  initMetaballs();
});

document.getElementById('colormapSelect').addEventListener('change', (e) => {
  colormap = e.target.value;
  drawGradientPreview();
});

document.getElementById('colorLowSlider').addEventListener('input', (e) => {
  colorLow = parseFloat(e.target.value);
  document.getElementById('colorLowValue').textContent = colorLow.toFixed(2);
});

document.getElementById('colorHighSlider').addEventListener('input', (e) => {
  colorHigh = parseFloat(e.target.value);
  document.getElementById('colorHighValue').textContent = colorHigh.toFixed(2);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  initMetaballs();
});

// Initialize
canvas.style.width = DISPLAY_SIZE + 'px';
canvas.style.height = DISPLAY_SIZE + 'px';

initMetaballs();
drawUnitCircle();
drawGradientPreview();
animate();