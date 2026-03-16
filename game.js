'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK STACKER
   Fast engine: pre-generates shape pool, stamps by filling cells
   directly — no expensive outline tracing per frame.
═══════════════════════════════════════════════════════════════ */

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
let sourceData = null;
let paused = false;
let animFrame = null;
let lastTime = 0;
let stampAccum = 0;

let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

const CANVAS_W = 4800;
const CANVAS_H = 2700;

// At speed=1, one chunk every 3 seconds
const speed1MsPerStamp = 3000;

// Pre-generated shape pools for speed
let shapePoolStripes = [];
let shapePoolClumps = [];
let shapePoolWeird = [];
const POOL_SIZE = 200;

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
    shapeStyle: parseInt(sliders.shapeStyle.value) / 100,
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
      buildShapePools();
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
  sourceData = sourceCtx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  ctx.drawImage(sourceCanvas, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   SHAPE POOL — pre-generate shapes once, reuse at stamp time.
   Each shape is an array of [row, col] cell offsets (normalized).
═══════════════════════════════════════════════════════════════ */

function growPolyomino(numCells, mode) {
  // mode: 'stripe' | 'clump' | 'weird'
  const cells = [[0, 0]];
  const cellSet = new Set();
  cellSet.add('0,0');

  let prefDir = Math.random() < 0.5 ? 0 : 1; // 0=vertical, 1=horizontal
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]]; // up,down,left,right

  for (let i = 1; i < numCells; i++) {
    // Collect frontier
    const frontier = [];
    for (const [r, c] of cells) {
      for (let d = 0; d < 4; d++) {
        const nr = r + dirs[d][0];
        const nc = c + dirs[d][1];
        if (!cellSet.has(nr + ',' + nc)) {
          frontier.push([nr, nc, d]);
        }
      }
    }
    if (frontier.length === 0) break;

    let pick;
    if (mode === 'stripe') {
      // Strongly prefer the current direction axis
      const preferred = frontier.filter(f =>
        prefDir === 0 ? (f[2] < 2) : (f[2] >= 2)
      );
      pick = (preferred.length > 0 && Math.random() < 0.88)
        ? preferred[Math.floor(Math.random() * preferred.length)]
        : frontier[Math.floor(Math.random() * frontier.length)];
    } else if (mode === 'clump') {
      // Prefer cells with more existing neighbors (compact)
      let bestCount = -1;
      const scored = frontier.map(f => {
        let n = 0;
        for (const d of dirs) {
          if (cellSet.has((f[0]+d[0]) + ',' + (f[1]+d[1]))) n++;
        }
        return { f, n };
      });
      scored.sort((a, b) => b.n - a.n);
      const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.4)));
      pick = top[Math.floor(Math.random() * top.length)].f;
    } else {
      // Weird: random with occasional direction flips
      pick = frontier[Math.floor(Math.random() * frontier.length)];
      if (Math.random() < 0.2) prefDir = 1 - prefDir;
    }

    cells.push([pick[0], pick[1]]);
    cellSet.add(pick[0] + ',' + pick[1]);
  }

  // Normalize
  const minR = Math.min(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  return cells.map(([r, c]) => [r - minR, c - minC]);
}

function buildShapePools() {
  shapePoolStripes = [];
  shapePoolClumps = [];
  shapePoolWeird = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const n = 3 + Math.floor(Math.random() * 25);
    shapePoolStripes.push(growPolyomino(n, 'stripe'));
    shapePoolClumps.push(growPolyomino(n, 'clump'));
    shapePoolWeird.push(growPolyomino(n, 'weird'));
  }
}

function pickShape(shapeStyle) {
  const idx = Math.floor(Math.random() * POOL_SIZE);
  if (shapeStyle < 0.33) return shapePoolStripes[idx];
  if (shapeStyle > 0.66) return shapePoolClumps[idx];
  return shapePoolWeird[idx];
}

/* ═══════════════════════════════════════════════════════════════
   WHITE BIAS SAMPLING
═══════════════════════════════════════════════════════════════ */

function sampleBrightness(x, y, w, h) {
  const d = sourceData.data;
  let total = 0;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const px = Math.min(CANVAS_W - 1, Math.floor(x + Math.random() * w));
    const py = Math.min(CANVAS_H - 1, Math.floor(y + Math.random() * h));
    const idx = (py * CANVAS_W + px) * 4;
    total += (d[idx] + d[idx+1] + d[idx+2]) / 765;
  }
  return total / steps;
}

function pickSourceXY(w, h, whiteBias) {
  const maxX = Math.max(0, CANVAS_W - w);
  const maxY = Math.max(0, CANVAS_H - h);

  if (whiteBias < 0.05) {
    return [Math.floor(Math.random() * maxX), Math.floor(Math.random() * maxY)];
  }

  let bestX = 0, bestY = 0, bestScore = -1;
  const tries = 3 + Math.floor(whiteBias * 15);
  for (let i = 0; i < tries; i++) {
    const cx = Math.floor(Math.random() * maxX);
    const cy = Math.floor(Math.random() * maxY);
    const brightness = sampleBrightness(cx, cy, w, h);
    const score = (1 - whiteBias) * Math.random() + whiteBias * brightness;
    if (score > bestScore) {
      bestScore = score;
      bestX = cx;
      bestY = cy;
    }
  }
  return [bestX, bestY];
}

