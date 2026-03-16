'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK STACKER
   Samples geometric tetris-like chunks from source artwork and
   stamps them permanently onto the canvas, building layers.
   Supports stripes, clumps, weird shapes, white-biased sampling.
═══════════════════════════════════════════════════════════════ */

/* ── DOM ───────────────────────────────────────────────────────── */
const canvas      = document.getElementById('main-canvas');
const ctx         = canvas.getContext('2d');
const dropOverlay = document.getElementById('drop-overlay');
const fileInput   = document.getElementById('file-input');
const menu        = document.getElementById('menu');
const btnHide     = document.getElementById('btn-hide-menu');
const btnShow     = document.getElementById('btn-show-menu');
const btnPause    = document.getElementById('btn-pause');
const btnReset    = document.getElementById('btn-reset');
const btnRecord   = document.getElementById('btn-record');
const btnStop     = document.getElementById('btn-stop-record');
const btnLoadNew  = document.getElementById('btn-load-new');
const recordStatus = document.getElementById('record-status');
const recordTime  = document.getElementById('record-time');
const toast       = document.getElementById('toast');

const sliders = {
  speed:      document.getElementById('speed-slider'),
  minSize:    document.getElementById('min-size-slider'),
  maxSize:    document.getElementById('max-size-slider'),
  density:    document.getElementById('density-slider'),
  edges:      document.getElementById('edges-slider'),
  restore:    document.getElementById('restore-slider'),
  drift:      document.getElementById('drift-slider'),
  whiteBias:  document.getElementById('white-bias-slider'),
  shapeStyle: document.getElementById('shape-style-slider'),
};

/* ── STATE ─────────────────────────────────────────────────────── */
let sourceImage = null;
let sourceCanvas = null;
let sourceCtx = null;
let sourceImageData = null; // for white-bias sampling
let paused = false;
let animFrame = null;
let lastTime = 0;
let stampAccum = 0;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

// Canvas dimensions (>2000px)
const CANVAS_W = 4800;
const CANVAS_H = 2700;

