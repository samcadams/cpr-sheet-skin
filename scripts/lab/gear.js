/**
 * Skin sheet: Gear and Cyber tabs.
 *
 * gearContext() adds what templates/lab/gear.hbs and cyber.hbs need to the
 * sheet data (as data.lab.gear); activateGear() binds their extra controls.
 * The system's own listeners still handle every control that keeps the
 * system's classes and data-* attributes (item-action, item-edit, item-view,
 * item-create, expand-button, repair, install-remove-cyberware,
 * uninstall-single-item, gear-amount-input). Only the equip state control and
 * the "show" filter pills are handled here.
 */

import { grenadeAction } from "./grenades.js";

const SYS = "cyberpunk-red-core";

/** This file's strings, from lang/en.json (CPRSKIN.lab.gear.*). */
const STRINGS = new Proxy({}, { get: (_t, key) => game.i18n.localize(`CPRSKIN.lab.gear.${String(key)}`) });

const EQUIP_STATES = [
  { value: "owned", icon: "fa-solid fa-box-archive", label: () => STRINGS.stashed, hint: () => STRINGS.stashedHint },
  { value: "carried", icon: "fa-solid fa-suitcase", label: () => L("CPR.global.equipState.carried"), hint: () => STRINGS.carriedHint },
  { value: "equipped", icon: "fa-solid fa-hand", label: () => L("CPR.global.equipState.equipped"), hint: () => STRINGS.equippedHint }
];

/** Gear list order within a category (after pinned items). */
const STATE_ORDER = { equipped: 0, carried: 1, owned: 2 };

/** Core cyberware foundations the system never lets you uninstall. */
const CORE_FOUNDATION_TYPES = ["fashionware", "cyberwareInternal", "cyberwareExternal"];

const L = key => game.i18n.localize(key);
const helper = (name, ...args) => Handlebars.helpers[name](...args, { hash: {} });
const mixins = type => CONFIG.Item.dataModels[type]?.mixins ?? [];
const hasMixin = (type, mixin) => mixins(type).includes(mixin);
const upgraded = (item, base, key) => helper("cprApplyUpgrade", item, base, key);
const plain = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const configLabel = (obj, key) => (key ? L(helper("cprFindConfigValue", obj, key) ?? key) : "");

/** The system shows "+" only when players may create items; a GM always may. */
const canCreateItems = () => game.user.isGM || !!game.settings.get(SYS, "playersCreateInventory");

/** cpr-hq's gear upkeep (Breaking Your Stuff maintenance), when that module is active. */
const upkeepApi = () => (game.modules.get("cpr-hq")?.active ? game.modules.get("cpr-hq").api?.upkeep ?? null : null);
/** Upkeep states that want the player's attention. */
const needsAttention = s => !!s && (["due", "neglected", "pending"].includes(s.state) || !!s.condition || !!s.malfunction);

/**
 * Small clickable tags for an item's upkeep: malfunction, condition, check due, neglected, due. A condition the GM
 * hides from players isn't in the status they get; the GM sees its tags dashed, with an eye-slash.
 */
function upkeepTags(item) {
  const s = upkeepApi()?.status(item);
  if (!needsAttention(s)) return [];
  const tip = s.summary.replace(/\n/g, "<br>");
  const tag = (cls, icon, label, secret = false) => ({
    cls: `uk ${cls} ${secret && s.hidden ? "uk-hidden" : ""}`, icon: secret && s.hidden ? "fa-solid fa-eye-slash" : icon, label, tip, upkeep: true
  });
  const tags = [];
  if (s.malfunction) tags.push(tag("uk-bad", "fa-solid fa-triangle-exclamation", STRINGS.ukMalfunction, true));
  if (s.beyondRepair) tags.push(tag("uk-dead", "fa-solid fa-skull", STRINGS.ukBeyond, true));
  else if (s.destroyed) tags.push(tag("uk-dead", "fa-solid fa-burst", STRINGS.ukDestroyed, true));
  else if (s.damaged) tags.push(tag("uk-bad", "fa-solid fa-heart-crack", STRINGS.ukDamaged, true));
  if (s.state === "pending") tags.push(tag("uk-info", "fa-solid fa-dice-d10", STRINGS.ukCheck));
  else if (s.state === "neglected") tags.push(tag("uk-alert", "fa-solid fa-toolbox", STRINGS.ukNeglected));
  else if (s.state === "due") tags.push(tag("uk-warn", "fa-solid fa-toolbox", STRINGS.ukDue));
  return tags;
}

