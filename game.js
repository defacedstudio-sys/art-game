/* ═══════════════════════════════════════════════════════════════════
   Four-Way Tetris Art Engine
   Blocks fall from TOP, RIGHT, BOTTOM, LEFT in turn,
   clustering around a seed block in the centre.
   Shapes merge into one organic blob with cross-piece gradient
   blending and soft rounded edges.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Directions ──────────────────────────────────────────────────
  const DIR = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };
  const DIR_NAMES = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
  const DIR_COLORS = ["#ff006e", "#06d6a0", "#ffbe0b", "#8338ec"];

  // ── Tetromino shapes ───────────────────────────────────────────
  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,0],[0,1],[0,2],[1,1]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    L: [[0,0],[1,0],[2,0],[2,1]],
    J: [[0,1],[1,1],[2,0],[2,1]],
  };

  // ── Face-feature shapes (per-cell colors) ─────────────────────
  // Eye: 3x3 white block with black pupil in centre
  // Nose: small shapes in red/pink
  // Mouth: wide shapes in red/black
  const FACE_SHAPES = {
    EYE: {
      cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],
      colors: ["#ffffff","#ffffff","#ffffff","#ffffff","#000000","#ffffff","#ffffff","#ffffff","#ffffff"],
    },
    EYE_WIDE: {
      cells: [[0,0],[0,1],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3]],
      colors: ["#ffffff","#ffffff","#ffffff","#ffffff","#ffffff","#1a1a6e","#000000","#ffffff","#ffffff","#ffffff","#ffffff","#ffffff"],
    },
    NOSE_TRI: {
      cells: [[0,1],[1,0],[1,1],[1,2]],
      colors: ["#ff0000","#ff0000","#ff0000","#ff0000"],
    },
    NOSE_DOT: {
      cells: [[0,0],[0,1],[1,0],[1,1]],
      colors: ["#ff3355","#ff3355","#ff3355","#ff3355"],
    },
    NOSE_LONG: {
      cells: [[0,0],[1,0],[2,0]],
      colors: ["#ff4466","#ff2244","#ff0022"],
    },
    MOUTH_WIDE: {
      cells: [[0,0],[0,1],[0,2],[0,3],[0,4]],
      colors: ["#cc0000","#dd0000","#ee0000","#dd0000","#cc0000"],
    },
    MOUTH_SMILE: {
      cells: [[0,0],[0,4],[1,1],[1,2],[1,3]],
      colors: ["#000000","#000000","#cc0000","#cc0000","#cc0000"],
    },
    MOUTH_OPEN: {
      cells: [[0,1],[0,2],[1,0],[1,3],[2,1],[2,2]],
      colors: ["#000000","#000000","#cc0000","#cc0000","#000000","#000000"],
    },
    MOUTH_LIPS: {
      cells: [[0,0],[0,1],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3]],
      colors: ["#ff2255","#ff0044","#ff0044","#ff2255","#cc0033","#aa0022","#aa0022","#cc0033"],
    },
  };
  const FACE_SHAPE_KEYS = Object.keys(FACE_SHAPES);

  const SHAPE_KEYS = Object.keys(SHAPES);

  // ── Color Palettes — each entry is [primary, secondary] ───────
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

  // Offscreen canvases for the blur-mask pipeline
  let colorCvs, colorCtx, maskCvs, maskCtx;

  let GRID = 36;
  let CELL = 0;
  let board = [];
  let boardColor = []; // per-cell color hex (for face features & blending)
  let pieceRegistry = {};
  let nextPieceId = 1;
  let currentDir = DIR.TOP;
  let activePiece = null;
  let dropInterval = 400;
  let lastDrop = 0;
  let paused = false;
  let autoPlay = true;
  let showGrid = false;
  let showGlow = true;
  let palette = "neon";
  let bgStyle = "dark";
  let gameOver = false;
  let piecesPlaced = 0;
  let blendRadius = 3; // how many cells to blend across

  // Pre-computed blended color grid (updated when board changes)
  let colorGrid = [];   // GRID x GRID → [r,g,b] or null
  let colorGridDirty = true;

  // ── Helpers ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbStr(r, g, b, a) {
    if (a !== undefined) return `rgba(${r},${g},${b},${a})`;
    return `rgb(${r},${g},${b})`;
  }

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    resize();
    resetBoard();
    bindControls();
    requestAnimationFrame(loop);
  }

  function createOffscreen() {
    colorCvs = document.createElement("canvas");
    colorCvs.width = canvas.width;
    colorCvs.height = canvas.height;
    colorCtx = colorCvs.getContext("2d");

    maskCvs = document.createElement("canvas");
    maskCvs.width = canvas.width;
    maskCvs.height = canvas.height;
    maskCtx = maskCvs.getContext("2d");
  }

  function resize() {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.88;
    CELL = Math.floor(size / GRID);
    canvas.width = GRID * CELL;
    canvas.height = GRID * CELL;
    createOffscreen();
    colorGridDirty = true;
  }

  function resetBoard() {
    GRID = parseInt(document.getElementById("grid-size").value) || 36;
    resize();
    board = Array.from({ length: GRID }, () => Array(GRID).fill(0));
    boardColor = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    pieceRegistry = {};
    nextPieceId = 1;

    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);
    const seedId = nextPieceId++;
    const seedCells = [
      { r: cx - 1, c: cy - 1 }, { r: cx - 1, c: cy },
      { r: cx, c: cy - 1 }, { r: cx, c: cy },
    ];
    for (const { r, c } of seedCells) {
      board[r][c] = seedId;
      boardColor[r][c] = "#ffffff";
    }
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
    colorGridDirty = true;
    updateHUD();
  }

  // ── Piece creation ─────────────────────────────────────────────
  function randomColorPair() {
    const pal = PALETTES[palette] || PALETTES.neon;
    return pal[Math.floor(Math.random() * pal.length)];
  }

  function rotateShape(cells, times) {
    let out = cells.map(([r, c]) => [r, c]);
    for (let t = 0; t < times; t++) out = out.map(([r, c]) => [c, -r]);
    let minR = Infinity, minC = Infinity;
    for (const [r, c] of out) { minR = Math.min(minR, r); minC = Math.min(minC, c); }
    return out.map(([r, c]) => [r - minR, c - minC]);
  }

  // Rotate cell colors to match the new cell order after rotateShape
  function rotateCellColors(origCells, origColors, times) {
    // Apply same rotation to get the mapping
    let rotated = origCells.map(([r, c], i) => ({ r, c, color: origColors[i] }));
    for (let t = 0; t < times; t++) {
      rotated = rotated.map(({ r, c, color }) => ({ r: c, c: -r, color }));
    }
    let minR = Infinity, minC = Infinity;
    for (const p of rotated) { minR = Math.min(minR, p.r); minC = Math.min(minC, p.c); }
    rotated = rotated.map(p => ({ r: p.r - minR, c: p.c - minC, color: p.color }));
    // Sort to match the order rotateShape produces (same normalisation)
    const rotatedCells = rotateShape(origCells, times);
    const colorMap = new Map();
    for (const p of rotated) colorMap.set(`${p.r},${p.c}`, p.color);
    return rotatedCells.map(([r, c]) => colorMap.get(`${r},${c}`) || "#ffffff");
  }

  function spawnPiece() {
    if (gameOver) return;

    // ~30% chance to spawn a face feature, 70% regular tetromino
    const isFace = Math.random() < 0.3;
    let baseCells, cellColors = null;

    if (isFace) {
      const fkey = FACE_SHAPE_KEYS[Math.floor(Math.random() * FACE_SHAPE_KEYS.length)];
      const face = FACE_SHAPES[fkey];
      const rotations = Math.floor(Math.random() * 4);
      baseCells = rotateShape(face.cells, rotations);
      // Rotate cell colors to match rotated cell order
      // rotateShape normalises positions, so we need to map original→rotated
      cellColors = rotateCellColors(face.cells, face.colors, rotations);
    } else {
      const key = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
      baseCells = rotateShape(SHAPES[key], Math.floor(Math.random() * 4));
    }

    const [color1, color2] = randomColorPair();

    let maxC = 0;
    for (const [, c] of baseCells) maxC = Math.max(maxC, c);
    const shapeW = maxC + 1;
    const cx = Math.floor(GRID / 2);
    let cells;

    switch (currentDir) {
      case DIR.TOP: {
        const sc = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r, c: c + sc }));
        break;
      }
      case DIR.BOTTOM: {
        const sc = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: GRID - 1 - r, c: c + sc }));
        break;
      }
      case DIR.LEFT: {
        const sr = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: c + sr, c: r }));
        break;
      }
      case DIR.RIGHT: {
        const sr = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: c + sr, c: GRID - 1 - r }));
        break;
      }
    }

    for (const cell of cells) {
      if (cell.r < 0 || cell.r >= GRID || cell.c < 0 || cell.c >= GRID) continue;
      if (board[cell.r][cell.c]) { advanceTurn(); return; }
    }
    activePiece = { cells, color1, color2, dir: currentDir, cellColors };
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
      const nr = r + dr, nc = c + dc;
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
    for (let i = 0; i < activePiece.cells.length; i++) {
      const { r, c } = activePiece.cells[i];
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) {
        board[r][c] = id;
        // Per-cell color: face features use cellColors, regular pieces use color1
        boardColor[r][c] = activePiece.cellColors
          ? activePiece.cellColors[i]
          : activePiece.color1;
      }
      sumR += r; sumC += c;
    }
    pieceRegistry[id] = {
      cells: activePiece.cells.map(({ r, c }) => ({ r, c })),
      color1: activePiece.color1,
      color2: activePiece.color2,
      cx: (sumC / activePiece.cells.length + 0.5) * CELL,
      cy: (sumR / activePiece.cells.length + 0.5) * CELL,
    };
    piecesPlaced++;
    activePiece = null;
    colorGridDirty = true;
    advanceTurn();
  }

  function hardDrop() {
    if (!activePiece) return;
    const { dr, dc } = getDelta(activePiece.dir);
    while (canMove(activePiece.cells, dr, dc))
      activePiece.cells = activePiece.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
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
    const d = activePiece.dir;
    if (d === DIR.TOP || d === DIR.BOTTOM) dc = primary;
    else dr = primary;
    movePiece(dr, dc);
  }

  function rotatePiece(clockwise) {
    if (!activePiece) return;
    const pv = activePiece.cells[0];
    const nc = activePiece.cells.map(({ r, c }) => {
      const dr = r - pv.r, dc = c - pv.c;
      return clockwise ? { r: pv.r + dc, c: pv.c - dr } : { r: pv.r - dc, c: pv.c + dr };
    });
    for (const { r, c } of nc)
      if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) return;
    activePiece.cells = nc;
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
      el.style.background = i === currentDir ? DIR_COLORS[i] : "";
      el.style.boxShadow = i === currentDir ? `0 0 12px ${DIR_COLORS[i]}` : "";
    });
  }

  // ── Color blending across pieces ───────────────────────────────
  // For each occupied cell, blend colors from all nearby pieces
  // weighted by inverse distance → colors merge at boundaries
  function rebuildColorGrid() {
    colorGrid = Array.from({ length: GRID }, () => Array(GRID).fill(null));

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!board[r][c]) continue;

        let tR = 0, tG = 0, tB = 0, tW = 0;
        const rad = blendRadius;

        for (let dr = -rad; dr <= rad; dr++) {
          for (let dc = -rad; dc <= rad; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            if (!board[nr][nc]) continue;
            const hex = boardColor[nr][nc];
            if (!hex) continue;
            const rgb = hexToRgb(hex);
            const dist = Math.sqrt(dr * dr + dc * dc);
            const w = 1 / (1 + dist * 1.2);
            tR += rgb[0] * w;
            tG += rgb[1] * w;
            tB += rgb[2] * w;
            tW += w;
          }
        }

        if (tW > 0) {
          colorGrid[r][c] = [
            Math.round(tR / tW),
            Math.round(tG / tW),
            Math.round(tB / tW),
          ];
        }
      }
    }
    colorGridDirty = false;
  }

  // ── Rendering ──────────────────────────────────────────────────

  function drawBg(target) {
    const c = target || ctx;
    const w = canvas.width, h = canvas.height;
    if (bgStyle === "light") {
      c.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0a0a0e");
      c.fillStyle = grad;
    } else {
      c.fillStyle = "#0a0a0e";
    }
    c.fillRect(0, 0, w, h);
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

  // Glow pass — large soft radial gradients under each piece
  function drawGlowPass() {
    if (!showGlow) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      const br = CELL * 4;
      const grad = ctx.createRadialGradient(piece.cx, piece.cy, 0, piece.cx, piece.cy, br);
      const [pr, pg, pb] = hexToRgb(piece.color1);
      grad.addColorStop(0, rgbStr(pr, pg, pb, 0.30));
      grad.addColorStop(0.35, rgbStr(pr, pg, pb, 0.12));
      grad.addColorStop(1, rgbStr(pr, pg, pb, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(piece.cx - br, piece.cy - br, br * 2, br * 2);
    }
    if (activePiece) {
      let sR = 0, sC = 0;
      for (const { r, c } of activePiece.cells) { sR += r; sC += c; }
      const ax = (sC / activePiece.cells.length + 0.5) * CELL;
      const ay = (sR / activePiece.cells.length + 0.5) * CELL;
      const br = CELL * 3;
      const [pr, pg, pb] = hexToRgb(activePiece.color1);
      const grad = ctx.createRadialGradient(ax, ay, 0, ax, ay, br);
      grad.addColorStop(0, rgbStr(pr, pg, pb, 0.25));
      grad.addColorStop(0.5, rgbStr(pr, pg, pb, 0.08));
      grad.addColorStop(1, rgbStr(pr, pg, pb, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(ax - br, ay - br, br * 2, br * 2);
    }
    ctx.restore();
  }

  // Build rounded-edge mask using blur + threshold technique
  function buildMask() {
    const w = canvas.width, h = canvas.height;
    maskCtx.clearRect(0, 0, w, h);

    // Draw occupied cells as white
    maskCtx.fillStyle = "#fff";
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (board[r][c]) maskCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
    // Also include active piece
    if (activePiece) {
      for (const { r, c } of activePiece.cells) {
        if (r >= 0 && r < GRID && c >= 0 && c < GRID)
          maskCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // Blur the mask to soften edges
    const blurPx = Math.max(3, Math.round(CELL * 0.45));
    maskCtx.filter = `blur(${blurPx}px)`;
    maskCtx.drawImage(maskCvs, 0, 0);
    maskCtx.filter = "none";

    // Re-sharpen by drawing on itself several times (threshold effect)
    // This keeps interior fully opaque but rounds corners
    maskCtx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 6; i++) {
      maskCtx.drawImage(maskCvs, 0, 0);
    }
  }

  // Draw blended color field to offscreen color canvas
  function drawColorField() {
    if (colorGridDirty) rebuildColorGrid();

    const w = canvas.width, h = canvas.height;
    colorCtx.clearRect(0, 0, w, h);

    // Board cells with blended colors
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const rgb = colorGrid[r][c];
        if (!rgb) continue;
        colorCtx.fillStyle = rgbStr(rgb[0], rgb[1], rgb[2]);
        colorCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // Active piece cells (with per-cell color support for face features)
    if (activePiece) {
      for (let i = 0; i < activePiece.cells.length; i++) {
        const { r, c } = activePiece.cells[i];
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;

        // Use per-cell color if face feature, otherwise piece color
        const cellHex = activePiece.cellColors
          ? activePiece.cellColors[i]
          : activePiece.color1;
        const [pr, pg, pb] = hexToRgb(cellHex);

        let tR = pr * 2, tG = pg * 2, tB = pb * 2, tW = 2;
        for (let dr = -blendRadius; dr <= blendRadius; dr++) {
          for (let dc = -blendRadius; dc <= blendRadius; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            const nrgb = colorGrid[nr]?.[nc];
            if (!nrgb) continue;
            const dist = Math.sqrt(dr * dr + dc * dc);
            const w = 1 / (1 + dist * 1.2);
            tR += nrgb[0] * w; tG += nrgb[1] * w; tB += nrgb[2] * w; tW += w;
          }
        }
        colorCtx.fillStyle = rgbStr(
          Math.round(tR / tW), Math.round(tG / tW), Math.round(tB / tW)
        );
        colorCtx.fillRect(c * CELL, r * CELL, CELL, CELL);
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
        if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) { blocked = true; break; }
      }
      if (blocked) break;
      ghost = next;
    }
    for (let i = 0; i < ghost.length; i++) {
      const { r, c } = ghost[i];
      const hex = activePiece.cellColors ? activePiece.cellColors[i] : activePiece.color1;
      const [pr, pg, pb] = hexToRgb(hex);
      ctx.fillStyle = rgbStr(pr, pg, pb, 0.12);
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
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

  function drawArrow(x, y, dx, dy, s) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (dx === 0) { ctx.lineTo(x - s, y - dy * s * 1.5); ctx.lineTo(x + s, y - dy * s * 1.5); }
    else { ctx.lineTo(x - dx * s * 1.5, y - s); ctx.lineTo(x - dx * s * 1.5, y + s); }
    ctx.closePath();
    ctx.fill();
  }

  // ── Composite everything ───────────────────────────────────────
  function render() {
    // 1. Background
    drawBg();
    drawGridLines();

    // 2. Glow halos (additive blend beneath the solid shape)
    drawGlowPass();

    // 3. Ghost piece
    drawGhostPiece();

    // 4. Build the color field and rounded mask
    drawColorField();
    buildMask();

    // 5. Clip color field by rounded mask → draw to main canvas
    colorCtx.save();
    colorCtx.globalCompositeOperation = "destination-in";
    colorCtx.drawImage(maskCvs, 0, 0);
    colorCtx.restore();

    ctx.drawImage(colorCvs, 0, 0);

    // 6. Direction arrow
    drawDirectionIndicators();
  }

  // ── Game loop ──────────────────────────────────────────────────
  function loop(time) {
    requestAnimationFrame(loop);

    render();

    if (paused || gameOver) return;

    if (!activePiece) {
      spawnPiece();
      lastDrop = time;
      return;
    }

    if (time - lastDrop >= dropInterval) {
      lastDrop = time;
      const { dr, dc } = getDelta(activePiece.dir);
      if (!movePiece(dr, dc)) lockPiece();
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
          if (activePiece) { const { dr, dc } = getDelta(activePiece.dir); movePiece(dr, dc); }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (activePiece) { const { dr, dc } = getDelta(activePiece.dir); movePiece(-dr, -dc); }
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

    document.getElementById("speed").addEventListener("input", (e) => { dropInterval = parseInt(e.target.value); });
    document.getElementById("grid-size").addEventListener("change", () => resetBoard());
    document.getElementById("palette").addEventListener("change", (e) => { palette = e.target.value; });
    document.getElementById("bg-style").addEventListener("change", (e) => { bgStyle = e.target.value; });
    document.getElementById("tog-grid").addEventListener("change", (e) => { showGrid = e.target.checked; });
    document.getElementById("tog-glow").addEventListener("change", (e) => { showGlow = e.target.checked; });
    document.getElementById("tog-shadow").addEventListener("change", (e) => {});
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
    // Pause rendering, capture at 3x
    const scale = 3;
    const w = canvas.width, h = canvas.height;
    const exp = document.createElement("canvas");
    exp.width = w * scale;
    exp.height = h * scale;
    const ec = exp.getContext("2d");
    ec.scale(scale, scale);

    // Background
    drawBg(ec);

    // Glow
    ec.save();
    ec.globalCompositeOperation = "lighter";
    for (const id in pieceRegistry) {
      const piece = pieceRegistry[id];
      const br = CELL * 4;
      const [pr, pg, pb] = hexToRgb(piece.color1);
      const grad = ec.createRadialGradient(piece.cx, piece.cy, 0, piece.cx, piece.cy, br);
      grad.addColorStop(0, rgbStr(pr, pg, pb, 0.30));
      grad.addColorStop(0.35, rgbStr(pr, pg, pb, 0.12));
      grad.addColorStop(1, rgbStr(pr, pg, pb, 0));
      ec.fillStyle = grad;
      ec.fillRect(piece.cx - br, piece.cy - br, br * 2, br * 2);
    }
    ec.restore();

    // Draw the already-composited color+mask from the live render
    ec.drawImage(colorCvs, 0, 0);

    const link = document.createElement("a");
    link.download = `tetris-art-hires-${Date.now()}.png`;
    link.href = exp.toDataURL("image/png");
    link.click();
  }

  // ── Start ──────────────────────────────────────────────────────
  init();
})();
