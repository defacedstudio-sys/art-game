// ── Art Blocks — game.js ────────────────────────────────────────

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const COLS = 20;
const ROWS = 30;
const CELL = 28; // px per cell

// Tetromino shapes (each entry is array of [row, col] offsets)
const SHAPES = {
  I: [[[0,0],[0,1],[0,2],[0,3]]],
  O: [[[0,0],[0,1],[1,0],[1,1]]],
  T: [[[0,0],[0,1],[0,2],[1,1]]],
  S: [[[1,0],[1,1],[0,1],[0,2]]],
  Z: [[[0,0],[0,1],[1,1],[1,2]]],
  L: [[[0,0],[1,0],[2,0],[2,1]]],
  J: [[[0,1],[1,1],[2,1],[2,0]]],
  DOT: [[[0,0]]],
  PLUS: [[[0,1],[1,0],[1,1],[1,2],[2,1]]],
  CORNER: [[[0,0],[1,0],[1,1]]],
};

const SHAPE_KEYS = Object.keys(SHAPES);

// Art-forward colour palette
const PALETTE = [
  '#ff6b6b','#ff9f43','#ffd93d','#6bcb77',
  '#4d96ff','#c77dff','#f8a5c2','#2ec4b6',
  '#e76f51','#264653','#a8dadc','#457b9d',
  '#f1faee','#1d3557','#e9c46a','#2a9d8f',
  '#8ecae6','#219ebc','#023047','#ffb703',
];

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let board = [];          // 2D: board[row][col] = color string or null
let history = [];        // stack of board snapshots for undo
let activePiece = null;  // { cells:[[r,c],...], color, shapeKey, rotation }
let activeColor = PALETTE[0];
let activeShape = SHAPE_KEYS[0];
let opacity = 1.0;
let dropInterval = null;
let msPerDrop = 600;     // ms between auto-drops
let gameRunning = false;

/* ═══════════════════════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════════════════════════════ */
const canvas    = document.getElementById('game-canvas');
const ctx       = canvas.getContext('2d');
const palette   = document.getElementById('palette');
const customCol = document.getElementById('custom-color');
const activeSw  = document.getElementById('active-swatch');
const shapeDiv  = document.getElementById('shape-selector');
const btnDrop   = document.getElementById('btn-drop');
const btnUndo   = document.getElementById('btn-undo');
const btnClear  = document.getElementById('btn-clear');
const btnSave   = document.getElementById('btn-save');
const speedSlid = document.getElementById('speed-slider');
const opacSlid  = document.getElementById('opacity-slider');
const toast     = document.getElementById('toast');

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
function init() {
  // Size canvas
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;

  // Init board
  resetBoard();

  // Build colour palette swatches
  PALETTE.forEach(col => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = col;
    sw.title = col;
    sw.addEventListener('click', () => setColor(col));
    palette.appendChild(sw);
  });
  setColor(PALETTE[0]);

  // Custom colour picker
  customCol.addEventListener('input', () => setColor(customCol.value));

  // Build shape selector
  SHAPE_KEYS.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'shape-btn';
    btn.title = key;
    btn.setAttribute('data-shape', key);
    btn.appendChild(makeShapePreview(key));
    btn.addEventListener('click', () => setShape(key));
    shapeDiv.appendChild(btn);
  });
  setShape(SHAPE_KEYS[0]);

  // Buttons
  btnDrop.addEventListener('click', spawnPiece);
  btnUndo.addEventListener('click', undo);
  btnClear.addEventListener('click', confirmClear);
  btnSave.addEventListener('click', saveImage);

  // Speed slider (1=slow … 10=fast → map to ms)
  speedSlid.addEventListener('input', () => {
    const v = parseInt(speedSlid.value);
    msPerDrop = Math.round(1200 - v * 100); // 1100ms … 200ms
    if (dropInterval) restartDropTimer();
  });

  // Opacity slider
  opacSlid.addEventListener('input', () => {
    opacity = parseInt(opacSlid.value) / 100;
  });

  // Keyboard
  document.addEventListener('keydown', onKey);

  draw();
}

/* ═══════════════════════════════════════════════════════════════
   BOARD
═══════════════════════════════════════════════════════════════ */
function resetBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneBoard() {
  return board.map(row => [...row]);
}

/* ═══════════════════════════════════════════════════════════════
   COLOUR & SHAPE SELECTION
═══════════════════════════════════════════════════════════════ */
function setColor(col) {
  activeColor = col;
  activeSw.style.background = col;
  customCol.value = isHex(col) ? col : rgbToHex(col);
  document.querySelectorAll('.swatch').forEach(s =>
    s.classList.toggle('active', s.style.background === col ||
      normalizeColor(s.style.background) === normalizeColor(col))
  );
}

