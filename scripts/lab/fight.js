/**
 * Skin sheet: Fight tab.
 *
 * fightContext() adds what templates/lab/fight.hbs needs to the sheet data (as
 * data.lab.fight); activateFight() binds its extra controls.
 *
 * Equipped weapons and armor get full cards that keep the system's classes and
 * data-* attributes (rollable, fire-checkbox, ablate, armor-current-track,
 * item-action, item-edit...), so the system's listeners do the work. Carried
 * and stashed ones follow as small "phantom" cards. Only the carry control is
 * handled here, through gear.js's setEquipState (same side effects as the
 * system's equip cycle: hands warning, armor tracking).
 */
import { setEquipState } from "./gear.js";
import { grenadeMode } from "./grenades.js";

const SYS = "cyberpunk-red-core";

/** This file's strings, from lang/en.json (CPRSKIN.lab.fight.*). */
const STRINGS = new Proxy({}, { get: (_t, key) => game.i18n.localize(`CPRSKIN.lab.fight.${String(key)}`) });
const L = key => game.i18n.localize(key);
const helper = (name, ...args) => Handlebars.helpers[name](...args, { hash: {} });
const upgraded = (item, base, key) => helper("cprApplyUpgrade", item, base, key);

/** Same three states, icons and hints as the Gear tab's equip control (gear.js EQUIP_STATES). */
const EQUIP_STATES = [
  { value: "owned", icon: "fa-solid fa-box-archive", label: () => L("CPRSKIN.lab.gear.stashed"), hint: () => L("CPRSKIN.lab.gear.stashedHint") },
  { value: "carried", icon: "fa-solid fa-suitcase", label: () => L("CPR.global.equipState.carried"), hint: () => L("CPRSKIN.lab.gear.carriedHint") },
  { value: "equipped", icon: "fa-solid fa-hand", label: () => L("CPR.global.equipState.equipped"), hint: () => L("CPRSKIN.lab.gear.equippedHint") }
];
/** Phantom cards: carried before stashed, so stashed items sit at the bottom of their section. */
const STATE_ORDER = { equipped: 0, carried: 1, owned: 2 };

/** HTML description -> one line of plain text (tags dropped, entities decoded). */
function plain(html) {
  const text = String(html ?? "").replace(/<[^>]*>/g, " ");
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value.replace(/\s+/g, " ").trim();
}

/** The system shows "+" only when players may create items; a GM always may. */
const canCreateItems = () => game.user.isGM || !!game.settings.get(SYS, "playersCreateInventory");

const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);

