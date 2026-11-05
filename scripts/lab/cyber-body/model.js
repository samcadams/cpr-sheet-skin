/**
 * Cyber tab body view: the body model and its renderer.
 *
 * The body and the bones are 2D signed-distance fields built from capsules and
 * ellipses ("body space": 300 x 610 units, the character's RIGHT at x < 150;
 * the body faces the viewer, so that's the viewer's left), drawn as an
 * x-ray: see-through flesh with bones. Flesh and bones are separate images so
 * the view can shift the bones a little for depth. A cyberlimb is a per-zone
 * material: its zone renders as machined metal past a lit attachment seam.
 *
 * Fields and images are computed in small slices across animation frames
 * (never one long block), and cached for the session: the body never changes,
 * so a field is built once; an image once per palette and set of limbs.
 */

export const BW = 300;
export const BH = 610;

/* ================================================================ Model */

const PARTS = [];
const BONES = [];
const mir = p => [300 - p[0], p[1]];
const cap = (list, zone, a, b, r0, r1 = r0, extra = {}) =>
  list.push({ k: "c", zone, ax: a[0], ay: a[1], bx: b[0], by: b[1], r0, r1, grp: 0, ...extra });
const ell = (list, zone, c, rx, ry, rot = 0, extra = {}) => list.push({ k: "e", zone, cx: c[0], cy: c[1], rx, ry, rot, ...extra });
const TORSO = { grp: 1 };
/** A rounded polygon (bones only): pts in body space, `round` grows it outwards. */
const pgon = (list, zone, pts, round = 0, extra = {}) => list.push({ k: "p", zone, pts, round, ...extra });
/** A polygon symmetric about the midline from its right half: [dx, y] pairs, top to bottom. */
const sym = half => [...half.map(([dx, y]) => [150 - dx, y]), ...half.filter(([dx]) => dx > 0).reverse().map(([dx, y]) => [150 + dx, y])];

// Flesh.
ell(PARTS, "head", [150, 38], 24, 31);
cap(PARTS, "neck", [150, 62], [150, 100], 12, 14, TORSO);
cap(PARTS, "neck", [140, 94], [116, 108], 9, 11, TORSO);
cap(PARTS, "neck", [160, 94], [184, 108], 9, 11, TORSO);
cap(PARTS, "chest", [113, 112], [187, 112], 14, 14, TORSO);
cap(PARTS, "chest", [150, 128], [150, 188], 40, 35, TORSO);
cap(PARTS, "abdomen", [150, 198], [150, 246], 30, 31, TORSO);
cap(PARTS, "pelvis", [136, 276], [164, 276], 30, 30, TORSO);
for (const s of ["R", "L"]) {
  const P = s === "R" ? p => p : mir;
  cap(PARTS, `arm${s}`, P([106, 118]), P([102, 148]), 15, 11.5);
  cap(PARTS, `arm${s}`, P([103, 128]), P([93, 222]), 12, 9.5);
  cap(PARTS, `arm${s}`, P([93, 226]), P([84, 298]), 9.5, 6.5);
  cap(PARTS, `arm${s}`, P([84, 305]), P([80, 340]), 7.5, 5.5);
  cap(PARTS, `arm${s}`, P([89, 306]), P([93, 325]), 3.2, 2.6);
  cap(PARTS, `leg${s}`, P([127, 290]), P([124, 444]), 24, 14);
  cap(PARTS, `leg${s}`, P([124, 450]), P([122, 562]), 12.5, 7.5);
  cap(PARTS, `leg${s}`, P([125, 468]), P([124, 512]), 14, 10.5);
  cap(PARTS, `leg${s}`, P([122, 568]), P([119, 598]), 7.5, 6.5);
}