/** The upkeep button in a row's actions (tracked items only). */
function upkeepAction(item) {
  const s = upkeepApi()?.status(item);
  if (!s) return null;
  return { cls: `cprlab-upkeep-act ${needsAttention(s) ? "uk-on" : ""}`, icon: "fa-solid fa-toolbox", tip: `${STRINGS.upkeep}: ${s.label}` };
}

/** Items the system shows nested inside their parent, never as their own gear row. */
const hiddenInGear = item => ["cyberware", "itemUpgrade", "program"].includes(item.type) && item.system.isInstalled;

/* ================================================================ Gear */

/** @param {ActorSheet} sheet  @param {object} data  the sheet's getData() result */
export function gearContext(sheet, data) {
  const actor = sheet.actor;
  return {
    ...gearTab(sheet, actor),
    cyber: cyberTab(sheet, actor),
    upkeep: upkeepStrips(actor)
  };
}

/**
 * Upkeep strips for the Fight cards and the Actions dock, by item id: the same tags as the Gear tab, plus the text
 * of a running malfunction (that's when it matters). Only items with something to show.
 */
function upkeepStrips(actor) {
  if (!upkeepApi()) return {};
  const out = {};
  for (const item of actor.items) {
    if (!["weapon", "armor", "cyberware"].includes(item.type)) continue;
    const tags = upkeepTags(item);
    if (!tags.length) continue;
    out[item.id] = { tags, malfunction: upkeepApi().status(item)?.malfunction?.text ?? "" };
  }
  return out;
}

function gearTab(sheet, actor) {
  const filter = sheet.options.cprContentFilter;
  const collapsedSections = sheet.options.collapsedSections ?? [];
  const show = sheet._labGearShow ?? "all";
  const canCreate = canCreateItems();
  const categories = helper("cprFindConfigObj", "inventoryCategories");

  const counts = { owned: 0, carried: 0, equipped: 0 };
  const sections = [];
  const empty = [];

  for (const [type, labelKey] of Object.entries(categories)) {
    const all = (actor.itemTypes[type] ?? []).filter(i => !hiddenInGear(i));
    for (const item of all) if (item.system.equipped in counts) counts[item.system.equipped] += 1;
    if (!all.length) {
      if (canCreate) empty.push({ type, label: L(labelKey) });
      continue;
    }
    const collapsed = collapsedSections.includes(`gearTab-${type}`);
    const rows = all
      .filter(i => helper("cprSheetContentFilter", filter, i.name))
      .filter(i => show === "all" || (show === "upkeep" ? needsAttention(upkeepApi()?.status(i)) : i.system.equipped === show))
      // Pinned first, then equipped, carried, stashed; A-Z within each.
      .sort((a, b) => (!!b.system.favorite - !!a.system.favorite)
        || (STATE_ORDER[a.system.equipped] ?? 0) - (STATE_ORDER[b.system.equipped] ?? 0)
        || a.name.localeCompare(b.name, game.i18n.lang))
      .map(i => gearRow(actor, i, collapsed));
    if (!rows.length) continue;
    sections.push({ type, label: L(labelKey), id: `gearTab-${type}`, collapsed, rows, count: rows.length });
  }

  const showPills = [
    { value: "all", label: STRINGS.all, active: show === "all" },
    ...EQUIP_STATES.map(s => ({ value: s.value, icon: s.icon, label: s.label(), hint: s.hint(), count: counts[s.value], active: show === s.value }))
  ];
  // Upkeep: everything that needs maintenance, a check, or is Damaged (uninstalled cyberware included).
  const upkeep = upkeepApi();
  if (upkeep) {
    // Count only what the filter lists: installed cyberware, upgrades and programs have no Gear row.
    const listed = Object.keys(categories).flatMap(type => actor.itemTypes[type] ?? []).filter(i => !hiddenInGear(i));
    const count = listed.filter(i => needsAttention(upkeep.status(i))).length;
    if (count || show === "upkeep") {
      showPills.push({ value: "upkeep", icon: "fa-solid fa-toolbox", label: STRINGS.upkeep, hint: STRINGS.upkeepHint, count, active: show === "upkeep", cls: "uk-pill" });
    }
  }

  return {
    sections, empty, canCreate, showPills, show,
    none: !sections.length,
    text: {
      show: STRINGS.show,
      addEmpty: STRINGS.addEmpty,
      addEmptyHint: STRINGS.addEmptyHint,
      nothing: STRINGS.nothing
    }
  };
}