function setShape(key) {
  activeShape = key;
  document.querySelectorAll('.shape-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.shape === key)
  );
}

/* tiny canvas previews for shapes */
function makeShapePreview(key) {
  const cells = SHAPES[key][0];
  const maxR = Math.max(...cells.map(c => c[0]));
  const maxC = Math.max(...cells.map(c => c[1]));
  const size = Math.max(maxR + 1, maxC + 1, 2);
  const px = 8;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * px;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#888';
  cells.forEach(([r, c]) => cx.fillRect(c * px, r * px, px - 1, px - 1));
  return cv;
}

/* ═══════════════════════════════════════════════════════════════
   PIECE SPAWN & CONTROL
═══════════════════════════════════════════════════════════════ */
function spawnPiece() {
  if (activePiece) {
    // Lock current piece immediately and spawn new one
    lockPiece();
  }

  const rotations = SHAPES[activeShape];
  const cells = rotations[0].map(([r, c]) => [r, c]); // clone

  // Centre horizontally
  const maxC = Math.max(...cells.map(c => c[1]));
  const startCol = Math.floor((COLS - maxC - 1) / 2);
  const startRow = 0;

  const positioned = cells.map(([r, c]) => [r + startRow, c + startCol]);

  // Check if spawn position is blocked
  if (positioned.some(([r, c]) => board[r]?.[c])) {
    showToast('Canvas full — clear some space!');
    return;
  }

  activePiece = {
    cells: positioned,
    color: activeColor,
    opacity,
    shapeKey: activeShape,
    rotation: 0,
  };

  gameRunning = true;
  restartDropTimer();
  draw();
}

function restartDropTimer() {
  if (dropInterval) clearInterval(dropInterval);
  dropInterval = setInterval(stepDown, msPerDrop);
}

function stepDown() {
  if (!activePiece) return;

  const moved = activePiece.cells.map(([r, c]) => [r + 1, c]);

  if (canPlace(moved)) {
    activePiece.cells = moved;
  } else {
    lockPiece();
  }
  draw();
}

function lockPiece() {
  if (!activePiece) return;
  history.push(cloneBoard());
  if (history.length > 50) history.shift(); // keep last 50 states

  activePiece.cells.forEach(([r, c]) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      // Encode color + opacity into a single string
      board[r][c] = encodeCell(activePiece.color, activePiece.opacity);
    }
  });

  activePiece = null;
  clearInterval(dropInterval);
  dropInterval = null;
  gameRunning = false;
  draw();
}

function encodeCell(color, op) {
  return JSON.stringify({ color, op });
}

function decodeCell(val) {
  try { return JSON.parse(val); }
  catch { return { color: val, op: 1 }; }
}

function canPlace(cells) {
  return cells.every(([r, c]) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS && !board[r][c]
  );
}

/* ── Movement ──────────────────────────────────────────────────── */
function movePiece(dr, dc) {
  if (!activePiece) return;
  const moved = activePiece.cells.map(([r, c]) => [r + dr, c + dc]);
  if (canPlace(moved)) {
    activePiece.cells = moved;
    draw();
  }
}

