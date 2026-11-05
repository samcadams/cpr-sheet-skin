/**
 * Skin sheet: MMuton's Better Grenades (mmutons-cyberpunk-red-upgraded-grenades).
 *
 * That module adds its Throw/Fire buttons to the system sheet's markup in a
 * renderActorSheet hook; its selectors don't match this sheet, so the buttons
 * are part of our own templates instead and call its global GrenadeSystem.
 * Same items as there: grenade ammo gets Throw, grenade/rocket launchers Fire.
 */

const MODULE = "mmutons-cyberpunk-red-upgraded-grenades";
const LAUNCHERS = ["grenadeLauncher", "rocketLauncher"];

const api = () => (game.modules.get(MODULE)?.active ? globalThis.GrenadeSystem : null) ?? null;

/** "throw", "fire" or null for an item. */
export function grenadeMode(item) {
  if (!api()) return null;
  if (item.type === "ammo" && item.system.variety === "grenade") return "throw";
  if (item.type === "weapon" && LAUNCHERS.includes(item.system.weaponType)) return "fire";
  return null;
}

/**
 * A labelled gear-row button for the item, or null. Grenade ammo shows it in the
 * equip column (ammo has no carry state), launchers first in the actions column.
 */
export function grenadeAction(item) {
  const mode = grenadeMode(item);
  if (!mode) return null;
  const tip = game.i18n.format(`CPRSKIN.lab.grenade.${mode}`, { name: item.name });
  const label = game.i18n.localize(`CPRSKIN.lab.grenade.${mode}Short`);
  return { cls: `cprlab-grenade cprlab-grenade-${mode}`, action: mode, icon: "fas fa-bomb", tip, label };
}

/** @param {ActorSheet} sheet  @param {HTMLElement} root  the sheet's form */
export function activateGrenades(sheet, root) {
  for (const button of root.querySelectorAll(".cprlab-grenade")) {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const gs = api();
      const id = button.closest("[data-item-id]")?.dataset.itemId;
      if (!gs || !id) return;
      if (button.dataset.action === "fire") await gs.fireGrenadeFromLauncher(sheet.actor, id);
      else await gs.throwGrenade(sheet.actor, id);
    });
  }
}