// Bones.
// Skull, front view: cranium, a face that narrows past the cheekbones to the upper teeth, a
// U-shaped mandible, a row of teeth; orbits, nasal opening and the gaps between teeth cut out.
ell(BONES, "skull", [150, 29], 20, 21.5);
pgon(BONES, "skull", sym([[19.5, 32], [20.5, 41], [18, 46], [13.5, 49.5], [10.5, 53.5], [0, 54]]), 1);
pgon(BONES, "skull", [
  ...[[17, 47], [16.8, 55], [14.5, 60.5], [8.5, 65.8], [0, 67.4]].map(([dx, y]) => [150 - dx, y]),
  ...[[8.5, 65.8], [14.5, 60.5], [16.8, 55], [17, 47], [13.8, 48.5], [13.2, 55], [9.5, 58.6], [0, 59.2]].map(([dx, y]) => [150 + dx, y]),
  ...[[9.5, 58.6], [13.2, 55], [13.8, 48.5]].map(([dx, y]) => [150 - dx, y])
], 0.8);
pgon(BONES, "skull", sym([[9.6, 52.8], [9.2, 60.6]]), 0.8);
cap(BONES, "skull", [140.5, 57.1], [159.5, 57.1], 0.35, 0.35, { sub: true });
for (let i = -3; i <= 3; i++) {
  const x = 150 + i * 2.55;
  cap(BONES, "skull", [x, 53.6], [x, 56.6], 0.22, 0.22, { sub: true });
  if (i < 3) cap(BONES, "skull", [x + 1.27, 57.6], [x + 1.27, 60.1], 0.22, 0.22, { sub: true });
}
for (const s of [-1, 1]) {
  const X = dx => 150 + s * dx;
  pgon(BONES, "skull", [[X(5), 33.5], [X(10.5), 32.8], [X(13.8), 34.4], [X(14.4), 38.6], [X(12.6), 41.8], [X(7.6), 42], [X(5.2), 39.4]], 1.8, { sub: true });
  cap(BONES, "skull", [X(16), 44.5], [X(20.5), 41.5], 1.6, 1.2);
}
pgon(BONES, "skull", [[150, 42.2], [152.2, 46.6], [152.3, 50.2], [150, 51], [147.7, 50.2], [147.8, 46.6]], 0.5, { sub: true });
for (let y = 70; y < 256; y += 8) {
  const w = y < 104 ? 3.5 : y < 232 ? 4.5 : 6;
  cap(BONES, "spine", [150 - w, y], [150 + w, y], 3);
}
cap(BONES, "core", [150, 116], [150, 172], 4.5, 3.5);
const bez = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
});
/** A smooth bone along a path: one polygon offset to both sides (radius r0 -> r1), so no bumps at the joints. */
const tube = (zone, pts, r0, r1 = r0) => {
  const n = pts.length - 1, side = k => pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const r = (r0 + (r1 - r0) * i / n - 0.5) * k;
    return [q[0] - dy / l * r, q[1] + dx / l * r];
  });
  pgon(BONES, zone, [...side(1), ...side(-1).reverse()], 0.5);
};
const poly = (zone, pts, r) => tube(zone, pts, r);
[21, 27, 31, 33, 34, 34, 33, 31, 28, 24].forEach((R, i) => {
  const y0 = 114 + i * 10.5;
  for (const s of [-1, 1]) {
    const X = x => 150 + s * x;
    poly("core", bez([X(5), y0], [X(R * 0.9), y0 - 7], [X(R + 4), y0 + 10], [X(R * 0.82), y0 + 24], 10), 1.9);
    if (i < 7) poly("core", bez([X(R * 0.82), y0 + 24], [X(R * 0.6), y0 + 30], [X(10), y0 + 22], [X(4.5), Math.min(170, y0 + 16)], 6), 1.5);
  }
});
for (const s of [-1, 1]) {
  const X = x => 150 + s * x;
  // Clavicle: a slim S from the sternal notch out to the acromion over the shoulder joint.
  tube("core", bez([X(4.5), 106.5], [X(16), 111], [X(29), 101.5], [X(41), 109.5], 16), 2.6, 1.9);
  ell(BONES, "core", [X(42), 111.5], 3.6, 2.1, s * 0.25);
  // Pelvis: the ilium flares from the sacrum up to the crest and down to the hip socket; below it
  // the pubis and ischium ring the obturator foramen and meet at the symphysis.
  const ilium = [
    ...bez([X(9), 253], [X(16), 238], [X(33), 237], [X(38.5), 251], 10),
    ...bez([X(38.5), 251], [X(37), 262], [X(30.5), 267], [X(30.5), 279], 6).slice(1),
    ...bez([X(22), 277.5], [X(18), 270], [X(12), 267], [X(9.5), 262], 5)
  ];
  pgon(BONES, "core", ilium, 0.6, { ring: 0.9 });
  pgon(BONES, "core", ilium, 0.6, { faint: true });
  pgon(BONES, "core", [[X(20), 281], [X(29), 282], [X(29.5), 290.5], [X(26), 299], [X(17), 303.5], [X(6.5), 301], [X(2.6), 296.5], [X(2.6), 290], [X(7.5), 286]], 1.8);
  ell(BONES, "core", [X(15.5), 294], 6, 4.4, s * -0.35, { sub: true });
  ell(BONES, "core", [X(24), 285.5], 7.2, 7.2, 0, { ring: 0.9 });
  for (const [dy, r] of [[262, 1.3], [270, 1.2], [278, 1]]) ell(BONES, "core", [X(4.3 - (dy - 262) * 0.06), dy], r, r, 0, { sub: true });
}
pgon(BONES, "core", sym([[8.5, 255], [7.2, 272], [4, 285.5], [1.4, 291]]), 1.4);
cap(BONES, "core", [150, 293], [150, 299], 1.3, 0.8);
pgon(BONES, "core", [[148.5, 106.5], [151.5, 106.5], [157, 107.5], [155.5, 118], [144.5, 118], [143, 107.5]], 1);
for (const s of ["R", "L"]) {
  const P = s === "R" ? p => p : mir, z = `arm${s}`, zl = `leg${s}`;
  ell(BONES, z, P([105, 122]), 6.5, 6.5);
  cap(BONES, z, P([104, 126]), P([94, 217]), 3.8, 3.2);
  ell(BONES, z, P([91, 220]), 4.2, 4); ell(BONES, z, P([97, 220]), 4.2, 4);
  cap(BONES, z, P([91, 227]), P([84, 294]), 2.2, 2.5); cap(BONES, z, P([97, 227]), P([89, 294]), 2.3, 1.9);
  ell(BONES, z, P([86, 301]), 5, 4);
  for (let i = 0; i < 4; i++) {
    const b0 = P([81.5 + i * 2.4, 305]), b1 = P([79.5 + i * 2.8, 321]), b2 = P([78.5 + i * 3.1, 336 - Math.abs(i - 1.5) * 2]);
    cap(BONES, z, b0, b1, 1.3, 1.1); cap(BONES, z, b1, b2, 1.05, 0.8);
  }
  cap(BONES, z, P([89, 304]), P([93, 320]), 1.4, 1.1);
  ell(BONES, zl, P([126, 285.5]), 5.6, 5.6);
  cap(BONES, zl, P([125, 287.5]), P([115.5, 296]), 3.6, 4);
  ell(BONES, zl, P([112.5, 295.5]), 4.2, 5.8, 0.15);
  ell(BONES, zl, P([121.5, 304]), 2.4, 2.4);
  cap(BONES, zl, P([115.5, 299]), P([124.5, 438]), 4.8, 4.1);
  ell(BONES, zl, P([121, 441]), 5.5, 5); ell(BONES, zl, P([129, 441]), 5.5, 5);
  ell(BONES, zl, P([125, 449]), 4.2, 4.4);
  ell(BONES, zl, P([121, 455]), 4.8, 3.8); ell(BONES, zl, P([128.5, 455]), 4.8, 3.8);
  cap(BONES, zl, P([125, 458]), P([123, 556]), 3.9, 3.3);
  cap(BONES, zl, P([117, 462]), P([118, 554]), 1.8, 1.6);
  ell(BONES, zl, P([124, 560]), 4, 3.5); ell(BONES, zl, P([117.5, 558]), 3, 3.2);
  ell(BONES, zl, P([122, 569]), 4.6, 4);
  for (let i = 0; i < 5; i++) cap(BONES, zl, P([117.5 + i * 2.4, 575]), P([115 + i * 3.2, 594]), 1.35, 1.1);
}

