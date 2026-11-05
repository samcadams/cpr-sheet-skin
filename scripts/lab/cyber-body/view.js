/**
 * Cyber tab body view (templates/lab/cyber-body.hbs): installed cyberware in two
 * columns around a body, 2077-style. Hovering an item draws a line to the exact
 * spot on the body and lights it up; face implants open a zoom lens over the head.
 *
 * cyberBodyContext() builds the template data from the Cyber tab's groups
 * (gear.js) and the placement rules (place.js). BodyView draws on one canvas
 * that covers the whole stage; the columns and readouts stay plain HTML, so the
 * system's own listeners (item-view, item-edit, install-remove-cyberware, ...)
 * keep working on them. While the stage is on screen it animates all the time
 * (scan sweep, drifting motes, a rare glitch, mouse parallax), at ~30 fps when
 * nothing is hovered and the camera has settled.
 */
import { BW, BH, LOC, HEAD, isHeadPoint, image, zoneMask, overlays, torsoPlating, palette, css } from "./model.js";
import { place, spotName, handFlag } from "./place.js";

const MODULE_ID = "cpr-sheet-skin";
const L = key => game.i18n.localize(key);
const T = key => L(`CPRSKIN.lab.cyberBody.${key}`);

/** Which column each cyberware type goes in (head things left, body things right). */
const COLUMNS = {
  L: ["neuralWare", "cyberEye", "cyberAudioSuite", "fashionware"],
  R: ["cyberwareInternal", "cyberwareExternal", "cyberArm", "cyberLeg", "borgware"]
};
const MAIN = { x: 0, y: 0, w: BW, h: BH, ss: 2 };
const ZOOM = 2.4;
/** The body is drawn this much larger than "fits the stage"; the feet take most of the crop. */
const CAMERA_ZOOM = 1.07;
/** Parallax shift in stage pixels at full mouse deflection: farther layers move less. */
const DEPTH = { grid: 5, bones: 9, body: 14 };
/** Scan sweep: a BAND-unit tall band crosses the body in SCAN_TIME s, every SCAN_EVERY s. */
const BAND = 46, SCAN_TIME = 3.2, SCAN_EVERY = 7;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)");

/* ============================================================== Context */

/**
 * @param {ActorSheet} sheet
 * @param {object} cyber  data.lab.gear.cyber (groups of rows, see gear.js cyberTab)
 */
