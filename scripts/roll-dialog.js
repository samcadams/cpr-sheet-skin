/**
 * "Theme Attack Check" (Sheet options, per user): the system's roll dialogs
 * (stat, skill, attack, Facedown, role ability, Interface, program, Death
 * Save and damage rolls) in the user's sheet theme, when the roll was started
 * from the skin sheet (see fromSheet). Criticals, Luck and Additional Mods
 * move to the bottom of the list, a "STAT + skill + mods" line sits over the
 * buttons, and Confirm becomes a "Roll +N" button. Only the rendered DOM
 * changes: the inputs and buttons are the system's own elements, so its form
 * handling is untouched. The system re-renders the dialog on every change, so
 * this runs each time.
 */

const ROLL_CLASS = "cprskin-roll";

const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** The actor whose skin sheet is starting a roll right now (see fromSheet). */
let rollingActor = null;

/** Run a sheet's roll; the roll dialog it opens is marked as the sheet's own. */
export async function fromSheet(sheet, roll) {
  rollingActor = sheet.actor;
  try {
    return await roll();
  } finally {
    rollingActor = null;
  }
}

/** Whether this roll dialog was opened by a roll from the skin sheet. Decided on its first render. */
export function isSheetRoll(app) {
  if (app._cprskinSheetRoll === undefined) {
    app._cprskinSheetRoll = !!rollingActor && app.actor === rollingActor;
    if (app._cprskinSheetRoll) rollingActor = null;
  }
  return app._cprskinSheetRoll;
}

/**
 * What each roll type adds to the die besides mods and Luck, as [input name,
 * value], in the order the dialog lists them (the system's _computeBase).
 */
function rollTerms(chain, rollData) {
  const num = (v) => Number.parseInt(v, 10) || 0;
  const term = (name) => [name, num(rollData[name])];
  if (chain.includes("CPRDeathSaveRoll")) return [term("penalty"), term("basePenalty")];
  if (chain.includes("CPRDamageRoll")) return [];
  if (chain.includes("CPRFacedownRoll")) return [term("statValue"), term("repValue")];
  if (chain.includes("CPRInterfaceRoll")) return rollData.statName ? [term("roleValue"), term("statValue")] : [term("roleValue")];
  if (chain.includes("CPRRoleRoll")) {
    const terms = [term("roleValue")];
    if (rollData.statValue) terms.push(term("statValue"));
    if (rollData.skillName !== "--") terms.push(term("skillValue"));
    return terms;
  }
  if (chain.includes("CPRSkillRoll")) return [term("statValue"), term("skillValue")];
  return rollData.statValue === undefined ? [] : [term("statValue")];
}

export function themeRollDialog(app, data, theme) {
  const root = app.element?.[0];
  if (!root) return;
  for (const cls of [...root.classList]) {
    if (cls.startsWith("cprskin-theme-")) root.classList.remove(cls);
  }
  root.classList.add("cprskin", `cprskin-theme-${theme}`, ROLL_CLASS);

  const list = root.querySelector(".dialog-list");
  const row = (name) => list?.querySelector(`[name="${name}"]`)?.closest("li");
  const totalRow = list?.querySelector(".total-mods");
  if (totalRow) {
    for (const li of [row("calculateCritical"), row("location"), row("luck"), row("additionalMods")]) {
      if (li) list.insertBefore(li, totalRow);
    }
  }

  // "Rolling for 'Brawling', Choomba!": the roll's name in the accent colour, without the quotes.
  const rollData = data.rollData ?? {};
  const heading = root.querySelector(".dialog-header .text-normal");
  const text = heading?.textContent.trim() ?? "";
  const title = [rollData.rollTitle, rollData.roleName, game.i18n.localize("CPR.global.generic.facedown")]
    .find((t) => t && text.includes(`'${t}'`));
  if (title) {
    const at = text.indexOf(`'${title}'`);
    const name = document.createElement("b");
    name.textContent = title;
    heading.replaceChildren(text.slice(0, at), name, text.slice(at + title.length + 2));
  }

  for (const el of root.querySelectorAll(".situational-mod-value, .total-mod-value")) {
    const value = Number(el.textContent.trim().replace("−", "-"));
    if (value) el.classList.add(value > 0 ? "cprskin-pos" : "cprskin-neg");
  }

  // Same sum as the roll: die + the roll's terms + every mod + Luck.
  const fallback = { statValue: "CPR.global.generic.stat", skillValue: "CPR.global.generic.skill" };
  const label = (name) => {
    const shown = row(name)?.querySelector(".dialog-item-name")?.textContent.replace(/\s+/g, " ").trim();
    if (!shown) return fallback[name] ? game.i18n.localize(fallback[name]) : "";
    return shown.match(/\(([^)]*)\)/)?.[1] ?? shown.replace(/:$/, "");
  };
  const terms = rollTerms(app.prototypeChain ?? [], rollData);
  const mods = Number(data.totalMods) || 0;
  const luck = Math.max(0, Number(rollData.luck) || 0);
  const total = terms.reduce((sum, [, value]) => sum + value, 0) + mods + luck;
  const parts = [];
  const add = (value, words) => {
    const sign = value < 0 ? "−" : parts.length ? "+" : "";
    parts.push([sign, ...words].filter((w) => w !== "").join(" "));
  };
  for (const [name, value] of terms) add(value, [label(name), Math.abs(value)]);
  add(mods, [Math.abs(mods), game.i18n.localize("CPRSKIN.rollDialog.mods")]);
  if (luck) add(luck, [luck, game.i18n.localize("CPRSKIN.rollDialog.luck")]);

  // The die: d10 for checks, the weapon's or program's dice for damage (× the autofire multiplier).
  const formula = String(rollData.formula ?? "1d10");
  const isD10 = formula === "1d10";
  let dice = formula.replace(/^1d/, "d");
  if (rollData.isAutofire) dice += ` × ${rollData.autofireMultiplier}`;

  const footer = root.querySelector(".dialog-footer");
  if (footer) {
    const math = document.createElement("div");
    math.className = "cprskin-roll-math";
    const sum = document.createElement("span");
    sum.textContent = parts.join(" ");
    const result = document.createElement("b");
    const value = document.createElement("em");
    value.textContent = Math.abs(total);
    result.append(`${dice} ${total < 0 ? "−" : "+"} `, value);
    math.append(sum, result);
    footer.prepend(math);

    const confirm = footer.querySelector('button[name="confirm"]');
    if (confirm) {
      const icon = document.createElement("i");
      icon.className = /d6\b/.test(formula) ? "fa-solid fa-dice-d6" : "fa-solid fa-dice-d10";
      const caption = document.createElement("span");
      const shown = isD10 ? signed(total) : total ? `${dice} ${signed(total)}` : dice;
      caption.textContent = game.i18n.format("CPRSKIN.rollDialog.roll", { total: shown });
      confirm.replaceChildren(icon, caption);
      confirm.classList.add("cprskin-roll-go");
    }
  }

  app.setPosition({ height: "auto" });
}