function rotatePiece() {
  if (!activePiece) return;
  const rotations = SHAPES[activePiece.shapeKey];
  if (rotations.length < 2) return; // single-rotation shapes

  const nextRot = (activePiece.rotation + 1) % rotations.length;
  const template = rotations[nextRot];

  // Anchor: top-left of bounding box of current piece
  const minR = Math.min(...activePiece.cells.map(c => c[0]));
  const minC = Math.min(...activePiece.cells.map(c => c[1]));

  const rotated = template.map(([r, c]) => [r + minR, c + minC]);

  if (canPlace(rotated)) {
    activePiece.cells = rotated;
    activePiece.rotation = nextRot;
    draw();
  }
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════════════════════════ */
function onKey(e) {
  if (!activePiece) {
    if (e.code === 'Space') { spawnPiece(); e.preventDefault(); }
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':  movePiece(0, -1); e.preventDefault(); break;
    case 'ArrowRight': movePiece(0,  1); e.preventDefault(); break;
    case 'ArrowDown':  stepDown();       e.preventDefault(); break;
    case 'ArrowUp':    rotatePiece();    e.preventDefault(); break;
    case 'Space':      lockPiece();      e.preventDefault(); break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   UNDO / CLEAR
═══════════════════════════════════════════════════════════════ */
function undo() {
  if (activePiece) { activePiece = null; clearInterval(dropInterval); dropInterval = null; gameRunning = false; draw(); return; }
  if (history.length === 0) { showToast('Nothing to undo'); return; }
  board = history.pop();
  draw();
  showToast('Undone');
}

function confirmClear() {
  if (board.every(row => row.every(c => c === null)) && !activePiece) {
    showToast('Canvas already empty');
    return;
  }
  history.push(cloneBoard());
  if (activePiece) { activePiece = null; clearInterval(dropInterval); dropInterval = null; gameRunning = false; }
  resetBoard();
  draw();
  showToast('Canvas cleared');
}

/* ═══════════════════════════════════════════════════════════════
   SAVE
═══════════════════════════════════════════════════════════════ */
function saveImage() {
  // Render board-only (no ghost, no grid lines) to offscreen canvas
  const off = document.createElement('canvas');
  off.width  = canvas.width;
  off.height = canvas.height;
  const ox = off.getContext('2d');
  ox.fillStyle = '#ffffff';
  ox.fillRect(0, 0, off.width, off.height);
  drawBoard(ox);

  const link = document.createElement('a');
  link.download = `art-blocks-${Date.now()}.png`;
  link.href = off.toDataURL('image/png');
  link.click();
  showToast('Image saved!');
}

/* ═══════════════════════════════════════════════════════════════
   DRAW
═══════════════════════════════════════════════════════════════ */
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid(ctx);
  drawBoard(ctx);
  drawGhost(ctx);
  drawActivePiece(ctx);
}

function drawGrid(cx) {
  cx.strokeStyle = '#f0f0f0';
  cx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    cx.beginPath();
    cx.moveTo(0, r * CELL);
    cx.lineTo(COLS * CELL, r * CELL);
    cx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    cx.beginPath();
    cx.moveTo(c * CELL, 0);
    cx.lineTo(c * CELL, ROWS * CELL);
    cx.stroke();
  }
}

function drawBoard(cx) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const { color, op } = decodeCell(board[r][c]);
        drawCell(cx, r, c, color, op);
      }
    }
  }
}

function drawGhost(cx) {
  if (!activePiece) return;

  // Project piece downward to landing row
  let ghost = activePiece.cells.map(([r, c]) => [r, c]);
  while (true) {
    const next = ghost.map(([r, c]) => [r + 1, c]);
    if (next.every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !board[r][c])) {
      ghost = next;
    } else break;
  }

  // Only draw ghost if it differs from current position
  const same = ghost.every(([r, c], i) => r === activePiece.cells[i][0] && c === activePiece.cells[i][1]);
  if (same) return;

  cx.save();
  cx.globalAlpha = 0.18;
  ghost.forEach(([r, c]) => drawCell(cx, r, c, activePiece.color, 1));
  cx.restore();
}

function drawActivePiece(cx) {
  if (!activePiece) return;
  activePiece.cells.forEach(([r, c]) => {
    drawCell(cx, r, c, activePiece.color, activePiece.opacity);
  });
}

function drawCell(cx, r, c, color, op) {
  cx.save();
  cx.globalAlpha = op;
  cx.fillStyle = color;
  cx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
  cx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

function isHex(str) { return /^#[0-9a-f]{6}$/i.test(str); }

function normalizeColor(str) {
  // Convert rgb(r,g,b) to hex for comparison
  const m = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return str.toLowerCase();
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}

function rgbToHex(rgb) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}

/* ═══════════════════════════════════════════════════════════════
   ADD ROTATION VARIANTS FOR SHAPES
═══════════════════════════════════════════════════════════════ */
(function buildRotations() {
  function rotate90(cells) {
    // 90° clockwise around origin: [r,c] → [c,-r]
    const rotated = cells.map(([r, c]) => [c, -r]);
    const minR = Math.min(...rotated.map(x => x[0]));
    const minC = Math.min(...rotated.map(x => x[1]));
    return rotated.map(([r, c]) => [r - minR, c - minC]);
  }

  SHAPE_KEYS.forEach(key => {
    const base = SHAPES[key][0];
    const rotations = [base];
    let cur = base;
    for (let i = 0; i < 3; i++) {
      const next = rotate90(cur);
      const alreadyExists = rotations.some(r =>
        JSON.stringify(r.map(c => c.join(',')).sort()) ===
        JSON.stringify(next.map(c => c.join(',')).sort())
      );
      if (!alreadyExists) rotations.push(next);
      cur = next;
    }
    SHAPES[key] = rotations;
  });
})();

/* ═══════════════════════════════════════════════════════════════
   START
═══════════════════════════════════════════════════════════════ */
init();
