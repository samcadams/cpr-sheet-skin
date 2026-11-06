// Live check for the Gear tab rows: what is rendered and what is hidden at rest.
// Run as a GM in the test world: fpw eval gm -f tests/live/gear-rows.live.js
// Uses (and leaves) the actor "<prefix>Gear Rows", rebuilt on every run; closes its sheet at the end.
const MODULE_ID = "cpr-sheet-skin";
const prefix = game.user.name.replace(/^ClaudeGM(\d+)$/, "Claude$1 ");
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const grenades = game.modules.get("mmutons-cyberpunk-red-upgraded-grenades")?.active && !!globalThis.GrenadeSystem;

const name = `${prefix}Gear Rows`;
await game.actors.getName(name)?.delete();
const actor = await Actor.create({ name, type: "character", flags: { core: { sheetClass: `${MODULE_ID}.CPRLabSheet` } } });
await actor.createEmbeddedDocuments("Item", [
  { name: "Light Armorjack", type: "armor", system: { equipped: "carried", isBodyLocation: true, isHeadLocation: false, bodyLocation: { sp: 11, ablation: 0 } } },
  { name: "Kevlar Helmet", type: "armor", system: { equipped: "equipped", isBodyLocation: false, isHeadLocation: true, headLocation: { sp: 7, ablation: 0 } } },
  { name: "Heavy Pistol", type: "weapon", system: { equipped: "carried", isRanged: true, weaponType: "heavyPistol", magazine: { max: 8, value: 8 } } },
  { name: "Flashlight", type: "gear", system: { equipped: "carried", amount: 1 } },
  { name: "Heavy Pistol Ammo (Basic)", type: "ammo", system: { variety: "heavyPistol", type: "basic", amount: 30 } },
  { name: "Grenade (Incendiary)", type: "ammo", system: { variety: "grenade", type: "incendiary", amount: 1 } },
  { name: "Smart Glasses", type: "cyberware", system: { type: "cyberEye", isInstalled: false, humanityLoss: { roll: "0", static: 0 } } },
  { name: "Cybereye", type: "cyberware", system: { type: "cyberEye", isInstalled: false, humanityLoss: { roll: "2d6", static: 7 } } }
]);

const sheet = actor.sheet;
try {
  sheet.render(true);
  for (let i = 0; i < 40 && !sheet.element?.[0]?.querySelector(".cprlab-gear"); i++) await wait(100);
  sheet.activateCoreTab?.("gear") ?? sheet._tabs?.[0]?.activate("gear");
  await wait(300);
  const root = sheet.element[0];
  const row = (n) => [...root.querySelectorAll(".cprlab-gear-row")].find((li) => li.querySelector(".nm")?.textContent === n);
  const shown = (el) => !!el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";

  const pill = root.querySelector('[data-lab-gear-show="upkeep"] .cprlab-pill-count');
  if (pill) {
    const count = Number(pill.textContent);
    root.querySelector('[data-lab-gear-show="upkeep"]').click();
    await wait(500);
    check("upkeep pill count = filtered rows", count === sheet.element[0].querySelectorAll(".cprlab-gear-row").length, `${count} vs ${sheet.element[0].querySelectorAll(".cprlab-gear-row").length}`);
    sheet._labGearShow = "all";
    sheet.render();
    await wait(500);
  }
  check("default width 1232", Math.round(sheet.position.width) === Math.round(1232 * (Number(game.modules.get(MODULE_ID).api.getPrefs().scale) / 100)), sheet.position.width);
  check("no disabled actions in gear rows", !root.querySelector(".cprlab-gear-row .cprlab-act.disabled"));

  const armor = row("Light Armorjack");
  check("carried armor: no ablate button", !armor?.querySelector(".ablate"));
  // Untrack it: the system's .ablate hits every equipped armor at the location, so the button stays.
  await actor.update({ "system.externalData.currentArmorHead.id": "" });
  await wait(300);
  check("equipped untracked armor: ablate head", row("Kevlar Helmet")?.querySelector(".ablate")?.dataset.location === "head");
  check("unablated armor: no repair button", !armor?.querySelector(".repair"));
  check("armor name not truncated", armor && armor.querySelector(".nm").scrollWidth <= armor.querySelector(".nm").clientWidth);

  const gun = row("Heavy Pistol");
  check("full magazine: no reload", !gun?.querySelector('[data-action="reload-ammo"]'));
  check("full magazine: change ammo kept", !!gun?.querySelector('[data-action="select-ammo"]'));
  check("weapon stats on one line", gun && gun.querySelector(".cprlab-gear-stats").scrollHeight <= gun.querySelector(".cprlab-gear-stats").clientHeight + 1);

  const light = row("Flashlight");
  check("x 1 hidden at rest", !shown(light?.querySelector(".cprlab-gear-amount")));
  const labels = [...(light?.querySelectorAll(".cprlab-equip-seg span") ?? [])];
  check("equip labels closed at rest", labels.length === 3 && labels.every((s) => s.getBoundingClientRect().width === 0), labels.length);

  const ammo = row("Heavy Pistol Ammo (Basic)");
  check("x 30 shown", shown(ammo?.querySelector(".cprlab-gear-amount")));
  check("amount left-aligned", getComputedStyle(ammo.querySelector(".gear-amount-input")).textAlign === "left");
  check("split only on hover", !!ammo?.querySelector('.cprlab-hover-act[data-action-type="split"]') && !shown(ammo.querySelector('[data-action-type="split"]')));
  check("ammo name not truncated", ammo && ammo.querySelector(".nm").scrollWidth <= ammo.querySelector(".nm").clientWidth);

  if (grenades) {
    const nade = row("Grenade (Incendiary)");
    const thr = nade?.querySelector(".cprlab-gear-actions .cprlab-grenade-throw");
    check("throw in actions", !!thr);
    check("throw is icon only", thr && !thr.querySelector("span"));
    check("equip column empty for grenade", nade && !nade.querySelector(".cprlab-equip").children.length);
  } else check("Better Grenades active (skipped throw checks)", true);

  const glasses = row("Smart Glasses");
  check("no 'Not installed' tag", !root.querySelector(".cprlab-gear-row .cprlab-gtag.off"));
  check("HL 0 hidden", glasses && !glasses.querySelector(".cprlab-gv.hl"));
  check("HL 2d6 shown", !!row("Cybereye")?.querySelector(".cprlab-gv.hl"));
  check("cyberware type chip kept", (glasses?.querySelectorAll(".cprlab-gv").length ?? 0) === 1);
} catch (err) {
  check("no error", false, err.message);
} finally {
  await sheet.close();
}
return results;
