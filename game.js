/* ═══════════════════════════════════════════════════════════════════
   Four-Way Tetris Art Engine
   Blocks fall from TOP, RIGHT, BOTTOM, LEFT in turn,
   clustering around a seed block in the centre.
   Flat block colours, no gradients.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const DIR = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };
  const DIR_NAMES = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
  const DIR_COLORS = ["#ff006e", "#06d6a0", "#ffbe0b", "#8338ec"];

  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,0],[0,1],[0,2],[1,1]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    L: [[0,0],[1,0],[2,0],[2,1]],
    J: [[0,1],[1,1],[2,0],[2,1]],
  };

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

  // Flat single-colour palettes
  const PALETTES = {
    neon:   ["#ff006e","#fb5607","#ffbe0b","#06d6a0","#118ab2","#8338ec","#ff69b4","#00f5d4"],
    pastel: ["#ffc8dd","#ffafcc","#bde0fe","#a2d2ff","#cdb4db","#b8e0d2","#d4a5a5","#e8d5b7"],
    earth:  ["#d4a373","#ccd5ae","#e9edc9","#faedcd","#a98467","#6b705c","#b7b7a4"],
    mono:   ["#f8f9fa","#dee2e6","#adb5bd","#6c757d","#495057","#343a40","#000000"],
    sunset: ["#ff006e","#ff5400","#ffbe0b","#ff0054","#9b5de5","#f15bb5"],
    ocean:  ["#03045e","#0077b6","#00b4d8","#48cae4","#90e0ef","#023e8a"],
  };

  // ── State ──────────────────────────────────────────────────────
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let GRID = 36;
  let CELL = 0;
  let board = [];       // GRID x GRID → 0 or piece id
  let boardColor = [];  // GRID x GRID → hex color string or null
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
  let nextPieceId = 1;

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
    boardColor = Array.from({ length: GRID }, () => Array(GRID).fill(null));
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

    currentDir = DIR.TOP;
    activePiece = null;
    gameOver = false;
    piecesPlaced = 0;
    updateHUD();
  }

  // ── Piece creation ─────────────────────────────────────────────
  function randomColor() {
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

  function rotateCellColors(origCells, origColors, times) {
    let rotated = origCells.map(([r, c], i) => ({ r, c, color: origColors[i] }));
    for (let t = 0; t < times; t++) {
      rotated = rotated.map(({ r, c, color }) => ({ r: c, c: -r, color }));
    }
    let minR = Infinity, minC = Infinity;
    for (const p of rotated) { minR = Math.min(minR, p.r); minC = Math.min(minC, p.c); }
    rotated = rotated.map(p => ({ r: p.r - minR, c: p.c - minC, color: p.color }));
    const rotatedCells = rotateShape(origCells, times);
    const colorMap = new Map();
    for (const p of rotated) colorMap.set(`${p.r},${p.c}`, p.color);
    return rotatedCells.map(([r, c]) => colorMap.get(`${r},${c}`) || "#ffffff");
  }

  function spawnPiece() {
    if (gameOver) return;

    const isFace = Math.random() < 0.3;
    let baseCells, cellColors = null;

    if (isFace) {
      const fkey = FACE_SHAPE_KEYS[Math.floor(Math.random() * FACE_SHAPE_KEYS.length)];
      const face = FACE_SHAPES[fkey];
      const rotations = Math.floor(Math.random() * 4);
      baseCells = rotateShape(face.cells, rotations);
      cellColors = rotateCellColors(face.cells, face.colors, rotations);
    } else {
      const key = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
      baseCells = rotateShape(SHAPES[key], Math.floor(Math.random() * 4));
    }

    const color = isFace ? null : randomColor();

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
    activePiece = { cells, color, dir: currentDir, cellColors };
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
    for (let i = 0; i < activePiece.cells.length; i++) {
      const { r, c } = activePiece.cells[i];
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) {
        board[r][c] = id;
        boardColor[r][c] = activePiece.cellColors
          ? activePiece.cellColors[i]
          : activePiece.color;
      }
    }
    piecesPlaced++;
    activePiece = null;
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

  // ── Rendering ──────────────────────────────────────────────────
  function drawBg() {
    if (bgStyle === "light") {
      ctx.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
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

  function drawCell(r, c, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
  }

  function drawBoard() {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (boardColor[r][c]) {
          drawCell(r, c, boardColor[r][c]);
        }
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
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < ghost.length; i++) {
      const { r, c } = ghost[i];
      const hex = activePiece.cellColors ? activePiece.cellColors[i] : activePiece.color;
      ctx.fillStyle = hex;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
    ctx.globalAlpha = 1;
  }

  function drawActivePiece() {
    if (!activePiece) return;
    for (let i = 0; i < activePiece.cells.length; i++) {
      const { r, c } = activePiece.cells[i];
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
      const hex = activePiece.cellColors ? activePiece.cellColors[i] : activePiece.color;
      drawCell(r, c, hex);
    }
  }

  function drawGlowPass() {
    if (!showGlow) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Glow around the whole cluster
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!boardColor[r][c]) continue;
        const hex = boardColor[r][c];
        ctx.fillStyle = hex;
        ctx.globalAlpha = 0.06;
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        const rad = CELL * 1.8;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, hex);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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
    const scale = 3;
    const w = canvas.width, h = canvas.height;
    const exp = document.createElement("canvas");
    exp.width = w * scale;
    exp.height = h * scale;
    const ec = exp.getContext("2d");
    ec.scale(scale, scale);

    // Background
    if (bgStyle === "light") {
      ec.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = ec.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.7);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0a0a0e");
      ec.fillStyle = grad;
    } else {
      ec.fillStyle = "#0a0a0e";
    }
    ec.fillRect(0, 0, w, h);

    // Board cells — flat colours
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (boardColor[r][c]) {
          ec.fillStyle = boardColor[r][c];
          ec.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }
    }

    const link = document.createElement("a");
    link.download = `tetris-art-hires-${Date.now()}.png`;
    link.href = exp.toDataURL("image/png");
    link.click();
  }

  init();
})();
