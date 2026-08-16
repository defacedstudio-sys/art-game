/* ──────────────────────────────────────────────────────────────────
   Character Layouts — generative staggered compositions

   Takes a library of characters on transparent canvases and lays them
   out on an off-white ground: staggered rows, no character twice in the
   same artwork, no overlaps, generous clear space, balanced weight.

   Each character keeps the size it occupies on its own canvas: the
   engine measures the alpha bounding box of every source file and
   reproduces that footprint ratio, so a character that fills its canvas
   stays big and a small one stays small. One global scale multiplies
   every character in an artwork by the same factor, so relative sizing
   is never broken.

   The engine half of this file is pure (no DOM) so it can be tested in
   Node; the UI half only runs in a browser.
   ────────────────────────────────────────────────────────────────── */

(function (global) {
  "use strict";

  /* ── Random ─────────────────────────────────────────────────────── */

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mixSeed(a, b) {
    let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* ── Settings ───────────────────────────────────────────────────── */

  const DEFAULTS = {
    width: 2048,
    height: 2048,
    background: "#f3f0e9",
    bgJitter: 0.0, // 0..1, subtle per-artwork tint drift
    minCount: 5,
    maxCount: 9,
    fullness: 0.75, // 0..1 — how much of the packable room the cast uses
    sizeCap: 0.5, // no character's footprint may exceed this share of the canvas
    margin: 0.07, // clear edge band, fraction of min(W, H)
    spacing: 0.035, // min clear space around each character, fraction of √(W·H)
    stagger: 0.7, // 0 = tidy aligned rows, 1 = strongly offset
    candidates: 24, // layouts tried per artwork, best one wins
    count: 250,
    seed: 1,
  };

  /* ── Geometry helpers ───────────────────────────────────────────── */

  function overlapAmount(a, b, pad) {
    const dx =
      Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x - pad, b.x - pad);
    const dy =
      Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y - pad, b.y - pad);
    return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
  }

  function anyOverlap(items, pad) {
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (overlapAmount(items[i], items[j], pad) > 0.5) return true;
    return false;
  }

  /* ── Cast selection ─────────────────────────────────────────────── */

  /* The fullness dial maps onto the share of the usable area the cast is
     allowed to occupy once every character carries its own clear space.
     The top of the range is where staggered rows start needing to trim a
     cast to fit, so the default sits comfortably below it. */
  function packEfficiency(fullness) {
    return clamp(0.06 + fullness * 0.5, 0.03, 0.62);
  }

  /* One size multiplier for the whole series.

     Every character is drawn at its own canvas footprint times this one
     number, so relative sizes hold both inside an artwork and across all
     250 of them — the same character is never big in one piece and small
     in the next. */
  function seriesScale(chars, cfg) {
    if (!chars.length) return 1;
    let sum = 0;
    let biggest = 0;
    for (const c of chars) {
      sum += c.occArea;
      if (c.occArea > biggest) biggest = c.occArea;
    }
    const meanOcc = Math.max(1e-6, sum / chars.length);
    const meanCast = Math.max(
      1,
      (Math.min(cfg.minCount, cfg.maxCount) + Math.max(cfg.minCount, cfg.maxCount)) / 2
    );
    const unit = Math.sqrt(cfg.width * cfg.height * meanOcc);

    // Room an average cast member may claim, its halo of clear space and
    // the edge margin already taken out.
    const halo = cfg.spacing * Math.sqrt(cfg.width * cfg.height);
    const margin = cfg.margin * Math.min(cfg.width, cfg.height);
    const usable =
      Math.max(1, cfg.width - margin * 2) * Math.max(1, cfg.height - margin * 2);
    const cell = Math.sqrt((packEfficiency(cfg.fullness) * usable) / meanCast);
    let s = Math.max(0.02, cell - 2 * halo) / unit;

    // Capped so the biggest character can never swallow the canvas.
    if (biggest > 0) s = Math.min(s, Math.sqrt(cfg.sizeCap / biggest));
    return s;
  }

  /* Roughly how much ink an average artwork will carry, for display. */
  function expectedCoverage(chars, cfg) {
    if (!chars.length) return 0;
    const meanOcc =
      chars.reduce((s, c) => s + c.occArea, 0) / chars.length;
    const meanCast =
      (Math.min(cfg.minCount, cfg.maxCount) + Math.max(cfg.minCount, cfg.maxCount)) / 2;
    const s = seriesScale(chars, cfg);
    return meanOcc * meanCast * s * s;
  }

  /* Draw a cast of distinct characters. Sampling without replacement is
     what guarantees no character appears twice in one artwork. */
  function pickCast(chars, cfg, rng) {
    const pool = shuffled(chars, rng);
    const lo = clamp(Math.min(cfg.minCount, cfg.maxCount), 1, pool.length);
    const hi = clamp(Math.max(cfg.minCount, cfg.maxCount), 1, pool.length);
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    return pool.slice(0, n);
  }

  /* ── Placement ──────────────────────────────────────────────────── */

  /* Lay the cast out in staggered rows. Returns null when the cast can
     not fit at this shrink level, so the caller can scale everyone down
     uniformly and try again — uniform shrink keeps relative sizes. */
  function placeRows(cast, cfg, rng, scale) {
    const W = cfg.width;
    const H = cfg.height;
    const ref = Math.sqrt(W * H);
    const margin = cfg.margin * Math.min(W, H);
    const usableW = W - margin * 2;
    const usableH = H - margin * 2;
    const gap = cfg.spacing * ref * 2; // min clear space between two neighbours

    const items = cast.map((c) => {
      const drawnArea = W * H * c.occArea * scale * scale;
      const aspect = c.aspect;
      const w = Math.sqrt(drawnArea * aspect);
      return { ref: c, w: w, h: w / aspect, x: 0, y: 0 };
    });
    if (!items.length) return null;

    const K = items.length;
    const aspectRatio = usableW / usableH;
    let rows = clamp(Math.round(Math.sqrt(K / aspectRatio)), 1, K);
    if (K >= 6 && rng() < 0.35) rows = clamp(rows + (rng() < 0.5 ? -1 : 1), 1, K);

    // How many characters per row — even split, remainder scattered.
    const caps = new Array(rows).fill(Math.floor(K / rows));
    let rem = K - caps.reduce((s, v) => s + v, 0);
    const order = shuffled(
      caps.map((_, i) => i),
      rng
    );
    for (let i = 0; rem > 0; i++, rem--) caps[order[i % rows]]++;

    // Assign biggest first to the currently lightest row: keeps visual
    // weight spread across the composition instead of pooling in a band.
    const byArea = items.slice().sort((a, b) => b.w * b.h - a.w * a.h);
    const buckets = caps.map(() => []);
    const rowWidth = new Array(rows).fill(0);
    for (const it of byArea) {
      let pick = -1;
      for (let r = 0; r < rows; r++) {
        if (buckets[r].length >= caps[r]) continue;
        if (pick === -1 || rowWidth[r] < rowWidth[pick]) pick = r;
      }
      if (pick === -1) return null;
      buckets[pick].push(it);
      rowWidth[pick] += it.w;
    }
    for (let r = 0; r < rows; r++) buckets[r] = shuffled(buckets[r], rng);

    // Vertical bands, each as tall as its tallest member, slack shared out.
    const bandH = buckets.map((b) => Math.max(...b.map((it) => it.h)));
    const needH = bandH.reduce((s, v) => s + v, 0) + gap * (rows - 1);
    if (needH > usableH) return null;
    const slackH = usableH - needH;
    const shareH = slackH / rows;

    let y = margin;
    for (let r = 0; r < rows; r++) {
      const row = buckets[r];
      const bandTop = y + shareH * 0.5 * (0.6 + rng() * 0.8);
      const bandSpace = bandH[r] + shareH * 0.4;

      // Horizontal: minimum gaps first, then scatter the leftover room
      // over every gap including the two outer ones.
      const sumW = row.reduce((s, it) => s + it.w, 0);
      const needW = sumW + gap * (row.length - 1);
      if (needW > usableW) return null;
      const slackW = usableW - needW;

      const weights = [];
      let wsum = 0;
      for (let i = 0; i <= row.length; i++) {
        const isOuter = i === 0 || i === row.length;
        const w = (isOuter ? 0.6 : 1) * (0.35 + rng());
        weights.push(w);
        wsum += w;
      }

      // Row-level offset is what staggers one row against the next.
      const zig = (r % 2 === 0 ? 1 : -1) * (rng() * 0.6 + 0.4);
      const shift = zig * cfg.stagger * Math.min(slackW * 0.35, gap * 1.5);

      let x = margin + (slackW * weights[0]) / wsum + shift;
      x = clamp(x, margin, margin + Math.max(0, slackW));

      const phase = rng() * Math.PI * 2;
      for (let i = 0; i < row.length; i++) {
        const it = row[i];
        it.x = x;
        // Per-character vertical offset inside the band — the staircase.
        const free = Math.max(0, bandSpace - it.h);
        const t = 0.5 + Math.sin(phase + i * 1.9) * 0.5 * cfg.stagger;
        it.y = bandTop + free * clamp(t, 0, 1);
        x += it.w + gap + (slackW * weights[i + 1]) / wsum;
      }

      y += bandH[r] + shareH + gap;
    }

    return { items: items, gap: gap, margin: margin };
  }

  /* Push overlapping neighbours apart, then pull everyone back inside
     the margin. A few dozen passes settle a cast of this size. */
  function relax(items, cfg, pad) {
    const W = cfg.width;
    const H = cfg.height;
    const margin = cfg.margin * Math.min(W, H);
    for (let pass = 0; pass < 120; pass++) {
      let moved = 0;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h / 2;
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const px = (a.w + b.w) / 2 + pad - Math.abs(ax - bx);
          const py = (a.h + b.h) / 2 + pad - Math.abs(ay - by);
          if (px <= 0 || py <= 0) continue;

          // Heavier characters give way less than lighter ones.
          const wa = a.w * a.h;
          const wb = b.w * b.h;
          const sa = wb / (wa + wb);
          const sb = wa / (wa + wb);
          if (px < py) {
            const dir = ax <= bx ? -1 : 1;
            a.x += dir * px * sa;
            b.x -= dir * px * sb;
          } else {
            const dir = ay <= by ? -1 : 1;
            a.y += dir * py * sa;
            b.y -= dir * py * sb;
          }
          moved++;
        }
      }
      for (const it of items) {
        it.x = clamp(it.x, margin, W - margin - it.w);
        it.y = clamp(it.y, margin, H - margin - it.h);
      }
      if (!moved) break;
    }
  }

  /* Slide the finished composition bodily towards the middle, as far as
     the margins allow. Moving everyone together leaves every gap exactly
     as the relaxation settled it. */
  function recenter(items, cfg) {
    const W = cfg.width;
    const H = cfg.height;
    const margin = cfg.margin * Math.min(W, H);
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const it of items) {
      const a = it.w * it.h;
      area += a;
      cx += (it.x + it.w / 2) * a;
      cy += (it.y + it.h / 2) * a;
    }
    if (!area) return;
    cx /= area;
    cy /= area;

    let dx = W / 2 - cx;
    let dy = H / 2 - cy;
    for (const it of items) {
      dx = dx > 0 ? Math.min(dx, W - margin - (it.x + it.w)) : Math.max(dx, margin - it.x);
      dy = dy > 0 ? Math.min(dy, H - margin - (it.y + it.h)) : Math.max(dy, margin - it.y);
    }
    for (const it of items) {
      it.x += dx;
      it.y += dy;
    }
  }

  /* ── Scoring ────────────────────────────────────────────────────── */

  function scoreLayout(items, cfg) {
    const W = cfg.width;
    const H = cfg.height;
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const it of items) {
      const a = it.w * it.h;
      area += a;
      cx += (it.x + it.w / 2) * a;
      cy += (it.y + it.h / 2) * a;
    }
    if (!area) return -1e6;
    cx /= area;
    cy /= area;

    // 1. Weight sits near the middle rather than pooling on one side.
    const off = Math.hypot(cx - W / 2, cy - H / 2) / (Math.min(W, H) * 0.5);
    const balance = off * off;

    // 2. Coverage spread over a 3×3 grid — punishes empty halves.
    const cellW = W / 3;
    const cellH = H / 3;
    const cells = new Array(9).fill(0);
    for (const it of items) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const ox =
            Math.min(it.x + it.w, (c + 1) * cellW) - Math.max(it.x, c * cellW);
          const oy =
            Math.min(it.y + it.h, (r + 1) * cellH) - Math.max(it.y, r * cellH);
          if (ox > 0 && oy > 0) cells[r * 3 + c] += ox * oy;
        }
      }
    }
    const mean = cells.reduce((s, v) => s + v, 0) / 9;
    let varSum = 0;
    for (const v of cells) varSum += (v - mean) * (v - mean);
    const spreadCV = mean > 0 ? Math.sqrt(varSum / 9) / mean : 3;

    // 3. Even breathing room — nearest-neighbour distances of similar size.
    const gaps = [];
    for (let i = 0; i < items.length; i++) {
      let best = Infinity;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i];
        const b = items[j];
        const dx = Math.max(
          0,
          Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
        );
        const dy = Math.max(
          0,
          Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
        );
        best = Math.min(best, Math.hypot(dx, dy));
      }
      if (isFinite(best)) gaps.push(best);
    }
    let gapCV = 0;
    if (gaps.length > 1) {
      const gm = gaps.reduce((s, v) => s + v, 0) / gaps.length;
      let gv = 0;
      for (const g of gaps) gv += (g - gm) * (g - gm);
      gapCV = gm > 0 ? Math.sqrt(gv / gaps.length) / gm : 2;
    }

    return -(2.8 * balance + 0.9 * spreadCV + 0.45 * gapCV);
  }

  /* ── One artwork ────────────────────────────────────────────────── */

  /* One arrangement of a cast.

     When a cast will not fit — an unlucky draw of heavyweights — the
     first remedy is to drop a character, not to resize anyone: cast size
     is a range, whereas a character changing size from one artwork to the
     next would show up across the series. Only if trimming still fails is
     everyone shrunk together, by a bounded amount, and never one
     character on its own. */
  const SHRINK_STEPS = [1, 0.95, 0.9];
  const LAST_RESORT = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];

  function attempt(cast, cfg, rng, scale) {
    const pad = 2 * cfg.spacing * Math.sqrt(cfg.width * cfg.height);

    const settle = (sub, shrink, trim) => {
      const placed = placeRows(sub, cfg, rng, scale * shrink);
      if (!placed) return null;
      relax(placed.items, cfg, pad);
      recenter(placed.items, cfg);
      if (anyOverlap(placed.items, pad)) return null;
      return { items: placed.items, shrink: shrink, trimmed: trim };
    };

    for (let trim = 0; trim < cast.length; trim++) {
      // The cast was drawn from a shuffled pool, so lopping off the tail
      // removes an arbitrary member rather than always the biggest.
      const sub = cast.slice(0, cast.length - trim);
      for (const shrink of SHRINK_STEPS) {
        const got = settle(sub, shrink, trim);
        if (got) return got;
      }
    }

    // Nothing fitted on the usual ladder — an unlucky cast against tight
    // margins. Shrink hard rather than hand back an empty artwork.
    for (const shrink of LAST_RESORT) {
      for (let trim = 0; trim < cast.length; trim++) {
        const got = settle(cast.slice(0, cast.length - trim), shrink, trim);
        if (got) return got;
      }
    }
    return null;
  }

  /* Build one artwork plan. The cast is drawn once from the artwork's own
     seed, then arranged N different ways and the best-balanced one wins —
     so scoring picks an arrangement, never a smaller cast. */
  function planArtwork(chars, settings, seed, scale) {
    const cfg = Object.assign({}, DEFAULTS, settings);
    const size = scale || seriesScale(chars, cfg);
    if (!chars.length) return null;

    let best = null;
    let bestScore = -Infinity;
    // Re-draw the cast on the rare occasion that no arrangement of it
    // works at all: the series has to deliver every artwork asked for.
    for (let round = 0; round < 4 && !best; round++) {
      const cast = pickCast(chars, cfg, mulberry32(mixSeed(seed, 0xc45 + round)));
      if (!cast.length) return null;
      for (let i = 0; i < cfg.candidates; i++) {
        const cand = attempt(cast, cfg, mulberry32(mixSeed(seed, i + 1 + round * 977)), size);
        if (!cand) continue;
        // Heavily prefer arrangements that kept the whole cast at full
        // size, so scoring never quietly thins an artwork to look tidier.
        const s =
          scoreLayout(cand.items, cfg) - 3 * cand.trimmed - 4 * (1 - cand.shrink);
        if (s > bestScore) {
          bestScore = s;
          best = cand;
        }
      }
    }
    if (!best) return null;

    const rng = mulberry32(mixSeed(seed, 9931));
    return {
      seed: seed,
      width: cfg.width,
      height: cfg.height,
      background: tintBackground(cfg.background, cfg.bgJitter, rng),
      score: bestScore,
      scale: Math.round(size * best.shrink * 1e4) / 1e4,
      items: best.items.map((it) => ({
        id: it.ref.id,
        name: it.ref.name,
        x: Math.round(it.x * 100) / 100,
        y: Math.round(it.y * 100) / 100,
        w: Math.round(it.w * 100) / 100,
        h: Math.round(it.h * 100) / 100,
      })),
    };
  }

  /* Generate the whole run. Every artwork is derived from the master
     seed, so the same seed always rebuilds the same 250 pieces. */
  function planSeries(chars, settings) {
    const cfg = Object.assign({}, DEFAULTS, settings);
    const scale = seriesScale(chars, cfg);
    const out = [];
    for (let i = 0; i < cfg.count; i++) {
      const plan = planArtwork(chars, cfg, mixSeed(cfg.seed >>> 0, i + 1), scale);
      if (plan) {
        plan.index = i;
        out.push(plan);
      }
    }
    return out;
  }

  function tintBackground(hex, jitter, rng) {
    if (!jitter) return hex;
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const d = (rng() * 2 - 1) * jitter * 14;
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      clamp(Math.round(v + d), 0, 255)
    );
    return (
      "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("")
    );
  }

  const Engine = {
    DEFAULTS: DEFAULTS,
    mulberry32: mulberry32,
    hashString: hashString,
    mixSeed: mixSeed,
    seriesScale: seriesScale,
    expectedCoverage: expectedCoverage,
    planArtwork: planArtwork,
    planSeries: planSeries,
    anyOverlap: anyOverlap,
    overlapAmount: overlapAmount,
  };

  global.LayoutEngine = Engine;
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;

  /* ════════════════════════════════════════════════════════════════
     Browser half — library, preview, batch render, export
     ════════════════════════════════════════════════════════════════ */

  if (typeof document === "undefined") return;

  const $ = (id) => document.getElementById(id);

  const state = {
    chars: [], // {id, name, bitmap, srcW, srcH, box, occArea, aspect, blob}
    plans: [],
    results: [], // {name, blob, url}
    busy: false,
    cancel: false,
  };

  /* ── Measuring a character ──────────────────────────────────────── */

  /* Find the alpha bounding box, i.e. how much of its own canvas the
     character actually takes up. Scanned at reduced resolution — plenty
     accurate for a ratio, and fast enough for a folder of 70 files. */
  function measure(bitmap) {
    const SCAN = 400;
    const s = Math.min(1, SCAN / Math.max(bitmap.width, bitmap.height));
    const sw = Math.max(1, Math.round(bitmap.width * s));
    const sh = Math.max(1, Math.round(bitmap.height * s));
    const cv = document.createElement("canvas");
    cv.width = sw;
    cv.height = sh;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (data[(y * sw + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // fully transparent

    // Grow by one scan pixel so nothing gets clipped, then map back up.
    const inv = 1 / s;
    const x0 = Math.max(0, (minX - 1) * inv);
    const y0 = Math.max(0, (minY - 1) * inv);
    const x1 = Math.min(bitmap.width, (maxX + 2) * inv);
    const y1 = Math.min(bitmap.height, (maxY + 2) * inv);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  async function addFiles(files) {
    const imgs = Array.from(files).filter((f) => /^image\//.test(f.type));
    if (!imgs.length) return;
    setStatus("Reading " + imgs.length + " file" + (imgs.length > 1 ? "s" : "") + "…");
    for (const file of imgs) {
      try {
        const bitmap = await createImageBitmap(file);
        const box = measure(bitmap);
        if (!box) continue;
        const name = file.name.replace(/\.[^.]+$/, "");
        if (state.chars.some((c) => c.name === name)) continue;
        state.chars.push({
          id: hashString(name),
          name: name,
          bitmap: bitmap,
          blob: file,
          srcW: bitmap.width,
          srcH: bitmap.height,
          box: box,
          occArea: (box.w * box.h) / (bitmap.width * bitmap.height),
          aspect: box.w / box.h,
        });
      } catch (err) {
        console.warn("Could not read", file.name, err);
      }
    }
    state.chars.sort((a, b) => a.name.localeCompare(b.name));
    await saveLibrary();
    renderLibrary();
    preview();
  }

  function renderLibrary() {
    const wrap = $("lib-list");
    wrap.innerHTML = "";
    for (const c of state.chars) {
      const cell = document.createElement("div");
      cell.className = "lib-item";
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 64;
      const ctx = cv.getContext("2d");
      const s = Math.min(60 / c.box.w, 60 / c.box.h);
      ctx.drawImage(
        c.bitmap,
        c.box.x,
        c.box.y,
        c.box.w,
        c.box.h,
        (64 - c.box.w * s) / 2,
        (64 - c.box.h * s) / 2,
        c.box.w * s,
        c.box.h * s
      );
      cell.appendChild(cv);
      const tag = document.createElement("span");
      tag.textContent = Math.round(Math.sqrt(c.occArea) * 100) + "%";
      tag.title =
        c.name + " — fills " + Math.round(c.occArea * 100) + "% of its canvas area";
      cell.appendChild(tag);
      const del = document.createElement("button");
      del.className = "lib-del";
      del.textContent = "×";
      del.title = "Remove " + c.name;
      del.onclick = async () => {
        state.chars = state.chars.filter((x) => x !== c);
        await saveLibrary();
        renderLibrary();
        preview();
      };
      cell.appendChild(del);
      wrap.appendChild(cell);
    }
    $("lib-count").textContent =
      state.chars.length + " character" + (state.chars.length === 1 ? "" : "s");
    const enough = state.chars.length >= 2;
    $("btn-generate").disabled = !enough;
    $("btn-shuffle").disabled = !enough;
  }

  /* ── Library persistence (IndexedDB — survives a reload) ─────────── */

  function idb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open("character-layouts", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("files"))
          req.result.createObjectStore("files");
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function saveLibrary() {
    try {
      const db = await idb();
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      store.clear();
      for (const c of state.chars) store.put(c.blob, c.name);
      await new Promise((r) => (tx.oncomplete = r));
    } catch (err) {
      console.warn("Could not save library", err);
    }
  }

  async function loadLibrary() {
    try {
      const db = await idb();
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const keys = await new Promise((r) => {
        const q = store.getAllKeys();
        q.onsuccess = () => r(q.result);
      });
      const vals = await new Promise((r) => {
        const q = store.getAll();
        q.onsuccess = () => r(q.result);
      });
      const files = vals.map(
        (blob, i) => new File([blob], keys[i] + ".png", { type: blob.type || "image/png" })
      );
      if (files.length) await addFiles(files);
    } catch (err) {
      console.warn("Could not load library", err);
    }
  }

  /* ── Settings from the panel ────────────────────────────────────── */

  function settings() {
    const [w, h] = $("size").value.split("x").map(Number);
    return {
      width: w,
      height: h,
      background: $("bg").value,
      bgJitter: +$("bg-jitter").value,
      minCount: +$("count-min").value,
      maxCount: Math.max(+$("count-min").value, +$("count-max").value),
      fullness: +$("fullness").value,
      sizeCap: +$("size-cap").value,
      margin: +$("margin").value,
      spacing: +$("spacing").value,
      stagger: +$("stagger").value,
      candidates: +$("candidates").value,
      count: +$("total").value,
      seed: hashString($("seed").value || "1"),
    };
  }

  /* ── Drawing ────────────────────────────────────────────────────── */

  function drawPlan(ctx, plan) {
    const byId = new Map(state.chars.map((c) => [c.id, c]));
    ctx.save();
    ctx.fillStyle = plan.background;
    ctx.fillRect(0, 0, plan.width, plan.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (const it of plan.items) {
      const c = byId.get(it.id);
      if (!c) continue;
      ctx.drawImage(
        c.bitmap,
        c.box.x,
        c.box.y,
        c.box.w,
        c.box.h,
        it.x,
        it.y,
        it.w,
        it.h
      );
    }
    ctx.restore();
  }

  let previewSeed = 1;

  function preview() {
    const cv = $("preview");
    if (state.chars.length < 2) {
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const cfg = settings();
    const plan = planArtwork(state.chars, cfg, mixSeed(cfg.seed, previewSeed));
    if (!plan) {
      setStatus("Nothing fits — try lower fullness, or a smaller cast.");
      return;
    }
    const max = 720;
    const s = Math.min(max / plan.width, max / plan.height);
    cv.width = Math.round(plan.width * s);
    cv.height = Math.round(plan.height * s);
    const ctx = cv.getContext("2d");
    ctx.save();
    ctx.scale(s, s);
    drawPlan(ctx, plan);
    ctx.restore();
    $("preview-info").textContent =
      plan.items.length + " characters · seed " + plan.seed;
    $("scale-readout").textContent =
      "Every character is drawn at " +
      Math.round(seriesScale(state.chars, cfg) * 100) +
      "% of the size it takes up on its own canvas — about " +
      Math.round(expectedCoverage(state.chars, cfg) * 100) +
      "% of the artwork covered.";
  }

  /* ── Batch run ──────────────────────────────────────────────────── */

  async function generate() {
    if (state.busy) {
      state.cancel = true;
      return;
    }
    const cfg = settings();
    state.busy = true;
    state.cancel = false;
    $("btn-generate").textContent = "Stop";
    revokeResults();

    const cv = document.createElement("canvas");
    cv.width = cfg.width;
    cv.height = cfg.height;
    const ctx = cv.getContext("2d");
    const grid = $("grid");
    grid.innerHTML = "";
    state.plans = [];

    const pad = String(cfg.count).length;
    const scale = seriesScale(state.chars, cfg);
    let missed = 0;
    for (let i = 0; i < cfg.count; i++) {
      if (state.cancel) break;
      const plan = planArtwork(state.chars, cfg, mixSeed(cfg.seed, i + 1), scale);
      if (!plan) {
        missed++;
        continue;
      }
      plan.index = i;
      drawPlan(ctx, plan);
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const name = "layout-" + String(i + 1).padStart(pad, "0") + ".png";
      const url = URL.createObjectURL(blob);
      state.plans.push(plan);
      state.results.push({ name: name, blob: blob, url: url });
      addThumb(grid, name, url, plan);

      setProgress((i + 1) / cfg.count, i + 1 + " / " + cfg.count);
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    state.busy = false;
    $("btn-generate").textContent = "Generate";
    $("btn-zip").disabled = !state.results.length;
    $("btn-manifest").disabled = !state.results.length;
    setStatus(
      state.results.length +
        " artworks ready" +
        (state.cancel ? " (stopped early)" : "") +
        "." +
        (missed
          ? " " +
            missed +
            " could not be laid out — lower the fullness or the cast size."
          : "")
    );
  }

  function addThumb(grid, name, url, plan) {
    const a = document.createElement("a");
    a.className = "thumb";
    a.href = url;
    a.download = name;
    a.title = name + " · " + plan.items.length + " characters · seed " + plan.seed;
    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    a.appendChild(img);
    grid.appendChild(a);
  }

  function revokeResults() {
    for (const r of state.results) URL.revokeObjectURL(r.url);
    state.results = [];
    $("btn-zip").disabled = true;
    $("btn-manifest").disabled = true;
  }

  /* ── ZIP (stored, no compression — PNGs are already compressed) ──── */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++)
      c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const enc = new TextEncoder();

    for (const e of entries) {
      const nameBytes = enc.encode(e.name);
      const crc = crc32(e.data);
      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); // stored
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, e.data.length, true);
      dv.setUint32(22, e.data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, e.data);

      const cen = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, e.data.length, true);
      cv.setUint32(24, e.data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + e.data.length;
    }

    let centralSize = 0;
    for (const c of central) centralSize += c.length;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }

  async function downloadZips() {
    const batch = +$("zip-batch").value;
    const total = state.results.length;
    const groups = Math.ceil(total / batch);
    for (let g = 0; g < groups; g++) {
      setStatus("Packing zip " + (g + 1) + " / " + groups + "…");
      const slice = state.results.slice(g * batch, (g + 1) * batch);
      const entries = [];
      for (const r of slice)
        entries.push({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) });
      const zip = buildZip(entries);
      saveBlob(
        zip,
        groups > 1 ? "layouts-" + String(g + 1).padStart(2, "0") + ".zip" : "layouts.zip"
      );
      await new Promise((r) => setTimeout(r, 400));
    }
    setStatus("Done — " + groups + " zip" + (groups > 1 ? "s" : "") + " downloaded.");
  }

  function downloadManifest() {
    const cfg = settings();
    const data = {
      generated: new Date().toISOString(),
      settings: cfg,
      characters: state.chars.map((c) => ({
        id: c.id,
        name: c.name,
        canvas: [c.srcW, c.srcH],
        bbox: [
          Math.round(c.box.x),
          Math.round(c.box.y),
          Math.round(c.box.w),
          Math.round(c.box.h),
        ],
        canvasShare: +(c.occArea).toFixed(4),
      })),
      artworks: state.plans,
    };
    saveBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      "layouts.json"
    );
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ── Demo characters ────────────────────────────────────────────── */

  /* Stand-ins drawn on 1920×1920 canvases at deliberately different
     footprints, so the layout system can be judged before the real
     artwork is loaded. */
  function demoCharacters() {
    const specs = [
      { name: "demo-tall-guy", fill: "#c9457f", w: 0.42, h: 0.72, kind: "body" },
      { name: "demo-small-bird", fill: "#e0a04a", w: 0.14, h: 0.13, kind: "bird" },
      { name: "demo-wide-log", fill: "#7fa88c", w: 0.62, h: 0.28, kind: "log" },
      { name: "demo-house", fill: "#8b6fc0", w: 0.38, h: 0.42, kind: "house" },
      { name: "demo-blob", fill: "#5a7fc0", w: 0.3, h: 0.34, kind: "blob" },
      { name: "demo-big-mask", fill: "#d8763c", w: 0.78, h: 0.66, kind: "mask" },
      { name: "demo-umbrella", fill: "#c8a9a0", w: 0.24, h: 0.5, kind: "body" },
      { name: "demo-pebble", fill: "#4f9aa8", w: 0.1, h: 0.09, kind: "blob" },
    ];
    const files = [];
    for (const s of specs) {
      const S = 1920;
      const cv = document.createElement("canvas");
      cv.width = S;
      cv.height = S;
      const ctx = cv.getContext("2d");
      const w = S * s.w;
      const h = S * s.h;
      const x = (S - w) / 2;
      const y = (S - h) / 2;
      ctx.fillStyle = s.fill;
      ctx.strokeStyle = "#2b2230";
      ctx.lineWidth = S * 0.006;
      ctx.beginPath();
      if (s.kind === "house") {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h * 0.4);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + h * 0.4);
        ctx.closePath();
      } else if (s.kind === "log" || s.kind === "mask") {
        ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.35);
      } else if (s.kind === "bird") {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else if (s.kind === "body") {
        ctx.ellipse(x + w / 2, y + h * 0.22, w / 2, h * 0.22, 0, 0, Math.PI * 2);
        ctx.roundRect(x + w * 0.12, y + h * 0.38, w * 0.76, h * 0.62, w * 0.2);
      } else {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      // eyes, so orientation is readable in a thumbnail
      ctx.fillStyle = "#2b2230";
      const ey = y + h * (s.kind === "body" ? 0.2 : 0.42);
      for (const dx of [-0.14, 0.14]) {
        ctx.beginPath();
        ctx.ellipse(x + w / 2 + w * dx, ey, w * 0.045, w * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      files.push({ name: s.name, canvas: cv });
    }
    return Promise.all(
      files.map(
        (f) =>
          new Promise((res) =>
            f.canvas.toBlob((b) => res(new File([b], f.name + ".png", { type: "image/png" })))
          )
      )
    );
  }

  /* ── Panel plumbing ─────────────────────────────────────────────── */

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setProgress(t, label) {
    $("bar-fill").style.width = Math.round(t * 100) + "%";
    $("bar-label").textContent = label || "";
  }

  function bindValue(id, fmt) {
    const el = $(id);
    const out = document.querySelector('[data-for="' + id + '"]');
    const sync = () => {
      if (out) out.textContent = fmt ? fmt(el.value) : el.value;
    };
    el.addEventListener("input", () => {
      sync();
      if (!state.busy) preview();
    });
    sync();
  }

  function initUI() {
    bindValue("fullness", (v) => Math.round(v * 100) + "%");
    bindValue("size-cap", (v) => Math.round(v * 100) + "%");
    bindValue("margin", (v) => Math.round(v * 100) + "%");
    bindValue("spacing", (v) => Math.round(v * 1000) / 10 + "%");
    bindValue("stagger", (v) => Math.round(v * 100) + "%");
    bindValue("bg-jitter", (v) => Math.round(v * 100) + "%");
    bindValue("candidates");
    bindValue("count-min");
    bindValue("count-max");
    for (const id of ["size", "bg", "seed", "total", "zip-batch"])
      $(id).addEventListener("change", () => {
        if (!state.busy) preview();
      });

    $("file-input").addEventListener("change", (e) => addFiles(e.target.files));
    $("folder-input").addEventListener("change", (e) => addFiles(e.target.files));
    $("btn-demo").addEventListener("click", async () => {
      setStatus("Building demo characters…");
      await addFiles(await demoCharacters());
      setStatus("Demo set loaded — swap it for your own artwork when ready.");
    });
    $("btn-clear").addEventListener("click", async () => {
      state.chars = [];
      await saveLibrary();
      renderLibrary();
      preview();
      setStatus("Library cleared.");
    });
    $("btn-shuffle").addEventListener("click", () => {
      previewSeed = Math.floor(Math.random() * 1e9);
      preview();
    });
    $("btn-generate").addEventListener("click", generate);
    $("btn-zip").addEventListener("click", downloadZips);
    $("btn-manifest").addEventListener("click", downloadManifest);

    // Drag and drop anywhere on the page.
    document.addEventListener("dragover", (e) => {
      e.preventDefault();
      document.body.classList.add("dragging");
    });
    document.addEventListener("dragleave", (e) => {
      if (e.relatedTarget === null) document.body.classList.remove("dragging");
    });
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      document.body.classList.remove("dragging");
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    renderLibrary();
    loadLibrary();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initUI);
  else initUI();
})(typeof window !== "undefined" ? window : globalThis);
