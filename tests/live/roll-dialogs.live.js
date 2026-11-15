// Live check for "Theme Attack Check" on every roll dialog the skin sheet opens, and only those.
// Run as a GM in the test world: fpw eval gm -f tests/live/roll-dialogs.live.js
// Uses (and leaves) the actor "<prefix>Roll Dialogs" (copied from a skin-sheet character); restores prefs.
const MODULE_ID = "cpr-sheet-skin";
const prefix = game.user.name.replace(/^ClaudeGM(\d+)$/, "Claude$1 ");
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const savedPrefs = game.settings.get(MODULE_ID, "prefs");
const setPref = (key, value) => game.modules.get(MODULE_ID).api.setPref(key, value);

const rollDialogs = () => Object.values(ui.windows).filter((w) => w.constructor.name.endsWith("RollDialog"));
async function closeDialogs() {
  for (const w of rollDialogs()) await w.close();
  await wait(300);
}
async function waitDialog() {
  for (let i = 0; i < 30 && !rollDialogs()[0]?.element?.[0]?.querySelector(".dialog-footer"); i++) await wait(100);
  return rollDialogs()[0];
}
function describe(app) {
  const el = app.element[0];
  return {
    themed: el.classList.contains("cprskin-roll"),
    title: el.querySelector(".dialog-header .text-normal b")?.textContent ?? "",
    math: el.querySelector(".cprskin-roll-math")?.textContent.replace(/\s+/g, " ").trim() ?? "",
    button: el.querySelector('button[name="confirm"]')?.textContent.trim() ?? "",
  };
}

try {
  const name = `${prefix}Roll Dialogs`;
  let actor = game.actors.getName(name);
  if (!actor) {
    const source = game.actors.find((a) => a.type === "character" && a.getFlag("core", "sheetClass") === `${MODULE_ID}.CPRLabSheet` && a.itemTypes.role.length && a.itemTypes.weapon.length);
    const data = source.toObject();
    delete data._id;
    Object.assign(data, { name, ownership: { default: 0 }, flags: { core: { sheetClass: `${MODULE_ID}.CPRLabSheet` } } });
    actor = await Actor.create(data);
  }
  await setPref("rollDialog", "themed");
  await actor.sheet.render(true);
  await wait(1500);
  const sheet = actor.sheet.element[0];

  // Each kind of roll button on the sheet opens its dialog themed, with a sum and a Roll button.
  const TYPES = { stat: "d10", skill: "d10", attack: "d10", facedown: "d10", roleAbility: "d10", deathsave: "d10", damage: "d6" };
  for (const [type, die] of Object.entries(TYPES)) {
    await closeDialogs();
    const button = sheet.querySelector(`.rollable[data-roll-type="${type}"]`);
    if (!button) { check(`${type}: button on sheet`, false, "none"); continue; }
    button.click();
    const app = await waitDialog();
    if (!app) { check(`${type}: dialog opened`, false); continue; }
    const d = describe(app);
    check(`${type}: themed`, d.themed, JSON.stringify(d));
    check(`${type}: title highlighted`, d.title !== "", JSON.stringify(d));
    check(`${type}: sum line`, d.math.includes(die) && d.math.includes("mods"), d.math);
    check(`${type}: Roll button`, /^Roll /.test(d.button), d.button);
    // Still themed after the system re-renders (here: add a +2 mod through the system's own input).
    const mods = app.element[0].querySelector('[name="additionalMods"]');
    if (mods) {
      mods.value = "2";
      mods.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(600);
      const again = describe(app);
      check(`${type}: themed after re-render`, again.themed && again.math !== d.math, `${d.math} -> ${again.math}`);
    }
    results.push(`     ${type}: "${d.title}" | ${d.math} | ${d.button}`);
  }
  await closeDialogs();

  // A roll started outside the sheet (macro / chat card path) keeps the system look.
  const roll = actor.createRoll("stat", "ref");
  roll.handleRollDialog({}, actor);
  const outside = await waitDialog();
  check("roll from outside the sheet: not themed", outside && !describe(outside).themed, outside ? JSON.stringify(describe(outside)) : "no dialog");
  await closeDialogs();

  // Option off: a sheet roll keeps the system look.
  await setPref("rollDialog", "system");
  sheet.querySelector('.rollable[data-roll-type="stat"]').click();
  const off = await waitDialog();
  check("option off: not themed", off && !describe(off).themed);
  await closeDialogs();
} catch (err) {
  check("no error", false, err.stack);
} finally {
  await closeDialogs();
  await game.settings.set(MODULE_ID, "prefs", savedPrefs);
}
return results.join("\n");