function gearRow(actor, item, collapsed) {
  const sys = item.system;
  const equippable = hasMixin(item.type, "equippable") && item.type !== "itemUpgrade";
  const row = {
    id: item.id,
    type: item.type,
    name: item.name,
    img: item.img,
    favorite: !!sys.favorite,
    hidden: collapsed && !sys.favorite,
    upgraded: !!sys.isUpgraded,
    desc: plain(sys.description?.value),
    state: equippable ? sys.equipped : null,
    equip: equippable ? EQUIP_STATES.map(s => ({ value: s.value, icon: s.icon, label: s.label(), hint: s.hint(), active: sys.equipped === s.value })) : null,
    stackable: hasMixin(item.type, "stackable"),
    amount: Number(sys.amount) || 0,
    single: (Number(sys.amount) || 0) <= 1,
    stats: [],
    actions: [],
    upkeep: upkeepAction(item),
    upgrades: null,
    installed: []
  };

  switch (item.type) {
    case "weapon": weaponStats(item, row); break;
    case "armor": armorStats(actor, item, row); break;
    case "ammo":
      row.stats.push({ value: configLabel("ammoVarieties", sys.variety) });
      if (sys.type) row.stats.push({ value: configLabel("ammoTypes", sys.type) });
      break;
    case "cyberware": {
      row.stats.push({ value: configLabel("cyberwareTypes", sys.type) });
      const hl = hlStat(item);
      if (hl.value !== "0") row.stats.push(hl);
      break;
    }
    case "cyberdeck": {
      const max = upgraded(item, sys.installedItems.slots, "slots");
      row.stats.push({ label: L("CPR.global.generic.slots"), value: `${sys.installedItems.usedSlots ?? 0}/${max}` });
      break;
    }
    case "program":
      if (sys.class) row.stats.push({ value: configLabel("programClassList", sys.class) });
      break;
    case "itemUpgrade":
      row.stats.push({ value: `${configLabel("objectTypes", sys.type)} ${L("CPR.global.itemTypes.itemUpgrade")}` });
      break;
    case "vehicle":
      row.stats.push({ label: L("CPR.characterSheet.rightPane.vehicle.seats"), value: upgraded(item, sys.seats, "seats") });
      row.stats.push({ label: L("CPR.characterSheet.rightPane.vehicle.sdp"), value: upgraded(item, sys.sdp, "sdp") });
      row.stats.push({ label: L("CPR.characterSheet.rightPane.vehicle.combatSpeed"), value: upgraded(item, sys.speedCombat, "speedCombat") });
      break;
    case "netarch":
      row.stats.push({ label: L("CPR.netArchitecture.floor.floors"), value: helper("cprSizeOf", sys.floors) });
      break;
    default:
      break;
  }

  row.actions = gearActions(item);
  // Upkeep status icons sit in the toolbox column; the toolbox takes their place on hover.
  row.ukTags = upkeepTags(item);
  if (item.type === "weapon" && sys.isRanged) magazineActions(item, row);
  // MMuton's Better Grenades: Throw is an icon button first in the actions (like Install); a launcher's Fire keeps its label.
  const grenade = grenadeAction(item);
  if (grenade?.action === "throw") row.actions.unshift({ ...grenade, label: null });
  else if (grenade) row.grenadeFire = grenade;
  if (sys.installedItems?.list?.length && typeof item.getInstalledItems === "function") {
    // Loaded ammo keeps its own row in the Ammo section, so it isn't repeated under the weapon.
    row.installed = item.getInstalledItems().filter(child => child.type !== "ammo").map(child => ({
      id: child.id,
      parent: item.id,
      name: child.name,
      typeLabel: L(`TYPES.Item.${child.type}`),
      tags: upkeepTags(child),
      icon: child.type === "program" ? "fa-folder-minus" : "fa-arrow-right-from-bracket"
    }));
  }
  // Manage upgrades sits in front of the installed items; with nothing installed it stays with the row's actions.
  if (upgradeAction(actor, item)) {
    const button = { cls: "item-action", icon: "fab fa-superpowers", tip: L("CPR.actorSheets.commonActions.manageUpgrades"), actionType: "manage-upgrades", on: !!sys.isUpgraded };
    if (row.installed.length) row.upgrades = button;
    else row.actions.unshift(button);
  }
  return row;
}