/** @param {ActorSheet} sheet  @param {object} data  the sheet's getData() result */
export function fightContext(sheet, data) {
  const actor = sheet.actor;
  const weapons = actor.system.weapons;

  // Equipped: everything the system can attack with (incl. installed cyberweapons and upgrade weapons), once each.
  const seen = new Set();
  const equipped = weapons.equipped.filter(w => !seen.has(w.id) && seen.add(w.id));
  // Phantoms: only real weapon items (cyberweapons and upgrade weapons follow their container, not a carry state).
  const phantoms = [...weapons.carried, ...weapons.owned].filter(w => w.type === "weapon" && !seen.has(w.id));

  const weaponSection = (key, label, ranged) => {
    const cards = equipped.filter(w => !!w.system.isRanged === ranged).sort(byName).map(w => weaponCard(w));
    const ghosts = phantoms.filter(w => !!w.system.isRanged === ranged).sort(phantomOrder).map(w => weaponPhantom(w));
    return { key, label, cards, phantoms: ghosts, count: cards.length, total: cards.length + ghosts.length };
  };
  const ranged = weaponSection("ranged", L("CPR.characterSheet.bottomPane.fight.ranged"), true);
  const melee = weaponSection("melee", L("CPR.characterSheet.bottomPane.fight.melee"), false);

  const armor = actor.itemTypes.armor;
  const armorCards = armor.filter(a => a.system.equipped === "equipped").sort(byName).map(a => armorCard(actor, a));
  const armorPhantoms = armor.filter(a => a.system.equipped !== "equipped").sort(phantomOrder).map(a => armorPhantom(a));

  const injuries = [...actor.itemTypes.criticalInjury].sort(byName).map(i => injuryRow(i));

  return {
    weapons: [ranged, melee].filter(s => s.total),
    noWeapons: !ranged.total && !melee.total,
    armor: { cards: armorCards, phantoms: armorPhantoms, count: armorCards.length, total: armor.length },
    injuries,
    canCreate: canCreateItems(),
    text: {
      weapons: L("CPR.characterSheet.bottomPane.fight.weapons"),
      armor: L("CPR.global.itemTypes.armor"),
      injuries: L("CPR.characterSheet.bottomPane.fight.criticalInjuries"),
      noWeapons: STRINGS.noWeapons,
      noArmor: STRINGS.noArmor,
      noInjuries: STRINGS.noInjuries,
      equippedCount: STRINGS.equippedCount,
      deathSave: `${L("CPR.characterSheet.leftPane.deathSave.title")} +1`,
      rollInjury: L("CPR.characterSheet.bottomPane.fight.criticalInjuryRoll"),
      createInjury: L("CPR.actorSheets.commonActions.createNewItem"),
      delete: L("CPR.actorSheets.commonActions.deleteItem"),
      open: L("CPR.mookSheet.items.clickToViewItem"),
      attack: L("CPRSKIN.lab.dock.attack"),
      damage: L("CPRSKIN.lab.dock.damage"),
      attackHint: L("CPR.characterSheet.bottomPane.fight.rollAnAttack"),
      damageHint: L("CPR.actorSheets.commonActions.rollDamage"),
      grenadeFire: L("CPRSKIN.lab.grenade.fireShort")
    }
  };
}

function phantomOrder(a, b) {
  return (STATE_ORDER[a.system.equipped] ?? 3) - (STATE_ORDER[b.system.equipped] ?? 3) || byName(a, b);
}

/** Card bits every weapon/armor card shares: description and the carry control. */
function common(item) {
  const sys = item.system;
  const state = sys.equipped;
  const carry = item.type === "weapon" || item.type === "armor";
  const current = EQUIP_STATES.find(s => s.value === state);
  return {
    id: item.id,
    item,
    name: item.name,
    img: item.img,
    upgraded: !!sys.isUpgraded,
    desc: plain(sys.description?.value),
    state,
    stateLabel: current?.label() ?? "",
    stateIcon: current?.icon ?? "",
    carryLabel: game.i18n.format("CPRSKIN.lab.fight.carryLabel", { name: item.name }),
    equip: carry
      ? EQUIP_STATES.map(s => ({ value: s.value, icon: s.icon, label: s.label(), hint: s.hint(), active: state === s.value }))
      : null
  };
}

function weaponCard(weapon) {
  const card = common(weapon);
  // Cyberweapons and upgrade weapons say where they come from instead of a carry control.
  if (weapon.type !== "weapon") card.source = L(`TYPES.Item.${weapon.type}`);
  // Better Grenades launchers: a Fire button next to Attack/Damage.
  if (grenadeMode(weapon) === "fire") card.grenadeTip = game.i18n.format("CPRSKIN.lab.grenade.fire", { name: weapon.name });
  return card;
}

function weaponPhantom(weapon) {
  const card = common(weapon);
  card.statLabel = L("CPR.global.generic.damage");
  card.stat = upgraded(weapon, weapon.system.damage, "damage");
  return card;
}

