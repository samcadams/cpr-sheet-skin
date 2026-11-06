/**
 * CPR Sheet Skin
 *
 * An opt-in character sheet for Cyberpunk RED (scripts/lab/sheet.js, picked
 * per actor in Sheet Configuration) with per-user themes and view options.
 * It extends the system's sheet, so the system's listeners and data are used
 * as they are; the system itself is never changed.
 */

import { registerMenus, settingsGroups } from "./settings.js";

const MODULE_ID = "cpr-sheet-skin";
const SETTING = "prefs";
const UI_SETTING = "labUI";
const CLASS_PREFIX = "cprskin";

const OPTIONS = {
  theme: ["hq", "gold"],
  scale: ["90", "100", "115", "130"],
  skills: ["dice", "table"],
  skillGroup: ["category", "stat", "alpha"],
  hideZero: ["show", "hide"],
  pinned: ["top", "inline"],
  role: ["cards", "compact"],
  dock: ["right", "off"],
  vitals: ["compact", "cards"],
  effectsBar: ["on", "off"],
  cyberView: ["body", "list"],
  cyberItems: ["rows", "tiles"],
};

const DEFAULTS = {
  theme: "hq", scale: "100",
  skills: "dice", skillGroup: "category", hideZero: "show", pinned: "top",
  role: "cards", dock: "right", vitals: "compact", effectsBar: "on",
  cyberView: "body", cyberItems: "rows",
};

/** The sheet's class, once registered (see init). */
let SkinSheet = null;

/** Window width the sheet is designed for, at 100% text size. */
const SHEET_WIDTH = 1120;

function isSkinSheet(app) {
  return !!SkinSheet && app instanceof SkinSheet;
}

function getPrefs() {
  const stored = game.settings.get(MODULE_ID, SETTING) ?? {};
  const prefs = { ...DEFAULTS };
  for (const [key, values] of Object.entries(OPTIONS)) {
    if (values.includes(stored[key])) prefs[key] = stored[key];
  }
  return prefs;
}

/** Swap this module's classes on one sheet window for the current prefs. */
function applySkin(app) {
  const el = app.element?.[0];
  if (!el) return;
  for (const cls of [...el.classList]) {
    if (cls === CLASS_PREFIX || cls.startsWith(`${CLASS_PREFIX}-`)) el.classList.remove(cls);
  }
  const prefs = getPrefs();
  el.classList.add(CLASS_PREFIX, `${CLASS_PREFIX}-theme-${prefs.theme}`, `${CLASS_PREFIX}-scale-${prefs.scale}`);

  // Each text size needs its own window width. Resize only when it changes,
  // so a width the user dragged to survives re-renders.
  const previous = el.dataset.cprskinScale ?? "100";
  el.dataset.cprskinScale = prefs.scale;
  if (previous !== prefs.scale) app.setPosition({ width: Math.round(SHEET_WIDTH * (Number(prefs.scale) / 100)) });
}

function applyToOpenSheets() {
  for (const app of Object.values(ui.windows)) {
    if (isSkinSheet(app)) app.render(false);
  }
}

/** Change one option (used by the sheet's quick switches, incl. the theme switch by Eurobucks). */
async function setPref(key, value) {
  if (!OPTIONS[key]?.includes(value)) return;
  await game.settings.set(MODULE_ID, SETTING, { ...getPrefs(), [key]: value });
}

/** Options for a sheet toolbar: {{#each (cprskinChoices "skills")}}. */
function choices(key) {
  const current = getPrefs()[key];
  return (OPTIONS[key] ?? []).map((value) => ({
    value,
    label: game.i18n.localize(`CPRSKIN.${key}.${value}`),
    active: value === current,
  }));
}

/**
 * Small per-user sheet UI state (open/collapsed panels). Unlike prefs,
 * changing it doesn't re-render sheets: the sheet toggles its own classes.
 */
function getUI() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, UI_SETTING) ?? {});
}

async function setUI(key, value) {
  await game.settings.set(MODULE_ID, UI_SETTING, { ...getUI(), [key]: value });
}

