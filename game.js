'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK STACKER
   Brushstroke shapes, wandering line creatures, fast stamping.
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
  speed:         document.getElementById('speed-slider'),
  minSize:       document.getElementById('min-size-slider'),
  maxSize:       document.getElementById('max-size-slider'),
  density:       document.getElementById('density-slider'),
  edges:         document.getElementById('edges-slider'),
  restore:       document.getElementById('restore-slider'),
  drift:         document.getElementById('drift-slider'),
  whiteBias:     document.getElementById('white-bias-slider'),
  shapeStyle:    document.getElementById('shape-style-slider'),
  wanderers:     document.getElementById('wanderer-slider'),
  wandererWidth: document.getElementById('wanderer-width-slider'),
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

// Wanderers — autonomous line creatures
let wanderers = [];

let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

const CANVAS_W = 4800;
const CANVAS_H = 2700;
const speed1MsPerStamp = 3000;

// Pre-generated shape pools
let shapePoolStripes = [];
let shapePoolClumps = [];
let shapePoolWeird = [];
let shapePoolBrush = [];
const POOL_SIZE = 200;

/* ── PARAMS ────────────────────────────────────────────────────── */
function getParams() {
  return {
    speed:         parseInt(sliders.speed.value),
    minSize:       parseInt(sliders.minSize.value),
    maxSize:       parseInt(sliders.maxSize.value),
    density:       parseInt(sliders.density.value),
    maxEdges:      parseInt(sliders.edges.value),
    restore:       parseInt(sliders.restore.value) / 100,
    drift:         parseInt(sliders.drift.value) / 100,
    whiteBias:     parseInt(sliders.whiteBias.value) / 100,
    shapeStyle:    parseInt(sliders.shapeStyle.value) / 100,
    wandererCount: parseInt(sliders.wanderers.value),
    wandererWidth: parseInt(sliders.wandererWidth.value),
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
      showToast('Artwork loaded');
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
   SHAPE POOLS
   Brushstrokes: flowing curves made of cells with varying width.
   Stripes: strongly directional lines.
   Clumps: compact fat blobs.
   Weird: chaotic mixed forms.
═══════════════════════════════════════════════════════════════ */

function growPolyomino(numCells, mode) {
  const cells = [[0, 0]];
  const cellSet = new Set();
  cellSet.add('0,0');
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  let prefDir = Math.random() < 0.5 ? 0 : 1;
  // For brushstroke: track a "head" position and grow from it
  let headR = 0, headC = 0;
  let angle = Math.random() * Math.PI * 2;

  for (let i = 1; i < numCells; i++) {
    if (mode === 'brush') {
      // Brushstroke: advance head along a curving path, add width
      angle += (Math.random() - 0.5) * 0.6;
      const nr = headR + Math.round(Math.sin(angle));
      const nc = headC + Math.round(Math.cos(angle));
      const key = nr + ',' + nc;
      if (!cellSet.has(key)) {
        cells.push([nr, nc]);
        cellSet.add(key);
        headR = nr;
        headC = nc;
      }
      // Add width: fill neighbors perpendicular to direction
      const perpR = Math.round(Math.cos(angle));
      const perpC = Math.round(-Math.sin(angle));
      const width = 1 + Math.floor(Math.random() * 3);
      for (let w = -width; w <= width; w++) {
        const wr = headR + perpR * w;
        const wc = headC + perpC * w;
        const wk = wr + ',' + wc;
        if (!cellSet.has(wk) && i + Math.abs(w) < numCells) {
          cells.push([wr, wc]);
          cellSet.add(wk);
          i++;
        }
      }
      continue;
    }

    // Collect frontier for other modes
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
      const preferred = frontier.filter(f =>
        prefDir === 0 ? (f[2] < 2) : (f[2] >= 2)
      );
      pick = (preferred.length > 0 && Math.random() < 0.88)
        ? preferred[Math.floor(Math.random() * preferred.length)]
        : frontier[Math.floor(Math.random() * frontier.length)];
    } else if (mode === 'clump') {
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
      pick = frontier[Math.floor(Math.random() * frontier.length)];
      if (Math.random() < 0.2) prefDir = 1 - prefDir;
    }

    cells.push([pick[0], pick[1]]);
    cellSet.add(pick[0] + ',' + pick[1]);
  }

  const minR = Math.min(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  return cells.map(([r, c]) => [r - minR, c - minC]);
}

function buildShapePools() {
  shapePoolStripes = [];
  shapePoolClumps = [];
  shapePoolWeird = [];
  shapePoolBrush = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const n = 8 + Math.floor(Math.random() * 50); // bigger shapes: 8-57 cells
    shapePoolStripes.push(growPolyomino(n, 'stripe'));
    shapePoolClumps.push(growPolyomino(n, 'clump'));
    shapePoolWeird.push(growPolyomino(n, 'weird'));
    shapePoolBrush.push(growPolyomino(n, 'brush'));
  }
}

function pickShape(shapeStyle) {
  const idx = Math.floor(Math.random() * POOL_SIZE);
  // Mix brushstrokes in everywhere (~30% chance)
  if (Math.random() < 0.3) return shapePoolBrush[idx];
  if (shapeStyle < 0.33) return shapePoolStripes[idx];
  if (shapeStyle > 0.66) return shapePoolClumps[idx];
  return shapePoolWeird[idx];
}

/* ═══════════════════════════════════════════════════════════════
   WANDERERS — autonomous line creatures that travel the canvas,
   sampling from the original art and stamping as they go.
   Each one has a position, direction, width, and lifetime.
   They curve, fork, and create their own pocket compositions.
═══════════════════════════════════════════════════════════════ */

function spawnWanderer(wandererWidth) {
  const w = Math.max(4, wandererWidth * (0.5 + Math.random()));
  return {
    // Current position on canvas (destination)
    x: Math.random() * CANVAS_W,
    y: Math.random() * CANVAS_H,
    // Source offset: where this wanderer samples from (different spot)
    srcOffX: (Math.random() - 0.5) * CANVAS_W * 0.8,
    srcOffY: (Math.random() - 0.5) * CANVAS_H * 0.8,
    // Movement
    angle: Math.random() * Math.PI * 2,
    speed: 2 + Math.random() * 8,
    turnRate: (Math.random() - 0.5) * 0.08,
    turnDrift: (Math.random() - 0.5) * 0.002,
    // Appearance
    width: w,
    widthVar: 0.3 + Math.random() * 0.7, // how much width varies
    // Life
    age: 0,
    lifetime: 200 + Math.floor(Math.random() * 800), // steps
    // Personality
    curviness: 0.02 + Math.random() * 0.12,
    wobble: Math.random() * Math.PI * 2,
  };
}

function stepWanderer(w) {
  w.age++;

  // Organic turning: smooth curves with occasional shifts
  w.turnRate += w.turnDrift + (Math.random() - 0.5) * w.curviness;
  w.turnRate = Math.max(-0.15, Math.min(0.15, w.turnRate));
  w.angle += w.turnRate;

  // Move
  w.x += Math.cos(w.angle) * w.speed;
  w.y += Math.sin(w.angle) * w.speed;

  // Wrap around canvas edges
  if (w.x < -50) w.x += CANVAS_W + 100;
  if (w.x > CANVAS_W + 50) w.x -= CANVAS_W + 100;
  if (w.y < -50) w.y += CANVAS_H + 100;
  if (w.y > CANVAS_H + 50) w.y -= CANVAS_H + 100;

  // Wobbling width
  w.wobble += 0.1;
  const currentW = w.width * (1 + Math.sin(w.wobble) * w.widthVar * 0.5);
  const halfW = Math.max(2, Math.floor(currentW / 2));

  // Source position: offset from destination
  let srcX = Math.floor(w.x + w.srcOffX);
  let srcY = Math.floor(w.y + w.srcOffY);
  // Wrap source into canvas bounds
  srcX = ((srcX % CANVAS_W) + CANVAS_W) % CANVAS_W;
  srcY = ((srcY % CANVAS_H) + CANVAS_H) % CANVAS_H;

  const destX = Math.floor(w.x);
  const destY = Math.floor(w.y);

  // Stamp a block of pixels perpendicular to movement direction
  const perpX = -Math.sin(w.angle);
  const perpY = Math.cos(w.angle);

  // Draw several cells along the width
  const cellSize = Math.max(2, Math.floor(currentW / 4));
  const steps = Math.max(1, Math.floor(currentW / cellSize));

  for (let i = -steps; i <= steps; i++) {
    const dx = Math.floor(destX + perpX * i * cellSize);
    const dy = Math.floor(destY + perpY * i * cellSize);
    const sx = Math.floor(srcX + perpX * i * cellSize);
    const sy = Math.floor(srcY + perpY * i * cellSize);

    if (dx < 0 || dx + cellSize > CANVAS_W || dy < 0 || dy + cellSize > CANVAS_H) continue;
    const clampSx = ((sx % CANVAS_W) + CANVAS_W) % CANVAS_W;
    const clampSy = ((sy % CANVAS_H) + CANVAS_H) % CANVAS_H;
    if (clampSx + cellSize > CANVAS_W || clampSy + cellSize > CANVAS_H) continue;

    ctx.drawImage(
      sourceCanvas,
      clampSx, clampSy, cellSize, cellSize,
      dx, dy, cellSize, cellSize
    );
  }

  return w.age < w.lifetime;
}

function updateWanderers(p) {
  const target = p.wandererCount;

  // Spawn new wanderers as needed
  while (wanderers.length < target) {
    wanderers.push(spawnWanderer(p.wandererWidth));
  }

  // Remove excess
  while (wanderers.length > target) {
    wanderers.pop();
  }

  // Step each wanderer, replace dead ones
  for (let i = 0; i < wanderers.length; i++) {
    const alive = stepWanderer(wanderers[i]);
    if (!alive) {
      wanderers[i] = spawnWanderer(p.wandererWidth);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   WHITE BIAS SAMPLING
═══════════════════════════════════════════════════════════════ */

function sampleBrightness(x, y, w, h) {
  const d = sourceData.data;
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const px = Math.min(CANVAS_W - 1, Math.floor(x + Math.random() * w));
    const py = Math.min(CANVAS_H - 1, Math.floor(y + Math.random() * h));
    const idx = (py * CANVAS_W + px) * 4;
    total += (d[idx] + d[idx+1] + d[idx+2]) / 765;
  }
  return total / 8;
}

function pickSourceXY(w, h, whiteBias) {
  const maxX = Math.max(1, CANVAS_W - w);
  const maxY = Math.max(1, CANVAS_H - h);

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
   STAMP CHUNK
═══════════════════════════════════════════════════════════════ */

function stampChunk() {
  const p = getParams();
  const cells = pickShape(p.shapeStyle);

  const size = p.minSize + Math.random() * (p.maxSize - p.minSize);
  const cellPx = Math.max(2, Math.floor(size / Math.max(1, Math.sqrt(cells.length))));

  let maxR = 0, maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const shapeW = (maxC + 1) * cellPx;
  const shapeH = (maxR + 1) * cellPx;
  if (shapeW < 2 || shapeH < 2) return;

  const [srcX, srcY] = pickSourceXY(shapeW, shapeH, p.whiteBias);

  let destX = Math.floor(Math.random() * CANVAS_W) - Math.floor(shapeW / 2);
  let destY = Math.floor(Math.random() * CANVAS_H) - Math.floor(shapeH / 2);

  if (p.drift > 0.01) {
    destX = Math.round(destX * (1 - p.drift) + srcX * p.drift);
    destY = Math.round(destY * (1 - p.drift) + srcY * p.drift);
  }

  for (const [r, c] of cells) {
    const dx = destX + c * cellPx;
    const dy = destY + r * cellPx;
    const sx = srcX + c * cellPx;
    const sy = srcY + r * cellPx;

    if (dx < -cellPx || dx > CANVAS_W || dy < -cellPx || dy > CANVAS_H) continue;
    if (sx < 0 || sx + cellPx > CANVAS_W || sy < 0 || sy + cellPx > CANVAS_H) continue;

    ctx.drawImage(sourceCanvas, sx, sy, cellPx, cellPx, dx, dy, cellPx, cellPx);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════════════════════════════ */

function startAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  stampAccum = 0;
  wanderers = [];
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

  // Restore
  if (p.restore > 0) {
    ctx.save();
    ctx.globalAlpha = p.restore * 0.2;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }

  // Chunk stamps
  stampAccum += dt;
  const msPerStamp = speed1MsPerStamp / Math.pow(p.speed / 100, 2.5);
  let stampsThisFrame = 0;
  if (p.speed <= 5) {
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

  // Wanderers: step multiple times per frame for visible movement
  const wandererSteps = Math.max(1, Math.floor(p.speed / 15));
  for (let s = 0; s < wandererSteps; s++) {
    updateWanderers(p);
  }
}

/* ═══════════════════════════════════════════════════════════════
   RECORDING
═══════════════════════════════════════════════════════════════ */

function startRecording() {
  const stream = canvas.captureStream(30);
  const mimeTypes = [
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4',
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
    recordTime.textContent =
      String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' +
      String(elapsed % 60).padStart(2, '0');
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
  wanderers = [];
  showToast('Reset to original');
});
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnLoadNew.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
  if (animFrame) cancelAnimationFrame(animFrame);
  sourceImage = null;
  sourceData = null;
  wanderers = [];
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

// Auto-load default artwork if available
(function autoLoad() {
  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    initSourceCanvas();
    buildShapePools();
    dropOverlay.classList.remove('visible');
    startAnimation();
  };
  img.onerror = () => {
    // No default artwork found — show the drop overlay
  };
  img.src = 'artwork.jpg';
})();