/** One SP (or shield HP) entry per covered location. */
function armorLocations(actor, armor) {
  const sys = armor.system;
  const ext = actor.system.externalData ?? {};
  const out = [];
  const loc = (key, label, max, value, trackKey, type, tips) => {
    const tracked = ext[trackKey]?.id === armor.id;
    out.push({
      key,
      label: L(label),
      type: L(type),
      max,
      value,
      low: value < max,
      bar: max ? Math.round((Math.max(0, value) / max) * 100) : 0,
      tracked,
      ablateTip: L(tips[0]),
      trackTip: L(tips[1])
    });
  };
  const sp = (block, key) => {
    const max = Number(upgraded(armor, block.sp, key)) || 0;
    return [max, max - (Number(block.ablation) || 0)];
  };
  if (sys.isHeadLocation) {
    loc("head", "CPR.global.location.head", ...sp(sys.headLocation, "headSp"), "currentArmorHead", "CPR.global.itemType.armor.sp",
      ["CPR.actorSheets.fightActions.ablateArmor", "CPR.actorSheets.commonActions.resyncHeadArmor"]);
  }
  if (sys.isBodyLocation) {
    loc("body", "CPR.global.location.body", ...sp(sys.bodyLocation, "bodySp"), "currentArmorBody", "CPR.global.itemType.armor.sp",
      ["CPR.actorSheets.fightActions.ablateArmor", "CPR.actorSheets.commonActions.resyncBodyArmor"]);
  }
  if (!sys.isHeadLocation && !sys.isBodyLocation) {
    const max = Number(upgraded(armor, sys.shieldHitPoints.max, "shieldHp")) || 0;
    loc("shield", "CPR.global.generic.shield", max, Number(sys.shieldHitPoints.value) || 0, "currentArmorShield", "CPR.global.itemType.armor.hp",
      ["CPR.actorSheets.fightActions.damageShield", "CPR.actorSheets.commonActions.resyncShield"]);
  }
  return out;
}

function armorCard(actor, armor) {
  return { ...common(armor), locations: armorLocations(actor, armor) };
}

function armorPhantom(armor) {
  const card = common(armor);
  const sys = armor.system;
  // Key stat: the SP it would give (head/body), or shield HP.
  const parts = [];
  if (sys.isHeadLocation) parts.push(upgraded(armor, sys.headLocation.sp, "headSp"));
  if (sys.isBodyLocation) parts.push(upgraded(armor, sys.bodyLocation.sp, "bodySp"));
  if (parts.length) {
    card.statLabel = L("CPR.global.itemType.armor.sp");
    card.stat = [...new Set(parts.map(String))].join("/");
    card.statTip = [sys.isHeadLocation && L("CPR.global.location.head"), sys.isBodyLocation && L("CPR.global.location.body")].filter(Boolean).join(" + ");
  } else {
    card.statLabel = L("CPR.global.itemType.armor.hp");
    card.stat = upgraded(armor, sys.shieldHitPoints.max, "shieldHp");
    card.statTip = L("CPR.global.generic.shield");
  }
  return card;
}

function injuryRow(injury) {
  const effects = [];
  for (const effect of injury.effects) {
    effect.changes.forEach((change, index) => {
      const cat = effect.flags?.[SYS]?.changes?.cats?.[index];
      const name = cat ? helper("cprGetChangeNameByKey", effect, cat, change.key) : change.key;
      effects.push(`${name} ${helper("cprEffectModMode", change.mode, change.value)}`);
    });
  }
  return {
    id: injury.id,
    type: injury.type,
    name: injury.name,
    img: injury.img,
    desc: plain(injury.system.description?.value),
    deathSave: !!injury.system.deathSaveIncrease,
    effects,
    hasTags: !!injury.system.deathSaveIncrease || effects.length > 0
  };
}

/** @param {ActorSheet} sheet  @param {HTMLElement} root  the sheet's form */
export function activateFight(sheet, root) {
  // Carry control on weapon and armor cards: one click sets that state directly.
  for (const button of root.querySelectorAll("[data-lab-fight-equip]")) {
    const set = event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.isEditable || button.classList.contains("active")) return;
      const item = sheet.actor.items.get(button.closest("[data-item-id]")?.dataset.itemId);
      if (item) setEquipState(sheet.actor, item, button.dataset.labFightEquip);
    };
    button.addEventListener("click", set);
    // The segments are focusable links without href: Enter and Space press them.
    button.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") set(event);
    });
  }
}