function weaponStats(item, row) {
  const sys = item.system;
  row.stats.push({ label: L("CPR.global.generic.damage"), value: upgraded(item, sys.damage, "damage") });
  row.stats.push({ label: L("CPR.itemSheet.weapon.rof"), value: upgraded(item, sys.rof, "rof") });
  if (sys.isRanged) {
    const max = Number(upgraded(item, sys.magazine.max, "magazine")) || 0;
    const value = Number(sys.magazine.value) || 0;
    const ammo = sys.loadedAmmo;
    row.stats.push({
      mag: true,
      label: L("CPR.itemSheet.weapon.magazine"),
      value: `${value}/${max}`,
      tip: ammo ? `${STRINGS.loaded}: ${ammo.name}` : STRINGS.empty,
      cls: value === 0 ? "bad" : value < max ? "warn" : ""
    });
  }
}

function armorStats(actor, item, row) {
  const sys = item.system;
  const loc = (on, base, ablation, key, label) => {
    if (!on) return;
    const max = Number(upgraded(item, base, key)) || 0;
    const value = Math.max(0, max - (Number(ablation) || 0));
    row.stats.push({
      label: L(label),
      value: `${value}/${max}`,
      tip: `${L(label)} SP ${value}/${max}${ablation ? ` (${L("CPR.global.generic.ablation")} ${ablation})` : ""}`,
      cls: value < max ? "warn" : "",
      bar: max ? Math.round((value / max) * 100) : 0
    });
  };
  loc(sys.isHeadLocation, sys.headLocation.sp, sys.headLocation.ablation, "headSp", "CPR.global.location.head");
  loc(sys.isBodyLocation, sys.bodyLocation.sp, sys.bodyLocation.ablation, "bodySp", "CPR.global.location.body");
  if (sys.isShield) {
    const max = Number(upgraded(item, sys.shieldHitPoints.max, "shieldHp")) || 0;
    const value = Number(sys.shieldHitPoints.value) || 0;
    row.stats.push({ label: L("CPR.global.generic.shield"), value: `${value}/${max}`, cls: value < max ? "warn" : "", bar: max ? Math.round((value / max) * 100) : 0 });
  }
}

function hlStat(item) {
  const hl = item.system.humanityLoss ?? {};
  const roll = hl.roll && hl.roll !== "0" ? hl.roll : "";
  return {
    label: STRINGS.hlShort,
    value: roll || String(hl.static ?? 0),
    tip: `${L("CPR.dialog.installCyberware.humanityLoss")}: ${roll ? `${roll} / ` : ""}${L("CPR.chat.humanityLoss.static")} ${hl.static ?? 0}`,
    cls: "hl"
  };
}

/** Reload, then change ammo, right of the magazine value. */
function magazineActions(item, row) {
  const sys = item.system;
  const mag = row.stats.find(s => s.mag);
  if (!mag) return;
  const max = Number(upgraded(item, sys.magazine.max, "magazine")) || 0;
  mag.after = [{ cls: "item-action", icon: "fas fa-arrow-right-arrow-left", tip: L("CPR.actorSheets.commonActions.changeAmmo"), action: "select-ammo" }];
  if ((Number(sys.magazine.value) || 0) < max) mag.after.unshift({ cls: "item-action", icon: "fas fa-rotate-right", tip: L("CPR.actorSheets.commonActions.reload"), action: "reload-ammo" });
}