/* ═══════════════════════════════════════════════════════════════
   STAMP — fast cell-based rendering, no outline tracing
═══════════════════════════════════════════════════════════════ */

function stampChunk() {
  const p = getParams();

  // Pick a pre-generated shape
  const cells = pickShape(p.shapeStyle);

  // Cell pixel size based on min/max size sliders
  const size = p.minSize + Math.random() * (p.maxSize - p.minSize);
  const cellPx = Math.max(2, Math.floor(size / Math.max(1, Math.sqrt(cells.length))));

  // Bounding box of the shape
  let maxR = 0, maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const shapeW = (maxC + 1) * cellPx;
  const shapeH = (maxR + 1) * cellPx;

  if (shapeW < 2 || shapeH < 2) return;

  // Source: where to grab pixels from original
  const [srcX, srcY] = pickSourceXY(shapeW, shapeH, p.whiteBias);

  // Destination: FULLY RANDOM position on canvas (independent of source)
  let destX = Math.floor(Math.random() * CANVAS_W) - Math.floor(shapeW / 2);
  let destY = Math.floor(Math.random() * CANVAS_H) - Math.floor(shapeH / 2);

  // Drift: 0 = full scramble (dest is random), 1 = dest matches source
  if (p.drift > 0.01) {
    destX = Math.round(destX * (1 - p.drift) + srcX * p.drift);
    destY = Math.round(destY * (1 - p.drift) + srcY * p.drift);
  }

  // Stamp each cell directly — fast, no path tracing needed
  for (const [r, c] of cells) {
    const dx = destX + c * cellPx;
    const dy = destY + r * cellPx;
    const sx = srcX + c * cellPx;
    const sy = srcY + r * cellPx;

    // Bounds check
    if (dx < -cellPx || dx > CANVAS_W || dy < -cellPx || dy > CANVAS_H) continue;
    if (sx < 0 || sx + cellPx > CANVAS_W || sy < 0 || sy + cellPx > CANVAS_H) continue;

    ctx.drawImage(
      sourceCanvas,
      sx, sy, cellPx, cellPx,
      dx, dy, cellPx, cellPx
    );
  }
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
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;

  const p = getParams();

  // Restore: blend towards original
  if (p.restore > 0) {
    ctx.save();
    ctx.globalAlpha = p.restore * 0.2;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }

  // Stamps per frame: speed 1 = 1 chunk every ~3 seconds
  // speed 100 = 60 per frame. Exponential curve for wide range.
  // density multiplies further.
  stampAccum += dt;
  const msPerStamp = speed1MsPerStamp / Math.pow(p.speed / 100, 2.5);
  let stampsThisFrame = 0;
  if (p.speed <= 5) {
    // Very slow: use accumulator for sub-frame timing
    while (stampAccum >= msPerStamp) {
      stampAccum -= msPerStamp;
      stampsThisFrame++;
    }
    stampsThisFrame = Math.max(0, stampsThisFrame * Math.max(1, Math.floor(p.density / 10)));
  } else {
    stampAccum = 0;
    stampsThisFrame = Math.max(1,
      Math.floor(Math.pow(p.speed / 100, 2.5) * 60 * (p.density / 10))
    );
  }

  for (let i = 0; i < stampsThisFrame; i++) {
    stampChunk();
  }
}

/* ═══════════════════════════════════════════════════════════════
   RECORDING
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
    if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
  }

  if (!mimeType) { showToast('Recording not supported'); return; }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `art-chunk-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Saved as .${ext}`);
  };

  mediaRecorder.start(100);
  recordStartTime = Date.now();
  btnRecord.disabled = true;
  btnStop.disabled = false;
  recordStatus.classList.remove('hidden');

  recordTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    recordTime.textContent = `${m}:${s}`;
  }, 500);

  showToast('Recording — adjust sliders to program output');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  clearInterval(recordTimerInterval);
  btnRecord.disabled = false;
  btnStop.disabled = true;
  recordStatus.classList.add('hidden');
  recordTime.textContent = '00:00';
}

/* ═══════════════════════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════════════════════ */

fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadImage(e.target.files[0]); });

dropOverlay.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.classList.add('dragover'); });
dropOverlay.addEventListener('dragleave', () => { dropOverlay.classList.remove('dragover'); });
dropOverlay.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadImage(f);
});

btnHide.addEventListener('click', () => { menu.classList.remove('visible'); btnShow.classList.add('visible'); });
btnShow.addEventListener('click', () => { menu.classList.add('visible'); btnShow.classList.remove('visible'); });

btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) lastTime = performance.now();
});

btnReset.addEventListener('click', () => {
  if (sourceCanvas) { ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); ctx.drawImage(sourceCanvas, 0, 0); }
  stampAccum = 0;
  showToast('Reset to original');
});

btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);

btnLoadNew.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
  if (animFrame) cancelAnimationFrame(animFrame);
  sourceImage = null;
  sourceData = null;
  dropOverlay.classList.add('visible');
  fileInput.value = '';
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