/* ── PARAMS ────────────────────────────────────────────────────── */
function getParams() {
  return {
    speed:      parseInt(sliders.speed.value),
    minSize:    parseInt(sliders.minSize.value),
    maxSize:    parseInt(sliders.maxSize.value),
    density:    parseInt(sliders.density.value),
    maxEdges:   parseInt(sliders.edges.value),
    restore:    parseInt(sliders.restore.value) / 100,
    drift:      parseInt(sliders.drift.value) / 100,
    whiteBias:  parseInt(sliders.whiteBias.value) / 100,
    shapeStyle: parseInt(sliders.shapeStyle.value) / 100, // 0=stripes, 1=clumps
  };
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE LOADING
═══════════════════════════════════════════════════════════════ */
function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      initSourceCanvas();
      dropOverlay.classList.remove('visible');
      startAnimation();
      showToast('Artwork loaded — chunks stacking');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initSourceCanvas() {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = CANVAS_W;
  sourceCanvas.height = CANVAS_H;
  sourceCtx = sourceCanvas.getContext('2d');

  const imgAspect = sourceImage.width / sourceImage.height;
  const canAspect = CANVAS_W / CANVAS_H;
  let sw, sh, sx, sy;
  if (imgAspect > canAspect) {
    sh = sourceImage.height;
    sw = sh * canAspect;
    sx = (sourceImage.width - sw) / 2;
    sy = 0;
  } else {
    sw = sourceImage.width;
    sh = sw / canAspect;
    sx = 0;
    sy = (sourceImage.height - sh) / 2;
  }
  sourceCtx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, CANVAS_W, CANVAS_H);

  // Cache pixel data for white-bias sampling
  sourceImageData = sourceCtx.getImageData(0, 0, CANVAS_W, CANVAS_H);

  ctx.drawImage(sourceCanvas, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   WHITE-BIAS SAMPLING
   Picks source positions biased towards whiter/lighter areas.
═══════════════════════════════════════════════════════════════ */

function getWhiteness(x, y, w, h) {
  if (!sourceImageData) return 0.5;
  const data = sourceImageData.data;
  // Sample a few random pixels in the region for speed
  const samples = Math.min(12, w * h);
  let totalBrightness = 0;
  for (let i = 0; i < samples; i++) {
    const sx = Math.floor(x + Math.random() * w);
    const sy = Math.floor(y + Math.random() * h);
    const idx = (sy * CANVAS_W + sx) * 4;
    const r = data[idx] || 0;
    const g = data[idx + 1] || 0;
    const b = data[idx + 2] || 0;
    totalBrightness += (r + g + b) / (3 * 255);
  }
  return totalBrightness / samples;
}

function pickSourcePosition(w, h, whiteBias) {
  if (whiteBias < 0.05) {
    // No bias — pure random
    return [
      Math.floor(Math.random() * Math.max(1, CANVAS_W - w)),
      Math.floor(Math.random() * Math.max(1, CANVAS_H - h)),
    ];
  }

  // Try multiple candidates, pick the whitest one weighted by bias
  const attempts = Math.floor(3 + whiteBias * 20); // 3-23 attempts
  let bestX = 0, bestY = 0, bestScore = -1;

  for (let i = 0; i < attempts; i++) {
    const cx = Math.floor(Math.random() * Math.max(1, CANVAS_W - w));
    const cy = Math.floor(Math.random() * Math.max(1, CANVAS_H - h));
    const whiteness = getWhiteness(cx, cy, w, h);
    // Score: blend between random (0.5) and whiteness based on bias
    const score = (1 - whiteBias) * Math.random() + whiteBias * whiteness;
    if (score > bestScore) {
      bestScore = score;
      bestX = cx;
      bestY = cy;
    }
  }

  return [bestX, bestY];
}

/* ═══════════════════════════════════════════════════════════════
   SHAPE GENERATION
   shapeStyle: 0 = long stripes, 0.5 = mixed/weird, 1 = fat clumps
═══════════════════════════════════════════════════════════════ */

function generateShape(cellSize, maxEdges, shapeStyle) {
  const targetEdges = 4 + Math.floor(Math.random() * (maxEdges - 4));
  const numCells = Math.max(2, Math.min(60, Math.ceil(targetEdges / 2.2)));

  const cells = new Set();
  cells.add('0,0');

  // Track a "direction" for stripe-like growth
  // shapeStyle 0 = strongly directional (stripes)
  // shapeStyle 1 = purely random (clumpy)
  // in between = weird mixed shapes
  const dirBias = 1 - shapeStyle; // 1 = full stripe, 0 = full clump
  let prefDir = Math.random() < 0.5 ? 'h' : 'v'; // preferred axis

  for (let i = 1; i < numCells; i++) {
    const candidates = [];
    const preferred = [];

    for (const key of cells) {
      const [r, c] = key.split(',').map(Number);
      const neighbors = [
        { pos: [r-1, c], axis: 'v' },
        { pos: [r+1, c], axis: 'v' },
        { pos: [r, c-1], axis: 'h' },
        { pos: [r, c+1], axis: 'h' },
      ];
      for (const n of neighbors) {
        const nk = `${n.pos[0]},${n.pos[1]}`;
        if (!cells.has(nk)) {
          candidates.push(nk);
          if (n.axis === prefDir) preferred.push(nk);
        }
      }
    }

    if (candidates.length === 0) break;

    // Mix between preferred direction and random based on shapeStyle
    let pick;
    if (preferred.length > 0 && Math.random() < dirBias * 0.85) {
      pick = preferred[Math.floor(Math.random() * preferred.length)];
    } else {
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Occasionally switch direction for weird shapes (mid-range style)
    if (shapeStyle > 0.2 && shapeStyle < 0.8 && Math.random() < 0.15) {
      prefDir = prefDir === 'h' ? 'v' : 'h';
    }

    cells.add(pick);
  }

  const cellCoords = [];
  for (const key of cells) {
    const [r, c] = key.split(',').map(Number);
    cellCoords.push([r, c]);
  }

  const minR = Math.min(...cellCoords.map(c => c[0]));
  const minC = Math.min(...cellCoords.map(c => c[1]));
  const normalized = cellCoords.map(([r, c]) => [r - minR, c - minC]);

  return buildOutlinePath(normalized, cellSize);
}

function buildOutlinePath(cells, cellSize) {
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  const maxR = Math.max(...cells.map(c => c[0]));
  const maxC = Math.max(...cells.map(c => c[1]));

  const edges = [];
  for (const [r, c] of cells) {
    const x = c * cellSize;
    const y = r * cellSize;
    if (!cellSet.has(`${r-1},${c}`))
      edges.push({ x1: x, y1: y, x2: x + cellSize, y2: y });
    if (!cellSet.has(`${r+1},${c}`))
      edges.push({ x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize });
    if (!cellSet.has(`${r},${c-1}`))
      edges.push({ x1: x, y1: y, x2: x, y2: y + cellSize });
    if (!cellSet.has(`${r},${c+1}`))
      edges.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize });
  }

  const path = traceOutline(edges);

  return {
    path,
    cells,
    cellSize,
    width: (maxC + 1) * cellSize,
    height: (maxR + 1) * cellSize,
    edgeCount: path.length,
  };
}

function traceOutline(edges) {
  if (edges.length === 0) return [[0, 0]];

  const vertexEdges = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const k1 = `${x1},${y1}`;
    const k2 = `${x2},${y2}`;
    if (!vertexEdges.has(k1)) vertexEdges.set(k1, []);
    if (!vertexEdges.has(k2)) vertexEdges.set(k2, []);
    vertexEdges.get(k1).push(k2);
    vertexEdges.get(k2).push(k1);
  };

  for (const e of edges) {
    addEdge(e.x1, e.y1, e.x2, e.y2);
  }

  const vertices = [...vertexEdges.keys()].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  });

  if (vertices.length === 0) return [[0, 0]];

  const start = vertices[0];
  const path = [];
  const visited = new Set();
  let current = start;

  for (let safety = 0; safety < 2000; safety++) {
    const [cx, cy] = current.split(',').map(Number);
    path.push([cx, cy]);

    const neighbors = vertexEdges.get(current) || [];
    const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

    let next = null;
    for (const n of neighbors) {
      const ek = edgeKey(current, n);
      if (!visited.has(ek)) {
        visited.add(ek);
        next = n;
        break;
      }
    }

    if (!next || next === start) break;
    current = next;
  }

  return path;
}

