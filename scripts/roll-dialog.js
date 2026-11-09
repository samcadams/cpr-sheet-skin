/**
 * "Theme Attack Check" (Sheet options, per user): the system's roll dialog
 * (cpr-base-verify-roll-prompt: stat, skill and attack rolls) in the user's
 * sheet theme. Criticals, Luck and Additional Mods move under the skill, a
 * "STAT + skill + mods" line sits over the buttons, and Confirm becomes a
 * d10 "Roll +N" button. Only the rendered DOM changes: the inputs and buttons
 * are the system's own elements, so its form handling is untouched. The
 * system re-renders the dialog on every change, so this runs each time.
 */

const BASE_PROMPT = "templates/dialog/rolls/cpr-base-verify-roll-prompt.hbs";
const ROLL_CLASS = "cprskin-roll";

const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export function themeRollDialog(app, data, theme) {
  const root = app.element?.[0];
  if (!root || !app.options.template?.endsWith(BASE_PROMPT)) return;
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
  const heading = root.querySelector(".dialog-header .text-normal");
  const title = data.rollData?.rollTitle;
  const text = heading?.textContent.trim() ?? "";
  const at = title ? text.indexOf(`'${title}'`) : -1;
  if (at >= 0) {
    const name = document.createElement("b");
    name.textContent = title;
    heading.replaceChildren(text.slice(0, at), name, text.slice(at + title.length + 2));
  }

  for (const el of root.querySelectorAll(".situational-mod-value, .total-mod-value")) {
    const value = Number(el.textContent.trim().replace("−", "-"));
    if (value) el.classList.add(value > 0 ? "cprskin-pos" : "cprskin-neg");
  }

  // Same sum as the roll: d10 + stat + skill + every mod + Luck.
  const rollData = data.rollData ?? {};
  const label = (name) => row(name)?.querySelector(".dialog-item-name")?.textContent.match(/\(([^)]*)\)/)?.[1] ?? "";
  const stat = Number(rollData.statValue) || 0;
  const skill = row("skillValue") ? Number(rollData.skillValue) || 0 : null;
  const mods = Number(data.totalMods) || 0;
  const luck = Math.max(0, Number(rollData.luck) || 0);
  const total = stat + (skill ?? 0) + mods + luck;
  const parts = [`${label("statValue")} ${stat}`];
  if (skill !== null) parts.push(`+ ${label("skillValue")} ${skill}`);
  parts.push(`${mods < 0 ? "−" : "+"} ${Math.abs(mods)} ${game.i18n.localize("CPRSKIN.rollDialog.mods")}`);
  if (luck) parts.push(`+ ${luck} ${game.i18n.localize("CPRSKIN.rollDialog.luck")}`);

  const footer = root.querySelector(".dialog-footer");
  if (footer) {
    const math = document.createElement("div");
    math.className = "cprskin-roll-math";
    const sum = document.createElement("span");
    sum.textContent = parts.join(" ");
    const result = document.createElement("b");
    const value = document.createElement("em");
    value.textContent = total;
    result.append("d10 + ", value);
    math.append(sum, result);
    footer.prepend(math);

    const confirm = footer.querySelector('button[name="confirm"]');
    if (confirm) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-dice-d10";
      const caption = document.createElement("span");
      caption.textContent = game.i18n.format("CPRSKIN.rollDialog.roll", { total: signed(total) });
      confirm.replaceChildren(icon, caption);
      confirm.classList.add("cprskin-roll-go");
    }
  }

  app.setPosition({ height: "auto" });
}
