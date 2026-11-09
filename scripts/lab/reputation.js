/**
 * Reputation on the Life tab (T290): the character's Rep and ledger from the system, plus the people
 * and factions that know them, each with a standing from -10 to +10 toward this character.
 *
 * People and factions live in one world setting (`reputation`), so the same faction is one entry on
 * every sheet. Only the GM changes it (players can't write world settings); players see the entries
 * shown to them on their own sheet. An entry is either per PC (`links[actorId] = { standing, hidden }`)
 * or synced (`sync`: one `standing`/`hidden` for every player character). Turning sync off brings the
 * per-PC values back.
 */

const MODULE_ID = "cpr-sheet-skin";
export const REP_SETTING = "reputation";
const TEMPLATES = `modules/${MODULE_ID}/templates/lab`;
const MIN = -10;
const MAX = 10;
const STEPS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
const LOG_SIZE = 10;
const DEFAULT_IMG = { person: "icons/svg/mystery-man.svg", faction: "icons/svg/combat.svg" };

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const esc = (s) => Handlebars.escapeExpression(s ?? "");
const clamp = (v) => Math.max(MIN, Math.min(MAX, Math.trunc(Number(v) || 0)));
export const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
/** Colour band of a standing, -3..3 (data-rep-tier in the templates): 7+, 4–6, 1–3, 0 and the same below zero. */
export const tier = (v) => Math.sign(v) * (v === 0 ? 0 : Math.abs(v) >= 7 ? 3 : Math.abs(v) >= 4 ? 2 : 1);

/* ------------------------------------------------------------------ Data */

export function registerReputationSetting(onChange) {
  game.settings.register(MODULE_ID, REP_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    name: "CPRSKIN.settings.reputation.name",
    hint: "CPRSKIN.settings.reputation.hint",
    default: { entities: {} },
    onChange: () => {
      onChange?.();
      for (const app of openApps) if (app.rendered) app.render();
    }
  });
}

function store() {
  return game.settings.get(MODULE_ID, REP_SETTING)?.entities ?? {};
}

/** Change the world's entries (GM only). `fn` gets a copy of the entities map to edit in place. */
async function mutate(fn) {
  if (!game.user.isGM) return;
  const entities = foundry.utils.deepClone(store());
  fn(entities);
  await game.settings.set(MODULE_ID, REP_SETTING, { entities });
}