/**
 * One button per action, in a fixed order; each keeps the system's class and data-* so its listener runs.
 * Actions that can't be done right now (armor not worn, nothing to repair) aren't rendered.
 * Reload/change ammo, upkeep and manage upgrades are placed elsewhere in the row (see gearRow).
 */
function gearActions(item) {
  const sys = item.system;
  const a = [];
  const add = (cls, icon, tip, extra = {}) => a.push({ cls, icon, tip, ...extra });

  if (item.type === "armor") {
    // The system's .ablate hits every equipped armor at its data-location (like the header's SP), so equipped armor
    // gets one per location it covers, tracked or not.
    if (sys.equipped === "equipped") {
      const locs = [["head", sys.isHeadLocation], ["body", sys.isBodyLocation], ["shield", sys.isShield]].filter(([, on]) => on).map(([loc]) => loc);
      for (const loc of locs) {
        const where = L(loc === "shield" ? "CPR.global.generic.shield" : `CPR.global.location.${loc}`);
        add("ablate", "fas fa-shield-halved", `${L("CPR.actorSheets.fightActions.ablateArmor")} (${where})`, { location: loc });
      }
    }
    const ablated = Number(sys.headLocation?.ablation) > 0 || Number(sys.bodyLocation?.ablation) > 0
      || (sys.isShield && Number(sys.shieldHitPoints.value) < Number(upgraded(item, sys.shieldHitPoints.max, "shieldHp")));
    if (ablated) add("repair", "fas fa-screwdriver-wrench", L("CPR.actorSheets.commonActions.repair"));
  }
  if (item.type === "cyberware") add("install-remove-cyberware", "fas fa-microchip", L("CPR.global.generic.install"), { prop: "system.isInstalled", strong: true });
  if (item.type === "cyberdeck") add("item-action", "fa-solid fa-folder-plus", L("CPR.actorSheets.commonActions.managePrograms"), { actionType: "manage-programs" });
  if (item.type === "drug") add("item-action", "fas fa-pills", L("CPR.global.generic.snort"), { actionType: "snort" });
  if (["itemUpgrade", "cyberdeck"].includes(item.type)) {
    if (sys.isInstalled) add("item-action", "fas fa-arrow-right-from-bracket", L("CPR.actorSheets.commonActions.uninstallFromItem"), { actionType: "uninstall-item", on: true });
    else add("item-action", "fas fa-right-to-bracket", L("CPR.actorSheets.commonActions.installIntoItem"), { actionType: "install-item" });
  }
  if (hasMixin(item.type, "stackable") && Number(sys.amount) > 1) add("item-action cprlab-hover-act", "fas fa-scissors", L("CPR.actorSheets.commonActions.splitItem"), { actionType: "split" });
  // Split, pin, edit and delete show only while the row is hovered (cprlab-hover-act).
  add("item-action cprlab-hover-act", "fas fa-thumbtack", L("CPR.actorSheets.commonActions.togglePin"), { actionType: "favorite", on: !!sys.favorite });
  add("item-edit cprlab-hover-act", "fas fa-pen-to-square", STRINGS.edit);
  add("item-action cprlab-hover-act", "fas fa-trash-can", L("CPR.actorSheets.commonActions.deleteItem"), { actionType: "delete", danger: true });
  return a;
}

/** Same rule as the system's cpr-actions.hbs: upgraded, or a free upgrade of this type exists. */
function upgradeAction(actor, item) {
  if (!helper("cprIsUpgradable", item)) return false;
  if (item.system.isUpgraded) return true;
  return actor.itemTypes.itemUpgrade.some(u => u.system.type === item.type && !u.system.isInstalled);
}

/* =============================================================== Cyber */