export function cyberBodyContext(sheet, cyber) {
  const actor = sheet.actor;
  const types = Handlebars.helpers.cprFindConfigObj("cyberwareTypes", { hash: {} }) ?? {};
  const groupsByType = new Map(cyber.groups.map(g => [g.type, g]));

  // Installed items in the order the tab walks them (parents before their options).
  const items = [];
  for (const g of cyber.groups) for (const row of g.rows) {
    const item = actor.items.get(row.id);
    if (!item) continue;
    const parent = actor.items.get(row.installationId);
    items.push({
      id: row.id, name: item.name,
      type: item.type === "cyberware" ? item.system.type : "other",
      found: !!row.foundational && row.depth === 0 && !g.core,
      parent: parent && !parent.system.core ? parent.id : null,
      flag: handFlag(item)
    });
  }
  const placed = place(items);
  const byId = new Map(items.map(i => [i.id, i]));
  const sideTag = id => (placed.at[id].side && !/\((l|r|left|right)\)/i.test(byId.get(id).name) ? ` (${T(placed.at[id].side)})` : "");

  const readouts = [], cols = { L: [], R: [] };
  for (const side of ["L", "R"]) {
    const sideTypes = [...COLUMNS[side], ...(side === "R" ? Object.keys(types).filter(t => !COLUMNS.L.includes(t) && !COLUMNS.R.includes(t)) : [])];
    for (const type of sideTypes) {
      const g = groupsByType.get(type) ?? { type, label: L(types[type] ?? type), rows: [], slots: null };
      const chunks = [];
      const rows = g.rows.map(r => ({
        ...r, label: r.name + sideTag(r.id), found: r.depth === 0 && r.foundational && !g.core,
        opt: r.depth > 0 || !!g.core
      }));
      for (const row of rows) {
        if (!chunks.length || row.found) chunks.push({ rows: [], free: 0 });
        chunks.at(-1).rows.push(row);
      }
      for (const ch of chunks) {
        const slots = g.core ? g.slots : ch.rows[0].slots;
        const free = slots ? Math.max(0, slots.max - slots.used) : 0;
        ch.freeCount = free;
        ch.free = Array.from({ length: Math.min(free, Math.max(free ? 1 : 0, 4 - ch.rows.length)) });
        ch.freeTip = game.i18n.format("CPRSKIN.lab.cyberBody.freeSlots", { n: free });
        ch.first = ch.rows[0].id;
      }
      const used = g.core ? g.slots : null;
      cols[side].push({
        type, label: g.label, slots: used, chunks,
        rows,
        empty: !g.rows.length
      });
      for (const row of g.rows) {
        const item = actor.items.get(row.id), at = placed.at[row.id], parent = actor.items.get(row.installationId);
        const hl = item.system.humanityLoss;
        readouts.push({
          id: row.id, img: row.img, name: row.name + sideTag(row.id), desc: row.desc, actions: row.actions, tags: row.tags,
          group: g.label,
          role: row.foundational && row.depth === 0 && !g.core ? T("foundational")
            : parent && !parent.system.core ? game.i18n.format("CPRSKIN.lab.cyberBody.optionIn", { name: parent.name }) : "",
          hl: hl ? `${hl.roll ?? ""}${hl.static ? ` (${hl.static})` : ""}` : "",
          spot: at.at.map(spotName).join(" + "), how: at.how,
          canPlace: sheet.isEditable && item.isOwner
        });
      }
    }
  }

  return {
    cols, readouts,
    json: JSON.stringify({
      items: items.map(i => ({ id: i.id, found: i.found, parent: i.parent, ...placed.at[i.id] })),
      vis: [...placed.vis], chrome: [...placed.chrome]
    })
  };
}

/* ============================================================ Listeners */

export function activateCyberBody(sheet, root) {
  sheet._cyberBody?.destroy();
  sheet._cyberBody = null;
  const stage = root.querySelector("[data-cb-stage]");
  if (stage) sheet._cyberBody = new BodyView(sheet, root, stage);
}

