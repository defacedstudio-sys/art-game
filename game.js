'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK ANIMATOR
   Generates geometric tetris-like chunks from source artwork,
   animates them hypnotically, with live controls and MP4 recording.
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
let sourceImage = null;        // loaded Image element
let sourceCanvas = null;       // offscreen canvas with original art
let sourceCtx = null;
let chunks = [];               // active animated chunks
let paused = false;
let animFrame = null;
let lastTime = 0;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

// Canvas dimensions (>2000px)
const CANVAS_W = 2400;
const CANVAS_H = 1350;

/* ── PARAMS (live-updated from sliders) ────────────────────────── */
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
      showToast('Artwork loaded — animation started');
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

  // Draw original onto main canvas
  ctx.drawImage(sourceCanvas, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   TETRIS / GEOMETRIC CHUNK SHAPE GENERATION
   Creates polyomino-like shapes with squared-off edges.
   Each shape is a set of grid cells that connect together,
   producing geometric forms with up to maxEdges edges.
═══════════════════════════════════════════════════════════════ */

function generateTetrisShape(cellSize, maxEdges) {
  // Number of cells in the polyomino (more cells = more edges possible)
  // Each cell contributes up to 4 edges, shared edges reduce count
  // For N cells in a line: edges = 2*N + 2
  // For more complex shapes, edges vary
  const targetEdges = 4 + Math.floor(Math.random() * (maxEdges - 4));
  // Estimate cells needed: roughly targetEdges / 2 cells
  const numCells = Math.max(2, Math.min(40, Math.ceil(targetEdges / 2.5)));

  const cells = new Set();
  cells.add('0,0');

  // Grow the polyomino by adding adjacent cells
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

    // Bias towards creating more interesting shapes
    // Sometimes pick random, sometimes extend in a direction
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    cells.add(pick);
  }

  // Convert to cell coordinates
  const cellCoords = [];
  for (const key of cells) {
    const [r, c] = key.split(',').map(Number);
    cellCoords.push([r, c]);
  }

  // Normalize to start at 0,0
  const minR = Math.min(...cellCoords.map(c => c[0]));
  const minC = Math.min(...cellCoords.map(c => c[1]));
  const normalized = cellCoords.map(([r, c]) => [r - minR, c - minC]);

  // Build the outline path (pixel coordinates)
  return buildOutlinePath(normalized, cellSize);
}

function buildOutlinePath(cells, cellSize) {
  // Create a grid lookup
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  const maxR = Math.max(...cells.map(c => c[0]));
  const maxC = Math.max(...cells.map(c => c[1]));

  // March around the perimeter to build a squared-off polygon
  // Use edge segments approach
  const edges = [];

  for (const [r, c] of cells) {
    const x = c * cellSize;
    const y = r * cellSize;
    // Top edge
    if (!cellSet.has(`${r-1},${c}`)) {
      edges.push({ x1: x, y1: y, x2: x + cellSize, y2: y, dir: 'top' });
    }
    // Bottom edge
    if (!cellSet.has(`${r+1},${c}`)) {
      edges.push({ x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize, dir: 'bottom' });
    }
    // Left edge
    if (!cellSet.has(`${r},${c-1}`)) {
      edges.push({ x1: x, y1: y, x2: x, y2: y + cellSize, dir: 'left' });
    }
    // Right edge
    if (!cellSet.has(`${r},${c+1}`)) {
      edges.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize, dir: 'right' });
    }
  }

  // Build connected path from edges
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

  // Build adjacency: map from vertex to connected vertices via edges
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

  // Trace the outline starting from the topmost-leftmost vertex
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

  // Simple outline tracing
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
   CHUNK CREATION & MANAGEMENT
═══════════════════════════════════════════════════════════════ */