function cyberTab(sheet, actor) {
  const filter = sheet.options.cprContentFilter;
  const match = item => helper("cprSheetContentFilter", filter, item.name);
  const types = helper("cprFindConfigObj", "cyberwareTypes");
  const groups = new Map(Object.keys(types).map(t => [t, { type: t, label: L(types[t]), rows: [], slots: null }]));

  const foundations = (actor.system.installedItems?.list ?? []).map(id => actor.items.get(id)).filter(Boolean);
  let installedCount = 0;

  const walk = (item, depth, group, out) => {
    for (const child of item.getInstalledItems?.() ?? []) {
      if (child.type === "cyberware") installedCount += 1;
      if (match(child)) out.push(cyberRow(actor, child, depth));
      walk(child, depth + 1, group, out);
    }
  };

  for (const f of foundations) {
    if (f.type !== "cyberware") continue;
    const group = groups.get(f.system.type) ?? groups.set(f.system.type, { type: f.system.type, label: f.system.type, rows: [] }).get(f.system.type);
    if (f.system.core) {
      // Internal/External/Fashionware placeholders: only their options are shown, the slots go on the group title.
      group.slots = slotInfo(f);
      group.core = true;
      walk(f, 0, group, group.rows);
    } else {
      installedCount += 1;
      const kids = [];
      walk(f, 1, group, kids);
      if (match(f) || kids.length) group.rows.push(cyberRow(actor, f, 0), ...kids);
    }
  }

  const uninstalled = actor.itemTypes.cyberware
    .filter(i => !i.system.isInstalled && match(i))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
    .map(i => {
      const row = cyberRow(actor, i, 0);
      row.installed = false;
      row.actions = [
        { cls: "install-remove-cyberware", icon: "fas fa-microchip", tip: L("CPR.global.generic.install"), prop: "system.isInstalled", strong: true },
        { cls: "item-edit", icon: "fas fa-pen-to-square", tip: STRINGS.edit },
        { cls: "item-action", icon: "fas fa-trash-can", tip: L("CPR.actorSheets.commonActions.deleteItem"), actionType: "delete", danger: true }
      ];
      return row;
    });

  return {
    groups: [...groups.values()].filter(g => g.rows.length),
    uninstalled,
    installedCount,
    capReduction: capReduction(actor),
    canCreate: canCreateItems(),
    text: { none: STRINGS.noCyber, notInstalled: STRINGS.notInstalledTitle, capReduction: STRINGS.capReduction, capReductionHint: STRINGS.capReductionHint }
  };
}

/** How much installed cyberware lowers max Humanity: the system's _calcMaxHumanity rule (borgware 4, else 2 if it has static loss). */
function capReduction(actor) {
  return actor.itemTypes.cyberware
    .filter(cw => cw.system.isInstalledInActor)
    .reduce((sum, cw) => sum + (cw.system.type === "borgware" ? 4 : parseInt(cw.system.humanityLoss?.static, 10) > 0 ? 2 : 0), 0);
}

function slotInfo(item) {
  if (!item.system.installedItems?.allowed) return null;
  const max = Number(upgraded(item, item.system.installedItems.slots, "slots")) || 0;
  const used = Number(item.system.installedItems.usedSlots) || 0;
  if (!max) return null;
  return {
    used,
    max,
    pips: max <= 8 ? Array.from({ length: max }, (_, i) => ({ full: i < used })) : null,
    tip: `${used}/${max} ${L("CPR.itemSheet.cyberware.optionalSlots")}`
  };
}

function cyberRow(actor, item, depth) {
  const sys = item.system;
  const isCyber = item.type === "cyberware";
  const row = {
    id: item.id,
    name: item.name,
    img: item.img,
    depth,
    indent: depth * 1.1,
    installationId: sys.installedIn?.[0] ?? "",
    foundational: isCyber && !!sys.isFoundational,
    upgraded: !!sys.isUpgraded,
    typeLabel: isCyber ? configLabel("cyberwareTypes", sys.type) : L(`TYPES.Item.${item.type}`),
    other: !isCyber,
    slots: slotInfo(item),
    installed: true,
    desc: plain(sys.description?.value),
    tags: upkeepTags(item),
    actions: []
  };
  if (isCyber && !(depth === 0 && CORE_FOUNDATION_TYPES.includes(sys.type) && sys.isFoundational)) {
    row.actions.push({ cls: "install-remove-cyberware", icon: "fas fa-arrow-right-from-bracket", tip: L("CPR.actorSheets.commonActions.uninstall"), prop: "system.isInstalled" });
  } else if (!isCyber && row.installationId) {
    row.actions.push({ cls: "uninstall-single-item", icon: "fas fa-arrow-right-from-bracket", tip: L("CPR.actorSheets.commonActions.uninstall"), parent: row.installationId });
  }
  if (isCyber && upgradeAction(actor, item)) {
    row.actions.push({ cls: "item-action", icon: "fab fa-superpowers", tip: L("CPR.actorSheets.commonActions.manageUpgrades"), actionType: "manage-upgrades", on: !!sys.isUpgraded });
  }
  const upkeep = upkeepAction(item);
  if (upkeep) row.actions.push(upkeep);
  row.actions.push({ cls: "item-view", icon: "fas fa-eye", tip: STRINGS.view });
  return row;
}