for (const p of [...PARTS, ...BONES]) {
  if (p.k === "c") {
    p.dx = p.bx - p.ax; p.dy = p.by - p.ay; p.L = Math.hypot(p.dx, p.dy);
    const r = Math.max(p.r0, p.r1);
    p.bb = [Math.min(p.ax, p.bx) - r, Math.min(p.ay, p.by) - r, Math.max(p.ax, p.bx) + r, Math.max(p.ay, p.by) + r];
  } else if (p.k === "p") {
    const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]), r = p.round + (p.ring ?? 0);
    p.bb = [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
    p.L = 1;
  } else {
    const r = Math.max(p.rx, p.ry);
    p.bb = [p.cx - r, p.cy - r, p.cx + r, p.cy + r];
    p.L = 2 * p.ry; p.cs = Math.cos(p.rot); p.sn = Math.sin(p.rot);
  }
}
export const ZONES = [...new Set([...PARTS, ...BONES].map(p => p.zone))];
const zi = z => ZONES.indexOf(z);

/** Named places on the body that cyberware can sit on (body space). */
export const LOC = {
  brain: [150, 22], scalp: [150, 12], eyeR: [140, 38], eyeL: [160, 38], earR: [126, 40], earL: [174, 40],
  nose: [150, 48], jaw: [150, 60], neck: [150, 84], spine: [150, 106], chest: [150, 150], heart: [158, 148],
  lungs: [136, 140], liver: [137, 212], gut: [152, 232], kidneys: [164, 220], pelvis: [150, 276]
};
for (const s of ["R", "L"]) {
  const P = s === "R" ? p => p : mir;
  Object.assign(LOC, {
    [`arm${s}.shoulder`]: P([105, 122]), [`arm${s}.upper`]: P([98, 176]), [`arm${s}.elbow`]: P([93, 224]),
    [`arm${s}.forearm`]: P([89, 262]), [`arm${s}.wrist`]: P([85, 299]), [`arm${s}.hand`]: P([82, 322]),
    [`leg${s}.hip`]: P([128, 292]), [`leg${s}.thigh`]: P([126, 368]), [`leg${s}.knee`]: P([124, 448]),
    [`leg${s}.calf`]: P([123, 500]), [`leg${s}.foot`]: P([121, 584])
  });
}
/** The part of the body the zoom lens shows (face implants crowd the head). */
export const HEAD = { x: 100, y: -4, w: 100, h: 92, cx: 150, cy: 42 };
export const isHeadPoint = p => p[1] < 72 && Math.abs(p[0] - 150) < 34;