class BodyView {
  constructor(sheet, root, stage) {
    this.sheet = sheet;
    this.root = root;
    this.stage = stage;
    this.canvas = stage.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.data = JSON.parse(stage.dataset.cbStage);
    this.byId = new Map(this.data.items.map(i => [i.id, i]));
    this.tiles = stage.dataset.cbLayout !== "rows";
    this.vis = new Set(this.data.vis);
    this.chrome = new Set(this.data.chrome);
    this.nodes = this.data.items.filter(i => i.node).flatMap(i => i.pts.map(at => ({ key: i.part, at, glyph: i.glyph })));
    this.els = new Map([...stage.querySelectorAll("[data-cb-id]")].map(e => [e.dataset.cbId, e]));
    this.rows = [...stage.querySelectorAll("[data-cb-row]")];
    this.hover = null;
    this.selected = sheet._cyberSelected && this.byId.has(sheet._cyberSelected) ? sheet._cyberSelected : null;
    this.pick = null;
    this.pickAt = null;
    this.C = palette(stage);
    this.img = null; this.headImg = null; this.plating = null; this.masks = {};
    this.raf = 0;
    this.cam = { x: 0, y: 0, tx: 0, ty: 0 };
    this.visible = true;
    this.motes = Array.from({ length: 28 }, (_, i) => ({ x: Math.random(), y: Math.random(), v: 0.015 + Math.random() * 0.03, ph: i * 2.4, r: 0.6 + Math.random() * 0.9 }));

    this._load();
    this.scroller = stage.closest(".cprlab-body");
    this.observer = new ResizeObserver(() => this.fit() || this.layout());
    this.observer.observe(stage);
    if (this.scroller) this.observer.observe(this.scroller);
    // Animate only while the stage is on screen (another tab, a minimized sheet: stop).
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.animate(); });
    this.io.observe(stage);
    this._bind();
    this.showReadout();
    this.animate();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.io.disconnect();
    document.removeEventListener("keydown", this._onKey, true);
    this.win?.removeEventListener("mousemove", this._onMouse);
    this.win?.removeEventListener("mouseleave", this._onMouseOut);
  }

  async _load() {
    // The theme class goes on the window after listeners run (renderActorSheet): read colours a frame later.
    await new Promise(r => requestAnimationFrame(r));
    if (this.dead) return;
    this.C = palette(this.stage);
    const C = this.C, hex = `#${C.accentHi.map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    this.body = await image(MAIN, C, this.chrome);
    this.boneBuf = new OffscreenCanvas(this.body.flesh.width, this.body.flesh.height);
    this.bandBuf = new OffscreenCanvas(this.body.flesh.width, Math.ceil(BAND * MAIN.ss));
    this.img = this.body.flesh;
    if (this.vis.has("armor")) this.plating = await torsoPlating(MAIN, C);
    for (const z of this.chrome) this.masks[z] = await zoneMask(MAIN, z, hex);
    if (this.dead) return;
    this.draw();
    // The zoom lens's sharper head, ready before anyone hovers a face implant.
    if (this.data.items.some(i => i.pts.some(isHeadPoint))) {
      this.headImg = await image({ x: HEAD.x, y: HEAD.y, w: HEAD.w, h: HEAD.h, ss: 6 }, C, this.chrome);
      if (!this.dead) this.draw();
    }
  }

  _bind() {
    const s = this.stage;
    const idOf = e => e.target.closest?.("[data-cb-id]")?.dataset.cbId ?? null;
    s.addEventListener("mouseover", e => { const id = idOf(e); if (id !== this.hover) this.setHover(id); });
    s.addEventListener("mouseleave", () => this.setHover(null));
    s.addEventListener("focusin", e => this.setHover(idOf(e)));
    s.addEventListener("focusout", () => this.setHover(null));
    s.addEventListener("click", e => {
      if (this.pick) return this._pickClick(e);
      const id = idOf(e);
      if (!id) return;
      this.selected = this.selected === id ? null : id;
      this.sheet._cyberSelected = this.selected;
      this.showReadout();
      this.draw();
    });
    s.addEventListener("dblclick", e => { const id = idOf(e); if (id) this.sheet.actor.items.get(id)?.sheet.render(true); });
    s.addEventListener("keydown", e => {
      const id = idOf(e);
      if (id && e.key === "Enter") { e.preventDefault(); this.sheet.actor.items.get(id)?.sheet.render(true); }
      if (id && e.key === " ") { e.preventDefault(); this.selected = this.selected === id ? null : id; this.showReadout(); this.draw(); }
    });
    s.addEventListener("mousemove", e => { if (this.pick) this._pickMove(e); });
    s.addEventListener("contextmenu", e => {
      if (!this.pick) return;
      e.preventDefault();
      this.sheet.actor.items.get(this.pick)?.unsetFlag(MODULE_ID, "body");
      this.endPick();
    });
    for (const b of this.root.querySelectorAll("[data-cb-place]")) {
      b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this.startPick(b.closest("[data-cb-read]").dataset.cbRead); });
    }
    this._onKey = e => {
      if (!this.stage.isConnected) return this.destroy();
      if (e.key === "Escape" && this.pick) { e.stopPropagation(); this.endPick(); }
    };
    document.addEventListener("keydown", this._onKey, true);
    // Parallax: the camera follows the mouse anywhere over the sheet window.
    this.win = this.sheet.element?.[0] ?? this.root;
    this._onMouse = e => {
      const r = this.stage.getBoundingClientRect(), w = this.win.getBoundingClientRect();
      const clamp = v => Math.max(-1, Math.min(1, v));
      this.cam.tx = clamp((e.clientX - (r.left + r.width / 2)) / (w.width / 2 || 1));
      this.cam.ty = clamp((e.clientY - (r.top + r.height / 2)) / (w.height / 2 || 1));
      this.animate();
    };
    this._onMouseOut = () => { this.cam.tx = 0; this.cam.ty = 0; };
    this.win.addEventListener("mousemove", this._onMouse);
    this.win.addEventListener("mouseleave", this._onMouseOut);
  }

  setHover(id) {
    if (this.pick) return;
    this.hover = id && this.byId.has(id) ? id : null;
    this.showReadout();
    this.animate();
  }

  /** Show the readout of the hovered item, else the selected one, else the hint. */
  showReadout() {
    const id = this.hover ?? this.selected ?? "";
    for (const r of this.root.querySelectorAll("[data-cb-read]")) r.hidden = r.dataset.cbRead !== id;
    for (const [k, el] of this.els) el.classList.toggle("selected", k === this.selected);
  }

  /* ------------------------------------------------------- Placement */

  startPick(id) {
    this.pick = id; this.hover = id;
    this.stage.classList.add("picking");
    this.stage.querySelector("[data-cb-pickbar]")?.replaceChildren(document.createTextNode(
      game.i18n.format("CPRSKIN.lab.cyberBody.placeHint", { name: this.sheet.actor.items.get(id)?.name ?? "" })), Object.assign(document.createElement("small"), { textContent: T("placeKeys") }));
    this.animate();
  }
  endPick() {
    this.pick = null; this.pickAt = null;
    this.stage.classList.remove("picking");
    this.draw();
  }
  _spotAt(e) {
    const r = this.stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 16;
    for (const [k, p] of Object.entries(LOC)) { const q = this.toStage(p), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  _pickMove(e) { this.pickAt = this._spotAt(e); }
  async _pickClick(e) {
    e.preventDefault();
    const spot = this._spotAt(e), id = this.pick;
    if (!spot) return;
    this.endPick();
    await this.sheet.actor.items.get(id)?.setFlag(MODULE_ID, "body.at", spot);
  }

  /* ---------------------------------------------------------- Layout */

  /**
   * Make stage + readout fill the tab's visible height (the tab scrolls; the
   * readout should not be below the fold). Returns true when it changed the
   * height (the observer then lays out again).
   */
  fit() {
    const sc = this.scroller, read = this.root.querySelector(".cprlab-cb-readouts");
    if (!sc || !sc.clientHeight || !this.stage.offsetParent) return false;
    const top = this.stage.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    const pad = parseFloat(getComputedStyle(sc).paddingBottom) || 0;
    const h = Math.max(460, Math.floor(sc.clientHeight - top - (read?.offsetHeight ?? 0) - pad - 14));
    if (Math.abs(h - this.stage.offsetHeight) < 2) return false;
    this.stage.style.height = `${h}px`;
    return true;
  }

  layout() {
    const r = this.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width || !r.height) return;
    this.W = r.width; this.H = r.height;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fit = (this.H - 16) / 612;
    this.s = fit * CAMERA_ZOOM;
    this.ox0 = this.W / 2 - (BW / 2) * this.s;
    this.oy0 = 6 - 612 * (this.s - fit) * 0.1; // zoom in towards the feet: the head stays in view
    this.ox = this.ox0; this.oy = this.oy0;
    this.draw();
  }
  /** Body space -> stage pixels. The body faces the viewer: the character's right is on the viewer's left. */
  toStage(p) { return [this.ox + p[0] * this.s, this.oy + p[1] * this.s]; }
  rel(el) {
    const a = el.getBoundingClientRect(), b = this.stage.getBoundingClientRect();
    return { l: a.left - b.left, r: a.right - b.left, t: a.top - b.top, b: a.bottom - b.top, cy: (a.top + a.bottom) / 2 - b.top };
  }
  sideOf(el) { return el.closest(".cprlab-cb-col")?.dataset.side === "L" ? "L" : "R"; }
  route(el, A) {
    const r = this.rel(el), side = this.sideOf(el);
    const S = side === "L" ? [r.r + 3, r.cy] : [r.l - 3, r.cy];
    const bus = side === "L" ? Math.max(S[0] + 12, Math.min(A[0] - 24, S[0] + 34)) : Math.min(S[0] - 12, Math.max(A[0] + 24, S[0] - 34));
    return [S, [bus, S[1]], A];
  }
  /** The zoom lens over the head: centre and radius on the stage, and the body -> lens mapping. */
  lens() {
    const R = Math.min(84, this.W * 0.14), c = this.toStage([HEAD.cx, HEAD.cy]);
    const cx = c[0], cy = Math.max(R + 4, c[1] + 6), k = this.s * ZOOM;
    return { R, cx, cy, k, map: p => [cx + (p[0] - HEAD.cx) * k, cy + (p[1] - HEAD.cy) * k] };
  }

  /* ------------------------------------------------------------ Draw */

  get still() { return !!REDUCED_MOTION?.matches; }

  animate() {
    if (this.raf || this.dead) return;
    const loop = ms => {
      this.raf = 0;
      if (this.dead || !this.stage.isConnected) return this.destroy();
      const cam = this.cam, dt = Math.min(0.1, (ms - (this.lastMs ?? ms)) / 1000);
      const settled = Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.002;
      const busy = this.hover || this.pick || !this.img || !settled;
      // Idle (only the shimmer moves): ~30 fps is plenty.
      if (busy || ms - (this.lastMs ?? 0) > 31) {
        const k = 1 - Math.exp(-dt * 5);
        cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k;
        this.lastMs = ms;
        this.draw(ms / 1000);
      }
      if (this.visible && (busy || !this.still)) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  draw(t = performance.now() / 1000) {
    if (!this.W || this.dead) return;
    const { ctx: c, C, W, H, s } = this;
    c.clearRect(0, 0, W, H);
    const accent = a => css(C.accent, a), still = this.still;

    // Camera: each layer shifts against the mouse, nearer layers more (parallax).
    const cx = still ? 0 : this.cam.x, cy = still ? 0 : this.cam.y * 0.65;
    this.ox = this.ox0 - cx * DEPTH.body; this.oy = this.oy0 - cy * DEPTH.body;

    // Backdrop: a softly breathing glow, a faint grid and drifting motes behind the body.
    const [mx, my] = this.toStage([150, 300]);
    const g = c.createRadialGradient(mx, my, 10, mx, my, 320 * s);
    g.addColorStop(0, accent(0.08 + (still ? 0 : 0.025 * Math.sin(t * 0.9)))); g.addColorStop(1, accent(0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.strokeStyle = accent(0.04); c.lineWidth = 1;
    const gox = this.ox0 - cx * DEPTH.grid, goy = -cy * DEPTH.grid;
    const gx0 = gox - 50, gx1 = gox + (BW + 50) * s;
    c.beginPath();
    for (let x = gx0; x < gx1; x += 16) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = (goy % 16) - 16; y < H; y += 16) { c.moveTo(gx0, y); c.lineTo(gx1, y); }
    c.stroke();
    if (!still) for (const m of this.motes) {
      const y = H - ((m.y * H + t * m.v * H) % H), x = gx0 + m.x * (gx1 - gx0) + Math.sin(t * 0.5 + m.ph) * 6;
      c.fillStyle = accent((0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.1 + m.ph))) * Math.min(1, y / 60));
      c.fillRect(x, y, m.r * 1.5, m.r * 1.5);
    }
    c.restore();

    if (!this.img) {
      // Still building the body: a scan line sweeps the stage.
      const y = (t * 140) % H;
      const sg = c.createLinearGradient(0, y - 40, 0, y);
      sg.addColorStop(0, accent(0)); sg.addColorStop(1, accent(0.25));
      c.fillStyle = sg; c.fillRect(gx0, y - 40, gx1 - gx0, 40);
      c.fillStyle = accent(0.8); c.font = "11px monospace"; c.textAlign = "center";
      c.fillText(T("scanning").toUpperCase(), mx, my);
      return;
    }

    const hov = this.hover ? this.byId.get(this.hover) : null, hot = new Set();
    if (hov) { hot.add(hov.part); if (hov.found) this.data.items.filter(k => k.parent === hov.id).forEach(k => hot.add(k.part)); }
    const lensOn = !!hov && hov.pts.every(isHeadPoint) && this.headImg;

    // Dim leader lines: one per tile row, or one per item in the row layout.
    c.save(); c.lineWidth = 1;
    if (this.tiles) {
      for (const row of this.rows) {
        const it = this.byId.get(row.dataset.cbRow);
        if (!it) continue;
        const p = this.route(row, this.toStage(it.pts[0]));
        c.strokeStyle = accent(0.26); this.stroke(p);
        c.fillStyle = accent(0.6); c.fillRect(p[0][0] - 2, p[0][1] - 2, 4, 4);
      }
    } else {
      c.strokeStyle = css(C.muted, 0.22);
      for (const it of this.data.items) for (const a of it.pts) { const el = this.els.get(it.id); if (el) this.stroke(this.route(el, this.toStage(a))); }
    }
    c.restore();

    // The body.
    c.save();
    c.translate(this.ox, this.oy); c.scale(s, s);
    c.globalAlpha = still ? 1 : 0.93 + 0.05 * Math.sin(t * 1.7) + 0.02 * Math.sin(t * 23);
    c.drawImage(this.img, 0, 0, BW, BH);
    // The bones sit deeper than the skin: they lag behind its parallax shift, clipped to the flesh.
    const bones = this.boneBuf, b = bones.getContext("2d"), ss = MAIN.ss, lag = (DEPTH.body - DEPTH.bones) / s;
    b.clearRect(0, 0, bones.width, bones.height);
    b.drawImage(this.body.bones, cx * lag * ss, cy * lag * ss);
    b.globalCompositeOperation = "destination-in"; b.drawImage(this.body.sil, 0, 0); b.globalCompositeOperation = "source-over";
    c.drawImage(bones, 0, 0, BW, BH);
    c.globalAlpha = 1;
    if (!still) this.shimmer(c, t);
    for (const z of hot) if (this.masks[z]) {
      c.save(); c.globalAlpha = 0.34 + 0.08 * Math.sin(t * 4); c.globalCompositeOperation = "lighter";
      c.drawImage(this.masks[z], 0, 0, BW, BH); c.restore();
    }
    for (const [rx, a] of [[70, 0.3], [95, 0.14]]) { c.strokeStyle = accent(a); c.lineWidth = 1 / s; c.beginPath(); c.ellipse(150, 600, rx, rx * 0.15, 0, 0, Math.PI * 2); c.stroke(); }
    overlays(c, { C, vis: this.vis, hot, nodes: this.nodes, t, torso: this.plating });
    if (this.pick) {
      for (const [k, p] of Object.entries(LOC)) {
        const on = k === this.pickAt;
        c.strokeStyle = css(C.accentHi, on ? 1 : 0.6); c.lineWidth = (on ? 1.6 : 0.8);
        c.beginPath(); c.arc(...p, on ? 5 : 3.2, 0, Math.PI * 2); c.stroke();
      }
    }
    c.restore();
    if (this.pick && this.pickAt) {
      const p = this.toStage(LOC[this.pickAt]);
      c.fillStyle = css(C.accentHi); c.font = "12px Signika, sans-serif"; c.textAlign = "left";
      c.fillText(spotName(this.pickAt), p[0] + 10, p[1] - 8);
    }

    // Zoom lens over the head while a face implant is hovered.
    let lens = null;
    if (lensOn) {
      lens = this.lens();
      c.save();
      c.beginPath(); c.arc(lens.cx, lens.cy, lens.R, 0, Math.PI * 2);
      c.fillStyle = css(C.bg, 0.96); c.fill(); c.clip();
      c.translate(lens.cx, lens.cy); c.scale(lens.k, lens.k); c.translate(-HEAD.cx, -HEAD.cy);
      c.drawImage(this.headImg.flesh, HEAD.x, HEAD.y, HEAD.w, HEAD.h);
      c.drawImage(this.headImg.bones, HEAD.x, HEAD.y, HEAD.w, HEAD.h);
      overlays(c, { C, vis: this.vis, hot, nodes: this.nodes.filter(n => isHeadPoint(n.at)), t, torso: null });
      c.restore();
      c.save();
      c.strokeStyle = accent(0.9); c.lineWidth = 1.2; c.shadowColor = accent(1); c.shadowBlur = 8;
      c.beginPath(); c.arc(lens.cx, lens.cy, lens.R, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0; c.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.arc(lens.cx, lens.cy, lens.R + 4, a - 0.18, a + 0.18); c.stroke(); }
      c.fillStyle = accent(0.9); c.font = "10px monospace"; c.textAlign = "center";
      c.fillText(game.i18n.format("CPRSKIN.lab.cyberBody.zoom", { z: ZOOM }), lens.cx, lens.cy + lens.R + 14);
      c.restore();
    }

    // The hovered item: a bright line with a travelling pulse to each of its spots.
    for (const [k, el] of this.els) el.classList.toggle("hot", k === this.hover);
    if (!hov) return;
    const el = this.els.get(hov.id);
    if (!el) return;
    const from = this.tiles ? el.closest("[data-cb-row]") ?? el : el;
    if (this.tiles) {
      const r = this.rel(el);
      c.save(); c.strokeStyle = accent(1); c.lineWidth = 2; c.shadowColor = accent(1); c.shadowBlur = 8;
      c.beginPath(); c.moveTo(r.l + 4, r.b + 3); c.lineTo(r.r - 4, r.b + 3); c.stroke(); c.restore();
    }
    for (const a of hov.pts) {
      const A = lens && isHeadPoint(a) ? lens.map(a) : this.toStage(a);
      const p = this.route(from, A);
      c.save();
      c.strokeStyle = accent(1); c.shadowColor = accent(1); c.shadowBlur = 10; c.lineWidth = 1.6; this.stroke(p);
      c.shadowBlur = 0; c.strokeStyle = css(C.accentHi); c.lineWidth = 0.8; this.stroke(p);
      const len = p.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
      c.fillStyle = css(C.accentHi); c.shadowColor = css(C.accentHi); c.shadowBlur = 12;
      c.beginPath(); c.arc(...this.pointAt(p, (t * 220) % len), 2.4, 0, Math.PI * 2); c.fill();
      const r = 9 + Math.sin(t * 5) * 1.2;
      c.shadowBlur = 6; c.strokeStyle = css(C.accentHi); c.lineWidth = 1.1;
      c.translate(...A); c.rotate(t * 1.5);
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, r, k * Math.PI / 2 + 0.3, k * Math.PI / 2 + 1.25); c.stroke(); }
      c.restore();
    }
  }

  /**
   * Idle life on the body (c is in body space): a scan band sweeps down every few seconds,
   * a ring pulses out from the feet, and now and then a thin slice glitches sideways.
   */
  shimmer(c, t) {
    const C = this.C, ss = MAIN.ss;
    const ph = (t % SCAN_EVERY) / SCAN_TIME;
    if (ph < 1) {
      const y0 = -20 + ph * (BH + BAND) - BAND, buf = this.bandBuf, b = buf.getContext("2d");
      b.clearRect(0, 0, buf.width, buf.height);
      b.drawImage(this.img, 0, -y0 * ss);
      b.drawImage(this.boneBuf, 0, -y0 * ss);
      b.globalCompositeOperation = "source-in";
      const g = b.createLinearGradient(0, 0, 0, buf.height);
      g.addColorStop(0, css(C.accentHi, 0)); g.addColorStop(0.85, css(C.accentHi, 0.45));
      g.addColorStop(0.97, css(C.accentHi, 0.9)); g.addColorStop(1, css(C.accentHi, 0));
      b.fillStyle = g; b.fillRect(0, 0, buf.width, buf.height);
      b.globalCompositeOperation = "source-over";
      c.save(); c.globalCompositeOperation = "lighter"; c.drawImage(buf, 0, y0, BW, BAND); c.restore();
    }
    const rp = (t % 4) / 4, rx = 40 + rp * 80;
    c.save(); c.strokeStyle = css(C.accent, 0.35 * (1 - rp)); c.lineWidth = 1 / this.s;
    c.beginPath(); c.ellipse(150, 600, rx, rx * 0.15, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    // A glitch: for 0.15 s every 9 s, a random thin slice of the body jumps sideways.
    const n = Math.floor(t / 9);
    if (t - n * 9 < 0.15) {
      const r = k => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const y = 40 + r(1) * 520, h = 6 + r(2) * 14, dx = (r(3) - 0.5) * 10;
      c.save(); c.globalAlpha = 0.55; c.globalCompositeOperation = "lighter";
      c.drawImage(this.img, 0, y * ss, this.img.width, h * ss, dx, y, BW, h); c.restore();
    }
  }

  stroke(p) { const c = this.ctx; c.beginPath(); c.moveTo(...p[0]); for (const q of p.slice(1)) c.lineTo(...q); c.stroke(); }
  pointAt(p, d) {
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= l) { const t = d / l; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
      d -= l;
    }
    return p.at(-1);
  }
}