/* =========================================================== Listeners */

/** @param {ActorSheet} sheet  @param {HTMLElement} root  the sheet's form */
export function activateGear(sheet, root) {
  // Equip state: one click sets that state directly.
  for (const button of root.querySelectorAll("[data-lab-equip]")) {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.isEditable) return;
      const item = sheet.actor.items.get(button.closest("[data-item-id]")?.dataset.itemId);
      if (item) setEquipState(sheet.actor, item, button.dataset.labEquip);
    });
  }

  // Upkeep: the tags and the toolbox button open the item's maintenance dialog.
  for (const el of root.querySelectorAll("[data-lab-upkeep], .cprlab-upkeep-act")) {
    el.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const item = sheet.actor.items.get(el.closest("[data-item-id]")?.dataset.itemId);
      if (item) upkeepDialog(sheet, item);
    });
  }

  // Show only items in one equip state (per window, not saved).
  for (const pill of root.querySelectorAll("[data-lab-gear-show]")) {
    pill.addEventListener("click", event => {
      event.preventDefault();
      sheet._labGearShow = pill.dataset.labGearShow;
      sheet.render(false);
    });
  }
}

/**
 * Set an item's equip state directly, with the same side effects as the
 * system's _cycleEquipState: hands warning for weapons,
 * one equipped cyberdeck, and installed items follow their container.
 */
export async function setEquipState(actor, item, state) {
  const from = item.system.equipped;
  if (from === state || !EQUIP_STATES.some(s => s.value === state)) return;

  if (state === "equipped") {
    if (item.type === "weapon" && !actor.canHoldWeapon(item)) {
      ui.notifications.warn(L("CPR.messages.warningTooManyHands"));
    }
    if (item.type === "cyberdeck" && actor.hasItemTypeEquipped(item.type)) {
      ui.notifications.error(L("CPR.messages.errorTooManyCyberdecks"));
      return;
    }
  }
  // Armor tracking follows the equip state by itself (see trackArmor in main.js).

  const updates = [{ _id: item.id, "system.equipped": state }];
  if (hasMixin(item.type, "container") && typeof item.recursiveGetAllInstalledItems === "function") {
    for (const child of item.recursiveGetAllInstalledItems()) {
      updates.push({ _id: child.id, "system.equipped": state });
    }
  }
  await actor.updateEmbeddedDocuments("Item", updates);
}

/* ============================================================== Upkeep */

/**
 * One item's maintenance (cpr-hq upkeep): its status, any running malfunction, and what this user may do about it.
 * The owner rolls the check once time is booked (Downtime "Gear Maintenance"), can check it for damage and clear a
 * malfunction; the GM can also set its condition (and hide it from players), roll a malfunction, book time, count it
 * as maintained or exempt it.
 */