/** Where a cyberlimb attaches: chrome only past this line (> 0), with a lit seam on it. */
function cut(zone, x, y) {
  if (zone === "legR") return y - (290 + Math.max(0, x - 100) * 0.45);
  if (zone === "legL") return y - (290 + Math.max(0, 200 - x) * 0.45);
  if (zone === "armR") return 113 - x;
  if (zone === "armL") return x - 187;
  return 99;
}

/* ================================================================ Field */

const out = { d: 0, t: 0, u: 0, r: 0 };
function sd(p, x, y) {
  if (p.k === "c") {
    let t = ((x - p.ax) * p.dx + (y - p.ay) * p.dy) / (p.L * p.L);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (p.ax + p.dx * t), ey = y - (p.ay + p.dy * t), r = p.r0 + (p.r1 - p.r0) * t;
    out.d = Math.hypot(ex, ey) - r; out.t = t; out.u = (ex * -p.dy + ey * p.dx) / p.L / r; out.r = r;
  } else if (p.k === "p") {
    // Signed distance to a simple polygon (winding by edge crossings).
    const v = p.pts;
    let d = (x - v[0][0]) ** 2 + (y - v[0][1]) ** 2, sg = 1;
    for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
      const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = x - v[i][0], wy = y - v[i][1];
      const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
      d = Math.min(d, (wx - ex * h) ** 2 + (wy - ey * h) ** 2);
      const a = y >= v[i][1], b = y < v[j][1], c = ex * wy > ey * wx;
      if ((a && b && c) || (!a && !b && !c)) sg = -sg;
    }
    out.d = sg * Math.sqrt(d) - p.round;
    if (p.ring) out.d = Math.abs(out.d) - p.ring;
    out.t = 0.5; out.u = 0; out.r = 1;
  } else {
    const lx = (x - p.cx) * p.cs + (y - p.cy) * p.sn, ly = -(x - p.cx) * p.sn + (y - p.cy) * p.cs;
    out.d = (Math.hypot(lx / p.rx, ly / p.ry) - 1) * Math.min(p.rx, p.ry);
    if (p.ring) out.d = Math.abs(out.d) - p.ring;
    out.t = (ly + p.ry) / (2 * p.ry); out.u = lx / p.rx; out.r = Math.min(p.rx, p.ry);
  }
  return out.d;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** Run fn(row) for every row, yielding to the browser every ~12 ms. */
