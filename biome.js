/* ═══════════════════════════════════════════════════════════════════
   Biome Adjuster
   Loads Tiled (.tmx) maps split into 20×20 tiles and re-imagines them in
   real time through five dials:
     • Order ↔ Chaos        – how well neighbouring tiles match
     • Ordinary ↔ Imaginative – pastel hue mixing
     • Relaxed ↔ Fear        – purple creep, greener water, more monsters
     • Memory                – afterimage / dream persistence
     • Zoom                  – pull back from 16 to 100 tiles across
   Tile art is supplied by dragging the matching .png / .tsx files in.
   Anything without art falls back to a generated colour block.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Built-in map layouts (the four uploaded .tmx files) ──────────
  // Stored as raw TMX so they parse through the same path as dropped files.
  const BUILTIN_MAPS = {
    "grass farm": `<?xml version="1.0" encoding="UTF-8"?>
<map width="16" height="9" tilewidth="20" tileheight="20">
 <tileset firstgid="1" source="tiling work.tsx"/>
 <tileset firstgid="25" source="new tiling.tsx"/>
 <tileset firstgid="49" source="new ne tiling.tsx"/>
 <tileset firstgid="73" source="new nnee tiling.tsx"/>
 <tileset firstgid="97" source="noeste niceles.tsx"/>
 <tileset firstgid="121" source="tii boy 2.tsx"/>
 <tileset firstgid="122" source="characters turning.tsx"/>
 <tileset firstgid="126" source="lazeey.tsx"/>
 <tileset firstgid="127" source="2lazeey.tsx"/>
 <tileset firstgid="128" source="mkkey.tsx"/>
 <tileset firstgid="129" source="soil tiles.tsx"/>
 <tileset firstgid="134" source="yellow flowersnew.tsx"/>
 <tileset firstgid="136" source="fishermen.tsx"/>
 <tileset firstgid="137" source="sitting-export.tsx"/>
 <tileset firstgid="138" source="left side net.tsx"/>
 <tileset firstgid="139" source="ideas maybe.tsx"/>
 <tileset firstgid="167" source="dogleg.tsx"/>
 <tileset firstgid="168" source="elmur.tsx"/>
 <tileset firstgid="169" source="hatredd.tsx"/>
 <tileset firstgid="170" source="lion.tsx"/>
 <tileset firstgid="171" source="plant.tsx"/>
 <tileset firstgid="172" source="plant blue.tsx"/>
 <tileset firstgid="173" source="cat blue.tsx"/>
 <tileset firstgid="174" source="blue dog.tsx"/>
 <tileset firstgid="175" source="blue spike.tsx"/>
 <tileset firstgid="176" source="yellow lion.tsx"/>
 <tileset firstgid="177" source="yellow dino.tsx"/>
 <tileset firstgid="178" source="yellow shooter.tsx"/>
 <tileset firstgid="179" source="yellow easter.tsx"/>
 <tileset firstgid="180" source="yellow balls.tsx"/>
 <tileset firstgid="181" source="red mop.tsx"/>
 <tileset firstgid="182" source="red ball.tsx"/>
 <tileset firstgid="183" source="red tall.tsx"/>
 <tileset firstgid="184" source="red tri.tsx"/>
 <tileset firstgid="185" source="toolbar 2.tsx"/>
 <tileset firstgid="186" source="idea caught sprite.tsx"/>
 <tileset firstgid="218" source="lazeey bby.tsx"/>
 <tileset firstgid="219" source="lazeey bomn.tsx"/>
 <tileset firstgid="220" source="lazeey bom.tsx"/>
 <tileset firstgid="242" source="ordamancer evolved animation.tsx"/>
 <tileset firstgid="260" source="lazeey bby snot.tsx"/>
 <tileset firstgid="306" source="ordamancer.tsx"/>
 <tileset firstgid="325" source="baby houndmare.tsx"/>
 <tileset firstgid="337" source="houndmare animated.tsx"/>
 <tileset firstgid="349" source="big lazeey.tsx"/>
 <tileset firstgid="412" source="big lazeey.tsx"/>
 <layer id="1" name="Tile Layer 1" width="16" height="9"><data encoding="csv">
87,87,87,64,64,87,87,113,90,31,38,38,64,85,87,87,
64,82,39,85,85,113,90,87,113,90,113,90,82,64,64,85,
87,85,85,32,113,113,38,31,31,38,113,115,12,99,113,64,
87,113,90,81,32,32,38,38,85,85,38,2,102,5,82,87,
86,86,113,113,115,75,90,38,38,113,85,4,118,21,99,64,
32,32,85,82,28,96,85,85,87,87,31,31,2,102,5,87,
86,86,113,90,113,64,87,64,85,31,81,32,2,119,48,85,
64,87,31,85,64,85,87,85,113,90,113,31,100,72,85,87,
86,64,31,85,31,85,64,87,113,113,85,85,87,85,31,31
</data></layer>
 <layer id="2" name="Tile Layer 2" width="16" height="9"><data encoding="csv">
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,308,242,0,0,0,0,135,129,0,423,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,337,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,217,0,335,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,135,132,0,0,305,0,0,0,0,0,0,0,
0,0,0,134,130,131,0,0,0,0,0,0,0,0,0,0,
185,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
</data></layer>
</map>`,
    "sand": `<?xml version="1.0" encoding="UTF-8"?>
<map width="16" height="9" tilewidth="20" tileheight="20">
 <tileset firstgid="1" source="sand.tsx"/>
 <tileset firstgid="25" source="tii boy 2.tsx"/>
 <tileset firstgid="26" source="lazeey.tsx"/>
 <tileset firstgid="27" source="mkkey.tsx"/>
 <tileset firstgid="28" source="soil tiles.tsx"/>
 <tileset firstgid="33" source="left side net.tsx"/>
 <tileset firstgid="34" source="fishermen.tsx"/>
 <tileset firstgid="35" source="redbob.tsx"/>
 <tileset firstgid="36" source="lion.tsx"/>
 <tileset firstgid="37" source="red tri.tsx"/>
 <tileset firstgid="38" source="yellow lion.tsx"/>
 <tileset firstgid="39" source="yellow easter.tsx"/>
 <tileset firstgid="40" source="red tall.tsx"/>
 <tileset firstgid="41" source="blue spike.tsx"/>
 <tileset firstgid="42" source="yellow shooter.tsx"/>
 <layer id="1" name="Tile Layer 1" width="16" height="9"><data encoding="csv">
6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
6,6,6,6,6,6,6,1,1,6,6,6,6,6,6,6,
6,6,6,6,6,17,18,8,8,4,16,6,6,6,6,6,
6,6,6,6,17,18,10,8,8,8,2,6,6,6,6,6,
6,6,6,6,5,9,8,8,7,9,2,6,6,6,6,6,
6,6,6,6,5,19,8,8,8,13,6,6,6,6,6,6,
6,6,6,6,5,19,19,8,13,14,6,6,6,6,6,6,
6,6,6,6,15,3,19,13,14,6,6,6,6,6,6,6,
6,6,6,6,6,15,12,14,6,6,6,6,6,6,6,6
</data></layer>
 <layer id="2" name="Tile Layer 2" width="16" height="9"><data encoding="csv">
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,17,0,0,16,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,31,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,39,0,31,0,0,0,0,0,0,
0,0,0,0,0,38,0,0,8,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,7,34,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
</data></layer>
</map>`,
    "purple": `<?xml version="1.0" encoding="UTF-8"?>
<map width="16" height="9" tilewidth="20" tileheight="20">
 <tileset firstgid="1" name="purptiles" tilewidth="20" tileheight="20" tilecount="9" columns="9">
  <image source="purptiles.png" width="180" height="20"/>
 </tileset>
 <tileset firstgid="10" source="green water.tsx"/>
 <tileset firstgid="37" source="characters turning.tsx"/>
 <tileset firstgid="41" source="soil tiles.tsx"/>
 <tileset firstgid="46" source="yellow flowersnew.tsx"/>
 <tileset firstgid="48" source="lion.tsx"/>
 <tileset firstgid="49" source="sun circle.tsx"/>
 <tileset firstgid="50" source="dogleg.tsx"/>
 <tileset firstgid="51" source="redbob.tsx"/>
 <tileset firstgid="52" source="yellow balls.tsx"/>
 <tileset firstgid="53" source="plant blue.tsx"/>
 <tileset firstgid="54" source="red tri.tsx"/>
 <tileset firstgid="55" source="yellow dino.tsx"/>
 <layer id="1" name="Tile Layer 1" width="16" height="9"><data encoding="csv">
8,6,9,9,1,3,8,8,1,1,4,4,9,6,6,1,
1,9,4,4,6,6,6,6,1,3,3,6,6,6,9,6,
1,6,4,3,8,2,3,5,3,9,6,1,9,3,6,6,
6,7,8,5,5,7,9,4,2,6,6,5,1,34,4,8,
7,6,8,3,1,3,2,1,8,1,7,8,5,16,7,8,
1,6,8,1,4,9,1,5,5,7,1,3,4,6,7,7,
6,1,3,1,6,6,2,3,1,6,2,8,6,1,3,3,
4,9,6,25,35,5,6,7,3,6,6,7,4,6,9,4,
3,4,4,4,4,6,5,6,8,8,3,6,1,8,4,4
</data></layer>
 <layer id="2" name="Tile Layer 2" width="16" height="9"><data encoding="csv">
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,54,0,0,0,0,0,0,0,0,43,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,46,45,4,53,0,
0,0,0,0,0,0,0,38,0,0,0,0,0,4,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,47,43,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,6,6,7,0,0,0,0,52,0,0,0,0,0,0,
0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0
</data></layer>
</map>`,
    "unconscious": `<?xml version="1.0" encoding="UTF-8"?>
<map width="16" height="9" tilewidth="20" tileheight="20">
 <tileset firstgid="1" source="unconscious.tsx"/>
 <tileset firstgid="31" source="tii boy 2.tsx"/>
 <tileset firstgid="32" source="sitting-export.tsx"/>
 <tileset firstgid="33" source="sitting sheep-export.tsx"/>
 <tileset firstgid="34" source="purple work.tsx"/>
 <tileset firstgid="43" source="eart.tsx"/>
 <tileset firstgid="44" source="eatthideaa.tsx"/>
 <tileset firstgid="47" source="tii boy 2look down.tsx"/>
 <tileset firstgid="48" source="tii boy 2 ginger.tsx"/>
 <tileset firstgid="49" source="tii boy 2 ginger.tsx"/>
 <tileset firstgid="50" source="earth middle.tsx"/>
 <tileset firstgid="51" source="eatthideaa-export.tsx"/>
 <tileset firstgid="56" source="choose ideas.tsx"/>
 <tileset firstgid="57" source="fishermen.tsx"/>
 <tileset firstgid="58" source="big earth.tsx"/>
 <tileset firstgid="62" source="stars minimal.tsx"/>
 <tileset firstgid="65" source="freee.tsx"/>
 <layer id="1" name="Tile Layer 1" width="16" height="9"><data encoding="csv">
21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,
21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,
21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,
21,21,21,21,21,21,45,45,45,45,21,21,21,21,21,21,
21,21,21,21,45,45,44,44,44,44,45,45,21,21,21,21,
21,21,45,45,44,44,44,44,44,44,44,44,45,45,21,21,
21,45,44,44,44,44,44,44,44,44,44,44,44,44,45,21,
45,44,44,44,44,44,44,44,44,44,44,44,44,44,44,45,
44,44,44,44,44,44,44,44,44,44,44,44,44,44,44,44
</data></layer>
 <layer id="3" name="Tile Layer 2" width="16" height="9"><data encoding="csv">
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,47,49,0,0,0,0,0,0,0,
0,0,0,0,0,0,52,52,52,52,0,0,0,0,0,0,
0,0,0,0,52,52,0,0,0,0,52,52,0,0,0,0,
0,0,52,52,0,0,0,0,0,0,0,0,52,52,0,0,
0,52,0,0,0,0,0,0,0,0,0,0,0,0,52,0,
52,0,0,0,63,0,0,62,63,0,0,0,0,0,0,52,
0,0,0,63,63,0,63,0,0,64,0,63,0,0,0,0
</data></layer>
 <layer id="4" name="Tile Layer 3" width="16" height="9"><data encoding="csv">
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,63,0,0,0,0,0,0,0,
0,0,0,0,0,63,64,0,0,63,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,64,0,0,0,0,0,
0,0,0,0,0,0,0,58,59,0,0,62,0,63,0,0
</data></layer>
</map>`,
  };

  // ── Tile category classification (by tileset name / source file) ─
  // Maps the human-readable tileset name to a biome role so the dials
  // know which tiles are water, which are monsters, etc.
  function classify(name) {
    const n = (name || "").toLowerCase();
    if (/water/.test(n)) return "water";
    if (/houndmare/.test(n)) return "houndmare";
    if (/lazeey/.test(n)) return "lazeey";
    if (/purp/.test(n)) return "purple";
    if (/sand/.test(n)) return "sand";
    if (/soil|dirt/.test(n)) return "soil";
    if (/earth|eart/.test(n)) return "earth";
    if (/unconscious/.test(n)) return "dream";
    if (/star/.test(n)) return "star";
    if (/flower|plant|easter|balls/.test(n)) return "flora";
    if (/boy|character|ginger|turning|look down|sitting|fishermen|elmur|hatred|mkkey|sheep|ordamancer|freee|choose|idea|toolbar|net/.test(n)) return "character";
    if (/lion|dino|dog|cat|bob|shooter|spike|mop|ball|tri|tall|sun|snot|bom|bby/.test(n)) return "creature";
    return "grass"; // tiling work / new tiling / noeste niceles / etc.
  }

  // Base HSL colour per category — used to draw fallback blocks and to
  // tint creatures spawned without art.
  const CAT_HSL = {
    grass: [110, 38, 42], water: [202, 55, 48], sand: [44, 52, 68],
    soil: [26, 45, 34], earth: [32, 40, 40], purple: [278, 46, 46],
    dream: [250, 34, 32], star: [232, 45, 14], flora: [330, 55, 66],
    creature: [12, 60, 52], houndmare: [285, 42, 34], lazeey: [85, 52, 55],
    character: [210, 28, 56], generic: [0, 0, 48],
  };
  const TERRAIN_CATS = new Set(["grass", "water", "sand", "soil", "earth", "purple", "dream", "star", "generic"]);
  const CREATURE_CATS = new Set(["creature", "houndmare", "lazeey", "character", "flora"]);

  // ── Asset pools (filled by the drop loader) ──────────────────────
  const images = {};   // basename(lower) -> HTMLImageElement
  const tsxDefs = {};  // basename(lower) -> { imageFile, tw, th, cols, count }
  const maps = {};     // displayName -> parsed map object

  // ── Parsing ──────────────────────────────────────────────────────
  const parser = new DOMParser();
  const baseName = (p) => (p || "").split(/[\\/]/).pop().toLowerCase();
  // Key = basename without extension, trimmed, spaces collapsed. This lets a
  // ".aseprite" image reference match a ".png" of the same name, and tolerates
  // stray spaces in filenames (e.g. "yellow flowersnew .png").
  const stripExt = (p) => baseName(p).replace(/\.[^.]+$/, "").trim().replace(/\s+/g, " ");

  function parseCSV(text) {
    return text.trim().split(/[\s,]+/).filter((s) => s !== "").map(Number);
  }

  function parseTMX(xmlText, displayName) {
    const doc = parser.parseFromString(xmlText, "text/xml");
    const mapEl = doc.querySelector("map");
    const W = +mapEl.getAttribute("width");
    const H = +mapEl.getAttribute("height");

    const tilesets = [...doc.querySelectorAll("map > tileset")].map((ts) => {
      const firstgid = +ts.getAttribute("firstgid");
      const source = ts.getAttribute("source");          // .tsx reference
      const inlineImg = ts.querySelector("image");        // inline tileset
      const name = ts.getAttribute("name") || (source ? stripExt(source) : "tiles");
      const def = {
        firstgid,
        name,
        category: classify(source ? stripExt(source) : name),
        tsxKey: source ? stripExt(source) : null,
        tw: +(ts.getAttribute("tilewidth") || 20),
        th: +(ts.getAttribute("tileheight") || 20),
        cols: +(ts.getAttribute("columns") || 0),
        count: +(ts.getAttribute("tilecount") || 0),
        imageKey: inlineImg ? stripExt(inlineImg.getAttribute("source")) : null,
      };
      return def;
    }).sort((a, b) => a.firstgid - b.firstgid);

    const layers = [...doc.querySelectorAll("layer")].map((l, i) => ({
      index: i,
      data: parseCSV(l.querySelector("data").textContent),
    }));

    const base = layers[0];
    const distinct = [...new Set(base.data.filter((g) => g > 0))];

    return { name: displayName, W, H, tilesets, layers, base, distinct, objects: layers.slice(1) };
  }

  // Registry of loaded terrain tilesets (real art), used to substitute a
  // same-category tileset when a terrain tileset's own art is missing.
  let terrainArt = [];

  // Resolve which tileset a gid belongs to, plus the loaded image (if any).
  // When allowFallback is set, a terrain tile with no art borrows a loaded
  // tileset of the same biome category so the world stays real art.
  function lookupGid(map, gid, allowFallback = true) {
    if (!gid) return null;
    let ts = null;
    for (const t of map.tilesets) { if (t.firstgid <= gid) ts = t; else break; }
    if (!ts) return null;
    const local = gid - ts.firstgid;
    let img = null, tw = ts.tw, th = ts.th, cols = ts.cols;
    if (ts.imageKey && images[ts.imageKey]) {
      img = images[ts.imageKey];
    } else if (ts.tsxKey && tsxDefs[ts.tsxKey]) {
      const d = tsxDefs[ts.tsxKey];
      tw = d.tw; th = d.th; cols = d.cols;
      if (images[d.imageKey]) img = images[d.imageKey];
    }
    if (img && !cols) cols = Math.max(1, Math.floor(img.width / tw));

    // Terrain fallback: borrow same-category (or any) real terrain art.
    if (!img && allowFallback && TERRAIN_CATS.has(ts.category) && terrainArt.length) {
      const pool = terrainArt.filter((a) => a.category === ts.category);
      const a = (pool.length ? pool : terrainArt)[0];
      const count = a.cols * Math.max(1, Math.floor(a.img.height / a.th));
      return { ts, local: local % count, img: a.img, tw: a.tw, th: a.th, cols: a.cols, category: ts.category };
    }
    return { ts, local, img, tw, th, cols, category: ts.category };
  }

  // Rebuild the terrain-art registry from everything currently loaded.
  function buildTerrainArt() {
    const seen = new Set();
    terrainArt = [];
    for (const nm in maps) {
      for (const ts of maps[nm].tilesets) {
        if (!TERRAIN_CATS.has(ts.category)) continue;
        const info = lookupGid(maps[nm], ts.firstgid, false);
        if (info && info.img && !seen.has(info.img.src)) {
          seen.add(info.img.src);
          terrainArt.push({ img: info.img, tw: info.tw, th: info.th, cols: info.cols, category: ts.category });
        }
      }
    }
  }

  // ── State / dials ────────────────────────────────────────────────
  const dials = { order: 0.5, imag: 0, fear: 0, memory: 0, zoom: 16 };
  let camX = 0, camY = 0;          // camera origin in world-tile coords
  let animate = true;
  let tileCache = new Map();        // tinted-tile cache, cleared on colour change
  let colorEpoch = 0;

  const canvas = document.getElementById("biome-canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 320; canvas.height = 180;
  ctx.imageSmoothingEnabled = false;

  // ── Deterministic hash noise (stable per world cell) ─────────────
  function hash(x, y, s) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2246822519;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── Order ↔ Chaos: transform a terrain gid for world cell (wx,wy) ─
  function terrainGid(map, wx, wy) {
    const lx = ((wx % map.W) + map.W) % map.W;
    const ly = ((wy % map.H) + map.H) % map.H;
    let gid = map.base.data[ly * map.W + lx];

    const order = Math.max(0, (0.5 - dials.order) * 2);  // left of centre
    const chaos = Math.max(0, (dials.order - 0.5) * 2);  // right of centre

    // Order: snap mismatched tiles to the dominant neighbour (tiles match).
    if (order > 0 && hash(wx, wy, 11) < order) {
      const counts = {};
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const nx = ((wx + dx) % map.W + map.W) % map.W;
        const ny = ((wy + dy) % map.H + map.H) % map.H;
        const g = map.base.data[ny * map.W + nx];
        if (g > 0) counts[g] = (counts[g] || 0) + 1;
      }
      let best = gid, bc = -1;
      for (const g in counts) if (counts[g] > bc) { bc = counts[g]; best = +g; }
      gid = best;
    }
    // Chaos: replace with a random terrain tile from this map (less matched).
    if (chaos > 0 && hash(wx, wy, 23) < chaos && map.distinct.length) {
      gid = map.distinct[Math.floor(hash(wx, wy, 37) * map.distinct.length)];
    }
    return gid;
  }

  // ── Colour tinting (Ordinary↔Imaginative, Fear water-green) ───────
  // Builds and caches a tinted 20×20 tile. Signature is quantised so only
  // a handful of variants ever exist.
  function tintedTile(info, sig) {
    const key = `${info.ts.firstgid}:${info.local}:${sig.h}:${sig.s}:${sig.b}`;
    let c = tileCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = info.tw; c.height = info.th;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    if (sig.h || sig.s !== 100 || sig.b !== 100)
      cx.filter = `hue-rotate(${sig.h}deg) saturate(${sig.s}%) brightness(${sig.b}%)`;
    const sx = (info.local % info.cols) * info.tw;
    const sy = Math.floor(info.local / info.cols) * info.th;
    cx.drawImage(info.img, sx, sy, info.tw, info.th, 0, 0, info.tw, info.th);
    if (tileCache.size > 4000) tileCache.clear();
    tileCache.set(key, c);
    return c;
  }

  // Compute the tint signature for a tile. Kept independent of per-cell
  // coordinates (apart from a 5-step "tone band") so the tinted-tile cache
  // stays small. Imaginative spreads tiles across many vivid hue variants.
  function tintSig(category, band, t) {
    const imag = dials.imag, fear = dials.fear;
    let hue = 0;
    let sat = lerp(100, 90, imag);            // keep colours punchy, not washed
    let bri = lerp(100, 116, imag);
    if (imag > 0) {
      hue += (band - 2) * imag * 58 + imag * 12;   // wide hue spread per band
      if (band % 2) sat = lerp(sat, 135, imag * 0.5); // some bands extra vivid
    }
    if (fear > 0) {
      if (category === "water") { hue += -70 * fear; sat = lerp(sat, sat + 25, fear); }
      else { hue += 18 * fear; }
    }
    return {
      h: Math.round(hue / 6) * 6,
      s: Math.round(sat / 5) * 5,
      b: Math.round(bri / 4) * 4,
    };
  }
  const TONE_BANDS = 5;
  const toneBand = (wx, wy) => (dials.imag > 0 ? (hash(wx, wy, 7) * TONE_BANDS) | 0 : 2);

  // ── Fallback colour block when a tile has no loaded art ──────────
  function fallbackBlock(category, wx, wy, x, y, px, t) {
    const base = CAT_HSL[category] || CAT_HSL.generic;
    const sig = tintSig(category, toneBand(wx, wy), t);
    let [h, s, l] = base;
    h += sig.h + (hash(wx, wy, 3) - 0.5) * 12;
    s = s * (sig.s / 100);
    l = Math.min(92, l * (sig.b / 100) + (hash(wx, wy, 5) - 0.5) * 6);
    ctx.fillStyle = `hsl(${h},${s}%,${l}%)`;
    ctx.fillRect(x, y, Math.ceil(px), Math.ceil(px));
  }

  // ── Object / creature layer (Fear spawns more monsters) ──────────
  // Pre-index object placements per local cell across the active map's
  // object layers, then add fear-driven monster spawns at render time.
  function objectsAt(map, lx, ly) {
    const out = [];
    for (const layer of map.objects) {
      const g = layer.data[ly * map.W + lx];
      if (g > 0) out.push(g);
    }
    return out;
  }

  // Find a loaded tileset of a given category anywhere in the asset pool,
  // so Fear can summon houndmares/lazeey even on maps that lack them.
  function findCreatureGid(category) {
    for (const mName in maps) {
      const m = maps[mName];
      for (const ts of m.tilesets) {
        if (ts.category !== category) continue;
        const probe = lookupGid(m, ts.firstgid);
        if (probe && probe.img) return { map: m, gid: ts.firstgid };
      }
    }
    return null;
  }

  // Find a loaded tileset whose name contains a substring (e.g. "ordamancer").
  function findByName(sub) {
    for (const mName in maps) {
      const m = maps[mName];
      for (const ts of m.tilesets) {
        const nm = (ts.name || ts.tsxKey || "").toLowerCase();
        if (!nm.includes(sub)) continue;
        const probe = lookupGid(m, ts.firstgid, false);
        if (probe && probe.img) return { map: m, gid: ts.firstgid };
      }
    }
    return null;
  }

  // Tilesets that are animation strips — cycle their frames over time.
  const ANIM_RE = /houndmare|lazeey|ordamancer/;

  // Draw an object/creature — ONLY if its real art is loaded. Houndmares,
  // lazeey (sloths) and ordamancers animate by cycling their sprite-sheet
  // frames; a per-cell phase keeps them out of lockstep. Sprites keep their
  // native pixel dimensions (scaled to the zoom — tiles are 20px), so larger
  // creatures stay big and uncompressed, anchored to the cell's bottom-centre.
  function drawSprite(map, gid, x, y, px, t, wx, wy) {
    const info = lookupGid(map, gid, false);   // creatures: real art only
    if (!info || !info.img) return;
    let frame = info.local;
    const nm = (info.ts.name || info.ts.tsxKey || "").toLowerCase();
    if (animate && ANIM_RE.test(nm)) {
      const rows = Math.max(1, Math.round(info.img.height / info.th));
      const frames = Math.max(1, info.cols * rows);
      if (frames > 1) {
        const phase = Math.floor(hash(wx, wy, 13) * frames);
        frame = (Math.floor(t / 110) + phase) % frames;
      }
    }
    const sx = (frame % info.cols) * info.tw;
    const sy = Math.floor(frame / info.cols) * info.th;
    const scale = px / 20;                      // world scale (native tile = 20px)
    const w = Math.ceil(info.tw * scale);
    const h = Math.ceil(info.th * scale);
    ctx.drawImage(info.img, sx, sy, info.tw, info.th, x + (px - w) / 2, y + px - h, w, h);
  }

  // ── Unified world ────────────────────────────────────────────────
  // All loaded maps are one world. Order↔Chaos decides whether biomes sit
  // in clean contiguous regions (order) or intermix tile-by-tile (chaos).
  // Relaxed↔Fear decides WHICH biome dominates: relaxed→beach(sand),
  // middle→grass & trees, fear→purple. Imaginative+chaos brings in dream.
  let MAPS = [], MAP_NAMES = [];
  function refreshMapList() { MAPS = Object.values(maps); MAP_NAMES = Object.keys(maps); }

  // Per-biome selection weight from the dials.
  function biomeWeights() {
    const f = dials.fear, imag = dials.imag;
    const chaos = Math.max(0, (dials.order - 0.5) * 2);
    const w = {};
    for (const n of MAP_NAMES) w[n] = 0.12;                 // small baseline
    if ("sand" in w)        w["sand"]        = 0.05 + Math.max(0, 1 - 2 * f);     // relaxed → beach
    if ("grass farm" in w)  w["grass farm"]  = 0.1 + (1 - 2 * Math.abs(f - 0.5)); // middle → grass+trees
    if ("purple" in w)      w["purple"]      = 0.05 + Math.max(0, 2 * f - 1);     // fear → purple
    if ("unconscious" in w) w["unconscious"] = imag * (0.25 + chaos);            // imaginative+chaotic → dream
    return w;
  }

  function pickMap(wx, wy) {
    if (MAPS.length <= 1) return MAPS[0];
    const order = Math.max(0, (0.5 - dials.order) * 2);
    const chaos = Math.max(0, (dials.order - 0.5) * 2);
    const bs = Math.max(3, Math.round(7 + order * 38));     // order → larger patches
    const bx = Math.floor(wx / bs), by = Math.floor(wy / bs);
    let r = hash(bx, by, 101);                              // contiguous region
    if (chaos > 0 && hash(wx, wy, 107) < chaos) r = hash(wx, wy, 103); // intermix
    // Weighted pick.
    const w = biomeWeights();
    let tot = 0; for (const n of MAP_NAMES) tot += w[n];
    if (tot <= 0) return MAPS[0];
    let x = r * tot;
    for (const n of MAP_NAMES) { x -= w[n]; if (x <= 0) return maps[n]; }
    return maps[MAP_NAMES[MAP_NAMES.length - 1]];
  }

  // Memory glitch helpers. Memory tears the world: white "void" patches
  // open up and rows of tiles slip sideways. These are STATIC — fixed by
  // world position and the memory amount, they do not animate.
  function memVoid(wx, wy) {
    const m = dials.memory;
    if (m <= 0) return false;
    return hash(Math.floor(wx / 2), Math.floor(wy / 2), 71) < m * 0.4;
  }
  function memShift(wy, px) {
    const m = dials.memory;
    if (m <= 0) return 0;
    if (hash(wy, 0, 73) < m * 0.45) return (hash(wy, 0, 9) - 0.5) * px * 7;
    return 0;
  }

  // ── Render ───────────────────────────────────────────────────────
  function render(t) {
    if (!MAPS.length) return;

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0c0c12";
    ctx.fillRect(0, 0, 320, 180);

    const across = dials.zoom;
    const px = 320 / across;
    const down = Math.ceil(180 / px) + 1;
    const ox = Math.floor(camX), oy = Math.floor(camY);
    const fx = (camX - ox) * px, fy = (camY - oy) * px;
    const purple = findPurpleGid();
    const cp = Math.ceil(px);

    // Terrain pass — biome chosen per cell, so regions border & blend.
    for (let j = -1; j < down; j++) {
      const sliceShift = memShift(oy + j, px);
      for (let i = -1; i <= across; i++) {
        const wx = ox + i, wy = oy + j;
        const sx = i * px - fx + sliceShift, sy = j * px - fy;

        // Memory: white void patches eat the world.
        if (memVoid(wx, wy)) { ctx.fillStyle = "#fff"; ctx.fillRect(sx, sy, cp, cp); continue; }

        const map = pickMap(wx, wy);
        let gid = terrainGid(map, wx, wy);
        let info = lookupGid(map, gid);
        let category = info ? info.category : "generic";

        // Fear: extra purple creep, but only past the middle so the grassy
        // centre stays clean.
        const creep = Math.max(0, dials.fear - 0.5) * 0.7;
        if (creep > 0 && category !== "purple" && hash(wx, wy, 91) < creep) {
          category = "purple";
          if (purple) info = lookupGid(purple.map, purple.gid);
        }

        if (info && info.img) {
          const sig = tintSig(category, toneBand(wx, wy), t);
          ctx.drawImage(tintedTile(info, sig), sx, sy, cp, cp);
        } else {
          fallbackBlock(category, wx, wy, sx, sy, px, t);
        }
      }
    }

    // Object pass — decorations only (trees, logs, plants, flowers…). The
    // map-placed creatures are skipped here and handled by the capped
    // creature system below.
    const isLog = (cat) => cat === "soil" || cat === "earth";
    for (let j = -1; j < down; j++) {
      const sliceShift = memShift(oy + j, px);
      for (let i = -1; i <= across; i++) {
        const wx = ox + i, wy = oy + j;
        const sx = i * px - fx + sliceShift, sy = j * px - fy;
        if (memVoid(wx, wy)) continue;
        const map = pickMap(wx, wy);
        if (catAt(map, wx, wy) === "water") continue;        // nothing sits on water
        const lx = ((wx % map.W) + map.W) % map.W;
        const ly = ((wy % map.H) + map.H) % map.H;
        for (const g of objectsAt(map, lx, ly)) {
          if (isCreatureGid(map, g)) continue;               // creatures handled below
          drawSprite(map, g, sx, sy, px, t, wx, wy);
        }
      }
    }

    // Creature pass — at most 4 on screen, never on water / trees / logs.
    const chaos = Math.max(0, (dials.order - 0.5) * 2);
    const order = Math.max(0, (0.5 - dials.order) * 2);
    const relaxed = 1 - dials.fear;
    const houndP = (chaos * 0.5 + dials.fear * 0.6) * 0.18;   // fearful + chaotic
    const slothP = (chaos * 0.5 + relaxed * 0.5) * 0.14;      // chaotic + relaxed
    const ordaP = order * 0.16;                               // orderly
    const candidates = [];
    for (let j = -1; j < down; j++) {
      const sliceShift = memShift(oy + j, px);
      for (let i = -1; i <= across; i++) {
        const wx = ox + i, wy = oy + j;
        if (memVoid(wx, wy)) continue;
        const map = pickMap(wx, wy);
        const lx = ((wx % map.W) + map.W) % map.W;
        const ly = ((wy % map.H) + map.H) % map.H;

        // No creatures on trees / logs / other objects.
        let blocked = false;
        for (const g of objectsAt(map, lx, ly)) {
          if (!isCreatureGid(map, g)) { blocked = true; break; }
        }
        if (blocked) continue;
        // No creatures on water (or watery soil/log tiles).
        const cat = catAt(map, wx, wy);
        if (cat === "water" || isLog(cat)) continue;

        let type = null;
        if (hash(wx, wy, 53) < houndP) type = "houndmare";
        else if (hash(wx, wy, 59) < slothP) type = "lazeey";
        else if (hash(wx, wy, 67) < ordaP) type = "ordamancer";
        if (!type) continue;
        candidates.push({ sx: i * px - fx + sliceShift, sy: j * px - fy, wx, wy, type, score: hash(wx, wy, 99) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const c of candidates.slice(0, 4)) {
      const found = c.type === "ordamancer" ? findByName("ordamancer") : findCreatureGid(c.type);
      if (found) drawSprite(found.map, found.gid, c.sx, c.sy, px, t, c.wx, c.wy);
    }
    ctx.globalAlpha = 1;
  }

  // Is this gid an animated creature (houndmare / lazeey / ordamancer)?
  function isCreatureGid(map, gid) {
    const info = lookupGid(map, gid, false);
    if (!info) return false;
    return ANIM_RE.test((info.ts.name || info.ts.tsxKey || "").toLowerCase());
  }

  // The terrain biome category rendered at a world cell.
  function catAt(map, wx, wy) {
    const info = lookupGid(map, terrainGid(map, wx, wy));
    return info ? info.category : "generic";
  }

  let purpleCache;
  function findPurpleGid() {
    if (purpleCache !== undefined) return purpleCache;
    purpleCache = findGidByCategory("purple");
    return purpleCache;
  }
  function findGidByCategory(category) {
    for (const mName in maps) {
      const m = maps[mName];
      for (const ts of m.tilesets) {
        if (ts.category !== category) continue;
        const probe = lookupGid(m, ts.firstgid);
        if (probe && probe.img) return { map: m, gid: ts.firstgid };
      }
    }
    return null;
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!animate && !needsRedraw) return;
    render(t);
    needsRedraw = false;
  }
  let needsRedraw = true;

  // ── Asset ingest ─────────────────────────────────────────────────
  function ingestFiles(fileList) {
    const files = [...fileList];
    let pending = files.length;
    if (!pending) return;
    const done = () => { if (--pending === 0) afterIngest(); };

    for (const f of files) {
      const ext = f.name.toLowerCase().split(".").pop();
      if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp") {
        const img = new Image();
        img.onload = done; img.onerror = done;
        img.src = URL.createObjectURL(f);
        images[stripExt(f.name)] = img;
      } else if (ext === "tsx") {
        f.text().then((txt) => {
          const doc = parser.parseFromString(txt, "text/xml");
          const ts = doc.querySelector("tileset");
          const im = doc.querySelector("image");
          if (ts && im) {
            tsxDefs[stripExt(f.name)] = {
              imageKey: stripExt(im.getAttribute("source")),
              tw: +(ts.getAttribute("tilewidth") || 20),
              th: +(ts.getAttribute("tileheight") || 20),
              cols: +(ts.getAttribute("columns") || 0),
              count: +(ts.getAttribute("tilecount") || 0),
            };
          }
          done();
        }).catch(done);
      } else if (ext === "tmx") {
        f.text().then((txt) => {
          const nm = stripExt(f.name);
          maps[nm] = parseTMX(txt, nm);
          done();
        }).catch(done);
      } else done();
    }
  }

  function afterIngest() {
    purpleCache = undefined;
    tileCache.clear();
    colorEpoch++;
    refreshMapList();
    buildTerrainArt();
    updateMissing();
    needsRedraw = true;
  }

  // Auto-load tileset art committed in /assets (listed in manifest.json) so
  // the deployed site shows real tiles with no drag-and-drop needed.
  function loadBundledAssets() {
    fetch("assets/manifest.json").then((r) => r.ok ? r.json() : []).then((list) => {
      if (!list || !list.length) return;
      let pending = list.length;
      const done = () => { if (--pending === 0) afterIngest(); };
      for (const name of list) {
        const url = "assets/" + encodeURIComponent(name);
        const ext = name.toLowerCase().split(".").pop();
        if (ext === "png") {
          const img = new Image();
          img.onload = done; img.onerror = done; img.src = url;
          images[stripExt(name)] = img;
        } else if (ext === "tsx") {
          fetch(url).then((r) => r.text()).then((txt) => {
            const doc = parser.parseFromString(txt, "text/xml");
            const ts = doc.querySelector("tileset"), im = doc.querySelector("image");
            if (ts && im) tsxDefs[stripExt(name)] = {
              imageKey: stripExt(im.getAttribute("source")),
              tw: +(ts.getAttribute("tilewidth") || 20),
              th: +(ts.getAttribute("tileheight") || 20),
              cols: +(ts.getAttribute("columns") || 0),
              count: +(ts.getAttribute("tilecount") || 0),
            };
            done();
          }).catch(done);
        } else done();
      }
    }).catch(() => {});
  }

  // ── UI ───────────────────────────────────────────────────────────
  function updateMissing() {
    const el = document.getElementById("missing");
    const need = new Set();
    for (const nm in maps) {
      const map = maps[nm];
      for (const ts of map.tilesets) {
        const probe = lookupGid(map, ts.firstgid);
        if (!probe || !probe.img)
          need.add(ts.imageKey ? ts.imageKey + ".png" : ts.tsxKey + ".tsx");
      }
    }
    if (need.size === 0) el.innerHTML = `<span class="ok">✓ all tile art loaded</span>`;
    else el.innerHTML = `<span class="warn">drop tileset art (.png/.tsx) to replace colour blocks — needs:</span> ` +
      [...need].slice(0, 10).map((s) => `<code>${s}</code>`).join(" ") +
      (need.size > 10 ? ` +${need.size - 10} more` : "");
  }

  function bindDial(id, key, fmt) {
    const slider = document.getElementById(id);
    const out = document.getElementById(id + "-val");
    const apply = () => {
      dials[key] = parseFloat(slider.value);
      if (key !== "zoom") { colorEpoch++; tileCache.clear(); }
      if (out) out.textContent = fmt ? fmt(dials[key]) : dials[key];
      needsRedraw = true;
    };
    slider.addEventListener("input", apply);
    apply();
  }

  function bindUI() {
    bindDial("dial-order", "order", (v) => v < 0.45 ? "order" : v > 0.55 ? "chaos" : "—");
    bindDial("dial-imag", "imag", (v) => v < 0.05 ? "ordinary" : Math.round(v * 100) + "%");
    bindDial("dial-fear", "fear", (v) => v < 0.05 ? "relaxed" : Math.round(v * 100) + "%");
    bindDial("dial-memory", "memory", (v) => Math.round(v * 100) + "%");
    bindDial("dial-zoom", "zoom", (v) => Math.round(v) + "× tiles");

    const dz = document.getElementById("dropzone");
    ["dragenter", "dragover"].forEach((e) => dz.addEventListener(e, (ev) => {
      ev.preventDefault(); dz.classList.add("hover");
    }));
    ["dragleave", "drop"].forEach((e) => dz.addEventListener(e, (ev) => {
      ev.preventDefault(); dz.classList.remove("hover");
    }));
    dz.addEventListener("drop", (ev) => ingestFiles(ev.dataTransfer.files));
    document.getElementById("file-input").addEventListener("change", (ev) => ingestFiles(ev.target.files));

    // Whole-window drop as well, so users can drop anywhere.
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => { e.preventDefault(); ingestFiles(e.dataTransfer.files); });

    // Pan: drag the canvas.
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const px = 320 / dials.zoom;
      const scale = canvas.clientWidth / 320;
      camX -= (e.clientX - lx) / (px * scale);
      camY -= (e.clientY - ly) / (px * scale);
      lx = e.clientX; ly = e.clientY; needsRedraw = true;
    });
    canvas.addEventListener("pointerup", () => { dragging = false; });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { camX -= 1; needsRedraw = true; }
      if (e.key === "ArrowRight") { camX += 1; needsRedraw = true; }
      if (e.key === "ArrowUp") { camY -= 1; needsRedraw = true; }
      if (e.key === "ArrowDown") { camY += 1; needsRedraw = true; }
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      dials.order = 0.5; dials.imag = 0; dials.fear = 0; dials.memory = 0; dials.zoom = 16;
      camX = 0; camY = 0;
      document.getElementById("dial-order").value = 0.5;
      document.getElementById("dial-imag").value = 0;
      document.getElementById("dial-fear").value = 0;
      document.getElementById("dial-memory").value = 0;
      document.getElementById("dial-zoom").value = 16;
      ["dial-order", "dial-imag", "dial-fear", "dial-memory", "dial-zoom"]
        .forEach((id) => document.getElementById(id).dispatchEvent(new Event("input")));
      colorEpoch++; tileCache.clear(); needsRedraw = true;
    });

    document.getElementById("btn-anim").addEventListener("click", (e) => {
      animate = !animate; e.target.textContent = animate ? "Pause" : "Play"; needsRedraw = true;
    });

    document.getElementById("btn-shot").addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `biome-world-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    for (const nm in BUILTIN_MAPS) maps[nm] = parseTMX(BUILTIN_MAPS[nm], nm);
    refreshMapList();
    bindUI();
    updateMissing();
    loadBundledAssets();
    requestAnimationFrame(loop);
  }

  init();
})();
