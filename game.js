'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK STACKER
   Samples geometric tetris-like chunks from source artwork and
   stamps them permanently onto the canvas, building layers.
   Controls adjust in real-time, even while recording.
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
  speed:   document.getElementById('speed-slider'),
  minSize: document.getElementById('min-size-slider'),
  maxSize: document.getElementById('max-size-slider'),
  density: document.getElementById('density-slider'),
  edges:   document.getElementById('edges-slider'),
  restore: document.getElementById('restore-slider'),
  drift:   document.getElementById('drift-slider'),
};

/* ── STATE ─────────────────────────────────────────────────────── */
let sourceImage = null;
let sourceCanvas = null;
let sourceCtx = null;
let paused = false;
let animFrame = null;
let lastTime = 0;
let stampAccum = 0;  // time accumulator for stamping

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

// Canvas dimensions (>2000px)
const CANVAS_W = 2400;
const CANVAS_H = 1350;

/* ── PARAMS ────────────────────────────────────────────────────── */
function getParams() {
  return {
    speed:     parseInt(sliders.speed.value),
    minSize:   parseInt(sliders.minSize.value),
    maxSize:   parseInt(sliders.maxSize.value),
    density:   parseInt(sliders.density.value),
    maxEdges:  parseInt(sliders.edges.value),
    restore:   parseInt(sliders.restore.value) / 100,
    drift:     parseInt(sliders.drift.value) / 100,
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

  // Draw source image scaled to fill canvas (cover)
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

  // Start with original on main canvas
  ctx.drawImage(sourceCanvas, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   TETRIS / GEOMETRIC CHUNK SHAPE GENERATION
   Creates polyomino-like shapes with squared-off edges.
═══════════════════════════════════════════════════════════════ */

function generateTetrisShape(cellSize, maxEdges) {
  const targetEdges = 4 + Math.floor(Math.random() * (maxEdges - 4));
  const numCells = Math.max(2, Math.min(40, Math.ceil(targetEdges / 2.5)));

  const cells = new Set();
  cells.add('0,0');

  for (let i = 1; i < numCells; i++) {
    const candidates = [];
    for (const key of cells) {
      const [r, c] = key.split(',').map(Number);
      const neighbors = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      for (const [nr, nc] of neighbors) {
        const nk = `${nr},${nc}`;
        if (!cells.has(nk)) candidates.push(nk);
      }
    }
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
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

  for (let safety = 0; safety < 1000; safety++) {
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
  const cellSize = Math.max(4, Math.floor(size / (3 + Math.random() * 5)));

  const shape = generateTetrisShape(cellSize, p.maxEdges);
  if (shape.width < 2 || shape.height < 2) return;

  // Source position: where to sample pixels from the original artwork
  const srcX = Math.floor(Math.random() * Math.max(1, CANVAS_W - shape.width));
  const srcY = Math.floor(Math.random() * Math.max(1, CANVAS_H - shape.height));

  // Destination: where to paste (offset from source for drift effect)
  const driftRange = p.drift * 400;
  let destX = srcX + Math.round((Math.random() - 0.5) * driftRange);
  let destY = srcY + Math.round((Math.random() - 0.5) * driftRange);

  // Clamp to canvas
  destX = Math.max(-shape.width / 2, Math.min(CANVAS_W - shape.width / 2, destX));
  destY = Math.max(-shape.height / 2, Math.min(CANVAS_H - shape.height / 2, destY));

  // Build clip path and stamp directly onto main canvas
  ctx.save();
  ctx.beginPath();
  if (shape.path.length > 1) {
    ctx.moveTo(shape.path[0][0] + destX, shape.path[0][1] + destY);
    for (let i = 1; i < shape.path.length; i++) {
      ctx.lineTo(shape.path[i][0] + destX, shape.path[i][1] + destY);
    }
    ctx.closePath();
  } else {
    // Fallback: just use a rectangle
    ctx.rect(destX, destY, shape.width, shape.height);
  }
  ctx.clip();

  // Draw the source artwork pixels at the destination
  ctx.drawImage(
    sourceCanvas,
    srcX, srcY, shape.width, shape.height,
    destX, destY, shape.width, shape.height
  );

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION LOOP — continuously stamps chunks
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
    ctx.globalAlpha = p.restore * 0.15; // gradual blend per frame
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }

  // How many chunks to stamp per second
  // speed 1 = ~2/sec, speed 100 = ~200/sec
  const chunksPerSec = 2 + (p.speed / 100) * 198;
  // density multiplier: stamps multiple chunks per interval
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

// File loading
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

// Menu toggle
btnHide.addEventListener('click', () => {
  menu.classList.remove('visible');
  btnShow.classList.add('visible');
});

btnShow.addEventListener('click', () => {
  menu.classList.add('visible');
  btnShow.classList.remove('visible');
});

// Pause / Reset
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

// Recording
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);

// Load new image
btnLoadNew.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopRecording();
  }
  if (animFrame) cancelAnimationFrame(animFrame);
  sourceImage = null;
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
