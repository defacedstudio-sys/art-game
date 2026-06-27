/* ═══════════════════════════════════════════════════════════════════
   NTSC / VHS Lab
   A from-scratch, browser-side recreation of the JargeZ/ntscqt look
   (https://github.com/JargeZ/ntscqt) — same artefacts, friendlier labels,
   and WITHOUT the grey transient streak the original leaves down the left
   edge.  Every horizontal filter is primed with its first sample and clamps
   at the borders, so the picture starts clean at column 0.

   Pipeline (per scan-line, mirrors the original order):
     RGB → YIQ
       → modulate chroma onto a 4-phase colour subcarrier
       → composite pre-emphasis (edge boost)
       → ringing (sharp band-limit → Gibbs ripples)
       → luma noise
       → demodulate chroma (recover I/Q)
       → chroma phase jitter / chroma noise / chroma drop-out
     then, full-frame:
       → colour bleed (horizontal + vertical chroma blur)
       → edge wobble (per-line horizontal warp)
       → optional VHS sharpen + head-switching
     YIQ → RGB

   Export uses an Aseprite-style integer upscaler (nearest-neighbour), so
   the crunchy pixels stay crunchy at 2×, 3×, 4× …
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Seeded RNG (mulberry32) so a given Seed is fully reproducible ──
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Gaussian from a uniform rng (Box–Muller, one value per call)
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ── FIXED PRESET ─────────────────────────────────────────────────────
  // The exact ntscqt settings from the reference screenshot (seed 44).
  // These are baked in — there are no dials. Change them here only.
  const PRESET = {
    preemphasis: 1.84746,   // Composite preemphasis
    vhsSharpen:  2.46772,   // VHS out sharpen   (only with vhs:true)
    edgeWave:    4,         // Edge wave
    ringingPower: 6,        // Ringing power
    bleedH:      1,         // Color bleed horiz
    bleedV:      1,         // Color bleed vert
    chromaNoise: 241,       // Video chroma noise
    chromaPhase: 3,         // Video chroma phase noise
    chromaLoss:  225,       // Video chroma loss
    videoNoise:  343,       // Video noise
    headSpeed:   0,         // Head switch move speed (only with head:true)
  };
  const TOG = { head: false, vhs: false };  // both off, exactly as the screenshot
  const SEED = 44;
  const RENDER_HEIGHT = 600;                 // the look is baked at TV resolution

  // ── State ───────────────────────────────────────────────────────────
  const state = {
    source: null,     // HTMLCanvasElement holding the original image at native size
  };

  // ─────────────────────────────────────────────────────────────────────
  //  COLOUR MATHS  (standard FCC YIQ, working in 0..255)
  // ─────────────────────────────────────────────────────────────────────
  // R,G,B in 0..255  →  Y 0..255,  I/Q roughly ±150
  function rgb2yiq(r, g, b, out, i) {
    out.Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    out.I[i] = 0.5959 * r - 0.2746 * g - 0.3213 * b;
    out.Q[i] = 0.2115 * r - 0.5227 * g + 0.3112 * b;
  }
  function yiq2rgb(Y, I, Q) {
    return [
      Y + 0.956 * I + 0.619 * Q,
      Y - 0.272 * I - 0.647 * Q,
      Y - 1.106 * I + 1.703 * Q,
    ];
  }
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  // ─────────────────────────────────────────────────────────────────────
  //  RINGING — a high-Q resonator excited by horizontal edges.
  //  Each sharp brightness change "rings" the resonator, which then
  //  oscillates and decays, painting the long horizontal ripple trails the
  //  real (FFT-based) ntscqt ringing produces.  `power` (2..7) raises the
  //  pole radius, so higher power → longer-lived, stronger ripples.
  //  We run it forwards AND backwards and average, so ripples sit on both
  //  sides of an edge and there is no left/right bias (no edge streak).
  // ─────────────────────────────────────────────────────────────────────
  function applyRinging(comp, W, power) {
    const r = 0.90 + ((power - 2) / 5) * 0.072;    // 0.90 … 0.972 (decay length)
    const w0 = (2 * Math.PI) / 5;                   // FINE ripples, period ≈ 5 px
    const c1 = 2 * r * Math.cos(w0), c2 = r * r;
    const gain = 0.15;                              // subtle, ±~13 % swing at an edge
    const fwd = ringPass(comp, W, c1, c2, +1);
    const bwd = ringPass(comp, W, c1, c2, -1);
    for (let x = 0; x < W; x++) comp[x] += gain * 0.5 * (fwd[x] + bwd[x]);
  }
  function ringPass(comp, W, c1, c2, dir) {
    const out = new Float32Array(W);
    let y1 = 0, y2 = 0;
    const start = dir > 0 ? 0 : W - 1;
    const end = dir > 0 ? W : -1;
    let prev = comp[start];                        // primed → no edge transient
    for (let x = start; x !== end; x += dir) {
      const exc = comp[x] - prev; prev = comp[x];
      const yv = exc + c1 * y1 - c2 * y2;
      y2 = y1; y1 = yv;
      out[x] = yv;
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  MAIN FILTER
  //  Takes an ImageData (working resolution) and returns a new ImageData.
  // ─────────────────────────────────────────────────────────────────────
  function applyNTSC(src, p, tog, seed) {
    const W = src.width, H = src.height;
    const sd = src.data;
    const N = W * H;

    const Y = new Float32Array(N);
    const I = new Float32Array(N);
    const Q = new Float32Array(N);
    const planes = { Y, I, Q };

    for (let i = 0; i < N; i++) {
      rgb2yiq(sd[i * 4], sd[i * 4 + 1], sd[i * 4 + 2], planes, i);
    }

    const rng = makeRng(seed);

    // ── Tunables derived from the (friendly) parameter values ───────────
    const preemph    = p.preemphasis;
    const ringPower  = p.ringingPower;
    const lumaStd    = (p.videoNoise / 4200) * 42;
    const chromaStd  = (p.chromaNoise / 16384) * 70;
    const phaseStd   = (p.chromaPhase / 50) * 0.45;      // radians, per line
    const lossChance = (p.chromaLoss / 10000) * 0.05;    // per-pixel drop-out start

    // temp row buffers
    const comp   = new Float32Array(W);
    const Iout   = new Float32Array(W);
    const Qout   = new Float32Array(W);

    for (let y = 0; y < H; y++) {
      const row = y * W;
      // subcarrier phase: 90° per pixel, flipped every other line (dot-crawl)
      const linePhase = (y & 1) ? Math.PI : 0;

      // 1) modulate chroma onto the subcarrier → composite luma signal
      for (let x = 0; x < W; x++) {
        const a = x * (Math.PI / 2) + linePhase;
        comp[x] = Y[row + x] + I[row + x] * Math.cos(a) + Q[row + x] * Math.sin(a);
      }

      // 2) composite pre-emphasis (one-pole high-pass boost, primed at x=0)
      if (preemph > 0) {
        let lp = comp[0];                       // prime → no left transient
        const aCoef = 0.5;
        for (let x = 0; x < W; x++) {
          lp += aCoef * (comp[x] - lp);
          comp[x] += preemph * (comp[x] - lp);
        }
      }

      // 3) ringing — edge-excited resonator (long horizontal ripple trails)
      applyRinging(comp, W, ringPower);

      // 4) luma noise
      if (lumaStd > 0) {
        for (let x = 0; x < W; x++) comp[x] += gauss(rng) * lumaStd;
      }

      // 5) demodulate chroma (multiply by carrier, then 4-tap box = remove carrier)
      for (let x = 0; x < W; x++) {
        const a = x * (Math.PI / 2) + linePhase;
        Iout[x] = 2 * comp[x] * Math.cos(a);
        Qout[x] = 2 * comp[x] * Math.sin(a);
      }
      boxRow(Iout, W, 2);    // one subcarrier cycle ≈ 4 px → radius 2
      boxRow(Qout, W, 2);

      // 6) chroma phase jitter (rotate I/Q by a small per-line angle)
      let rot = 0;
      if (phaseStd > 0) {
        rot = gauss(rng) * phaseStd;
      }
      const cr = Math.cos(rot), sr = Math.sin(rot);

      // 7) drop-out run state
      let drop = 0;

      for (let x = 0; x < W; x++) {
        let iv = Iout[x], qv = Qout[x];
        if (rot !== 0) { const ni = iv * cr - qv * sr; qv = iv * sr + qv * cr; iv = ni; }
        if (chromaStd > 0) { iv += gauss(rng) * chromaStd; qv += gauss(rng) * chromaStd; }
        if (lossChance > 0) {
          if (drop > 0) { drop--; iv = 0; qv = 0; }
          else if (rng() < lossChance) { drop = 4 + ((rng() * 12) | 0); iv = 0; qv = 0; }
        }
        I[row + x] = iv;
        Q[row + x] = qv;
        // luma = composite with the recovered chroma notched back out
        const a = x * (Math.PI / 2) + linePhase;
        Y[row + x] = comp[x] - (iv * Math.cos(a) + qv * Math.sin(a));
      }
    }

    // ── Colour bleed (chroma blur), horizontal then vertical ────────────
    if (p.bleedH > 0) { blurPlaneH(I, W, H, p.bleedH); blurPlaneH(Q, W, H, p.bleedH); }
    if (p.bleedV > 0) { blurPlaneV(I, W, H, p.bleedV); blurPlaneV(Q, W, H, p.bleedV); }

    // ── Edge wobble (per-line horizontal warp, clamped sampling) ────────
    if (p.edgeWave > 0) {
      warpEdgeWave(planes, W, H, p.edgeWave, seed);
    }

    // ── Optional VHS path ───────────────────────────────────────────────
    if (tog.vhs) {
      vhsLowpass(Y, W, H);
      unsharp(Y, W, H, p.vhsSharpen - 1);
    }

    // ── Optional head switching (torn band at bottom) ───────────────────
    if (tog.head) {
      headSwitch(planes, W, H, p.headSpeed, seed);
    }

    // ── YIQ → RGB ───────────────────────────────────────────────────────
    const out = new ImageData(W, H);
    const od = out.data;
    for (let i = 0; i < N; i++) {
      const [r, g, b] = yiq2rgb(Y[i], I[i], Q[i]);
      od[i * 4]     = clamp8(r);
      od[i * 4 + 1] = clamp8(g);
      od[i * 4 + 2] = clamp8(b);
      od[i * 4 + 3] = 255;
    }
    return out;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  // In-place horizontal box blur of a single row (radius r), clamped edges.
  function boxRow(buf, W, r) {
    if (r <= 0) return;
    const tmp = new Float32Array(W);
    const win = 2 * r + 1;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += buf[clampi(x, W)];
    for (let x = 0; x < W; x++) {
      tmp[x] = acc / win;
      acc += buf[clampi(x + r + 1, W)] - buf[clampi(x - r, W)];
    }
    buf.set(tmp);
  }
  const clampi = (x, W) => (x < 0 ? 0 : x >= W ? W - 1 : x);

  function blurPlaneH(plane, W, H, r) {
    const row = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      for (let x = 0; x < W; x++) row[x] = plane[o + x];
      boxRow(row, W, r);
      for (let x = 0; x < W; x++) plane[o + x] = row[x];
    }
  }
  function blurPlaneV(plane, W, H, r) {
    const col = new Float32Array(H);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) col[y] = plane[y * W + x];
      boxRow(col, H, r);             // reuse 1-D box on the column
      for (let y = 0; y < H; y++) plane[y * W + x] = col[y];
    }
  }

  function warpEdgeWave(planes, W, H, amp, seed) {
    const rng = makeRng(seed ^ 0x9e3779b9);
    const phase = rng() * Math.PI * 2;
    const Y = planes.Y, I = planes.I, Q = planes.Q;
    const ry = new Float32Array(W), ri = new Float32Array(W), rq = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      // smooth low-frequency wobble + a touch of per-line jitter
      const dx = amp * Math.sin(y * 0.18 + phase) + amp * 0.35 * (rng() - 0.5);
      for (let x = 0; x < W; x++) {
        const sx = x - dx;
        const x0 = Math.floor(sx);
        const f = sx - x0;
        const a = clampi(x0, W), b = clampi(x0 + 1, W);
        ry[x] = Y[o + a] * (1 - f) + Y[o + b] * f;
        ri[x] = I[o + a] * (1 - f) + I[o + b] * f;
        rq[x] = Q[o + a] * (1 - f) + Q[o + b] * f;
      }
      for (let x = 0; x < W; x++) { Y[o + x] = ry[x]; I[o + x] = ri[x]; Q[o + x] = rq[x]; }
    }
  }

  function vhsLowpass(Y, W, H) {
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let lp = Y[o];
      for (let x = 0; x < W; x++) { lp += 0.45 * (Y[o + x] - lp); Y[o + x] = lp; }
    }
  }
  function unsharp(Y, W, H, amount) {
    if (amount <= 0) return;
    for (let y = 0; y < H; y++) {
      const o = y * W;
      const blur = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        blur[x] = (Y[o + clampi(x - 1, W)] + Y[o + x] + Y[o + clampi(x + 1, W)]) / 3;
      }
      for (let x = 0; x < W; x++) Y[o + x] += amount * (Y[o + x] - blur[x]);
    }
  }
  function headSwitch(planes, W, H, speed, seed) {
    const rng = makeRng(seed ^ 0x5bd1e995);
    const band = Math.max(6, Math.round(H * 0.04));
    const drift = (speed / 100) * W * 0.5;
    const Y = planes.Y, I = planes.I, Q = planes.Q;
    for (let y = H - band; y < H; y++) {
      const t = (y - (H - band)) / band;             // 0 at top of band → 1 at bottom
      const shift = Math.round((drift + W * 0.25) * t + (rng() - 0.5) * 6);
      shiftRow(Y, W, y, shift);
      shiftRow(I, W, y, shift);
      shiftRow(Q, W, y, shift);
    }
  }
  function shiftRow(plane, W, y, s) {
    const o = y * W;
    const tmp = new Float32Array(W);
    for (let x = 0; x < W; x++) tmp[x] = plane[o + clampi(x - s, W)];
    for (let x = 0; x < W; x++) plane[o + x] = tmp[x];
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DEFAULT SAMPLE IMAGE  — a friendly stand-in subject with strong
  //  edges & saturated colour so every artefact is visible out of the box.
  // ═══════════════════════════════════════════════════════════════════
  function buildSampleImage() {
    const w = 480, h = 480;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // dark surround
    g.fillStyle = "#2a1414";
    g.fillRect(0, 0, w, h);

    // cream rounded frame
    roundRect(g, 40, 40, w - 80, h - 80, 34);
    g.fillStyle = "#f3efe0";
    g.fill();

    // eyes
    g.fillStyle = "#1a1010";
    circle(g, w * 0.42, h * 0.30, 13);
    circle(g, w * 0.58, h * 0.30, 13);

    // cone nose (orange→red gradient)
    const ng = g.createLinearGradient(0, h * 0.34, 0, h * 0.55);
    ng.addColorStop(0, "#ffcf33");
    ng.addColorStop(0.5, "#ff8a00");
    ng.addColorStop(1, "#ff2a00");
    g.fillStyle = ng;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.34);
    g.lineTo(w * 0.565, h * 0.55);
    g.lineTo(w * 0.435, h * 0.55);
    g.closePath();
    g.fill();

    // blue bowl body
    const bg = g.createLinearGradient(w * 0.32, 0, w * 0.68, 0);
    bg.addColorStop(0, "#6ec8ff");
    bg.addColorStop(0.5, "#2a5cff");
    bg.addColorStop(1, "#6ec8ff");
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(w * 0.33, h * 0.60);
    g.lineTo(w * 0.67, h * 0.60);
    g.arc(w * 0.5, h * 0.60, w * 0.17, 0, Math.PI);
    g.closePath();
    g.fill();

    // red bow-tie + centre knot
    g.fillStyle = "#ff1a1a";
    tri(g, w * 0.40, h * 0.74, w * 0.40, h * 0.84, w * 0.475, h * 0.79);
    tri(g, w * 0.60, h * 0.74, w * 0.60, h * 0.84, w * 0.525, h * 0.79);
    circle(g, w * 0.5, h * 0.79, 16);

    return c;

    function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    function tri(ctx, x1, y1, x2, y2, x3, y3) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER  — always the fixed preset, computed once per loaded image.
  // ═══════════════════════════════════════════════════════════════════
  const previewCanvas = document.getElementById("preview");
  const pctx = previewCanvas.getContext("2d");
  let working = null;     // last processed ImageData (the baked NTSC frame)
  let workW = 0, workH = 0;

  function scaledSource() {
    // Bake the look at TV resolution (RENDER_HEIGHT), preserving aspect.
    const s = state.source;
    const h = Math.min(RENDER_HEIGHT, Math.max(64, s.height));
    const w = Math.max(1, Math.round((s.width * h) / s.height));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(s, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  function render() {
    if (!state.source) return;
    const srcImg = scaledSource();
    workW = srcImg.width; workH = srcImg.height;
    working = applyNTSC(srcImg, PRESET, TOG, SEED);

    previewCanvas.width = workW;
    previewCanvas.height = workH;
    pctx.imageSmoothingEnabled = false;
    pctx.putImageData(working, 0, 0);

    // refresh the export-size fields to the new native size
    if (exW && !exW._touched) exW.value = workW;
    if (exH && !exH._touched) exH.value = workH;
    updateSizeNote();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EXPORT — Aseprite-style nearest-neighbour resize to any size.
  // ═══════════════════════════════════════════════════════════════════
  function exportPNG(targetW, targetH) {
    if (!working) return;
    targetW = Math.max(1, Math.round(targetW));
    targetH = Math.max(1, Math.round(targetH));

    const src = document.createElement("canvas");
    src.width = workW; src.height = workH;
    src.getContext("2d").putImageData(working, 0, 0);

    const out = document.createElement("canvas");
    out.width = targetW; out.height = targetH;
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = false;        // crisp pixels, exactly like Aseprite
    g.drawImage(src, 0, 0, targetW, targetH);

    out.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ntsc_${targetW}x${targetH}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MINIMAL UI  — open image, choose export size, save. No dials.
  // ═══════════════════════════════════════════════════════════════════
  const exW = document.getElementById("exW");
  const exH = document.getElementById("exH");
  const lockChk = document.getElementById("lockAspect");
  const sizeNote = document.getElementById("sizeNote");

  function aspect() { return workH ? workW / workH : 1; }
  function updateSizeNote() {
    if (!sizeNote) return;
    const w = parseInt(exW.value, 10) || workW;
    const h = parseInt(exH.value, 10) || workH;
    const mult = workW ? (w / workW) : 1;
    const clean = Math.abs(mult - Math.round(mult)) < 0.01 && Math.round(mult) >= 1;
    sizeNote.textContent =
      `Source bakes at ${workW}×${workH}. Export ${w}×${h}` +
      (clean ? ` (${Math.round(mult)}× — perfectly crisp).` : ` (nearest-neighbour).`);
  }

  exW.addEventListener("input", () => {
    exW._touched = true;
    if (lockChk.checked) { exH.value = Math.max(1, Math.round((parseInt(exW.value, 10) || 0) / aspect())); }
    updateSizeNote();
  });
  exH.addEventListener("input", () => {
    exH._touched = true;
    if (lockChk.checked) { exW.value = Math.max(1, Math.round((parseInt(exH.value, 10) || 0) * aspect())); }
    updateSizeNote();
  });

  // quick integer-scale buttons
  document.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = parseInt(btn.dataset.scale, 10);
      exW.value = workW * s; exH.value = workH * s;
      exW._touched = exH._touched = true;
      updateSizeNote();
    });
  });

  document.getElementById("savePNG").addEventListener("click", () => {
    exportPNG(parseInt(exW.value, 10) || workW, parseInt(exH.value, 10) || workH);
  });

  // Image loading
  const fileInput = document.getElementById("fileInput");
  document.getElementById("openImage").addEventListener("click", () => fileInput.click());
  function loadFile(f) {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      state.source = c;
      exW._touched = exH._touched = false;   // re-fit export size to new image
      render();
    };
    img.src = URL.createObjectURL(f);
  }
  fileInput.addEventListener("change", () => loadFile(fileInput.files && fileInput.files[0]));

  // Drag & drop onto the preview
  const wrap = document.querySelector(".canvas-wrap");
  wrap.addEventListener("dragover", (e) => { e.preventDefault(); wrap.classList.add("drag"); });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("drag"));
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    wrap.classList.remove("drag");
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // ── Boot ────────────────────────────────────────────────────────────
  state.source = buildSampleImage();
  render();
})();