function createChunk() {
  const p = getParams();
  const size = p.minSize + Math.random() * (p.maxSize - p.minSize);
  const cellSize = Math.max(4, Math.floor(size / (3 + Math.random() * 5)));

  const shape = generateTetrisShape(cellSize, p.maxEdges);

  // Source position: random position on the artwork
  const srcX = Math.floor(Math.random() * (CANVAS_W - shape.width));
  const srcY = Math.floor(Math.random() * (CANVAS_H - shape.height));

  // Destination: offset from source for hypnotic drift
  const driftRange = p.drift * 300;
  const destX = srcX + (Math.random() - 0.5) * driftRange;
  const destY = srcY + (Math.random() - 0.5) * driftRange;

  // Create an offscreen canvas for this chunk's pixel data
  const chunkCanvas = document.createElement('canvas');
  chunkCanvas.width = shape.width;
  chunkCanvas.height = shape.height;
  const chunkCtx = chunkCanvas.getContext('2d');

  // Draw the source pixels into the chunk canvas, clipped to shape
  chunkCtx.save();
  chunkCtx.beginPath();
  if (shape.path.length > 0) {
    chunkCtx.moveTo(shape.path[0][0], shape.path[0][1]);
    for (let i = 1; i < shape.path.length; i++) {
      chunkCtx.lineTo(shape.path[i][0], shape.path[i][1]);
    }
    chunkCtx.closePath();
  }
  chunkCtx.clip();

  // Copy pixels from source
  chunkCtx.drawImage(sourceCanvas, srcX, srcY, shape.width, shape.height, 0, 0, shape.width, shape.height);
  chunkCtx.restore();

  const speedMult = 0.2 + Math.random() * 1.5;
  const phase = Math.random() * Math.PI * 2;

  return {
    canvas: chunkCanvas,
    shape,
    srcX, srcY,
    destX, destY,
    x: srcX,
    y: srcY,
    speedMult,
    phase,
    age: 0,
    lifetime: 3000 + Math.random() * 8000, // 3-11 seconds
    opacity: 0,
    state: 'fadein', // fadein -> visible -> fadeout -> dead
  };
}

function updateChunks(dt) {
  const p = getParams();
  const speedFactor = p.speed / 50;

  // Spawn new chunks based on density
  const targetCount = p.density * 3;
  while (chunks.length < targetCount) {
    chunks.push(createChunk());
  }

  // Update each chunk
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    c.age += dt;

    const progress = c.age / c.lifetime;
    const drift = p.drift;

    // Hypnotic sinusoidal movement
    const t = c.age * 0.001 * c.speedMult * speedFactor;
    c.x = c.srcX + (c.destX - c.srcX) * Math.sin(t + c.phase) * 0.5 +
           Math.sin(t * 0.7 + c.phase * 2) * drift * 40;
    c.y = c.srcY + (c.destY - c.srcY) * Math.cos(t * 0.8 + c.phase) * 0.5 +
           Math.cos(t * 0.6 + c.phase * 3) * drift * 40;

    // Opacity lifecycle
    const fadeInDuration = 0.1;
    const fadeOutStart = 0.75;
    if (progress < fadeInDuration) {
      c.opacity = progress / fadeInDuration;
      c.state = 'fadein';
    } else if (progress < fadeOutStart) {
      c.opacity = 1;
      c.state = 'visible';
    } else if (progress < 1) {
      c.opacity = 1 - (progress - fadeOutStart) / (1 - fadeOutStart);
      c.state = 'fadeout';
    } else {
      chunks.splice(i, 1);
      continue;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════════════════════════ */

function render() {
  const p = getParams();

  // Clear
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw the animated state (original + chunks overlay)
  // Start with original
  ctx.drawImage(sourceCanvas, 0, 0);

  // Draw chunks on top
  ctx.save();
  for (const c of chunks) {
    ctx.globalAlpha = c.opacity * (1 - p.restore);
    ctx.drawImage(c.canvas, Math.round(c.x), Math.round(c.y));
  }
  ctx.restore();

  // Blend towards original based on restore slider
  if (p.restore > 0) {
    ctx.save();
    ctx.globalAlpha = p.restore;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════════════════════════════ */

function startAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  chunks = [];
  lastTime = performance.now();
  paused = false;
  btnPause.textContent = 'Pause';
  tick();
}

function tick(now) {
  animFrame = requestAnimationFrame(tick);

  if (!sourceImage || paused) return;

  if (!now) now = performance.now();
  const dt = Math.min(now - lastTime, 100); // cap dt
  lastTime = now;

  updateChunks(dt);
  render();
}

/* ═══════════════════════════════════════════════════════════════
   MP4 RECORDING (via MediaRecorder + WebM → download)
═══════════════════════════════════════════════════════════════ */

function startRecording() {
  // Try to get a video/webm stream from the canvas
  const stream = canvas.captureStream(30); // 30 fps

  // Try preferred codecs
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
    videoBitsPerSecond: 8000000, // 8 Mbps for quality
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

  mediaRecorder.start(100); // collect data every 100ms
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

  showToast('Recording started — adjust controls freely');
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
  chunks = [];
  if (sourceCanvas) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(sourceCanvas, 0, 0);
  }
  showToast('Animation reset');
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
  chunks = [];
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
   INIT — set canvas size and wait for image
═══════════════════════════════════════════════════════════════ */
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