async function sliced(rows, fn) {
  let t0 = performance.now();
  for (let r = 0; r < rows; r++) {
    fn(r);
    if (performance.now() - t0 > 12) { await new Promise(res => requestAnimationFrame(res)); t0 = performance.now(); }
  }
}

const FIELDS = new Map();
/**
 * The field over a region of body space ({x, y, w, h} in body units, ss pixels per unit).
 * Per pixel: d (body distance), z (fake depth 0 edge .. 1 axis), t/u/len (along and across the
 * nearest part), zone, bd (bone distance), bf (faint bone fill).
 */
export function field(region) {
  const key = `${region.x},${region.y},${region.w},${region.h},${region.ss}`;
  if (!FIELDS.has(key)) FIELDS.set(key, buildField(region));
  return FIELDS.get(key);
}
async function buildField({ x: X0, y: Y0, w, h, ss }) {
  const GW = Math.round(w * ss), GH = Math.round(h * ss), N = GW * GH;
  const F = {
    GW, GH, ss, X0, Y0, d: new Float32Array(N), z: new Float32Array(N), t: new Float32Array(N), u: new Float32Array(N),
    len: new Float32Array(N), zone: new Uint8Array(N), bd: new Float32Array(N), bf: new Uint8Array(N)
  };
  const M = 18;
  await sliced(GH, gy => {
    const y = Y0 + (gy + 0.5) / ss;
    const parts = PARTS.filter(p => y >= p.bb[1] - M && y <= p.bb[3] + M), bones = BONES.filter(p => y >= p.bb[1] - 4 && y <= p.bb[3] + 4);
    for (let gx = 0; gx < GW; gx++) {
      const x = X0 + (gx + 0.5) / ss, i = gy * GW + gx;
      let dT = 1e9, dO = 1e9, best = 1e9, bp = null, bt = 0, bu = 0, br = 1;
      for (const p of parts) {
        if (x < p.bb[0] - M || x > p.bb[2] + M) continue;
        const d = sd(p, x, y);
        if (p.grp === 1) dT = dT > 1e8 ? d : smin(dT, d, 16); else dO = dO > 1e8 ? d : smin(dO, d, 5);
        if (d < best) { best = d; bp = p; bt = out.t; bu = out.u; br = out.r; }
      }
      const d = dT > 1e8 ? dO : dO > 1e8 ? dT : smin(dT, dO, 6);
      F.d[i] = d; F.zone[i] = bp ? zi(bp.zone) : 255; F.t[i] = bt; F.u[i] = bu; F.len[i] = bp ? bp.L : 1;
      const zz = Math.min(1, Math.max(0, -d / br));
      F.z[i] = Math.sqrt(1 - (1 - zz) * (1 - zz));
      let b = 1e9, sub = 1e9;
      if (d < 4) for (const p of bones) {
        if (x < p.bb[0] - 4 || x > p.bb[2] + 4) continue;
        const v = sd(p, x, y);
        if (p.faint) { if (v < 0) F.bf[i] = 1; continue; }
        if (p.sub) sub = Math.min(sub, v); else b = b > 1e8 ? v : smin(b, v, 1.2);
      }
      F.bd[i] = Math.max(b, -sub);
    }
  });
  return F;
}

