/* ═══════════════════════════════════════════════════════════════════
   Four-Way Tetris Art Engine
   Blocks fall from TOP, RIGHT, BOTTOM, LEFT in turn,
   clustering around a seed block in the centre.
   Inspired by bold, flat illustration with bleeding radial gradients.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Directions ──────────────────────────────────────────────────
  const DIR = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };
  const DIR_NAMES = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
  const DIR_COLORS = ["#ff006e", "#06d6a0", "#ffbe0b", "#8338ec"];

  // ── Tetromino shapes (relative coords) ─────────────────────────
  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,0],[0,1],[0,2],[1,1]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    L: [[0,0],[1,0],[2,0],[2,1]],
    J: [[0,1],[1,1],[2,0],[2,1]],
  };
  const SHAPE_KEYS = Object.keys(SHAPES);

  // ── Color Palettes — bold, saturated, inspired by reference ────
  const PALETTES = {
    neon: [
      ["#ff006e","#ff69b4"], ["#fb5607","#ff9e00"], ["#ffbe0b","#ffe66d"],
      ["#06d6a0","#00f5d4"], ["#118ab2","#48cae4"], ["#8338ec","#b56eff"],
      ["#ff0000","#ff6b6b"], ["#000000","#333333"], ["#ffffff","#e0e0e0"],
    ],
    pastel: [
      ["#ffc8dd","#ffe0eb"], ["#ffafcc","#ffd6e7"], ["#bde0fe","#dceffe"],
      ["#a2d2ff","#c8e3ff"], ["#cdb4db","#e4d5ed"], ["#b8e0d2","#d4f0e7"],
    ],
    earth: [
      ["#d4a373","#e8c9a0"], ["#6b705c","#8a8d7b"], ["#a98467","#c9a88a"],
      ["#ccd5ae","#e0e7cc"], ["#faedcd","#fdf5e6"], ["#b7b7a4","#d0d0c3"],
    ],
    mono: [
      ["#ffffff","#e0e0e0"], ["#cccccc","#b0b0b0"], ["#888888","#707070"],
      ["#555555","#404040"], ["#333333","#222222"], ["#000000","#1a1a1a"],
    ],
    sunset: [
      ["#ff006e","#ff4d94"], ["#ff5400","#ff7b33"], ["#ffbe0b","#ffd04d"],
      ["#ff0054","#ff3377"], ["#9b5de5","#b88ae8"], ["#f15bb5","#f590cf"],
    ],
    ocean: [
      ["#03045e","#0a0f7a"], ["#0077b6","#1a9fd4"], ["#00b4d8","#33c8e5"],
      ["#48cae4","#7adcee"], ["#90e0ef","#b3ecf5"], ["#023e8a","#0a5cad"],
    ],
  };

  // ── State ──────────────────────────────────────────────────────
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let GRID = 36;
  let CELL = 0;
  let board = [];        // GRID x GRID — stores piece ID (number) or 0
  let pieceRegistry = {};// id → { cells:[{r,c}], color1, color2, cx, cy }
  let nextPieceId = 1;
  let currentDir = DIR.TOP;
  let activePiece = null;
  let dropInterval = 400;
  let lastDrop = 0;
  let paused = false;
  let autoPlay = true;
  let showGrid = false;
  let showGlow = true;
  let showShadow = true;
  let palette = "neon";
  let bgStyle = "dark";
  let gameOver = false;
  let piecesPlaced = 0;

  // ── Helpers ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToStr([r, g, b], a = 1) {
    return `rgba(${r},${g},${b},${a})`;
  }

  function lerpColor(hex1, hex2, t) {
    const [r1,g1,b1] = hexToRgb(hex1);
    const [r2,g2,b2] = hexToRgb(hex2);
    return [
      Math.round(r1 + (r2 - r1) * t),
      Math.round(g1 + (g2 - g1) * t),
      Math.round(b1 + (b2 - b1) * t),
    ];
  }

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    resize();
    resetBoard();
    bindControls();
    requestAnimationFrame(loop);
  }

  function resize() {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.88;
    CELL = Math.floor(size / GRID);
    canvas.width = GRID * CELL;
    canvas.height = GRID * CELL;
  }

  function resetBoard() {
    GRID = parseInt(document.getElementById("grid-size").value) || 36;
    resize();
    board = Array.from({ length: GRID }, () => Array(GRID).fill(0));
    pieceRegistry = {};
    nextPieceId = 1;

    // Place seed block in the centre (2x2)
    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);
    const seedId = nextPieceId++;
    const seedCells = [
      {r: cx-1, c: cy-1}, {r: cx-1, c: cy},
      {r: cx, c: cy-1}, {r: cx, c: cy},
    ];
    for (const {r, c} of seedCells) board[r][c] = seedId;
    pieceRegistry[seedId] = {
      cells: seedCells,
      color1: "#ffffff",
      color2: "#e8e0f0",
      cx: (cx - 0.5) * CELL + CELL / 2,
      cy: (cy - 0.5) * CELL + CELL / 2,
    };

    currentDir = DIR.TOP;
    activePiece = null;
    gameOver = false;
    piecesPlaced = 0;
    updateHUD();
  }

  // ── Piece creation ─────────────────────────────────────────────
  function randomColorPair() {
    const pal = PALETTES[palette] || PALETTES.neon;
    return pal[Math.floor(Math.random() * pal.length)];
  }

  function rotateShape(cells, times) {
    let out = cells.map(([r, c]) => [r, c]);
    for (let t = 0; t < times; t++) {
      out = out.map(([r, c]) => [c, -r]);
    }
    let minR = Infinity, minC = Infinity;
    for (const [r, c] of out) { minR = Math.min(minR, r); minC = Math.min(minC, c); }
    return out.map(([r, c]) => [r - minR, c - minC]);
  }

  function spawnPiece() {
    if (gameOver) return;

    const key = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
    const rotations = Math.floor(Math.random() * 4);
    const baseCells = rotateShape(SHAPES[key], rotations);
    const [color1, color2] = randomColorPair();

    let maxR = 0, maxC = 0;
    for (const [r, c] of baseCells) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }

    const shapeW = maxC + 1;
    const cx = Math.floor(GRID / 2);
    let cells;

    switch (currentDir) {
      case DIR.TOP: {
        const startCol = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r, c: c + startCol }));
        break;
      }
      case DIR.BOTTOM: {
        const startCol = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: GRID - 1 - r, c: c + startCol }));
        break;
      }
      case DIR.LEFT: {
        const startRow = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: c + startRow, c: r }));
        break;
      }
      case DIR.RIGHT: {
        const startRow = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: c + startRow, c: GRID - 1 - r }));
        break;
      }
    }

    for (const cell of cells) {
      if (cell.r < 0 || cell.r >= GRID || cell.c < 0 || cell.c >= GRID) continue;
      if (board[cell.r][cell.c]) {
        advanceTurn();
        return;
      }
    }

    activePiece = { cells, color1, color2, dir: currentDir };
  }

  // ── Movement ───────────────────────────────────────────────────
  function getDelta(dir) {
    switch (dir) {
      case DIR.TOP:    return { dr: 1, dc: 0 };
      case DIR.BOTTOM: return { dr: -1, dc: 0 };
      case DIR.LEFT:   return { dr: 0, dc: 1 };
      case DIR.RIGHT:  return { dr: 0, dc: -1 };
    }
  }

  function canMove(cells, dr, dc) {
    for (const { r, c } of cells) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return false;
      if (board[nr][nc]) return false;
    }
    return true;
  }

  function movePiece(dr, dc) {
    if (!activePiece) return false;
    if (canMove(activePiece.cells, dr, dc)) {
      activePiece.cells = activePiece.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
      return true;
    }
    return false;
  }

  function lockPiece() {
    if (!activePiece) return;
    const id = nextPieceId++;
    let sumR = 0, sumC = 0;
    for (const { r, c } of activePiece.cells) {
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) {
        board[r][c] = id;
      }
      sumR += r;
      sumC += c;
    }
    pieceRegistry[id] = {
      cells: activePiece.cells.map(({r,c}) => ({r,c})),
      color1: activePiece.color1,
      color2: activePiece.color2,
      cx: (sumC / activePiece.cells.length + 0.5) * CELL,
      cy: (sumR / activePiece.cells.length + 0.5) * CELL,
    };
    piecesPlaced++;
    activePiece = null;
    advanceTurn();
  }

  function hardDrop() {
    if (!activePiece) return;
    const { dr, dc } = getDelta(activePiece.dir);
    while (canMove(activePiece.cells, dr, dc)) {
      activePiece.cells = activePiece.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
    }
    lockPiece();
  }

  function advanceTurn() {
    currentDir = (currentDir + 1) % 4;
    updateHUD();
    activePiece = null;
  }

  function moveLateral(primary) {
    if (!activePiece) return;
    let dr = 0, dc = 0;
    switch (activePiece.dir) {
      case DIR.TOP:
      case DIR.BOTTOM:
        dc = primary; break;
      case DIR.LEFT:
      case DIR.RIGHT:
        dr = primary; break;
    }
    movePiece(dr, dc);
  }

  function rotatePiece(clockwise) {
    if (!activePiece) return;
    const pivot = activePiece.cells[0];
    const newCells = activePiece.cells.map(({ r, c }) => {
      const dr = r - pivot.r;
      const dc = c - pivot.c;
      if (clockwise) return { r: pivot.r + dc, c: pivot.c - dr };
      else return { r: pivot.r - dc, c: pivot.c + dr };
    });
    let valid = true;
    for (const { r, c } of newCells) {
      if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) {
        valid = false; break;
      }
    }
    if (valid) activePiece.cells = newCells;
  }

  // ── HUD ────────────────────────────────────────────────────────
  function updateHUD() {
    const label = document.getElementById("turn-label");
    label.textContent = DIR_NAMES[currentDir];
    label.style.color = DIR_COLORS[currentDir];
    label.style.textShadow = `0 0 10px ${DIR_COLORS[currentDir]}80`;

    ["top", "right", "bottom", "left"].forEach((name, i) => {
      const el = document.getElementById("arrow-" + name);
      el.classList.toggle("active", i === currentDir);
      if (i === currentDir) {
        el.style.background = DIR_COLORS[i];
        el.style.boxShadow = `0 0 12px ${DIR_COLORS[i]}`;
      } else {
        el.style.background = "";
        el.style.boxShadow = "";
      }
    });
  }

  // ── Rendering ──────────────────────────────────────────────────

  function drawBg() {
    if (bgStyle === "light") {
      ctx.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 0,
        canvas.width/2, canvas.height/2, canvas.width * 0.7
      );
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0a0a0e");
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = "#0a0a0e";
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawGridLines() {
    if (!showGrid) return;
    ctx.strokeStyle = bgStyle === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }
  }

  // Pass 1: Draw soft bleeding glow halos behind each piece
  function drawGlowPass() {
    if (!showGlow) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      const bleedRadius = CELL * 3.5;
      const grad = ctx.createRadialGradient(
        piece.cx, piece.cy, 0,
        piece.cx, piece.cy, bleedRadius
      );
      const rgb1 = hexToRgb(piece.color1);
      grad.addColorStop(0, rgbToStr(rgb1, 0.35));
      grad.addColorStop(0.4, rgbToStr(rgb1, 0.15));
      grad.addColorStop(1, rgbToStr(rgb1, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(
        piece.cx - bleedRadius, piece.cy - bleedRadius,
        bleedRadius * 2, bleedRadius * 2
      );
    }

    // Active piece glow
    if (activePiece) {
      let sumR = 0, sumC = 0;
      for (const {r, c} of activePiece.cells) { sumR += r; sumC += c; }
      const acx = (sumC / activePiece.cells.length + 0.5) * CELL;
      const acy = (sumR / activePiece.cells.length + 0.5) * CELL;
      const bleedRadius = CELL * 3;
      const grad = ctx.createRadialGradient(acx, acy, 0, acx, acy, bleedRadius);
      const rgb1 = hexToRgb(activePiece.color1);
      grad.addColorStop(0, rgbToStr(rgb1, 0.3));
      grad.addColorStop(0.5, rgbToStr(rgb1, 0.1));
      grad.addColorStop(1, rgbToStr(rgb1, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(acx - bleedRadius, acy - bleedRadius, bleedRadius * 2, bleedRadius * 2);
    }

    ctx.restore();
  }

  // Pass 2: Draw flat filled cells with NO gaps, using per-piece gradient
  function drawBoard() {
    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      for (const {r, c} of piece.cells) {
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
        const x = c * CELL;
        const y = r * CELL;

        // Per-cell gradient based on distance from piece centre
        const cellCx = x + CELL / 2;
        const cellCy = y + CELL / 2;
        const dx = cellCx - piece.cx;
        const dy = cellCy - piece.cy;
        const maxDist = CELL * 2.5;
        const t = Math.min(1, Math.sqrt(dx*dx + dy*dy) / maxDist);
        const blended = lerpColor(piece.color1, piece.color2, t);

        ctx.fillStyle = rgbToStr(blended);
        // Fill slightly oversized to eliminate subpixel gaps
        ctx.fillRect(x - 0.5, y - 0.5, CELL + 1, CELL + 1);
      }
    }
  }

  function drawGhostPiece() {
    if (!activePiece) return;
    const { dr, dc } = getDelta(activePiece.dir);
    let ghost = activePiece.cells.map(({ r, c }) => ({ r, c }));
    while (true) {
      const next = ghost.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
      let blocked = false;
      for (const { r, c } of next) {
        if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) {
          blocked = true; break;
        }
      }
      if (blocked) break;
      ghost = next;
    }

    const rgb = hexToRgb(activePiece.color1);
    for (const { r, c } of ghost) {
      ctx.fillStyle = rgbToStr(rgb, 0.15);
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }

  function drawActivePiece() {
    if (!activePiece) return;
    let sumR = 0, sumC = 0;
    for (const {r, c} of activePiece.cells) { sumR += r; sumC += c; }
    const pcx = (sumC / activePiece.cells.length + 0.5) * CELL;
    const pcy = (sumR / activePiece.cells.length + 0.5) * CELL;

    for (const { r, c } of activePiece.cells) {
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
      const x = c * CELL;
      const y = r * CELL;
      const cellCx = x + CELL / 2;
      const cellCy = y + CELL / 2;
      const dx = cellCx - pcx;
      const dy = cellCy - pcy;
      const maxDist = CELL * 2.5;
      const t = Math.min(1, Math.sqrt(dx*dx + dy*dy) / maxDist);
      const blended = lerpColor(activePiece.color1, activePiece.color2, t);

      ctx.fillStyle = rgbToStr(blended);
      ctx.fillRect(x - 0.5, y - 0.5, CELL + 1, CELL + 1);
    }
  }

  function drawDirectionIndicators() {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = DIR_COLORS[currentDir];
    const mid = canvas.width / 2;
    const sz = 12;
    switch (currentDir) {
      case DIR.TOP:    drawArrow(mid, 10, 0, 1, sz); break;
      case DIR.BOTTOM: drawArrow(mid, canvas.height - 10, 0, -1, sz); break;
      case DIR.LEFT:   drawArrow(10, mid, 1, 0, sz); break;
      case DIR.RIGHT:  drawArrow(canvas.width - 10, mid, -1, 0, sz); break;
    }
    ctx.globalAlpha = 1;
  }

  function drawArrow(x, y, dx, dy, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (dx === 0) {
      ctx.lineTo(x - size, y - dy * size * 1.5);
      ctx.lineTo(x + size, y - dy * size * 1.5);
    } else {
      ctx.lineTo(x - dx * size * 1.5, y - size);
      ctx.lineTo(x - dx * size * 1.5, y + size);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Game loop ──────────────────────────────────────────────────
  function loop(time) {
    requestAnimationFrame(loop);

    drawBg();
    drawGridLines();
    drawGlowPass();
    drawBoard();
    drawGhostPiece();
    drawActivePiece();
    drawDirectionIndicators();

    if (paused || gameOver) return;

    if (!activePiece) {
      spawnPiece();
      lastDrop = time;
      return;
    }

    if (time - lastDrop >= dropInterval) {
      lastDrop = time;
      const { dr, dc } = getDelta(activePiece.dir);
      if (!movePiece(dr, dc)) {
        lockPiece();
      }
    }
  }

  // ── Controls ───────────────────────────────────────────────────
  function bindControls() {
    window.addEventListener("keydown", (e) => {
      if (gameOver && e.key !== "r") return;
      switch (e.key) {
        case "ArrowLeft":  e.preventDefault(); moveLateral(-1); break;
        case "ArrowRight": e.preventDefault(); moveLateral(1); break;
        case "ArrowDown":
          e.preventDefault();
          if (activePiece) { const {dr,dc} = getDelta(activePiece.dir); movePiece(dr,dc); }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (activePiece) { const {dr,dc} = getDelta(activePiece.dir); movePiece(-dr,-dc); }
          break;
        case " ":  e.preventDefault(); hardDrop(); break;
        case "z": case "Z": rotatePiece(false); break;
        case "x": case "X": rotatePiece(true); break;
        case "Enter": if (!activePiece) spawnPiece(); break;
        case "p": case "P": togglePause(); break;
        case "r": case "R": resetBoard(); break;
      }
    });

    const ctrl = document.getElementById("controls");
    const showBtn = document.getElementById("btn-show-ctrl");
    document.getElementById("btn-toggle-ctrl").addEventListener("click", () => {
      ctrl.classList.add("hidden"); showBtn.classList.add("visible");
    });
    showBtn.addEventListener("click", () => {
      ctrl.classList.remove("hidden"); showBtn.classList.remove("visible");
    });

    document.getElementById("speed").addEventListener("input", (e) => {
      dropInterval = parseInt(e.target.value);
    });
    document.getElementById("grid-size").addEventListener("change", () => resetBoard());
    document.getElementById("palette").addEventListener("change", (e) => { palette = e.target.value; });
    document.getElementById("bg-style").addEventListener("change", (e) => { bgStyle = e.target.value; });
    document.getElementById("tog-grid").addEventListener("change", (e) => { showGrid = e.target.checked; });
    document.getElementById("tog-glow").addEventListener("change", (e) => { showGlow = e.target.checked; });
    document.getElementById("tog-shadow").addEventListener("change", (e) => { showShadow = e.target.checked; });
    document.getElementById("tog-auto").addEventListener("change", (e) => { autoPlay = e.target.checked; });
    document.getElementById("btn-pause").addEventListener("click", togglePause);
    document.getElementById("btn-reset").addEventListener("click", resetBoard);

    document.getElementById("btn-screenshot").addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `tetris-art-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
    document.getElementById("btn-export").addEventListener("click", exportHighRes);
    window.addEventListener("resize", resize);
  }

  function togglePause() {
    paused = !paused;
    document.getElementById("btn-pause").textContent = paused ? "Play" : "Pause";
  }

  function exportHighRes() {
    const scale = 3;
    const expCanvas = document.createElement("canvas");
    const w = GRID * CELL;
    const h = GRID * CELL;
    expCanvas.width = w * scale;
    expCanvas.height = h * scale;
    const ectx = expCanvas.getContext("2d");
    ectx.scale(scale, scale);

    // Background
    if (bgStyle === "light") {
      ectx.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = ectx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.7);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0a0a0e");
      ectx.fillStyle = grad;
    } else {
      ectx.fillStyle = "#0a0a0e";
    }
    ectx.fillRect(0, 0, w, h);

    // Glow pass
    ectx.save();
    ectx.globalCompositeOperation = "lighter";
    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      const bleedRadius = CELL * 3.5;
      const grad = ectx.createRadialGradient(piece.cx, piece.cy, 0, piece.cx, piece.cy, bleedRadius);
      const rgb1 = hexToRgb(piece.color1);
      grad.addColorStop(0, rgbToStr(rgb1, 0.35));
      grad.addColorStop(0.4, rgbToStr(rgb1, 0.15));
      grad.addColorStop(1, rgbToStr(rgb1, 0));
      ectx.fillStyle = grad;
      ectx.fillRect(piece.cx - bleedRadius, piece.cy - bleedRadius, bleedRadius * 2, bleedRadius * 2);
    }
    ectx.restore();

    // Flat cells
    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      for (const {r, c} of piece.cells) {
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
        const x = c * CELL;
        const y = r * CELL;
        const cellCx = x + CELL / 2;
        const cellCy = y + CELL / 2;
        const dx = cellCx - piece.cx;
        const dy = cellCy - piece.cy;
        const t = Math.min(1, Math.sqrt(dx*dx + dy*dy) / (CELL * 2.5));
        const blended = lerpColor(piece.color1, piece.color2, t);
        ectx.fillStyle = rgbToStr(blended);
        ectx.fillRect(x - 0.5, y - 0.5, CELL + 1, CELL + 1);
      }
    }

    const link = document.createElement("a");
    link.download = `tetris-art-hires-${Date.now()}.png`;
    link.href = expCanvas.toDataURL("image/png");
    link.click();
  }

  // ── Start ──────────────────────────────────────────────────────
  init();
})();
