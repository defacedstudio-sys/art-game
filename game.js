'use strict';

/* ═══════════════════════════════════════════════════════════════
   ABSTRACT ART — PIXEL CHUNK ANIMATOR
   Chunks, snake-game wanderers, paint.net strokes, landscape
   generation, musical rhythm mode. Whimsical & fun.
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

const sl = {
  speed:         document.getElementById('speed-slider'),
  minSize:       document.getElementById('min-size-slider'),
  maxSize:       document.getElementById('max-size-slider'),
  density:       document.getElementById('density-slider'),
  edges:         document.getElementById('edges-slider'),
  restore:       document.getElementById('restore-slider'),
  drift:         document.getElementById('drift-slider'),
  whiteBias:     document.getElementById('white-bias-slider'),
  shapeStyle:    document.getElementById('shape-style-slider'),
  snakes:        document.getElementById('wanderer-slider'),
  snakeWidth:    document.getElementById('wanderer-width-slider'),
  paint:         document.getElementById('paint-slider'),
  paintSize:     document.getElementById('paint-size-slider'),
  rhythm:        document.getElementById('rhythm-slider'),
};

const tog = {
  chunks:    document.getElementById('tog-chunks'),
  snakes:    document.getElementById('tog-snakes'),
  paint:     document.getElementById('tog-paint'),
  landscape: document.getElementById('tog-landscape'),
  rhythm:    document.getElementById('tog-rhythm'),
  walkers:   document.getElementById('tog-walkers'),
  dog:       document.getElementById('tog-dog'),
  bird:      document.getElementById('tog-bird'),
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
let globalTime = 0; // total elapsed ms for rhythm

let snakes = [];
let paintStrokes = [];
let walkerList = [];
let dogList = [];
let birdList = [];

let mediaRecorder = null;
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;

const W = 4800;
const H = 2700;
const SLOW_MS = 3000;

// Shape pools
let poolStripes = [], poolClumps = [], poolWeird = [], poolBrush = [];
const POOL = 200;

/* ── PARAMS ────────────────────────────────────────────────────── */
function P() {
  return {
    speed:      +sl.speed.value,
    minSize:    +sl.minSize.value,
    maxSize:    +sl.maxSize.value,
    density:    +sl.density.value,
    maxEdges:   +sl.edges.value,
    restore:    +sl.restore.value / 100,
    drift:      +sl.drift.value / 100,
    whiteBias:  +sl.whiteBias.value / 100,
    shapeStyle: +sl.shapeStyle.value / 100,
    snakeCount: +sl.snakes.value,
    snakeWidth: +sl.snakeWidth.value,
    paintCount: +sl.paint.value,
    paintSize:  +sl.paintSize.value,
    bpm:        +sl.rhythm.value,
    // toggles
    doChunks:    tog.chunks.checked,
    doSnakes:    tog.snakes.checked,
    doPaint:     tog.paint.checked,
    doLandscape: tog.landscape.checked,
    doRhythm:    tog.rhythm.checked,
    doWalkers:   tog.walkers.checked,
    doDog:       tog.dog.checked,
    doBird:      tog.bird.checked,
  };
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE LOADING
═══════════════════════════════════════════════════════════════ */
function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => { bootImage(img); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function bootImage(img) {
  sourceImage = img;
  initSourceCanvas();
  buildShapePools();
  dropOverlay.classList.remove('visible');
  startAnimation();
}

function initSourceCanvas() {
  canvas.width = W;
  canvas.height = H;
  sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = W;
  sourceCanvas.height = H;
  sourceCtx = sourceCanvas.getContext('2d');

  const ia = sourceImage.width / sourceImage.height;
  const ca = W / H;
  let sw, sh, sx, sy;
  if (ia > ca) { sh = sourceImage.height; sw = sh * ca; sx = (sourceImage.width - sw) / 2; sy = 0; }
  else { sw = sourceImage.width; sh = sw / ca; sx = 0; sy = (sourceImage.height - sh) / 2; }
  sourceCtx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, W, H);
  sourceData = sourceCtx.getImageData(0, 0, W, H);
  ctx.drawImage(sourceCanvas, 0, 0);
}

/* ═══════════════════════════════════════════════════════════════
   SHAPE POOLS
═══════════════════════════════════════════════════════════════ */
function grow(n, mode) {
  const cells = [[0,0]];
  const set = new Set(['0,0']);
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  let pref = Math.random() < 0.5 ? 0 : 1;
  let hR = 0, hC = 0, ang = Math.random() * Math.PI * 2;

  for (let i = 1; i < n; i++) {
    if (mode === 'brush') {
      ang += (Math.random() - 0.5) * 0.6;
      const nr = hR + Math.round(Math.sin(ang));
      const nc = hC + Math.round(Math.cos(ang));
      if (!set.has(nr+','+nc)) { cells.push([nr,nc]); set.add(nr+','+nc); hR=nr; hC=nc; }
      const pr = Math.round(Math.cos(ang)), pc = Math.round(-Math.sin(ang));
      const w = 1 + Math.floor(Math.random()*3);
      for (let j=-w;j<=w;j++) {
        const wr=hR+pr*j, wc=hC+pc*j, wk=wr+','+wc;
        if (!set.has(wk) && i<n) { cells.push([wr,wc]); set.add(wk); i++; }
      }
      continue;
    }
    const fr = [];
    for (const [r,c] of cells) for (let d=0;d<4;d++) {
      const nr=r+dirs[d][0], nc=c+dirs[d][1];
      if (!set.has(nr+','+nc)) fr.push([nr,nc,d]);
    }
    if (!fr.length) break;
    let pick;
    if (mode==='stripe') {
      const pf = fr.filter(f => pref===0 ? f[2]<2 : f[2]>=2);
      pick = (pf.length && Math.random()<0.88) ? pf[Math.floor(Math.random()*pf.length)] : fr[Math.floor(Math.random()*fr.length)];
    } else if (mode==='clump') {
      const sc = fr.map(f => { let n=0; for (const d of dirs) if (set.has((f[0]+d[0])+','+(f[1]+d[1]))) n++; return {f,n}; });
      sc.sort((a,b)=>b.n-a.n);
      pick = sc[Math.floor(Math.random()*Math.max(1,Math.ceil(sc.length*0.4)))].f;
    } else {
      pick = fr[Math.floor(Math.random()*fr.length)];
      if (Math.random()<0.2) pref = 1-pref;
    }
    cells.push([pick[0],pick[1]]); set.add(pick[0]+','+pick[1]);
  }
  const mr = Math.min(...cells.map(c=>c[0])), mc = Math.min(...cells.map(c=>c[1]));
  return cells.map(([r,c])=>[r-mr,c-mc]);
}

function buildShapePools() {
  poolStripes=[]; poolClumps=[]; poolWeird=[]; poolBrush=[];
  for (let i=0;i<POOL;i++) {
    const n = 8 + Math.floor(Math.random()*50);
    poolStripes.push(grow(n,'stripe'));
    poolClumps.push(grow(n,'clump'));
    poolWeird.push(grow(n,'weird'));
    poolBrush.push(grow(n,'brush'));
  }
}

function pickShape(style) {
  const i = Math.floor(Math.random()*POOL);
  if (Math.random()<0.3) return poolBrush[i];
  if (style<0.33) return poolStripes[i];
  if (style>0.66) return poolClumps[i];
  return poolWeird[i];
}

/* ═══════════════════════════════════════════════════════════════
   WHITE BIAS
═══════════════════════════════════════════════════════════════ */
function pickSrc(w, h, wb) {
  const mx = Math.max(1,W-w), my = Math.max(1,H-h);
  if (wb < 0.05) return [Math.floor(Math.random()*mx), Math.floor(Math.random()*my)];
  const d = sourceData.data;
  let bx=0,by=0,bs=-1;
  const tries = 3+Math.floor(wb*15);
  for (let i=0;i<tries;i++) {
    const cx=Math.floor(Math.random()*mx), cy=Math.floor(Math.random()*my);
    let t=0; for (let j=0;j<8;j++) {
      const px=Math.min(W-1,cx+Math.floor(Math.random()*w));
      const py=Math.min(H-1,cy+Math.floor(Math.random()*h));
      const idx=(py*W+px)*4; t+=(d[idx]+d[idx+1]+d[idx+2])/765;
    }
    const score = (1-wb)*Math.random() + wb*(t/8);
    if (score>bs) { bs=score; bx=cx; by=cy; }
  }
  return [bx,by];
}

/* ═══════════════════════════════════════════════════════════════
   CHUNK STAMPING
═══════════════════════════════════════════════════════════════ */
function stampChunk(p) {
  const cells = pickShape(p.shapeStyle);
  const size = p.minSize + Math.random()*(p.maxSize-p.minSize);
  const cpx = Math.max(2, Math.floor(size / Math.max(1, Math.sqrt(cells.length))));
  let mR=0, mC=0;
  for (const [r,c] of cells) { if (r>mR)mR=r; if(c>mC)mC=c; }
  const sw = (mC+1)*cpx, sh = (mR+1)*cpx;
  if (sw<2||sh<2) return;

  const [sx,sy] = pickSrc(sw,sh,p.whiteBias);
  let dx = Math.floor(Math.random()*W) - Math.floor(sw/2);
  let dy = Math.floor(Math.random()*H) - Math.floor(sh/2);
  if (p.drift>0.01) { dx=Math.round(dx*(1-p.drift)+sx*p.drift); dy=Math.round(dy*(1-p.drift)+sy*p.drift); }

  for (const [r,c] of cells) {
    const ddx=dx+c*cpx, ddy=dy+r*cpx, ssx=sx+c*cpx, ssy=sy+r*cpx;
    if (ddx<-cpx||ddx>W||ddy<-cpx||ddy>H) continue;
    if (ssx<0||ssx+cpx>W||ssy<0||ssy+cpx>H) continue;
    ctx.drawImage(sourceCanvas, ssx,ssy,cpx,cpx, ddx,ddy,cpx,cpx);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SNAKES — Nokia snake-game style: 90° turns only, pixel grid,
   geometric squared-off trails. No curves.
═══════════════════════════════════════════════════════════════ */
const SNAKE_DIRS = [[0,1],[1,0],[0,-1],[-1,0]]; // right, down, left, up

function spawnSnake(p) {
  const cellPx = Math.max(4, Math.floor(p.snakeWidth * (0.5+Math.random())));
  const dir = Math.floor(Math.random()*4);
  const x = Math.floor(Math.random() * (W/cellPx)) * cellPx;
  const y = Math.floor(Math.random() * (H/cellPx)) * cellPx;
  return {
    x, y,
    dir,
    cellPx,
    // Source offset — samples from a different area
    srcOffX: Math.floor((Math.random()-0.5) * W * 0.7),
    srcOffY: Math.floor((Math.random()-0.5) * H * 0.7),
    age: 0,
    lifetime: 100 + Math.floor(Math.random()*500),
    turnTimer: 5 + Math.floor(Math.random()*15), // steps between turns
    turnCount: 0,
    // Body width in cells (1-4)
    bodyW: 1 + Math.floor(Math.random()*3),
  };
}

function stepSnake(s) {
  s.age++;
  s.turnCount++;

  // Turn decision: snake-game style 90° turns
  if (s.turnCount >= s.turnTimer) {
    s.turnCount = 0;
    s.turnTimer = 3 + Math.floor(Math.random()*12);
    // Turn left or right (90°)
    if (Math.random() < 0.5) {
      s.dir = (s.dir + 1) % 4;
    } else {
      s.dir = (s.dir + 3) % 4;
    }
  }

  // Move one cell in current direction
  const d = SNAKE_DIRS[s.dir];
  s.x += d[1] * s.cellPx;
  s.y += d[0] * s.cellPx;

  // Wrap
  if (s.x < 0) s.x += W;
  if (s.x >= W) s.x -= W;
  if (s.y < 0) s.y += H;
  if (s.y >= H) s.y -= H;

  // Stamp body — a square block of cells
  const perpDir = (s.dir + 1) % 4;
  const pd = SNAKE_DIRS[perpDir];

  for (let w = -Math.floor(s.bodyW/2); w <= Math.floor(s.bodyW/2); w++) {
    const dx = s.x + pd[1] * w * s.cellPx;
    const dy = s.y + pd[0] * w * s.cellPx;
    let sx = ((dx + s.srcOffX) % W + W) % W;
    let sy = ((dy + s.srcOffY) % H + H) % H;

    if (dx<0||dx+s.cellPx>W||dy<0||dy+s.cellPx>H) continue;
    if (sx+s.cellPx>W) sx = W-s.cellPx;
    if (sy+s.cellPx>H) sy = H-s.cellPx;

    ctx.drawImage(sourceCanvas, sx,sy,s.cellPx,s.cellPx, dx,dy,s.cellPx,s.cellPx);
  }

  return s.age < s.lifetime;
}

function updateSnakes(p) {
  while (snakes.length < p.snakeCount) snakes.push(spawnSnake(p));
  while (snakes.length > p.snakeCount) snakes.pop();
  for (let i=0; i<snakes.length; i++) {
    if (!stepSnake(snakes[i])) snakes[i] = spawnSnake(p);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PAINT.NET STROKES — long sweeping strokes that drag pixels
   like a smear/smudge tool, pulling color across the canvas
═══════════════════════════════════════════════════════════════ */
function spawnPaintStroke(p) {
  const sz = p.paintSize * (0.5 + Math.random());
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    angle: Math.random() * Math.PI * 2,
    speed: 3 + Math.random() * 10,
    size: sz,
    srcX: Math.floor(Math.random() * W),
    srcY: Math.floor(Math.random() * H),
    age: 0,
    lifetime: 50 + Math.floor(Math.random() * 200),
    wobble: Math.random() * Math.PI * 2,
    curve: (Math.random() - 0.5) * 0.06,
  };
}

function stepPaintStroke(s) {
  s.age++;
  s.angle += s.curve;
  s.wobble += 0.15;
  s.x += Math.cos(s.angle) * s.speed;
  s.y += Math.sin(s.angle) * s.speed;

  // Wrap
  if (s.x<0) s.x+=W; if (s.x>=W) s.x-=W;
  if (s.y<0) s.y+=H; if (s.y>=H) s.y-=H;

  const w = Math.floor(s.size * (0.7 + Math.sin(s.wobble) * 0.3));
  const h = Math.max(4, Math.floor(w * 0.3));
  const dx = Math.floor(s.x - w/2);
  const dy = Math.floor(s.y - h/2);

  // Source tracks along the original image at a different position
  let sx = Math.floor((s.srcX + s.age * Math.cos(s.angle) * 2) % W);
  let sy = Math.floor((s.srcY + s.age * Math.sin(s.angle) * 2) % H);
  if (sx<0) sx+=W; if (sy<0) sy+=H;

  // Paint a rectangular smear
  const cw = Math.min(w, W-Math.max(0,dx), W-sx);
  const ch = Math.min(h, H-Math.max(0,dy), H-sy);
  if (cw>0 && ch>0 && dx>=0 && dy>=0 && dx+cw<=W && dy+ch<=H && sx+cw<=W && sy+ch<=H) {
    ctx.drawImage(sourceCanvas, sx,sy,cw,ch, dx,dy,cw,ch);
  }

  return s.age < s.lifetime;
}

function updatePaint(p) {
  while (paintStrokes.length < p.paintCount) paintStrokes.push(spawnPaintStroke(p));
  while (paintStrokes.length > p.paintCount) paintStrokes.pop();
  for (let i=0; i<paintStrokes.length; i++) {
    if (!stepPaintStroke(paintStrokes[i])) paintStrokes[i] = spawnPaintStroke(p);
  }
}

/* ═══════════════════════════════════════════════════════════════
   LANDSCAPE MODE — stamps chunks biased towards forming
   mountain ridgelines, cloud layers, and creature silhouettes
   at specific horizon zones on the canvas.
═══════════════════════════════════════════════════════════════ */
function stampLandscape(p) {
  const cells = pickShape(p.shapeStyle);
  const size = p.minSize + Math.random()*(p.maxSize-p.minSize);
  const cpx = Math.max(2, Math.floor(size / Math.max(1, Math.sqrt(cells.length))));
  let mR=0, mC=0;
  for (const [r,c] of cells) { if(r>mR)mR=r; if(c>mC)mC=c; }
  const sw = (mC+1)*cpx, sh = (mR+1)*cpx;
  if (sw<2||sh<2) return;

  const [sx,sy] = pickSrc(sw,sh,p.whiteBias);

  // Choose a zone: sky (top 30%), mountains (30-60%), ground (60-85%), creatures (random)
  const zone = Math.random();
  let dy;
  if (zone < 0.25) {
    // Sky/clouds — top area, wide shapes
    dy = Math.floor(Math.random() * H * 0.3);
  } else if (zone < 0.55) {
    // Mountain ridgeline — middle band, follow a ridge curve
    const ridge = H * 0.35 + Math.sin(globalTime * 0.0003 + Math.random() * 6) * H * 0.1;
    dy = Math.floor(ridge + (Math.random()-0.5) * H * 0.15);
  } else if (zone < 0.8) {
    // Ground/terrain
    dy = Math.floor(H * 0.55 + Math.random() * H * 0.35);
  } else {
    // Creatures/animals — small shapes scattered
    dy = Math.floor(H * 0.4 + Math.random() * H * 0.4);
  }
  const dx = Math.floor(Math.random() * W) - Math.floor(sw/2);

  for (const [r,c] of cells) {
    const ddx=dx+c*cpx, ddy=dy+r*cpx, ssx=sx+c*cpx, ssy=sy+r*cpx;
    if (ddx<-cpx||ddx>W||ddy<-cpx||ddy>H) continue;
    if (ssx<0||ssx+cpx>W||ssy<0||ssy+cpx>H) continue;
    ctx.drawImage(sourceCanvas, ssx,ssy,cpx,cpx, ddx,ddy,cpx,cpx);
  }
}

/* ═══════════════════════════════════════════════════════════════
   RHYTHM MODE — pulses activity to a BPM, creating musical
   bursts and pauses. Whimsical bouncy feel.
═══════════════════════════════════════════════════════════════ */
function rhythmMultiplier(bpm, time) {
  const beatMs = 60000 / bpm;
  const phase = (time % beatMs) / beatMs; // 0-1 within beat

  // Kick on the beat (phase 0): big burst
  // Snare on half beat: medium burst
  // Rest: quiet
  // Creates a bouncy 4/4 feel

  const beat = Math.floor(time / beatMs) % 4;
  let mult = 0.1; // base quiet level

  if (phase < 0.15) {
    // On the beat — burst!
    if (beat === 0) mult = 4.0;        // big downbeat
    else if (beat === 2) mult = 2.5;    // snare
    else mult = 1.5;                    // ghost notes
  } else if (phase < 0.3) {
    mult = 0.8; // decay
  } else if (phase > 0.45 && phase < 0.55) {
    // Off-beat swing — little playful hits
    mult = 1.2;
  }

  // Add some swing — every other beat is slightly late
  // Makes it feel more musical and less mechanical
  return mult;
}

/* ═══════════════════════════════════════════════════════════════
   STICK FIGURE WALKERS — two stick fingers walking together
   All geometric pixel blocks, no curves.
═══════════════════════════════════════════════════════════════ */
function spawnWalker() {
  const s = 3 + Math.floor(Math.random() * 5); // pixel scale
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    x: dir > 0 ? -100 : W + 100,
    y: H * (0.5 + Math.random() * 0.4),
    scale: s,
    dir,
    speed: 1 + Math.random() * 3,
    step: 0,
    srcX: Math.floor(Math.random() * W),
    srcY: Math.floor(Math.random() * H),
  };
}

function drawBlockAt(bx, by, bw, bh, srcOx, srcOy) {
  const sx = ((srcOx + bx) % W + W) % W;
  const sy = ((srcOy + by) % H + H) % H;
  const cw = Math.min(bw, W - sx, W - bx);
  const ch = Math.min(bh, H - sy, H - by);
  if (cw > 0 && ch > 0 && bx >= 0 && by >= 0 && bx + cw <= W && by + ch <= H) {
    ctx.drawImage(sourceCanvas, sx, sy, cw, ch, bx, by, cw, ch);
  }
}

function stepWalker(w) {
  w.x += w.dir * w.speed;
  w.step += 0.08;

  const s = w.scale;
  const x = Math.floor(w.x);
  const y = Math.floor(w.y);
  const legSwing = Math.sin(w.step) * s * 4;
  const legSwing2 = Math.sin(w.step + Math.PI) * s * 4;

  // Figure 1 (left)
  const f1x = x;
  // Head
  drawBlockAt(f1x - s*2, y - s*14, s*4, s*4, w.srcX, w.srcY);
  // Body
  drawBlockAt(f1x - s, y - s*10, s*2, s*8, w.srcX, w.srcY);
  // Left leg
  drawBlockAt(f1x - s*2, y - s*2 + Math.floor(legSwing), s*2, s*6, w.srcX, w.srcY);
  // Right leg
  drawBlockAt(f1x, y - s*2 + Math.floor(legSwing2), s*2, s*6, w.srcX, w.srcY);
  // Left arm
  const armSwing = Math.sin(w.step + Math.PI) * s * 3;
  drawBlockAt(f1x - s*3, y - s*9 + Math.floor(armSwing), s*2, s*5, w.srcX, w.srcY);
  // Right arm
  drawBlockAt(f1x + s, y - s*9 + Math.floor(-armSwing), s*2, s*5, w.srcX, w.srcY);

  // Figure 2 (partner, walking beside)
  const f2x = x + w.dir * s * 10;
  drawBlockAt(f2x - s*2, y - s*13, s*3, s*3, w.srcX + 200, w.srcY + 200);
  drawBlockAt(f2x - s, y - s*10, s*2, s*7, w.srcX + 200, w.srcY + 200);
  drawBlockAt(f2x - s*2, y - s*3 + Math.floor(legSwing2), s*2, s*5, w.srcX+200, w.srcY+200);
  drawBlockAt(f2x, y - s*3 + Math.floor(legSwing), s*2, s*5, w.srcX+200, w.srcY+200);
  drawBlockAt(f2x - s*3, y - s*8 + Math.floor(-armSwing), s*2, s*4, w.srcX+200, w.srcY+200);
  drawBlockAt(f2x + s, y - s*8 + Math.floor(armSwing), s*2, s*4, w.srcX+200, w.srcY+200);

  // Off screen? Respawn
  if (w.dir > 0 && w.x > W + 200) return false;
  if (w.dir < 0 && w.x < -200) return false;
  return true;
}

function updateWalkers() {
  if (walkerList.length < 2 && Math.random() < 0.005) walkerList.push(spawnWalker());
  for (let i = walkerList.length - 1; i >= 0; i--) {
    if (!stepWalker(walkerList[i])) walkerList.splice(i, 1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DOG — crude geometric pixel dog that trots across the canvas
═══════════════════════════════════════════════════════════════ */
function spawnDog() {
  const s = 3 + Math.floor(Math.random() * 4);
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    x: dir > 0 ? -150 : W + 150,
    y: H * (0.55 + Math.random() * 0.35),
    scale: s,
    dir,
    speed: 1.5 + Math.random() * 2.5,
    step: 0,
    srcX: Math.floor(Math.random() * W),
    srcY: Math.floor(Math.random() * H),
    tailWag: 0,
  };
}

function stepDog(d) {
  d.x += d.dir * d.speed;
  d.step += 0.1;
  d.tailWag += 0.25;

  const s = d.scale;
  const x = Math.floor(d.x);
  const y = Math.floor(d.y);
  const legF = Math.sin(d.step) * s * 3;
  const legB = Math.sin(d.step + Math.PI) * s * 3;
  const flip = d.dir;

  // Body (long rectangle)
  drawBlockAt(x - s*8, y - s*6, s*16, s*6, d.srcX, d.srcY);
  // Head
  const headX = x + flip * s * 8;
  drawBlockAt(headX - s*3, y - s*9, s*6, s*5, d.srcX, d.srcY);
  // Snout
  drawBlockAt(headX + flip * s*2, y - s*7, s*3, s*2, d.srcX, d.srcY);
  // Ear
  drawBlockAt(headX - s, y - s*11, s*2, s*3, d.srcX, d.srcY);
  // Front legs
  drawBlockAt(x + flip*s*4, y + Math.floor(legF), s*2, s*6, d.srcX, d.srcY);
  drawBlockAt(x + flip*s*6, y + Math.floor(legB), s*2, s*6, d.srcX, d.srcY);
  // Back legs
  drawBlockAt(x - flip*s*5, y + Math.floor(legB), s*2, s*6, d.srcX, d.srcY);
  drawBlockAt(x - flip*s*7, y + Math.floor(legF), s*2, s*6, d.srcX, d.srcY);
  // Tail (wags!)
  const tailAngle = Math.sin(d.tailWag) * s * 3;
  drawBlockAt(x - flip*s*9, y - s*7 + Math.floor(tailAngle), s*2, s*4, d.srcX, d.srcY);

  if (d.dir > 0 && d.x > W + 250) return false;
  if (d.dir < 0 && d.x < -250) return false;
  return true;
}

function updateDogs() {
  if (dogList.length < 2 && Math.random() < 0.003) dogList.push(spawnDog());
  for (let i = dogList.length - 1; i >= 0; i--) {
    if (!stepDog(dogList[i])) dogList.splice(i, 1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   BIRD — geometric pixel bird that flaps across the sky
═══════════════════════════════════════════════════════════════ */
function spawnBird() {
  const s = 2 + Math.floor(Math.random() * 4);
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    x: dir > 0 ? -120 : W + 120,
    y: H * (0.05 + Math.random() * 0.4),
    scale: s,
    dir,
    speed: 2 + Math.random() * 4,
    flap: 0,
    flapSpeed: 0.12 + Math.random() * 0.08,
    srcX: Math.floor(Math.random() * W),
    srcY: Math.floor(Math.random() * H),
    bobble: 0,
  };
}

function stepBird(b) {
  b.x += b.dir * b.speed;
  b.flap += b.flapSpeed;
  b.bobble += 0.04;

  const s = b.scale;
  const x = Math.floor(b.x);
  const yBob = Math.sin(b.bobble) * s * 2;
  const y = Math.floor(b.y + yBob);
  const wingAngle = Math.sin(b.flap); // -1 to 1
  const wingUp = Math.floor(wingAngle * s * 6);

  // Body (small rectangle)
  drawBlockAt(x - s*2, y - s, s*4, s*2, b.srcX, b.srcY);
  // Head
  const headX = x + b.dir * s * 3;
  drawBlockAt(headX - s, y - s*2, s*2, s*2, b.srcX, b.srcY);
  // Beak
  drawBlockAt(headX + b.dir * s, y - s, s*2, s, b.srcX, b.srcY);
  // Left wing
  drawBlockAt(x - s*6, y - s*2 - wingUp, s*4, s*2, b.srcX, b.srcY);
  drawBlockAt(x - s*9, y - s*2 - wingUp*1.5, s*3, s, b.srcX, b.srcY);
  // Right wing
  drawBlockAt(x + s*2, y - s*2 - wingUp, s*4, s*2, b.srcX, b.srcY);
  drawBlockAt(x + s*6, y - s*2 - wingUp*1.5, s*3, s, b.srcX, b.srcY);
  // Tail
  drawBlockAt(x - b.dir*s*3, y - s*2, s*2, s*3, b.srcX, b.srcY);

  if (b.dir > 0 && b.x > W + 200) return false;
  if (b.dir < 0 && b.x < -200) return false;
  return true;
}

function updateBirds() {
  if (birdList.length < 3 && Math.random() < 0.008) birdList.push(spawnBird());
  for (let i = birdList.length - 1; i >= 0; i--) {
    if (!stepBird(birdList[i])) birdList.splice(i, 1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════════════════════════════ */
function startAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  stampAccum = 0;
  globalTime = 0;
  snakes = [];
  paintStrokes = [];
  walkerList = [];
  dogList = [];
  birdList = [];
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
  globalTime += dt;

  const p = P();

  // Restore
  if (p.restore > 0) {
    ctx.save();
    ctx.globalAlpha = p.restore * 0.2;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  }

  // Rhythm multiplier
  const rmult = p.doRhythm ? rhythmMultiplier(p.bpm, globalTime) : 1;

  // ── CHUNKS ──
  if (p.doChunks) {
    stampAccum += dt;
    const msPerStamp = SLOW_MS / Math.pow(p.speed/100, 2.5);
    let stamps = 0;
    if (p.speed <= 5) {
      while (stampAccum >= msPerStamp) { stampAccum -= msPerStamp; stamps++; }
      stamps = Math.max(0, stamps * Math.max(1, Math.floor(p.density/10)));
    } else {
      stampAccum = 0;
      stamps = Math.max(1, Math.floor(Math.pow(p.speed/100,2.5)*60*(p.density/10)));
    }
    stamps = Math.floor(stamps * rmult);
    for (let i=0; i<stamps; i++) stampChunk(p);
  }

  // ── LANDSCAPE ──
  if (p.doLandscape) {
    const lStamps = Math.max(1, Math.floor(3 * rmult * (p.density / 10)));
    for (let i=0; i<lStamps; i++) stampLandscape(p);
  }

  // ── SNAKES ──
  if (p.doSnakes) {
    const snakeSteps = Math.max(1, Math.floor((p.speed/15) * rmult));
    for (let s=0; s<snakeSteps; s++) updateSnakes(p);
  }

  // ── PAINT STROKES ──
  if (p.doPaint) {
    const paintSteps = Math.max(1, Math.floor(2 * rmult));
    for (let s=0; s<paintSteps; s++) updatePaint(p);
  }

  // ── WALKERS ──
  if (p.doWalkers) updateWalkers();

  // ── DOG ──
  if (p.doDog) updateDogs();

  // ── BIRD ──
  if (p.doBird) updateBirds();
}

/* ═══════════════════════════════════════════════════════════════
   RECORDING
═══════════════════════════════════════════════════════════════ */
function startRecording() {
  const stream = canvas.captureStream(30);
  const types = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  let mime = '';
  for (const t of types) if (MediaRecorder.isTypeSupported(t)) { mime=t; break; }
  if (!mime) { showToast('Recording not supported'); return; }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:8000000 });
  mediaRecorder.ondataavailable = e => { if (e.data.size>0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const ext = mime.includes('mp4')?'mp4':'webm';
    const blob = new Blob(recordedChunks, {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`art-${Date.now()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
    showToast(`Saved .${ext}`);
  };

  mediaRecorder.start(100);
  recordStartTime = Date.now();
  btnRecord.disabled = true;
  btnStop.disabled = false;
  recordStatus.classList.remove('hidden');
  recordTimerInterval = setInterval(() => {
    const e = Math.floor((Date.now()-recordStartTime)/1000);
    recordTime.textContent = String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
  }, 500);
  showToast('Recording — tweak sliders to program output');
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
fileInput.addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0]); });
dropOverlay.addEventListener('dragover', e => { e.preventDefault(); dropOverlay.classList.add('dragover'); });
dropOverlay.addEventListener('dragleave', () => dropOverlay.classList.remove('dragover'));
dropOverlay.addEventListener('drop', e => {
  e.preventDefault(); dropOverlay.classList.remove('dragover');
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
  if (sourceCanvas) { ctx.clearRect(0,0,W,H); ctx.drawImage(sourceCanvas,0,0); }
  stampAccum=0; snakes=[]; paintStrokes=[]; walkerList=[]; dogList=[]; birdList=[];
  showToast('Reset');
});
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnLoadNew.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state!=='inactive') stopRecording();
  if (animFrame) cancelAnimationFrame(animFrame);
  sourceImage=null; sourceData=null; snakes=[]; paintStrokes=[]; walkerList=[]; dogList=[]; birdList=[];
  dropOverlay.classList.add('visible');
  fileInput.value='';
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

/* ═══════════════════════════════════════════════════════════════
   INIT — auto-load artwork.jpg if available
═══════════════════════════════════════════════════════════════ */
canvas.width = W;
canvas.height = H;

(function autoLoad() {
  const img = new Image();
  img.onload = () => bootImage(img);
  img.onerror = () => {}; // show drop overlay
  img.src = 'artwork.jpg';
})();