/* =============================================================== Render */

const hex = h => {
  const s = h.trim().replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map(c => c + c).join("") : s.slice(0, 6), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c, a = 1) => `rgba(${c.map(Math.round).join(",")},${a})`;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fr = x => x - Math.floor(x);
const lineAA = (v, period, w) => { const f = fr(v / period); return 1 - sm(w * 0.5, w * 0.5 + 0.6, Math.min(f, 1 - f) * period); };

/** The palette, from the sheet's --sk-* tokens. */
export function palette(el) {
  const s = getComputedStyle(el), tok = n => s.getPropertyValue(`--sk-${n}`).trim() || null;
  const bg = hex(tok("bg") ?? "#0f1113"), panel = hex(tok("panel") ?? "#171a1d"), fg = hex(tok("fg") ?? "#e9e6dd");
  const accent = hex(tok("accent") ?? "#31c6d4");
  return { bg, panel, fg, accent, muted: hex(tok("muted") ?? "#8d9399"), metal: mix(panel, fg, 0.14), accentHi: mix(accent, [255, 255, 255], 0.55) };
}

function chrome(F, i, C) {
  const z = F.z[i], u = F.u[i], d = F.d[i], s = F.t[i] * F.len[i];
  const light = mix(C.fg, C.accent, 0.3);
  let c = mix(C.bg, C.metal, 0.35 + 0.9 * z);
  c = mix(c, light, 0.75 * Math.exp(-(((u + 0.36) / 0.13) ** 2)) * (0.4 + 0.6 * z));
  c = mix(c, C.accent, 0.18 * Math.exp(-(((u - 0.55) / 0.2) ** 2)));
  const ring = lineAA(s, 22, 1.1), bevel = lineAA(s - 1.2, 22, 0.6);
  const lng = Math.max(0, 1 - Math.abs(Math.abs(u) - 0.62) * 18) * (z > 0.1 ? 1 : 0);
  c = mix(c, C.bg, Math.max(ring, lng) * 0.75);
  c = mix(c, light, bevel * 0.35 * z);
  return mix(c, C.accent, (1 - sm(0, 3.2 / F.ss, -d)) * 0.95);
}

const IMAGES = new Map();
/**
 * The body images for a region, palette and set of chrome zones: { flesh, bones, sil }.
 * sil is the see-through flesh's silhouette (no chrome), the clip for shifted bones.
 */
export function image(region, C, chromeZones) {
  const key = [region.x, region.y, region.w, region.h, region.ss, C.accent, C.bg, [...chromeZones].sort()].join("|");
  if (!IMAGES.has(key)) IMAGES.set(key, field(region).then(F => paint(F, C, chromeZones)));
  return IMAGES.get(key);
}
async function paint(F, C, chromeZones) {
  const { GW, GH, ss, X0, Y0 } = F;
  const layer = () => { const cv = new OffscreenCanvas(GW, GH), x = cv.getContext("2d"); return { cv, x, img: x.createImageData(GW, GH) }; };
  const flesh = layer(), bones = layer(), sil = layer();
  const isChrome = ZONES.map(z => chromeZones.has(z));
  const put = (D, i, c, a) => {
    if (a <= 0) return;
    a = Math.min(1, a);
    const o = i * 4, A = D[o + 3] / 255, na = a + A * (1 - a);
    for (let k = 0; k < 3; k++) D[o + k] = (c[k] * a + D[o + k] * A * (1 - a)) / na;
    D[o + 3] = na * 255;
  };
  const FD = flesh.img.data, BD = bones.img.data, SD = sil.img.data;
  const boneC = mix(C.fg, C.accent, 0.25), px = 2 / ss; // px: one screen pixel at the main view's scale, in body units
  await sliced(GH, gy => {
    const y = Y0 + gy / ss;
    for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, d = F.d[i];
      if (d > 3) continue;
      const zn = F.zone[i], z = F.z[i], bx = X0 + gx / ss;
      const cd = zn < 255 && isChrome[zn] ? cut(ZONES[zn], bx, y) : -1;
      const rim = d < 0 ? 1 - sm(0, 1.5 * px, -d) : 1 - sm(0, 1.4 * px, d);
      if (d >= 0) { put(FD, i, C.accent, rim * (cd > 0 ? 0.9 : 0.55)); continue; }
      if (Math.abs(cd) < 0.8 * px) { put(FD, i, C.accent, 1); continue; }
      if (cd > 0) { put(FD, i, chrome(F, i, C), 1); continue; }
      SD[i * 4 + 3] = 255;
      put(FD, i, C.accent, 0.035 + 0.22 * Math.pow(1 - z, 3) + rim * 0.5);
      const bd = F.bd[i];
      if (F.bf[i]) put(BD, i, boneC, 0.16);
      if (bd < 0.6 * px) {
        const cortex = 1 - sm(0.6 * px, 1.8 * px, -bd), inner = 0.28 + 0.18 * hash(gx >> 1, gy >> 1);
        put(BD, i, boneC, bd > 0 ? 0.25 * (1 - bd / (0.6 * px)) : Math.max(cortex * 0.92, inner));
      }
    }
  });
  for (const l of [flesh, bones, sil]) l.x.putImageData(l.img, 0, 0);
  return { flesh: flesh.cv, bones: bones.cv, sil: sil.cv };
}