export async function upkeepDialog(sheet, item) {
  const api = upkeepApi();
  const s = api?.status(item);
  if (!s) return;
  const esc = v => Handlebars.escapeExpression(v ?? "");
  const gm = game.user.isGM;
  const buttons = [];
  const add = (action, icon, label, cls = "") => buttons.push(`<button type="button" data-uk="${action}" class="${cls}"><i class="${icon}"></i> ${esc(label)}</button>`);
  if ((s.pending || gm) && !s.broken) add("check", "fa-solid fa-dice-d10", game.i18n.format("CPRSKIN.lab.gear.ukRoll", { dv: s.dv, skill: s.skill }), "primary");
  if (item.isOwner) add("inspect", "fa-solid fa-magnifying-glass", game.i18n.format("CPRSKIN.lab.gear.ukInspect", { dv: s.inspectDV, skill: s.skill }), "wide");
  if (s.malfunction && item.isOwner) add("clear", "fa-solid fa-eraser", STRINGS.ukClear);
  if (gm) {
    if (s.damaged) add("malfunction", "fa-solid fa-triangle-exclamation", STRINGS.ukRollMalfunction);
    if (!s.pending && !s.broken) add("allot", "fa-solid fa-clock", STRINGS.ukAllot);
    if (!s.broken) add("done", "fa-solid fa-circle-check", STRINGS.ukMarkDone);
    add("exempt", "fa-solid fa-ban", s.exempt ? STRINGS.ukUnexempt : STRINGS.ukExempt);
  }
  // GM: the item's condition (one of four) and whether players can see it.
  const conditions = gm ? `
    <div class="cprlab-uk-cond">
      <span class="lbl">${esc(STRINGS.ukCondition)}</span>
      ${[["", "fa-solid fa-circle-check", STRINGS.ukFine], ["damaged", "fa-solid fa-heart-crack", STRINGS.ukDamaged],
        ["destroyed", "fa-solid fa-burst", STRINGS.ukDestroyed], ["beyond", "fa-solid fa-skull", STRINGS.ukBeyond]]
        .map(([value, icon, label]) => `<button type="button" data-uk="cond" data-cond="${value}" class="${(s.condition ?? "") === value ? "active" : ""}"><i class="${icon}"></i> ${esc(label)}</button>`).join("")}
      <label class="cprlab-uk-hide" data-tooltip="${esc(STRINGS.ukHideHint)}"><input type="checkbox" data-uk-hide ${s.hidden ? "checked" : ""}> <i class="fa-solid fa-eye-slash"></i> ${esc(STRINGS.ukHide)}</label>
    </div>` : "";
  const lines = s.summary.split("\n").map(l => `<li>${esc(l)}</li>`).join("");
  const malfunction = s.malfunction ? `
    <div class="cprlab-uk-malf"><i class="fa-solid fa-triangle-exclamation"></i>
      <div><strong>${esc(s.tableName)} ${s.malfunction.face}</strong> ${esc(s.malfunction.text)}</div></div>` : "";
  const hint = (!s.pending && !gm && s.needs) ? `<p class="hint">${esc(STRINGS.ukBookHint)}</p>` : "";
  let choice = null;
  let condition = null;
  await foundry.applications.api.DialogV2.wait({
    classes: ["cprlab-upkeep-dialog"],
    window: { title: `${STRINGS.upkeep}: ${item.name}`, icon: "fa-solid fa-toolbox" },
    position: { width: 440 },
    content: `
      <div class="cprlab-uk-head"><img src="${esc(item.img)}" alt=""><div><strong>${esc(item.name)}</strong>
        <span class="cprlab-uk-state st-${s.state}">${esc(s.label)}</span>${(s.condition && !s.broken) ? ` <span class="cprlab-uk-state st-damaged">${esc(s.conditionLabel)}</span>` : ""}</div></div>
      <ul class="cprlab-uk-lines">${lines}</ul>
      ${malfunction}${hint}${conditions}
      <div class="cprlab-uk-buttons">${buttons.join("")}</div>`,
    rejectClose: false,
    render: (event, element) => {
      for (const box of element.querySelectorAll(".cprlab-uk-buttons, .cprlab-uk-cond")) {
        box.addEventListener("click", ev => {
          const button = ev.target.closest("[data-uk]");
          if (!button) return;
          choice = button.dataset.uk;
          condition = button.dataset.cond ?? null;
          event.target.close();
        });
      }
      element.querySelector("[data-uk-hide]")?.addEventListener("change", ev => api.setHidden(item, ev.target.checked));
    },
    buttons: [{ action: "close", label: L("Close"), icon: "fa-solid fa-xmark" }]
  });
  switch (choice) {
    case "check": return api.check(item, { roller: sheet.actor });
    case "inspect": return api.inspect(item, { roller: sheet.actor });
    case "clear": return api.clearMalfunction(item);
    case "cond": return api.setCondition(item, condition || null);
    case "malfunction": return api.rollMalfunction(item);
    case "allot": return api.allotTime(item);
    case "done": return api.markMaintained(item);
    case "exempt": return api.setExempt(item, !s.exempt);
    default: return null;
  }
}