/* ═══════════════════════════════════════════════════════════════
   STAMP A CHUNK — permanently paste onto the canvas
═══════════════════════════════════════════════════════════════ */

function stampChunk() {
  const p = getParams();
  const size = p.minSize + Math.random() * (p.maxSize - p.minSize);
  const cellSize = Math.max(2, Math.floor(size / (2 + Math.random() * 6)));

  const shape = generateShape(cellSize, p.maxEdges, p.shapeStyle);
  if (shape.width < 2 || shape.height < 2) return;

  // Source: where to grab pixels from the ORIGINAL artwork
  const [srcX, srcY] = pickSourcePosition(shape.width, shape.height, p.whiteBias);

  // Destination: COMPLETELY INDEPENDENT random position on the canvas
  // This is what makes the composition actually change — pixels migrate
  let destX = Math.floor(Math.random() * (CANVAS_W - shape.width));
  let destY = Math.floor(Math.random() * (CANVAS_H - shape.height));

  // Drift slider blends between full-random placement (0) and
  // same-position-as-source (1) — so at 0 it's maximum chaos
  if (p.drift > 0) {
    destX = Math.round(destX * (1 - p.drift) + srcX * p.drift);
    destY = Math.round(destY * (1 - p.drift) + srcY * p.drift);
  }

  // Stamp with clip path
  ctx.save();
  ctx.beginPath();
  if (shape.path.length > 1) {
    ctx.moveTo(shape.path[0][0] + destX, shape.path[0][1] + destY);
    for (let i = 1; i < shape.path.length; i++) {
      ctx.lineTo(shape.path[i][0] + destX, shape.path[i][1] + destY);
    }
    ctx.closePath();
  } else {
    ctx.rect(destX, destY, shape.width, shape.height);
  }
  ctx.clip();

  ctx.drawImage(
    sourceCanvas,
    srcX, srcY, shape.width, shape.height,
    destX, destY, shape.width, shape.height
  );

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════════════════════════════ */

function startAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  stampAccum = 0;
  lastTime = performance.now();
  paused = false;
  btnPause.textContent = 'Pause';
  tick();
}

function tick(now) {
  animFrame = requestAnimationFrame(tick);

  if (!sourceImage || paused) return;

  if (!now) now = performance.now();
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  const p = getParams();

  // Restore slider: blend back towards original
  if (p.restore > 0) {
    ctx.save();
    ctx.globalAlpha = p.restore * 0.15;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }

  const chunksPerSec = 2 + (p.speed / 100) * 198;
  const densityMult = p.density;

  stampAccum += dt;
  const interval = 1000 / chunksPerSec;

  while (stampAccum >= interval) {
    stampAccum -= interval;
    for (let d = 0; d < densityMult; d++) {
      stampChunk();
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   MP4 RECORDING
═══════════════════════════════════════════════════════════════ */

function startRecording() {
  const stream = canvas.captureStream(30);

  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];

  let mimeType = '';
  for (const mt of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mt)) {
      mimeType = mt;
      break;
    }
  }

  if (!mimeType) {
    showToast('Recording not supported in this browser');
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `art-chunk-animation-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Recording saved as .${ext}`);
  };

  mediaRecorder.start(100);
  recordStartTime = Date.now();

  btnRecord.disabled = true;
  btnStop.disabled = false;
  recordStatus.classList.remove('hidden');

  recordTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    recordTime.textContent = `${mins}:${secs}`;
  }, 500);

  showToast('Recording — adjust sliders to program the output');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  clearInterval(recordTimerInterval);
  btnRecord.disabled = false;
  btnStop.disabled = true;
  recordStatus.classList.add('hidden');
  recordTime.textContent = '00:00';
}

/* ═══════════════════════════════════════════════════════════════
   EVENT HANDLERS
═══════════════════════════════════════════════════════════════ */

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadImage(e.target.files[0]);
});

dropOverlay.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('dragover');
});

dropOverlay.addEventListener('dragleave', () => {
  dropOverlay.classList.remove('dragover');
});

dropOverlay.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
});

btnHide.addEventListener('click', () => {
  menu.classList.remove('visible');
  btnShow.classList.add('visible');
});

btnShow.addEventListener('click', () => {
  menu.classList.add('visible');
  btnShow.classList.remove('visible');
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) {
    lastTime = performance.now();
  }
});

btnReset.addEventListener('click', () => {
  if (sourceCanvas) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(sourceCanvas, 0, 0);
  }
  stampAccum = 0;
  showToast('Reset to original');
});

btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);

btnLoadNew.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopRecording();
  }
  if (animFrame) cancelAnimationFrame(animFrame);
  sourceImage = null;
  sourceImageData = null;
  dropOverlay.classList.add('visible');
  fileInput.value = '';
});

/* ═══════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════ */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