const MASKS = new Map();
/** A glow mask for one limb zone (hover highlight), tinted with colour c. */
export function zoneMask(region, zone, c) {
  const key = `${region.ss}|${zone}|${c}`;
  if (!MASKS.has(key)) MASKS.set(key, field(region).then(F => {
    const cv = new OffscreenCanvas(F.GW, F.GH), x = cv.getContext("2d"), img = x.createImageData(F.GW, F.GH), z = zi(zone);
    const col = hex(c.startsWith("#") ? c : "#ffffff");
    for (let i = 0; i < F.GW * F.GH; i++) {
      if (F.zone[i] !== z || F.d[i] > 0) continue;
      const bx = F.X0 + (i % F.GW) / F.ss, by = F.Y0 + Math.floor(i / F.GW) / F.ss;
      if (cut(zone, bx, by) <= 0) continue;
      img.data.set([...col, 255], i * 4);
    }
    x.putImageData(img, 0, 0);
    return cv;
  }));
  return MASKS.get(key);
}

/* ============================================================ Overlays */

/**
 * Everything that is not a limb: eye lenses, ear pickups, neural traces, subdermal plating
 * and one marker per implant. o = { C, vis:Set, hot:Set(part keys), nodes:[{key, at, glyph}], t, torso }
 */
export function overlays(c, o) {
  const { C, vis, hot, t } = o;
  const g = (key, fn) => {
    const h = hot.has(key);
    c.save();
    c.strokeStyle = c.fillStyle = css(h ? C.accentHi : C.accent);
    c.lineWidth = h ? 1.4 : 1;
    c.shadowColor = css(C.accent); c.shadowBlur = h ? 10 : 3;
    fn(h);
    c.restore();
  };
  for (const k of ["eyeR", "eyeL"]) if (vis.has(k)) g(k, () => {
    const [x, y] = LOC[k];
    c.save(); c.fillStyle = css(C.bg); c.beginPath(); c.ellipse(x, y, 5.2, 3.6, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.beginPath(); c.ellipse(x, y, 5.2, 3.6, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.6; c.beginPath(); c.moveTo(x + (k === "eyeR" ? -5 : 5), y); c.lineTo(x + (k === "eyeR" ? -11 : 11), y - 2); c.stroke();
  });
  for (const k of ["earR", "earL"]) if (vis.has(k)) g(k, h => {
    const [x, y] = LOC[k], out = k === "earR" ? Math.PI : 0;
    c.beginPath(); c.roundRect(x - 2.5, y - 5, 5, 10, 2); c.stroke();
    for (let i = 1; i <= (h ? 3 : 2); i++) { c.globalAlpha = 1 - i * 0.25; c.beginPath(); c.arc(x, y, 3 + i * 4, out - 0.6, out + 0.6); c.stroke(); }
  });
  if (vis.has("neural")) g("neural", h => {
    c.beginPath(); c.roundRect(145, 17, 10, 8, 1.5); c.stroke();
    for (const [a, b] of [[[145, 21], [136, 21]], [[155, 21], [164, 21]], [[150, 17], [150, 11]], [[147, 25], [143, 30]], [[153, 25], [157, 30]]]) {
      c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
      c.beginPath(); c.arc(...b, 1.2, 0, Math.PI * 2); c.fill();
    }
    c.save(); c.setLineDash([2, 3]); c.lineDashOffset = -t * 16; c.globalAlpha = h ? 1 : 0.55;
    c.beginPath(); c.moveTo(150, 26); c.lineTo(150, 290); c.stroke(); c.restore();
  });
  if (vis.has("armor") && o.torso) g("armor", h => {
    c.save(); c.globalAlpha = h ? 0.75 : 0.3; c.shadowBlur = 0;
    c.drawImage(o.torso, 0, 0, BW, BH); c.restore();
  });
  for (const n of o.nodes) g(n.key, h => {
    const [x, y] = n.at;
    if (n.glyph === "tattoo") { c.beginPath(); for (let i = -3; i <= 3; i++) c.lineTo(x + (i % 2 ? 3 : -3), y + i * 5); c.stroke(); return; }
    if (n.glyph === "blades") { const L = h ? 22 : 6; for (const dx of [-3, 0, 3]) { c.beginPath(); c.moveTo(x + dx, y + 8); c.lineTo(x + dx * 1.3, y + 8 + L); c.stroke(); } }
    if (n.glyph === "thruster") {
      c.beginPath(); c.roundRect(x - 3.5, y - 10, 7, 20, 2); c.stroke();
      if (h) { c.globalAlpha = 0.6 + 0.3 * Math.sin(t * 9); c.beginPath(); c.moveTo(x - 3, y + 11); c.lineTo(x, y + 22); c.lineTo(x + 3, y + 11); c.fill(); }
      return;
    }
    // Generic implant marker: a small chip, with a pulse ring while hovered.
    c.save(); c.fillStyle = css(C.bg); c.beginPath(); c.roundRect(x - 3.2, y - 3.2, 6.4, 6.4, 1.2); c.fill(); c.restore();
    c.beginPath(); c.roundRect(x - 3.2, y - 3.2, 6.4, 6.4, 1.2); c.stroke();
    c.beginPath(); c.arc(x, y, 1.1, 0, Math.PI * 2); c.fill();
    if (h) { c.globalAlpha = 0.5; c.beginPath(); c.arc(x, y, 7 + (t * 8 % 4), 0, Math.PI * 2); c.stroke(); }
  });
}

/** Hex plating over chest and abdomen (Subdermal Armor and friends), for the main region. */
export function torsoPlating(region, C) {
  const key = `plating|${region.ss}|${C.accent}`;
  if (!MASKS.has(key)) MASKS.set(key, field(region).then(F => {
    const cv = new OffscreenCanvas(F.GW, F.GH), x = cv.getContext("2d");
    x.scale(F.ss, F.ss); x.strokeStyle = css(C.accent); x.lineWidth = 0.7;
    const r = 6;
    for (let y = 100; y < 260; y += r * 1.5) for (let xx = 100; xx < 200; xx += r * Math.sqrt(3)) {
      const cx = xx + (Math.round((y - 100) / (r * 1.5)) % 2 ? r * Math.sqrt(3) / 2 : 0);
      x.beginPath();
      for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; x.lineTo(cx + Math.cos(an) * r * 0.9, y + Math.sin(an) * r * 0.9); }
      x.closePath(); x.stroke();
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    const img = x.getImageData(0, 0, F.GW, F.GH), a = zi("chest"), b = zi("abdomen");
    for (let i = 0; i < F.GW * F.GH; i++) if (!(F.d[i] < -1.5 && (F.zone[i] === a || F.zone[i] === b))) img.data[i * 4 + 3] = 0;
    x.putImageData(img, 0, 0);
    return cv;
  }));
  return MASKS.get(key);
}
