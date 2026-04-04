/* ═══════════════════════════════════════════════════════════════════
   Shape Layer Studio
   Click grid intersections to draw connected shapes.
   Close a path to fill it with a flat colour.
   Layer new shapes on top, each a different colour.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  // ── Palettes ───────────────────────────────────────────────────
  const PALETTES = {
    bold:   ["#ff006e","#fb5607","#ffbe0b","#06d6a0","#118ab2","#8338ec","#ff0000","#000000","#ffffff"],
    pastel: ["#ffc8dd","#ffafcc","#bde0fe","#a2d2ff","#cdb4db","#b8e0d2","#d4a5a5","#e8d5b7"],
    earth:  ["#d4a373","#ccd5ae","#e9edc9","#faedcd","#a98467","#6b705c","#b7b7a4"],
    mono:   ["#f8f9fa","#dee2e6","#adb5bd","#6c757d","#495057","#343a40","#000000"],
    neon:   ["#ff006e","#00f5d4","#ffbe0b","#8338ec","#ff69b4","#06d6a0","#fb5607"],
  };

  // ── State ──────────────────────────────────────────────────────
  let gridSpacing = 40;
  let dotSize = 3;
  let palette = "bold";
  let bgStyle = "dark";
  let colorIndex = 0;

  let layers = [];       // Array of { points: [{x,y},...], color: str }
  let currentPoints = []; // Points being drawn for the active shape
  let hoverDot = null;    // {gx, gy, x, y} — grid dot the cursor is near
  let offsetX = 0;        // grid pixel offset for centring
  let offsetY = 0;
  let gridCols = 0;
  let gridRows = 0;

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    resize();
    bindControls();
    requestAnimationFrame(loop);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gridCols = Math.floor(canvas.width / gridSpacing);
    gridRows = Math.floor(canvas.height / gridSpacing);
    offsetX = Math.floor((canvas.width - gridCols * gridSpacing) / 2) + gridSpacing / 2;
    offsetY = Math.floor((canvas.height - gridRows * gridSpacing) / 2) + gridSpacing / 2;
  }

  function gridToPixel(gx, gy) {
    return {
      x: offsetX + gx * gridSpacing,
      y: offsetY + gy * gridSpacing,
    };
  }

  function pixelToGrid(mx, my) {
    const gx = Math.round((mx - offsetX) / gridSpacing);
    const gy = Math.round((my - offsetY) / gridSpacing);
    return { gx, gy };
  }

  function nextColor() {
    const pal = PALETTES[palette] || PALETTES.bold;
    const color = pal[colorIndex % pal.length];
    colorIndex++;
    return color;
  }

  // ── Interaction ────────────────────────────────────────────────
  function handleClick(mx, my) {
    const { gx, gy } = pixelToGrid(mx, my);
    const { x, y } = gridToPixel(gx, gy);

    // Check if close enough to a grid dot
    const dist = Math.hypot(mx - x, my - y);
    if (dist > gridSpacing * 0.4) return;

    // If we have points and click the first point again → close shape
    if (currentPoints.length >= 3) {
      const first = currentPoints[0];
      if (first.gx === gx && first.gy === gy) {
        closeShape();
        return;
      }
    }

    // Don't allow duplicate consecutive points
    if (currentPoints.length > 0) {
      const last = currentPoints[currentPoints.length - 1];
      if (last.gx === gx && last.gy === gy) return;
    }

    currentPoints.push({ gx, gy, x, y });
  }

  function closeShape() {
    if (currentPoints.length < 3) return;
    const color = nextColor();
    layers.push({
      points: currentPoints.map(p => ({ x: p.x, y: p.y })),
      color,
    });
    currentPoints = [];
    updateLayerCount();
  }

  function handleMouseMove(mx, my) {
    const { gx, gy } = pixelToGrid(mx, my);
    const { x, y } = gridToPixel(gx, gy);
    const dist = Math.hypot(mx - x, my - y);
    if (dist < gridSpacing * 0.4 && gx >= 0 && gy >= 0 && gx <= gridCols && gy <= gridRows) {
      hoverDot = { gx, gy, x, y };
    } else {
      hoverDot = null;
    }
  }

  function undoPoint() {
    if (currentPoints.length > 0) {
      currentPoints.pop();
    } else if (layers.length > 0) {
      undoLayer();
    }
  }

  function undoLayer() {
    if (layers.length > 0) {
      layers.pop();
      colorIndex = Math.max(0, colorIndex - 1);
      updateLayerCount();
    }
  }

  function cancelShape() {
    currentPoints = [];
  }

  function clearAll() {
    layers = [];
    currentPoints = [];
    colorIndex = 0;
    updateLayerCount();
  }

  function updateLayerCount() {
    document.getElementById("layer-count").textContent = `Layers: ${layers.length}`;
  }

  // ── Rendering ──────────────────────────────────────────────────
  function drawBg() {
    if (bgStyle === "light") {
      ctx.fillStyle = "#f0f0f0";
    } else {
      ctx.fillStyle = "#0a0a0e";
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawGrid() {
    const isLight = bgStyle === "light";
    ctx.fillStyle = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";

    for (let gy = 0; gy <= gridRows; gy++) {
      for (let gx = 0; gx <= gridCols; gx++) {
        const { x, y } = gridToPixel(gx, gy);
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLayers() {
    for (const layer of layers) {
      const pts = layer.points;
      if (pts.length < 3) continue;

      // Fill
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // Stroke
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.globalAlpha = 1;

      // Vertices
      for (const p of pts) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawCurrentShape() {
    if (currentPoints.length === 0) return;

    const pts = currentPoints;

    // Lines between placed points
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }

    // Line to cursor/hover
    if (hoverDot) {
      ctx.lineTo(hoverDot.x, hoverDot.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Preview fill if hovering on start point and enough points
    if (hoverDot && pts.length >= 3 &&
        hoverDot.gx === pts[0].gx && hoverDot.gy === pts[0].gy) {
      const pal = PALETTES[palette] || PALETTES.bold;
      const previewColor = pal[colorIndex % pal.length];
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = previewColor;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Placed vertices
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const isFirst = i === 0 && pts.length >= 3;

      // First-point glow (close target)
      if (isFirst) {
        ctx.fillStyle = "rgba(124, 110, 240, 0.25)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = i === 0 ? "#7c6ef0" : "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0a0a0e";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHover() {
    if (!hoverDot) return;

    // Don't draw hover dot if it's a placed point already shown
    ctx.fillStyle = "rgba(124, 110, 240, 0.3)";
    ctx.beginPath();
    ctx.arc(hoverDot.x, hoverDot.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(124, 110, 240, 0.8)";
    ctx.beginPath();
    ctx.arc(hoverDot.x, hoverDot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Game loop ──────────────────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);
    drawBg();
    drawGrid();
    drawLayers();
    drawCurrentShape();
    drawHover();
  }

  // ── Controls ───────────────────────────────────────────────────
  function bindControls() {
    canvas.addEventListener("click", (e) => {
      handleClick(e.clientX, e.clientY);
    });

    canvas.addEventListener("mousemove", (e) => {
      handleMouseMove(e.clientX, e.clientY);
    });

    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      handleClick(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      handleMouseMove(t.clientX, t.clientY);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cancelShape();
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoPoint();
      }
    });

    // Panel
    const ctrl = document.getElementById("controls");
    const showBtn = document.getElementById("btn-show-ctrl");
    document.getElementById("btn-toggle-ctrl").addEventListener("click", () => {
      ctrl.classList.add("hidden"); showBtn.classList.add("visible");
    });
    showBtn.addEventListener("click", () => {
      ctrl.classList.remove("hidden"); showBtn.classList.remove("visible");
    });

    document.getElementById("grid-spacing").addEventListener("input", (e) => {
      gridSpacing = parseInt(e.target.value);
      resize();
    });

    document.getElementById("dot-size").addEventListener("input", (e) => {
      dotSize = parseInt(e.target.value);
    });

    document.getElementById("palette").addEventListener("change", (e) => {
      palette = e.target.value;
    });

    document.getElementById("bg-style").addEventListener("change", (e) => {
      bgStyle = e.target.value;
    });

    document.getElementById("btn-undo").addEventListener("click", undoPoint);
    document.getElementById("btn-cancel").addEventListener("click", cancelShape);
    document.getElementById("btn-undo-layer").addEventListener("click", undoLayer);
    document.getElementById("btn-clear").addEventListener("click", clearAll);

    document.getElementById("btn-screenshot").addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `shape-art-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    document.getElementById("btn-export").addEventListener("click", exportHighRes);

    window.addEventListener("resize", resize);
  }

  function exportHighRes() {
    const scale = 3;
    const exp = document.createElement("canvas");
    exp.width = canvas.width * scale;
    exp.height = canvas.height * scale;
    const ec = exp.getContext("2d");
    ec.scale(scale, scale);

    // Background
    ec.fillStyle = bgStyle === "light" ? "#f0f0f0" : "#0a0a0e";
    ec.fillRect(0, 0, canvas.width, canvas.height);

    // Grid dots
    const isLight = bgStyle === "light";
    ec.fillStyle = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
    for (let gy = 0; gy <= gridRows; gy++) {
      for (let gx = 0; gx <= gridCols; gx++) {
        const { x, y } = gridToPixel(gx, gy);
        ec.beginPath();
        ec.arc(x, y, dotSize, 0, Math.PI * 2);
        ec.fill();
      }
    }

    // Layers
    for (const layer of layers) {
      const pts = layer.points;
      if (pts.length < 3) continue;
      ec.globalAlpha = 0.75;
      ec.fillStyle = layer.color;
      ec.beginPath();
      ec.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ec.lineTo(pts[i].x, pts[i].y);
      ec.closePath();
      ec.fill();
      ec.globalAlpha = 0.9;
      ec.strokeStyle = layer.color;
      ec.lineWidth = 2.5;
      ec.lineJoin = "round";
      ec.stroke();
      ec.globalAlpha = 1;
      for (const p of pts) {
        ec.fillStyle = "#ffffff";
        ec.beginPath();
        ec.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ec.fill();
        ec.fillStyle = layer.color;
        ec.beginPath();
        ec.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ec.fill();
      }
    }

    const link = document.createElement("a");
    link.download = `shape-art-hires-${Date.now()}.png`;
    link.href = exp.toDataURL("image/png");
    link.click();
  }

  // ── Start ──────────────────────────────────────────────────────
  init();
})();
