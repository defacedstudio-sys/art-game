/* ═══════════════════════════════════════════════════════════════════
   Four-Way Tetris Art Engine
   Blocks fall from TOP, RIGHT, BOTTOM, LEFT in turn,
   clustering around a seed block in the centre.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Directions ──────────────────────────────────────────────────
  const DIR = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };
  const DIR_NAMES = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
  const DIR_COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a29bfe"];

  // ── Tetromino shapes (relative coords, origin at 0,0) ──────────
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

  // ── Color Palettes ─────────────────────────────────────────────
  const PALETTES = {
    neon:   ["#ff006e","#fb5607","#ffbe0b","#06d6a0","#118ab2","#8338ec","#ff69b4","#00f5d4"],
    pastel: ["#ffc8dd","#ffafcc","#bde0fe","#a2d2ff","#cdb4db","#b8e0d2","#d4a5a5","#e8d5b7"],
    earth:  ["#d4a373","#ccd5ae","#e9edc9","#faedcd","#fefae0","#a98467","#6b705c","#b7b7a4"],
    mono:   ["#f8f9fa","#e9ecef","#dee2e6","#ced4da","#adb5bd","#6c757d","#495057","#343a40"],
    sunset: ["#ff7b00","#ff8800","#ff9500","#ffa200","#ffaa00","#ffb700","#ffc300","#ffd000"],
    ocean:  ["#03045e","#023e8a","#0077b6","#0096c7","#00b4d8","#48cae4","#90e0ef","#ade8f4"],
  };

  // ── State ──────────────────────────────────────────────────────
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let GRID = 36;
  let CELL = 0;
  let board = [];
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
    // Place seed block in the centre (2x2)
    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);
    const seedColor = "#ffffff";
    board[cx][cy] = seedColor;
    board[cx - 1][cy] = seedColor;
    board[cx][cy - 1] = seedColor;
    board[cx - 1][cy - 1] = seedColor;
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
    const color = randomColor();

    let maxR = 0, maxC = 0;
    for (const [r, c] of baseCells) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }

    const shapeW = maxC + 1;
    const shapeH = maxR + 1;
    const cx = Math.floor(GRID / 2);
    let cells;

    switch (currentDir) {
      case DIR.TOP: {
        const startCol = cx - Math.floor(shapeW / 2);
        cells = baseCells.map(([r, c]) => ({ r: r, c: c + startCol }));
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

    // Check if spawn location is blocked
    for (const cell of cells) {
      if (cell.r < 0 || cell.r >= GRID || cell.c < 0 || cell.c >= GRID) continue;
      if (board[cell.r][cell.c]) {
        advanceTurn();
        return;
      }
    }

    activePiece = { cells, color, dir: currentDir };
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
    for (const { r, c } of activePiece.cells) {
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) {
        board[r][c] = activePiece.color;
      }
    }
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
        valid = false;
        break;
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

  function drawGrid() {
    if (!showGrid) return;
    ctx.strokeStyle = bgStyle === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }
  }

  function drawCell(r, c, color, alpha = 1) {
    const x = c * CELL;
    const y = r * CELL;
    const pad = 1;

    if (showShadow) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x + pad + 2, y + pad + 2, CELL - pad * 2, CELL - pad * 2);
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2);

    // Inner highlight
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x + pad, y + pad, CELL - pad * 2, 2);
    ctx.fillRect(x + pad, y + pad, 2, CELL - pad * 2);

    // Inner shadow
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(x + pad, y + CELL - pad - 2, CELL - pad * 2, 2);
    ctx.fillRect(x + CELL - pad - 2, y + pad, 2, CELL - pad * 2);

    if (showGlow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.15;
      ctx.fillRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    ctx.globalAlpha = 1;
  }

  function drawBoard() {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (board[r][c]) {
          drawCell(r, c, board[r][c]);
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
        if (r < 0 || r >= GRID || c < 0 || c >= GRID || board[r][c]) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      ghost = next;
    }
    for (const { r, c } of ghost) {
      const x = c * CELL;
      const y = r * CELL;
      ctx.strokeStyle = activePiece.color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
    }
  }

  function drawActivePiece() {
    if (!activePiece) return;
    for (const { r, c } of activePiece.cells) {
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) {
        drawCell(r, c, activePiece.color);
      }
    }
  }

  function drawDirectionIndicators() {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = DIR_COLORS[currentDir];
    const mid = canvas.width / 2;
    const sz = 10;

    switch (currentDir) {
      case DIR.TOP:
        drawArrow(mid, 8, 0, 1, sz);
        break;
      case DIR.BOTTOM:
        drawArrow(mid, canvas.height - 8, 0, -1, sz);
        break;
      case DIR.LEFT:
        drawArrow(8, mid, 1, 0, sz);
        break;
      case DIR.RIGHT:
        drawArrow(canvas.width - 8, mid, -1, 0, sz);
        break;
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
    drawGrid();
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
        case "ArrowLeft":
          e.preventDefault();
          moveLateral(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveLateral(1);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (activePiece) {
            const { dr, dc } = getDelta(activePiece.dir);
            movePiece(dr, dc);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (activePiece) {
            const { dr, dc } = getDelta(activePiece.dir);
            movePiece(-dr, -dc);
          }
          break;
        case " ":
          e.preventDefault();
          hardDrop();
          break;
        case "z": case "Z":
          rotatePiece(false);
          break;
        case "x": case "X":
          rotatePiece(true);
          break;
        case "Enter":
          if (!activePiece) spawnPiece();
          break;
        case "p": case "P":
          togglePause();
          break;
        case "r": case "R":
          resetBoard();
          break;
      }
    });

    // Panel toggles
    const ctrl = document.getElementById("controls");
    const showBtn = document.getElementById("btn-show-ctrl");

    document.getElementById("btn-toggle-ctrl").addEventListener("click", () => {
      ctrl.classList.add("hidden");
      showBtn.classList.add("visible");
    });

    showBtn.addEventListener("click", () => {
      ctrl.classList.remove("hidden");
      showBtn.classList.remove("visible");
    });

    document.getElementById("speed").addEventListener("input", (e) => {
      dropInterval = parseInt(e.target.value);
    });

    document.getElementById("grid-size").addEventListener("change", () => {
      resetBoard();
    });

    document.getElementById("palette").addEventListener("change", (e) => {
      palette = e.target.value;
    });

    document.getElementById("bg-style").addEventListener("change", (e) => {
      bgStyle = e.target.value;
    });

    document.getElementById("tog-grid").addEventListener("change", (e) => {
      showGrid = e.target.checked;
    });

    document.getElementById("tog-glow").addEventListener("change", (e) => {
      showGlow = e.target.checked;
    });

    document.getElementById("tog-shadow").addEventListener("change", (e) => {
      showShadow = e.target.checked;
    });

    document.getElementById("tog-auto").addEventListener("change", (e) => {
      autoPlay = e.target.checked;
    });

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
    const scale = 2;
    const expCanvas = document.createElement("canvas");
    expCanvas.width = GRID * CELL * scale;
    expCanvas.height = GRID * CELL * scale;
    const ectx = expCanvas.getContext("2d");
    ectx.scale(scale, scale);

    if (bgStyle === "light") {
      ectx.fillStyle = "#f0f0f0";
    } else if (bgStyle === "gradient") {
      const grad = ectx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
      );
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0a0a0e");
      ectx.fillStyle = grad;
    } else {
      ectx.fillStyle = "#0a0a0e";
    }
    ectx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (board[r][c]) {
          const x = c * CELL + 1;
          const y = r * CELL + 1;
          const s = CELL - 2;
          ectx.fillStyle = board[r][c];
          ectx.fillRect(x, y, s, s);
          ectx.fillStyle = "rgba(255,255,255,0.12)";
          ectx.fillRect(x, y, s, 2);
          ectx.fillRect(x, y, 2, s);
          ectx.fillStyle = "rgba(0,0,0,0.18)";
          ectx.fillRect(x, y + s - 2, s, 2);
          ectx.fillRect(x + s - 2, y, 2, s);
        }
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