Hooks.once("init", async () => {
  game.settings.register(MODULE_ID, SETTING, {
    scope: "client",
    config: false,
    type: Object,
    name: "CPRSKIN.settings.prefs.name",
    hint: "CPRSKIN.settings.prefs.hint",
    default: { ...DEFAULTS },
    onChange: applyToOpenSheets,
  });
  game.settings.register(MODULE_ID, UI_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    name: "CPRSKIN.settings.labUI.name",
    hint: "CPRSKIN.settings.labUI.hint",
    default: {},
  });
  const world = (key, type, def, redraw = true) => game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: false,
    type,
    name: `CPRSKIN.settings.${key}.name`,
    hint: `CPRSKIN.settings.${key}.hint`,
    default: def,
    ...(redraw ? { onChange: applyToOpenSheets } : {}),
  });
  world("autoTrackArmor", Boolean, true, false);
  world("humanityStrip", Boolean, true);
  world("humanityLabels", Object, {});
  world("execTeam", Boolean, true);
  world("hiddenEffects", String, "Agent, Flashlight");
  registerMenus();

  game.modules.get(MODULE_ID).api = { getPrefs, setPref, choices, getUI, setUI };
  Hooks.once("i18nInit", () => {
    game.modules.get(MODULE_ID).api.settings = { groups: settingsGroups() };
  });
  Handlebars.registerHelper("cprskinChoices", (key) => choices(key));

  // The sheet imports the system's sheet class; load it on its own so a
  // system change that breaks it only logs an error.
  try {
    ({ default: SkinSheet } = await import("./lab/sheet.js"));
    Actors.registerSheet(MODULE_ID, SkinSheet, {
      types: ["character"],
      label: "CPRSKIN.lab.sheetLabel",
      makeDefault: false,
    });
    await loadTemplates(["header", "skills", "role", "fight", "lifepath", "dock", "gear", "cyber", "cyber-body", "effects"]
      .map((name) => `modules/${MODULE_ID}/templates/lab/${name}.hbs`));
  } catch (err) {
    console.error(`${MODULE_ID} | sheet unavailable`, err);
  }
});

/**
 * Armor is tracked (what damage ablates, what the token shows) as soon as it
 * is equipped, on every location it covers. When tracked armor is taken off,
 * the best other equipped armor for that location takes over. Runs only on
 * the client that made the change.
 */
async function trackArmor(item) {
  if (!game.settings.get(MODULE_ID, "autoTrackArmor")) return;
  const actor = item.actor;
  if (item.type !== "armor" || typeof actor?.updateTrackedArmor !== "function") return;
  const sys = item.system;
  const equipped = sys.equipped === "equipped";
  const locations = [["head", sys.isHeadLocation], ["body", sys.isBodyLocation], ["shield", sys.isShield]];
  for (const [location, covers] of locations) {
    if (!covers) continue;
    const key = `currentArmor${location.charAt(0).toUpperCase()}${location.slice(1)}`;
    const tracked = actor.system.externalData?.[key]?.id;
    if (equipped && tracked !== item.id) {
      await actor.updateTrackedArmor(location, item.id);
    } else if (!equipped && tracked === item.id) {
      const sp = (a) => (location === "shield" ? Number(a.system.shieldHitPoints?.max) : Number(a.system[`${location}Location`]?.sp)) || 0;
      const next = actor.getEquippedArmors(location).filter((a) => a.id !== item.id).sort((a, b) => sp(b) - sp(a))[0];
      await actor.updateTrackedArmor(location, next?.id ?? null);
    }
  }
}

Hooks.on("updateItem", (item, change, _options, userId) => {
  if (userId === game.user.id && foundry.utils.hasProperty(change, "system.equipped")) trackArmor(item);
});
Hooks.on("createItem", (item, _options, userId) => {
  if (userId === game.user.id && item.system?.equipped === "equipped") trackArmor(item);
});

Hooks.on("renderActorSheet", (app) => {
  if (isSkinSheet(app)) applySkin(app);
});
