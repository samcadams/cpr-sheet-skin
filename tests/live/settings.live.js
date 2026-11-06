// Live check for the world toggles, the settings menus and api.settings (T264).
// Run as a GM in the test world: fpw eval gm -f tests/live/settings.live.js
// Uses (and leaves) the actor "<prefix>T264 Exec"; restores every setting it changes.
const MODULE_ID = "cpr-sheet-skin";
const prefix = game.user.name.replace(/^ClaudeGM(\d+)$/, "Claude$1 ");
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (key) => game.settings.get(MODULE_ID, key);
const set = (key, value) => game.settings.set(MODULE_ID, key, value);

const RULES = { autoTrackArmor: true, humanityStrip: true, humanityLabels: {}, execTeam: true, hiddenEffects: "Agent, Flashlight" };
const saved = Object.fromEntries(Object.keys(RULES).map((key) => [key, get(key)]));
const savedPrefs = get("prefs");

try {
  // api.settings: shape, keys registered with name and hint, menus registered.
  const groups = game.modules.get(MODULE_ID).api.settings?.groups ?? [];
  check("api.settings groups", groups.map((g) => g.id).join() === "sheetOptions,sheetRules", JSON.stringify(groups));
  for (const g of groups) {
    check(`group ${g.id} label`, typeof g.label === "string" && !g.label.startsWith("CPRSKIN"), g.label);
    check(`group ${g.id} menu`, game.settings.menus.has(`${MODULE_ID}.${g.menu}`), g.menu);
    for (const key of g.keys) {
      const s = game.settings.settings.get(`${MODULE_ID}.${key}`);
      check(`setting ${key} name/hint`, !!s?.name && !!s?.hint, key);
    }
  }
  check("labUI name/hint", !!game.settings.settings.get(`${MODULE_ID}.labUI`)?.hint);
  check("sheetRules restricted", game.settings.menus.get(`${MODULE_ID}.sheetRules`).restricted === true);
  check("sheetOptions open to players", game.settings.menus.get(`${MODULE_ID}.sheetOptions`).restricted === false);
  for (const [key, value] of Object.entries(RULES)) {
    check(`default ${key}`, JSON.stringify(game.settings.settings.get(`${MODULE_ID}.${key}`).default) === JSON.stringify(value));
  }
  for (const [key, value] of Object.entries(RULES)) await set(key, value);

  // Test actor: Exec rank 5, Humanity 15 (EMP 1 = "danger"), effects Agent and a visible one, body armor.
  const name = `${prefix}T264 Exec`;
  let actor = game.actors.getName(name);
  if (!actor) {
    actor = await Actor.create({ name, type: "character", flags: { core: { sheetClass: `${MODULE_ID}.CPRLabSheet` } } });
    await actor.createEmbeddedDocuments("Item", [
      { name: "Exec", type: "role", system: { mainRoleAbility: "Teamwork", rank: 5 } },
      { name: `${prefix}T264 Vest`, type: "armor", system: { isBodyLocation: true, bodyLocation: { sp: 11 }, equipped: "carried" } }
    ]);
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Agent" }, { name: `${prefix}T264 Buff` }]);
  }
  await actor.update({ "system.derivedStats.humanity.value": 15 });
  const sheet = actor.sheet;
  const data = async () => (await sheet.getData()).lab;
  const effectNames = (lab) => lab.effects.map((e) => e.name);
  const exec = (lab) => lab.roles.find((r) => r.name === "Exec" || r.main.name === "Teamwork");

  let lab = await data();
  check("strip on: danger label", lab.vitals.humanityTip === game.i18n.localize("CPRSKIN.lab.vitals.humanityState.danger"), lab.vitals.humanityTip);
  check("exec team on", !!exec(lab)?.team, JSON.stringify(exec(lab)?.team));
  check("Agent hidden by default", !effectNames(lab).includes("Agent") && effectNames(lab).includes(`${prefix}T264 Buff`), effectNames(lab).join());

  await sheet._render(true);
  const el = () => sheet.element[0];
  check("DOM strip shown", !!el().querySelector(".cprlab-humanity-note"));
  check("DOM team shown", !!el().querySelector(".cprlab-team"));

  await set("humanityLabels", { danger: "Claude T264 label" });
  check("custom label", (await data()).vitals.humanityTip === "Claude T264 label");
  await set("humanityStrip", false);
  lab = await data();
  check("strip off: no label, colour kept", lab.vitals.humanityTip === "" && lab.vitals.humanityState === "danger", JSON.stringify(lab.vitals.humanityTip));
  await wait(500);
  check("DOM strip hidden (re-render on change)", !el().querySelector(".cprlab-humanity-note"));

  await set("execTeam", false);
  check("exec team off", (await data()) && !exec(await data())?.team);
  await wait(500);
  check("DOM team hidden", !el().querySelector(".cprlab-team"));

  await set("hiddenEffects", `${prefix}T264 Buff`);
  lab = await data();
  check("hidden effects list", effectNames(lab).includes("Agent") && !effectNames(lab).includes(`${prefix}T264 Buff`), effectNames(lab).join());

  // Armor tracking off, then on.
  const vest = actor.items.getName(`${prefix}T264 Vest`);
  await actor.updateTrackedArmor("body", null);
  await vest.update({ "system.equipped": "carried" });
  await set("autoTrackArmor", false);
  await vest.update({ "system.equipped": "equipped" });
  await wait(500);
  check("armor tracking off", !actor.system.externalData?.currentArmorBody?.id, actor.system.externalData?.currentArmorBody?.id);
  await vest.update({ "system.equipped": "carried" });
  await set("autoTrackArmor", true);
  await vest.update({ "system.equipped": "equipped" });
  await wait(500);
  check("armor tracking on", actor.system.externalData?.currentArmorBody?.id === vest.id, actor.system.externalData?.currentArmorBody?.id);
  await sheet.close();

  // Menus: Sheet rules form saves, its button opens Edit state labels, which saves trimmed values.
  for (const [key, value] of Object.entries(RULES)) await set(key, value);
  const Rules = game.settings.menus.get(`${MODULE_ID}.sheetRules`).type;
  const rules = new Rules();
  await rules._render(true);
  const form = rules.element[0].querySelector("form");
  check("rules form fields", ["autoTrackArmor", "humanityStrip", "execTeam", "hiddenEffects"].every((k) => form.elements[k]));
  form.elements.execTeam.checked = false;
  form.elements.hiddenEffects.value = "Agent";
  await rules.submit();
  check("rules form saves", get("execTeam") === false && get("hiddenEffects") === "Agent", `${get("execTeam")} ${get("hiddenEffects")}`);
  const rules2 = new Rules();
  await rules2._render(true);
  rules2.element[0].querySelector("[data-action=labels]").click();
  await wait(1000);
  const labelsApp = Object.values(ui.windows).find((w) => w.id === "cprskin-state-labels");
  check("Edit state labels opens", !!labelsApp);
  if (labelsApp) {
    const lf = labelsApp.element[0].querySelector("form");
    lf.elements.warn.value = "  Claude T264 warn  ";
    await labelsApp.submit();
    check("state labels save trimmed", JSON.stringify(get("humanityLabels")) === JSON.stringify({ warn: "Claude T264 warn" }), JSON.stringify(get("humanityLabels")));
  }
  await rules2.close();

  // Sheet options writes prefs through setPref.
  const Options = game.settings.menus.get(`${MODULE_ID}.sheetOptions`).type;
  const opts = new Options();
  await opts._render(true);
  const of = opts.element[0].querySelector("form");
  check("options form has every pref", ["scale", "theme", "dock", "vitals", "effectsBar", "skills", "cyberItems"].every((k) => of.elements[k]));
  const nextScale = get("prefs").scale === "115" ? "100" : "115";
  of.elements.scale.value = nextScale;
  await opts.submit();
  check("options form saves", game.modules.get(MODULE_ID).api.getPrefs().scale === nextScale);
} catch (err) {
  check("no exception", false, `${err.message}\n${err.stack}`);
} finally {
  for (const [key, value] of Object.entries(saved)) await set(key, value);
  await set("prefs", savedPrefs);
}
return results;