/** Characters with a player owner: who a synced entry applies to. */
export function playerCharacters() {
  return game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const isPC = (actor) => actor?.type === "character" && actor.hasPlayerOwner;

/** This character's standing with an entry, or null when it isn't on their sheet. */
function standingOf(entity, actor) {
  if (entity.sync) return isPC(actor) ? { standing: entity.standing ?? 0, hidden: !!entity.hidden } : null;
  const link = entity.links?.[actor.id];
  return link ? { standing: link.standing ?? 0, hidden: !!link.hidden } : null;
}

function logChange(entity, actorId, from, to) {
  if (from === to) return;
  entity.log = [{ t: Date.now(), actor: actorId, from, to }, ...(entity.log ?? [])].slice(0, LOG_SIZE);
}

function segments(standing) {
  return STEPS.map((value) => ({
    value,
    tier: tier(value),
    on: value === 0 ? standing === 0 : standing > 0 ? value > 0 && value <= standing : value < 0 && value >= standing,
    current: value === standing
  }));
}

/* --------------------------------------------------------- Life tab block */

/** The Life tab's Reputation block for one sheet. */
export function reputationContext(sheet) {
  const actor = sheet.actor;
  const gm = game.user.isGM;
  const rep = Number(actor.system.reputation?.value) || 0;
  const cool = Number(actor.system.stats?.cool?.value) || 0;
  const ledger = (actor.system.reputation?.transactions ?? []).slice(-3).reverse()
    .map(([sentence, reason]) => ({ sentence, reason }));
  const people = Object.values(store())
    .map((e) => ({ e, s: standingOf(e, actor) }))
    .filter(({ s }) => s && (gm || !s.hidden))
    .map(({ e, s }) => ({
      id: e.id, name: e.name, img: e.img || DEFAULT_IMG[e.kind], kind: e.kind,
      standing: s.standing, tier: tier(s.standing), label: signed(s.standing), hidden: s.hidden, sync: !!e.sync
    }))
    .sort((a, b) => Math.abs(b.standing) - Math.abs(a.standing) || a.name.localeCompare(b.name));
  return {
    value: rep,
    pips: Array.from({ length: 10 }, (_, i) => i < rep),
    facedown: cool + rep,
    facedownTip: game.i18n.format("CPRSKIN.lab.rep.facedownTip", { cool, rep }),
    ledger,
    ledgerCount: actor.system.reputation?.transactions?.length ?? 0,
    people,
    gm
  };
}

export function activateReputation(sheet, root) {
  const block = root.querySelector(".cprlab-rep");
  if (!block) return;
  for (const tile of block.querySelectorAll("[data-lab-rep-entity]")) {
    tile.addEventListener("click", (event) => {
      event.preventDefault();
      openEntity(tile.dataset.labRepEntity, sheet.actor);
    });
  }
  block.querySelector("[data-lab-rep-add]")?.addEventListener("click", (event) => {
    event.preventDefault();
    openAdd(sheet.actor);
  });
  const drop = block.querySelector("[data-lab-rep-drop]");
  if (drop && game.user.isGM) {
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("drop-target");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drop-target"));
    drop.addEventListener("drop", async (event) => {
      // The sheet's own drop handler would treat this as a drop on the character.
      event.preventDefault();
      event.stopPropagation();
      drop.classList.remove("drop-target");
      const prefill = await prefillFromDrop(TextEditor.getDragEventData(event));
      if (prefill) openAdd(sheet.actor, prefill);
    });
  }
}

/** Name, image and kind from a dropped Actor or Journal Entry. */
async function prefillFromDrop(data) {
  if (!["Actor", "JournalEntry"].includes(data?.type) || !data.uuid) return null;
  const doc = await fromUuid(data.uuid);
  if (!doc) return null;
  const actor = data.type === "Actor";
  return { uuid: doc.uuid, name: doc.name, img: actor ? doc.img : "", kind: actor ? "person" : "faction" };
}

/* --------------------------------------------------------------- Windows */

const openApps = new Set();

function themeClasses() {
  const theme = game.modules.get(MODULE_ID).api.getPrefs().theme;
  return ["cprskin", `cprskin-theme-${theme}`, "cprlab-rep-app"];
}

class RepApp extends HandlebarsApplicationMixin(ApplicationV2) {
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    openApps.add(this);
  }

  _onClose(options) {
    super._onClose(options);
    openApps.delete(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Follow the user's sheet theme (it can change while the window is open).
    this.element.classList.remove("cprskin-theme-hq", "cprskin-theme-gold");
    this.element.classList.add(...themeClasses());
  }
}

/** One person or faction, as it stands toward one character. */
class ReputationEntityApp extends RepApp {
  constructor(entityId, actor, options = {}) {
    super({ ...options, id: `cprlab-rep-${entityId}-${actor.id}` });
    this.entityId = entityId;
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    classes: ["cprlab-rep-entity"],
    window: { icon: "fa-solid fa-user-group", resizable: false },
    position: { width: 460, height: "auto" },
    actions: {
      setStanding: ReputationEntityApp.#setStanding,
      step: ReputationEntityApp.#step,
      setOther: ReputationEntityApp.#setOther,
      toggleSync: ReputationEntityApp.#toggleSync,
      toggleHidden: ReputationEntityApp.#toggleHidden,
      setKind: ReputationEntityApp.#setKind,
      pickImage: ReputationEntityApp.#pickImage,
      openLinked: ReputationEntityApp.#openLinked,
      removeHere: ReputationEntityApp.#removeHere,
      deleteAll: ReputationEntityApp.#deleteAll,
      addOthers: ReputationEntityApp.#addOthers
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/reputation-entity.hbs` } };

  get title() {
    return this.entity?.name ?? game.i18n.localize("CPRSKIN.lab.rep.title");
  }

  get entity() {
    return store()[this.entityId];
  }

  async _prepareContext() {
    const e = this.entity;
    const gm = game.user.isGM;
    if (!e) return { missing: true };
    const s = standingOf(e, this.actor) ?? { standing: 0, hidden: false };
    const linked = e.uuid ? fromUuidSync(e.uuid) : null;
    const others = e.sync ? [] : Object.entries(e.links ?? {})
      .filter(([id]) => id !== this.actor.id)
      .map(([id, link]) => ({ id, name: game.actors.get(id)?.name ?? "?", standing: link.standing ?? 0, tier: tier(link.standing ?? 0), label: signed(link.standing ?? 0), hidden: !!link.hidden }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const names = (id) => (id ? game.actors.get(id)?.name ?? "?" : game.i18n.localize("CPRSKIN.lab.rep.allPCs"));
    return {
      gm,
      e,
      img: e.img || DEFAULT_IMG[e.kind],
      kindLabel: game.i18n.localize(`CPRSKIN.lab.rep.kind.${e.kind}`),
      actorName: this.actor.name,
      standing: s.standing,
      tier: tier(s.standing),
      label: signed(s.standing),
      hidden: s.hidden,
      segs: segments(s.standing),
      canStep: { down: s.standing > MIN, up: s.standing < MAX },
      linked: linked ? { name: linked.name, canOpen: linked.testUserPermission(game.user, "OBSERVER") } : null,
      others,
      missingPCs: gm && !e.sync ? playerCharacters().filter((a) => !e.links?.[a.id]).length : 0,
      log: gm ? (e.log ?? []).map((l) => ({
        date: new Date(l.t).toLocaleDateString(),
        who: names(l.actor),
        from: signed(l.from), to: signed(l.to), toTier: tier(l.to)
      })) : []
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;
    // Text fields save on change; the world setting then re-renders the window.
    for (const input of this.element.querySelectorAll("[data-field]")) {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        const value = input.value.trim();
        mutate((all) => { if (all[this.entityId]) all[this.entityId][field] = value; });
      });
    }
  }

  static async #setStanding(_event, target) {
    const to = clamp(target.dataset.value);
    await setStanding(this.entityId, this.actor.id, to);
  }

  static async #step(_event, target) {
    const s = standingOf(this.entity, this.actor);
    if (s) await setStanding(this.entityId, this.actor.id, clamp(s.standing + Number(target.dataset.step)));
  }

  static async #setOther(_event, target) {
    const e = this.entity;
    const id = target.closest("[data-actor-id]")?.dataset.actorId;
    const link = e?.links?.[id];
    if (link) await setStanding(this.entityId, id, clamp((link.standing ?? 0) + Number(target.dataset.step)));
  }

  static async #toggleSync() {
    const actorId = this.actor.id;
    await mutate((all) => {
      const e = all[this.entityId];
      if (!e) return;
      if (e.sync) {
        // Back to per PC: the stored per-PC values, and this sheet keeps the shared value if it had none.
        e.links ??= {};
        e.links[actorId] ??= { standing: e.standing ?? 0, hidden: !!e.hidden };
        e.sync = false;
      } else {
        const here = e.links?.[actorId];
        e.standing = here?.standing ?? 0;
        e.hidden = !!here?.hidden;
        e.sync = true;
      }
    });
  }

  static async #toggleHidden(_event, target) {
    const id = target.closest("[data-actor-id]")?.dataset.actorId ?? this.actor.id;
    await mutate((all) => {
      const e = all[this.entityId];
      if (!e) return;
      if (e.sync) e.hidden = !e.hidden;
      else if (e.links?.[id]) e.links[id].hidden = !e.links[id].hidden;
    });
  }

  static async #setKind(_event, target) {
    const kind = target.dataset.kind;
    await mutate((all) => { if (all[this.entityId] && DEFAULT_IMG[kind]) all[this.entityId].kind = kind; });
  }

  static #pickImage() {
    const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    new Picker({
      type: "image",
      current: this.entity?.img,
      callback: (path) => mutate((all) => { if (all[this.entityId]) all[this.entityId].img = path; })
    }).browse();
  }

  static #openLinked() {
    const doc = this.entity?.uuid ? fromUuidSync(this.entity.uuid) : null;
    if (doc?.testUserPermission(game.user, "OBSERVER")) doc.sheet.render(true);
  }

  static async #removeHere() {
    await mutate((all) => { delete all[this.entityId]?.links?.[this.actor.id]; });
    this.close();
  }

  static async #deleteAll() {
    const e = this.entity;
    if (!e) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CPRSKIN.lab.rep.deleteAll") },
      content: `<p>${game.i18n.format("CPRSKIN.lab.rep.deleteConfirm", { name: esc(e.name) })}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await mutate((all) => { delete all[this.entityId]; });
    this.close();
  }

  static #addOthers() {
    openAdd(this.actor, null, this.entityId);
  }
}

/** Set a standing: the shared one for a synced entry, else this character's. */
async function setStanding(entityId, actorId, to) {
  await mutate((all) => {
    const e = all[entityId];
    if (!e) return;
    if (e.sync) {
      logChange(e, null, e.standing ?? 0, to);
      e.standing = to;
    } else if (e.links?.[actorId]) {
      logChange(e, actorId, e.links[actorId].standing ?? 0, to);
      e.links[actorId].standing = to;
    }
  });
}

/**
 * Add a person or faction (GM): a new one by name, from a dropped Actor or Journal Entry, or one already
 * tracked on other sheets, to any number of player characters at once.
 */
class ReputationAddApp extends RepApp {
  constructor(actor, prefill = null, focusId = null, options = {}) {
    super({ ...options, id: "cprlab-rep-add" });
    this.actor = actor;
    this.form = {
      kind: prefill?.kind ?? "person", name: prefill?.name ?? "", img: prefill?.img ?? "", uuid: prefill?.uuid ?? null,
      sub: "", standing: 0, sync: false, shown: true
    };
    this.pcs = new Set(actor ? [actor.id] : []);
    this.search = "";
    this.focusId = focusId ?? (prefill?.uuid ? Object.values(store()).find((e) => e.uuid === prefill.uuid)?.id : null);
    // Previously tracked starts folded, unless the window was opened for one of its entries.
    this.showTracked = !!this.focusId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["cprlab-rep-add"],
    window: { icon: "fa-solid fa-user-plus", title: "CPRSKIN.lab.rep.addTitle", resizable: true },
    position: { width: 620, height: "auto" },
    actions: {
      setKind: ReputationAddApp.#setKind,
      setStanding: ReputationAddApp.#setStanding,
      pickImage: ReputationAddApp.#pickImage,
      togglePC: ReputationAddApp.#togglePC,
      allPCs: ReputationAddApp.#allPCs,
      create: ReputationAddApp.#create,
      addExisting: ReputationAddApp.#addExisting,
      clearLink: ReputationAddApp.#clearLink,
      toggleTracked: ReputationAddApp.#toggleTracked
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/reputation-add.hbs`, scrollable: [".cprlab-rep-tracked-list"] } };

  async _prepareContext() {
    const f = this.form;
    const pcs = playerCharacters();
    // The sheet's own character, even when it has no player owner (an NPC on this sheet).
    if (this.actor && !pcs.some((a) => a.id === this.actor.id)) pcs.unshift(this.actor);
    const term = this.search.toLowerCase();
    const tracked = Object.values(store())
      .filter((e) => !term || e.name.toLowerCase().includes(term))
      .sort((a, b) => (b.id === this.focusId) - (a.id === this.focusId) || a.name.localeCompare(b.name))
      .map((e) => {
        const on = e.sync ? pcs.map((a) => a.id) : Object.keys(e.links ?? {});
        const missing = [...this.pcs].filter((id) => !on.includes(id));
        return {
          id: e.id, name: e.name, img: e.img || DEFAULT_IMG[e.kind], sync: !!e.sync, focus: e.id === this.focusId,
          kindLabel: game.i18n.localize(`CPRSKIN.lab.rep.kind.${e.kind}`),
          scope: e.sync ? game.i18n.localize("CPRSKIN.lab.rep.allPCs")
            : on.map((id) => game.actors.get(id)?.name).filter(Boolean).join(", ") || "—",
          canAdd: !e.sync && missing.length > 0,
          done: e.sync || missing.length === 0
        };
      });
    return {
      f,
      img: f.img || DEFAULT_IMG[f.kind],
      linked: f.uuid ? fromUuidSync(f.uuid)?.name ?? f.name : null,
      segs: segments(f.standing),
      tier: tier(f.standing),
      label: signed(f.standing),
      pcs: pcs.map((a) => ({ id: a.id, name: a.name, img: a.img, checked: this.pcs.has(a.id) })),
      selectedCount: this.pcs.size,
      tracked,
      search: this.search,
      showTracked: this.showTracked,
      trackedCount: Object.keys(store()).length,
      canCreate: !!f.name.trim() && (f.sync || this.pcs.size > 0)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    // Keep typed values across re-renders (the world setting re-renders open windows).
    for (const input of el.querySelectorAll("[data-form]")) {
      const key = input.dataset.form;
      input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
        this.form[key] = input.type === "checkbox" ? input.checked : input.value;
        if (input.type === "checkbox") return this.render();
        const create = el.querySelector("[data-action='create']");
        if (create) create.disabled = !this.form.name.trim() || (!this.form.sync && !this.pcs.size);
      });
    }
    const search = el.querySelector("[data-search]");
    search?.addEventListener("input", foundry.utils.debounce(() => {
      this.search = search.value;
      this.render();
    }, 200));
    // Drop an Actor or Journal Entry anywhere on the window to link it.
    el.addEventListener("dragover", (event) => event.preventDefault());
    el.addEventListener("drop", async (event) => {
      event.preventDefault();
      const prefill = await prefillFromDrop(TextEditor.getDragEventData(event));
      if (!prefill) return;
      const existing = Object.values(store()).find((e) => e.uuid === prefill.uuid);
      if (existing) {
        this.focusId = existing.id;
        this.showTracked = true;
      }
      else Object.assign(this.form, prefill);
      this.render();
    });
  }

  /** Re-render without losing the caret in the search field. */
  async render(...args) {
    const searching = !!this.element?.querySelector?.("[data-search]:focus");
    const out = await super.render(...args);
    const search = searching ? this.element.querySelector("[data-search]") : null;
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
    return out;
  }

  static #setKind(_event, target) {
    this.form.kind = target.dataset.kind;
    this.render();
  }

  static #setStanding(_event, target) {
    this.form.standing = clamp(target.dataset.value);
    this.render();
  }

  static #pickImage() {
    const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    new Picker({
      type: "image",
      current: this.form.img,
      callback: (path) => {
        this.form.img = path;
        this.render();
      }
    }).browse();
  }

  static #togglePC(_event, target) {
    const id = target.dataset.actorId;
    if (this.pcs.has(id)) this.pcs.delete(id);
    else this.pcs.add(id);
    this.render();
  }

  static #allPCs() {
    const all = playerCharacters().map((a) => a.id);
    const every = all.every((id) => this.pcs.has(id));
    this.pcs = new Set(every ? [] : all);
    this.render();
  }

  static #toggleTracked() {
    this.showTracked = !this.showTracked;
    this.render();
  }

  static #clearLink() {
    this.form.uuid = null;
    this.render();
  }

  static async #create() {
    const f = this.form;
    const name = f.name.trim();
    if (!name || (!f.sync && !this.pcs.size)) return;
    const id = foundry.utils.randomID();
    const standing = clamp(f.standing);
    const hidden = !f.shown;
    await mutate((all) => {
      all[id] = {
        id, kind: f.kind, name, img: f.img, uuid: f.uuid, sub: f.sub.trim(), note: "", gmNote: "",
        sync: !!f.sync, standing, hidden,
        links: f.sync ? {} : Object.fromEntries([...this.pcs].map((pc) => [pc, { standing, hidden }])),
        log: []
      };
    });
    ui.notifications.info(game.i18n.format("CPRSKIN.lab.rep.created", { name }));
    this.close();
  }

  static async #addExisting(_event, target) {
    const id = target.closest("[data-entity-id]")?.dataset.entityId;
    const standing = clamp(this.form.standing);
    const hidden = !this.form.shown;
    await mutate((all) => {
      const e = all[id];
      if (!e || e.sync) return;
      e.links ??= {};
      for (const pc of this.pcs) e.links[pc] ??= { standing, hidden };
    });
  }
}

export function openEntity(entityId, actor) {
  if (!store()[entityId]) return;
  const id = `cprlab-rep-${entityId}-${actor.id}`;
  const open = [...openApps].find((app) => app.id === id);
  if (open) return open.bringToFront();
  new ReputationEntityApp(entityId, actor).render(true);
}

export function openAdd(actor, prefill = null, focusId = null) {
  if (!game.user.isGM) return;
  for (const app of openApps) if (app instanceof ReputationAddApp) app.close();
  new ReputationAddApp(actor, prefill, focusId).render(true);
}
