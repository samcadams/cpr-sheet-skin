/**
 * CPR Sheet Skin: an opt-in replacement for the Cyberpunk RED character sheet.
 *
 * It extends the system's own sheet class and only replaces the template and
 * the tab setup, so every roll, item action, ledger and calculation is still
 * the system's code. Controls in the templates keep the system's classes and
 * data-* attributes, which is what the system's listeners look for.
 */
import CPRCharacterActorSheet from "../../../../systems/cyberpunk-red-core/modules/actor/sheet/cpr-character-sheet.js";
import { CPRRoll } from "../../../../systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
import CPRChat from "../../../../systems/cyberpunk-red-core/modules/chat/cpr-chat.js";
import { ROLE_TEXT, roleReminder, noteKey } from "./role-text.js";
import { gearContext, activateGear } from "./gear.js";
import { fightContext, activateFight } from "./fight.js";
import { activateGrenades } from "./grenades.js";
import { cyberBodyContext, activateCyberBody } from "./cyber-body/view.js";
import { execTeamContext, activateExecTeam } from "./exec-team.js";

const MODULE_ID = "cpr-sheet-skin";
const TEMPLATES = `modules/${MODULE_ID}/templates/lab`;

/** Call a system Handlebars helper from JS (they expect Handlebars' options as the last argument). */
const helper = (name, ...args) => Handlebars.helpers[name](...args, { hash: {} });
const helperHash = (name, hash, ...args) => Handlebars.helpers[name](...args, { hash });

const LIFEPATH_FIELDS = [
  ["culturalOrigins", "systemLifepathCulturalOrigin", "culturalOrigins"],
  ["languages", "systemLifepathLanguages", "languages"],
  ["personality", "systemLifepathPersonality", "personality"],
  ["clothingStyle", "systemLifepathClothingStyle", "clothingStyle"],
  ["hairStyle", "systemLifepathHairStyle", "hairStyle"],
  ["affectations", "systemLifepathAffectations", "affectations"],
  ["valueMost", "systemLifepathValueMost", "valueMost"],
  ["peopleFeelings", "systemLifepathAboutPeople", "peopleFeelings"],
  ["valuedPerson", "systemLifepathValuedPerson", "valuedPerson"],
  ["valuedPossession", "systemLifepathValuedPossession", "valuedPossession"],
  ["familyBackground", "systemLifepathFamilyBackground", "familyBackground"],
  ["childhoodEnvironment", "systemLifepathChildhoodEnvironment", "childhoodEnvironment"],
  ["familyCrisis", "systemLifepathFamilyCrisis", "familyCrisis"],
  ["friends", "systemLifepathFriends", "friends"],
  ["enemies", "systemLifepathEnemies", "enemies"],
  ["lovers", "systemLifepathTragicLoveAffairs", "lovers"],
  ["lifeGoals", "systemLifepathLifeGoals", "lifeGoals"]
];

const WOUND_ICONS = {
  notWounded: "wounded_none",
  lightlyWounded: "wounded_lightly",
  seriouslyWounded: "wounded_seriously",
  mortallyWounded: "wounded_mortally"
};

/** Effects most characters carry all the time: kept out of the Active bar unless the user shows them (world setting). */
const defaultHiddenEffects = () => String(game.settings.get(MODULE_ID, "hiddenEffects") ?? "")
  .split(",").map((name) => name.trim()).filter(Boolean);

/** Lifepath cards are grouped the way the rulebook's Lifepath reads. */
const LIFEPATH_GROUPS = {
  style: ["culturalOrigins", "languages", "personality", "clothingStyle", "hairStyle", "affectations"],
  values: ["valueMost", "peopleFeelings", "valuedPerson", "valuedPossession", "lifeGoals"],
  history: ["familyBackground", "childhoodEnvironment", "familyCrisis", "friends", "enemies", "lovers"]
};

export default class CPRLabSheet extends CPRCharacterActorSheet {
  /** Collapsed skill groups, by group key. Kept for the life of the window. */
  _labCollapsed = new Set();

  /** cpr-hq panel UI state (selected day, hours, ...), one per panel, kept across renders. */
  _hqUI = {};

  static get defaultOptions() {
    const options = super.defaultOptions;
    return foundry.utils.mergeObject(options, {
      classes: [...options.classes, "cprlab"],
      template: `${TEMPLATES}/sheet.hbs`,
      width: 1120,
      height: 880,
      tabs: [{ navSelector: ".cprlab-tabs", contentSelector: ".cprlab-body", initial: "skills" }],
      scrollY: [".cprlab-body", ".cprlab-dock"]
    });
  }

  /**
   * Foundry re-renders a window by filling `element.find(".window-content")`.
   * The embedded cpr-hq panels contain their own .window-content (cpr-hq's CSS
   * needs it), so that would match them too: jQuery then puts a copy of the new
   * sheet in each match, the copy in the real window has no listeners, and the
   * tabs come up blank. Fill only the window's own content element.
   * @override
   */
  _replaceHTML(element, html) {
    if (!element.length || !this.popOut) return super._replaceHTML(element, html);
    element.children(".window-content").html(html);
    let title = element.find(".window-title")[0];
    if (title?.hasChildNodes()) title = title.childNodes[0];
    if (title) title.textContent = this.title;
  }

  /** The skin module's per-user options (set from the Skin dialog). */
  get labPrefs() {
    return game.modules.get(MODULE_ID).api.getPrefs();
  }

  async getData() {
    const data = await super.getData();
    const prefs = this.labPrefs;
    const hq = this._hqPanels();
    const skillRows = this._labSkillRows();
    const skills = this._labSkills(prefs, skillRows);
    data.lab = {
      prefs,
      is: Object.fromEntries(Object.entries(prefs).map(([k, v]) => [`${k}_${v}`, true])),
      ui: game.modules.get(MODULE_ID).api.getUI(),
      themeTip: game.i18n.format("CPRSKIN.theme.switch", { theme: game.i18n.localize(`CPRSKIN.theme.${prefs.theme}`) }),
      stats: this._labStats(),
      vitals: this._labVitals(),
      portrait: this._labPortrait(),
      skills,
      roles: await this._labRoles(),
      roleNames: this._labRoleNames(),
      roleTitle: this._labRoleTitle(),
      effectsHidden: this._labEffectsHidden(),
      injuries: this._labInjuries(),
      effects: prefs.effectsBar === "on" ? this._labEffects() : [],
      lifepath: this._labLifepath(data),
      hq,
      tabs: this._labTabs(hq)
    };
    data.lab.gear = gearContext(this, data);
    data.lab.fight = fightContext(this, data);
    if (prefs.cyberView === "body") data.lab.cyberBody = cyberBodyContext(this, data.lab.gear.cyber);
    return data;
  }

  /* ----------------------------------------------------------- Header */

  _labStats() {
    const stats = this.actor.system.stats;
    return Object.entries(stats).map(([key, stat]) => ({
      key,
      label: game.i18n.localize(helper("cprFindConfigValue", "statList", key)),
      value: stat.value,
      max: stat.max,
      hasMax: stat.max !== undefined && stat.max !== null,
      tooltip: helper("cprGetStatToolTip", key)
    }));
  }

  /** The character's portrait; the token art when the portrait is still Foundry's placeholder. */
  _labPortrait() {
    const token = this.actor.prototypeToken?.texture?.src;
    const placeholder = !this.actor.img || this.actor.img === CONST.DEFAULT_TOKEN || this.actor.img === Actor.implementation.DEFAULT_ICON;
    const tokenizer = !!game.modules.get("vtta-tokenizer")?.active;
    return {
      src: placeholder && token && token !== CONST.DEFAULT_TOKEN ? token : this.actor.img,
      tip: game.i18n.localize(tokenizer ? "CPRSKIN.lab.portrait.tokenizer" : "CPRSKIN.lab.portrait.edit")
    };
  }

  /** Portrait click: Tokenizer when it's active (shift-click: the plain file picker), else the file picker. */
  _labEditPortrait(event) {
    event.preventDefault();
    event.stopPropagation();
    const tokenizer = game.modules.get("vtta-tokenizer");
    if (tokenizer?.active && tokenizer.api?.tokenizeActor && !event.shiftKey) {
      tokenizer.api.tokenizeActor(this.actor);
      return;
    }
    const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    new Picker({
      type: "image",
      current: this.actor.img,
      callback: path => this.actor.update({ img: path }),
      top: this.position.top + 40,
      left: this.position.left + 10
    }).browse();
  }

  /** Quick +1/-1 on HP or Humanity, like typing the new value (never above max or below 0). */
  async _labStepVital(button) {
    const key = button.dataset.labVitalStep;
    const stat = this.actor.system.derivedStats[key];
    if (!stat) return;
    const value = Math.max(0, Math.min(Number(stat.max) || 0, (Number(stat.value) || 0) + Number(button.dataset.step)));
    await this.actor.update({ [`system.derivedStats.${key}.value`]: value });
  }

  _labVitals() {
    const ds = this.actor.system.derivedStats;
    const pct = (v, m) => Math.max(0, Math.min(100, Math.round((Number(v) / Math.max(1, Number(m))) * 100)));
    const humanity = this._labHumanityState();
    return {
      wound: ds.currentWoundState,
      ...this._labDeathSave(),
      hpPct: pct(ds.hp.value, ds.hp.max),
      humanityPct: pct(ds.humanity.value, ds.humanity.max),
      humanityState: humanity.state,
      humanityTip: humanity.tip,
      woundIcon: `systems/cyberpunk-red-core/icons/hud/${WOUND_ICONS[ds.currentWoundState] ?? "wounded_none"}.svg`,
      woundLabel: game.i18n.localize(`CPR.global.woundState.${ds.currentWoundState}`),
      armor: this._labArmor()
    };
  }

  /**
   * Death Save penalty with everything the system's roll adds: saves already
   * made, critical injuries that raise it, and deathSavePenalty effects
   * (always-on or situational-on-by-default, like _createDeathSaveRoll).
   */
  _labDeathSave() {
    const ds = this.actor.system.derivedStats.deathSave;
    const esc = Handlebars.escapeExpression;
    const effects = [];
    for (const effect of this.actor.allApplicableEffects()) {
      if (effect.disabled || effect.isSuppressed) continue;
      effect.changes.forEach((change, index) => {
        if (change.key !== "bonuses.deathSavePenalty") return;
        const situational = effect.getFlag(game.system.id, `changes.situational.${index}`);
        if (situational?.isSituational && !situational.onByDefault) return;
        const value = Number.parseInt(change.value, 10) || 0;
        if (value) effects.push({ label: effect.name, value });
      });
    }
    const penalty = Number(ds.penalty) || 0;
    const injuries = Number(ds.basePenalty) || 0;
    const total = penalty + injuries + effects.reduce((sum, e) => sum + e.value, 0);
    const sign = v => (v < 0 ? `${v}` : `+${v}`);
    const lines = [
      `<strong>${game.i18n.localize("CPRSKIN.lab.vitals.deathSave")}: 1d10 ${sign(total)}</strong>`,
      `${game.i18n.localize("CPRSKIN.lab.vitals.dsNeed")} ${this.actor.system.stats.body?.value ?? 0}`,
      `${game.i18n.localize("CPRSKIN.lab.vitals.dsSaves")}: ${sign(penalty)}`,
      `${game.i18n.localize("CPRSKIN.lab.vitals.dsInjuries")}: ${sign(injuries)}`,
      ...effects.map(e => `${esc(e.label)}: ${sign(e.value)}`)
    ];
    return { deathSave: total, deathTip: lines.join("<br>") };
  }

  /**
   * How close the character is to cyberpsychosis, from the EMP their Humanity
   * works out to (Humanity / 10, rounded down, as the system calculates it).
   */
  _labHumanityState() {
    const humanity = Number(this.actor.system.derivedStats.humanity.value) || 0;
    const emp = Math.floor(humanity / 10);
    const state = humanity < 0 ? "extreme" : emp <= 0 ? "psycho" : emp === 1 ? "danger" : emp === 2 ? "warn" : "ok";
    const labels = game.settings.get(MODULE_ID, "humanityLabels") ?? {};
    const tip = state === "ok" || !game.settings.get(MODULE_ID, "humanityStrip") ? ""
      : labels[state] || game.i18n.localize(`CPRSKIN.lab.vitals.humanityState.${state}`);
    return { state, tip };
  }

  /**
   * Head and body SP right now: the armor the system tracks for that location
   * (what damage ablates), else the best equipped piece. Locations with no
   * armor are left out.
   */
  _labArmor() {
    const actor = this.actor;
    const ext = actor.system.externalData ?? {};
    const equipped = actor.itemTypes.armor.filter(a => a.system.equipped === "equipped");
    const parts = [
      { id: "head", key: "currentArmorHead", on: s => s.isHeadLocation, loc: "headLocation", upgrade: "headSp",
        icon: "fa-solid fa-helmet-safety", label: "CPR.global.location.head" },
      { id: "body", key: "currentArmorBody", on: s => s.isBodyLocation, loc: "bodyLocation", upgrade: "bodySp",
        icon: "fa-solid fa-shirt", label: "CPR.global.location.body" }
    ];
    const out = [];
    for (const part of parts) {
      const tracked = ext[part.key]?.id ? actor.items.get(ext[part.key].id) : null;
      const candidates = tracked ? [tracked] : equipped.filter(a => part.on(a.system));
      const best = candidates.map(a => {
        const max = Number(helper("cprApplyUpgrade", a, a.system[part.loc].sp, part.upgrade)) || 0;
        return { item: a, max, value: Math.max(0, max - (Number(a.system[part.loc].ablation) || 0)) };
      }).sort((x, y) => y.value - x.value)[0];
      if (!best) continue;
      out.push({
        id: part.id,
        icon: part.icon,
        value: best.value,
        max: best.max,
        low: best.value < best.max,
        tip: `${Handlebars.escapeExpression(best.item.name)}<br>${best.value}/${best.max} SP<br><em>${game.i18n.localize("CPRSKIN.lab.vitals.spClick")}</em>`
      });
    }
    return out;
  }

  /**
   * HP a day of natural healing gives: BODY plus "heal as if BODY were higher"
   * bonuses from cpr-hq (Medbay, Morale Boost) of the HQs the character is full crew of.
   * Only the best HQ counts: you rest in one place.
   */
  async _labHealing() {
    const body = Number(this.actor.system.stats.body?.value) || 0;
    const parts = [{ label: game.i18n.localize(helper("cprFindConfigValue", "statList", "body")), value: body }];
    const hqApi = game.modules.get("cpr-hq")?.active ? game.modules.get("cpr-hq").api : null;
    if (hqApi?.healing?.of) {
      try {
        const best = hqApi.healing.of(this.actor);
        if (best) parts.push(best);
      } catch (err) {
        console.warn(`${MODULE_ID} | cpr-hq healing bonus unavailable`, err);
      }
    }
    return { parts, perDay: parts.reduce((sum, p) => sum + p.value, 0) };
  }

  /** Heal button: a few days of natural healing (BODY + modifiers per day), capped at max HP. */
  async _labHeal(event) {
    event.preventDefault();
    const actor = this.actor;
    const hp = actor.system.derivedStats.hp;
    const { parts, perDay } = await this._labHealing();
    const esc = Handlebars.escapeExpression;
    const breakdown = parts.map(p => `${esc(p.label)} ${p.value}`).join(" + ");
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("CPRSKIN.lab.vitals.healTitle", { name: actor.name }) },
      position: { width: 380 },
      content: `<p class="hint">${game.i18n.localize("CPRSKIN.lab.vitals.healHint")}</p>
        <p><strong>${game.i18n.localize("CPRSKIN.lab.vitals.healPerDay")}:</strong> ${breakdown} = ${perDay}</p>
        <div class="form-group"><label>${game.i18n.localize("CPRSKIN.lab.vitals.healDays")}</label>
          <input type="number" name="days" value="1" min="1" step="1" autofocus></div>
        <div class="form-group"><label>${game.i18n.localize("CPRSKIN.lab.vitals.healExtra")}</label>
          <input type="number" name="extra" value="0" step="1"></div>`,
      rejectClose: false,
      buttons: [{
        action: "heal", label: "CPRSKIN.lab.vitals.healApply", icon: "fa-solid fa-heart-pulse", default: true,
        callback: (_e, b) => ({ days: Math.max(1, Number(b.form.elements.days.value) || 1), extra: Number(b.form.elements.extra.value) || 0 })
      }]
    });
    if (!result) return;
    const daily = Math.max(0, perDay + result.extra);
    const from = Number(hp.value) || 0;
    const to = Math.min(Number(hp.max) || 0, from + daily * result.days);
    await actor.update({ "system.derivedStats.hp.value": to });
    const extra = result.extra ? ` ${result.extra > 0 ? "+" : "−"} ${Math.abs(result.extra)}` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${game.i18n.format("CPRSKIN.lab.vitals.healChat", { name: esc(actor.name), hp: to - from, days: result.days })}</p>
        <p><small>(${breakdown}${extra}) × ${result.days} · HP ${from} → ${to}/${hp.max}</small></p>`
    });
  }

  /** Therapy button: roll the Humanity regained (the player picks the dice), capped at max Humanity. */
  async _labTherapy(event) {
    event.preventDefault();
    const actor = this.actor;
    const humanity = actor.system.derivedStats.humanity;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("CPRSKIN.lab.vitals.therapyTitle", { name: actor.name }) },
      position: { width: 380 },
      content: `<p class="hint">${game.i18n.localize("CPRSKIN.lab.vitals.therapyHint")}</p>
        <div class="form-group"><label>${game.i18n.localize("CPRSKIN.lab.vitals.therapyDice")}</label>
          <input type="text" name="formula" value="2d6" autofocus></div>`,
      rejectClose: false,
      buttons: [{
        action: "roll", label: "CPRSKIN.lab.vitals.therapyRoll", icon: "fa-solid fa-dice", default: true,
        callback: (_e, b) => ({ formula: b.form.elements.formula.value.trim() })
      }]
    });
    if (!result?.formula) return;
    // CPR's rolls take one XdY term and at most one flat +/- mod.
    const formula = result.formula.replace(/\s+/g, "").replace(/^d/i, "1d");
    if (!/^\d+d\d+([+-]\d+)?$/i.test(formula)) {
      ui.notifications.warn(game.i18n.format("CPRSKIN.lab.vitals.therapyBadDice", { formula: result.formula }));
      return;
    }
    const roll = new CPRRoll(game.i18n.localize("CPRSKIN.lab.vitals.therapy"), formula);
    roll.calculateCritical = false;
    await roll.roll();
    const from = Number(humanity.value) || 0;
    const to = Math.min(Number(humanity.max) || 0, from + Math.max(0, roll.resultTotal));
    // The system keeps EMP at Humanity / 10 whenever it changes Humanity itself.
    await actor.update({ "system.derivedStats.humanity.value": to, "system.stats.emp.value": Math.max(0, Math.floor(to / 10)) });
    roll.rollCardExtraArgs.rollDescription = `${game.i18n.localize("CPR.characterSheet.leftPane.humanity")} ${from} → ${to}/${humanity.max}`;
    roll.entityData = { actor: actor.id, token: actor.token?.id ?? null };
    await CPRChat.RenderRollCard(roll);
  }

  /** Custom role title: empty means "list every role", which the system stores as the first role's name. */
  async _labSetRoleTitle(input) {
    const roles = this.actor.itemTypes.role;
    const title = input.value.trim() || ([...roles].sort((a, b) => a.name.localeCompare(b.name))[0]?.name ?? "");
    await this.actor.update({ "system.roleInfo.activeRole": title });
  }

  /* ----------------------------------------------------------- Skills */

  /**
   * Skill rows with everything the views need worked out in one place:
   * localized name, stat, level, modifier (with its tooltip) and the total.
   */
  _labSkillRows() {
    const actor = this.actor;
    const statLabel = key => game.i18n.localize(helper("cprFindConfigValue", "statList", key));
    const situationalLabel = game.i18n.localize("CPRSKIN.lab.skills.situational");

    return actor.itemTypes.skill.map(skill => {
      const name = game.i18n.localize(helper("cprGetLocalizedlNameKey", skill));
      const mod = Number(helper("cprGetSkillModInfo", skill.name, actor, "modTotal")) || 0;
      const situational = !!helper("cprGetSkillModInfo", skill.name, actor, "hasSituational");
      const mods = helperHash("cprGetSkillModInfo", { keepSituational: true }, skill.name, actor, "modList") || [];
      const statValue = Number(actor.system.stats[skill.system.stat]?.value) || 0;
      const level = Number(skill.system.level) || 0;
      return {
        id: skill.id,
        rollName: skill.name,
        name,
        difficult: skill.system.difficulty === "difficult",
        basic: !!skill.system.basic,
        core: !!skill.system.core,
        favorite: !!skill.system.favorite,
        stat: skill.system.stat,
        statLabel: statLabel(skill.system.stat),
        statValue,
        category: skill.system.category,
        level,
        mod,
        situational,
        modTooltip: mods.map(m => `${m.source}: ${m.value > 0 ? "+" : ""}${m.value}${m.isSituational ? ` (${situationalLabel})` : ""}`).join("<br>"),
        base: level + mod + statValue,
        initial: name.charAt(0).toUpperCase()
      };
    }).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** Skill rows filtered and grouped for the Skills tab. */
  _labSkills(prefs, allRows) {
    const actor = this.actor;
    const filter = this.options.cprContentFilter;
    const categories = helper("cprFindConfigObj", "skillCategories");
    let rows = allRows.filter(r => helper("cprSheetContentFilter", filter, r.name));
    if (prefs.hideZero === "hide") rows = rows.filter(r => r.level > 0 || r.favorite);

    const groups = new Map();
    const add = (key, label, row) => {
      if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
      groups.get(key).rows.push(row);
    };

    if (prefs.pinned === "top") {
      for (const row of rows.filter(r => r.favorite)) add("pinned", game.i18n.localize("CPRSKIN.lab.skills.pinned"), row);
    }
    for (const row of rows) {
      if (prefs.pinned === "top" && row.favorite) continue;
      if (prefs.skillGroup === "stat") add(`stat-${row.stat}`, row.statLabel, row);
      else if (prefs.skillGroup === "alpha") add(`alpha-${row.initial}`, row.initial, row);
      else add(`cat-${row.category}`, game.i18n.localize(categories[row.category] ?? row.category), row);
    }

    let list = [...groups.values()];
    if (prefs.skillGroup === "category") {
      const order = Object.keys(categories);
      list.sort((a, b) => (a.key === "pinned" ? -1 : b.key === "pinned" ? 1
        : order.indexOf(a.key.slice(4)) - order.indexOf(b.key.slice(4))));
    } else if (prefs.skillGroup === "stat") {
      const order = Object.keys(actor.system.stats);
      list.sort((a, b) => (a.key === "pinned" ? -1 : b.key === "pinned" ? 1
        : order.indexOf(a.key.slice(5)) - order.indexOf(b.key.slice(5))));
    }
    for (const group of list) group.collapsed = this._labCollapsed.has(group.key);
    return { groups: list, count: rows.length };
  }

  /* ------------------------------------------------------------ Effects */

  /**
   * Effects that are changing the character right now (the actor's own and
   * those transferred from its items), for the bar under the tabs.
   */
  _labEffects() {
    const hidden = this._labEffectsHidden();
    const out = [];
    for (const effect of this.actor.allApplicableEffects()) {
      if (!effect.active || hidden[effect.name]) continue;
      out.push({
        uuid: effect.uuid,
        name: effect.name,
        img: effect.img,
        wound: effect.parent?.type === "criticalInjury",
        tooltip: [effect.name, ...effect.changes.map((c, i) => this._labEffectChange(effect, c, i))]
          .map(line => Handlebars.escapeExpression(line)).join("<br>")
      });
    }
    // Critical injuries without an effect still change the character (Broken Arm…), so they get a chip too.
    for (const injury of this._labInjuries()) {
      if (hidden[injury.name]) continue;
      out.push({
        itemId: injury.id,
        injury: true,
        name: injury.name,
        img: injury.img,
        tooltip: [injury.name, injury.summary].filter(Boolean).map(line => Handlebars.escapeExpression(line)).join("<br>")
      });
    }
    return out.sort((a, b) => (!!b.injury - !!a.injury) || a.name.localeCompare(b.name));
  }

  /** Critical injuries that carry no Active Effect of their own. */
  _labInjuries() {
    return this.actor.itemTypes.criticalInjury.filter(item => !item.effects.size).map(item => {
      const text = String(item.system.description?.value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return {
        id: item.id,
        name: item.name,
        img: item.img,
        summary: text.length > 160 ? `${text.slice(0, 157)}…` : text
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Effect names this user keeps out of the Active bar. Agent, Flashlight and
   * fashionware are hidden unless the user shows them; the user's choices
   * (labUI.effectsHidden, by effect name) win.
   */
  _labEffectsHidden() {
    const hidden = {};
    const defaults = defaultHiddenEffects();
    for (const effect of this.actor.allApplicableEffects()) {
      const parent = effect.parent;
      if (defaults.includes(effect.name)
        || (parent?.type === "cyberware" && parent.system.type === "fashionware")) hidden[effect.name] = true;
    }
    for (const [name, value] of Object.entries(game.modules.get(MODULE_ID).api.getUI().effectsHidden ?? {})) {
      if (value) hidden[name] = true;
      else delete hidden[name];
    }
    return hidden;
  }

  async _labToggleEffectBar(name) {
    const api = game.modules.get(MODULE_ID).api;
    const choices = { ...(api.getUI().effectsHidden ?? {}), [name]: !this._labEffectsHidden()[name] };
    await api.setUI("effectsHidden", choices);
    this.render(false);
  }

  /** One change of an effect as the system's Effects tab names it ("Perception (Hearing) +2"). */
  _labEffectChange(effect, change, index) {
    const category = effect.getFlag(game.system.id, `changes.cats.${index}`);
    let label = category ? helper("cprGetChangeNameByKey", effect, category, change.key) : null;
    if (!label || label === "???") label = change.key.split(".").pop();
    if (change.key === "bonuses.hasPainSuppression") return label;
    return `${label} ${helper("cprEffectModMode", change.mode, change.value)}`;
  }

  /* ------------------------------------------------------------- Role */

  /** Every role the character has: they are all in use at once, so the header lists them all. */
  _labRoleNames() {
    return this.actor.itemTypes.role.map(role => game.i18n.localize(helper("cprGetLocalizedlNameKey", role)))
      .sort((a, b) => a.localeCompare(b)).join(" · ");
  }

  /**
   * The custom role title, like the system sheet's Role field, or "" when it is
   * just one of the character's role names (the system fills that in by itself).
   */
  _labRoleTitle() {
    const title = String(this.actor.system.roleInfo?.activeRole ?? "").trim();
    return this.actor.itemTypes.role.some(role => role.name === title) ? "" : title;
  }

  async _labRoles() {
    const actor = this.actor;
    const modInfo = name => ({
      mod: Number(helper("cprGetSkillModInfo", name, actor, "modTotal")) || 0,
      situational: !!helper("cprGetSkillModInfo", name, actor, "hasSituational")
    });
    const abilityLabel = name => game.i18n.localize(helper("cprGetLocalizedlNameKey", name, "roleAbility"));
    return Promise.all(actor.itemTypes.role.sort((a, b) => a.name.localeCompare(b.name)).map(async role => ({
      id: role.id,
      // The system's sub-ability inputs read data-role-name as written here.
      roleRef: String(role),
      name: game.i18n.localize(helper("cprGetLocalizedlNameKey", role)),
      img: role.img,
      rank: role.system.rank,
      // Enriched, so @UUID citations become content links.
      description: await TextEditor.enrichHTML(role.system.description?.value ?? "", { async: true, relativeTo: role, secrets: role.isOwner }),
      main: {
        name: role.system.mainRoleAbility,
        label: abilityLabel(role.system.mainRoleAbility),
        hasRoll: role.system.hasRoll,
        note: roleReminder(role, role.system.mainRoleAbility),
        noteKey: noteKey(role.system.mainRoleAbility),
        custom: role.getFlag(MODULE_ID, `notes.${noteKey(role.system.mainRoleAbility)}`) !== undefined,
        ...modInfo(role.system.mainRoleAbility)
      },
      abilities: [...role.system.abilities].sort((a, b) => a.name.localeCompare(b.name)).map(ability => ({
        name: ability.name,
        label: abilityLabel(ability.name),
        rank: ability.rank,
        hasRoll: ability.hasRoll,
        // Points needed per +1, when the ability converts rank into a bonus.
        ratio: ability.bonusRatio > 1 ? ability.bonusRatio : null,
        bonus: ability.bonusRatio ? Math.floor((Number(ability.rank) || 0) / ability.bonusRatio) : null,
        note: roleReminder(role, ability.name),
        noteKey: noteKey(ability.name),
        custom: role.getFlag(MODULE_ID, `notes.${noteKey(ability.name)}`) !== undefined,
        ...modInfo(ability.name)
      })),
      team: game.settings.get(MODULE_ID, "execTeam") ? execTeamContext(role, this.isEditable) : null
    })));
  }

  /* --------------------------------------------------------- Lifepath */

  _labLifepath(data) {
    const html = data.enrichedHTML ?? {};
    const card = ([key, enriched, label]) => ({
      key,
      label: game.i18n.localize(`CPR.characterSheet.bottomPane.lifepath.${label}`),
      html: html[enriched] ?? "",
      empty: !String(html[enriched] ?? "").replace(/<[^>]*>/g, "").trim()
    });
    const byKey = Object.fromEntries(LIFEPATH_FIELDS.map(f => [f[0], card(f)]));
    return Object.fromEntries(Object.entries(LIFEPATH_GROUPS).map(([group, keys]) => [group, keys.map(k => byKey[k])]));
  }

  /* ------------------------------------------------------------- cpr-hq */

  /** cpr-hq's Workshop, Downtime and Lifestyle & Housing panels, when cpr-hq is active and they apply to this character. */
  _hqPanels() {
    const panels = game.modules.get("cpr-hq")?.active ? game.modules.get("cpr-hq").api?.panels : null;
    if (!panels) return {};
    const out = {};
    // "downtime" and "housing" are the two halves of cpr-hq's combined "lifestyle" panel: Downtime gets its own tab, housing tops the Life tab.
    for (const key of ["downtime", "housing", "workshop"]) {
      const panel = panels[key];
      if (!panel) continue;
      try {
        if (!panel.available(this.actor)) continue;
        if (!this._hqUI[key]) {
          this._hqUI[key] = panel.newUI(this.actor);
          if (key === "downtime") this._hqUI[key].pastOpen = true; // start with "Past days" expanded
        }
        out[key] = { partial: panel.partial, context: panel.context(this.actor, this._hqUI[key]) };
      } catch (err) {
        console.error(`${MODULE_ID} | cpr-hq ${key} panel failed`, err);
      }
    }
    return out;
  }

  /** cpr-hq's Lifestyle and Workshop header buttons open what this sheet already shows in its tabs. */
  _getHeaderButtons() {
    return super._getHeaderButtons().filter(b => !["cpr-hq-lifestyle-button", "cpr-hq-workshop-button"].includes(b.class));
  }

  _labTabs(hq) {
    const tabs = [
      { id: "skills", icon: "fa-solid fa-dice-d20", label: "CPR.characterSheet.rightPane.skills.title" },
      { id: "role", icon: "fa-solid fa-star", label: "CPR.global.role.role" },
      { id: "fight", icon: "fa-solid fa-hand-fist", label: "CPR.characterSheet.bottomPane.fight.title" },
      { id: "gear", icon: "fa-solid fa-briefcase", label: "CPR.global.itemTypes.gear" },
      { id: "cyberware", icon: "fa-solid fa-microchip", label: "CPR.characterSheet.rightPane.cyber.title" },
      { id: "lifepath", icon: "fa-solid fa-route", label: "CPRSKIN.lab.tabs.life" }
    ];
    if (hq.downtime) tabs.push({ id: "downtime", icon: "fa-solid fa-hourglass-half", label: "CPRSKIN.lab.tabs.downtime" });
    if (hq.workshop) tabs.push({ id: "workshop", icon: "fa-solid fa-screwdriver-wrench", label: "CPRSKIN.lab.tabs.workshop" });
    tabs.push({ id: "effects", icon: "fa-solid fa-bolt", label: "CPR.characterSheet.rightPane.effects.title" });
    return tabs;
  }

  /* -------------------------------------------------------- Listeners */

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];

    // Collapsible skill groups.
    for (const toggle of root.querySelectorAll("[data-lab-group-toggle]")) {
      toggle.addEventListener("click", event => {
        event.preventDefault();
        const key = toggle.dataset.labGroupToggle;
        const group = toggle.closest(".cprlab-skill-group");
        const collapsed = !this._labCollapsed.has(key);
        if (collapsed) this._labCollapsed.add(key);
        else this._labCollapsed.delete(key);
        group?.classList.toggle("collapsed", collapsed);
      });
    }

    // Open/collapse panels (the Actions dock and its sections), remembered per user.
    for (const toggle of root.querySelectorAll("[data-lab-ui]")) {
      toggle.addEventListener("click", event => {
        event.preventDefault();
        const key = toggle.dataset.labUi;
        const target = root.querySelector(`[data-lab-ui-target="${key}"]`);
        const collapsed = !target?.classList.contains("collapsed");
        target?.classList.toggle("collapsed", collapsed);
        if (toggle.dataset.tipOpen) {
          toggle.dataset.tooltip = toggle.ariaLabel = collapsed ? toggle.dataset.tipClosed : toggle.dataset.tipOpen;
        }
        game.modules.get(MODULE_ID).api.setUI(key, collapsed);
      });
    }

    // Active effects bar: a chip opens its effect; the label opens the Effects tab.
    for (const chip of root.querySelectorAll("[data-lab-effect]")) {
      chip.addEventListener("click", event => {
        event.preventDefault();
        fromUuidSync(chip.dataset.labEffect)?.sheet.render(true);
      });
    }
    for (const chip of root.querySelectorAll("[data-lab-injury]")) {
      chip.addEventListener("click", event => {
        event.preventDefault();
        this.actor.items.get(chip.dataset.labInjury)?.sheet.render(true);
      });
    }
    // Effects tab: show or hide an effect in the Active bar.
    for (const button of root.querySelectorAll("[data-lab-effect-bar]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        this._labToggleEffectBar(button.dataset.labEffectBar);
      });
    }
    root.querySelector("[data-lab-effects-tab]")?.addEventListener("click", event => {
      event.preventDefault();
      this.activateTab("effects");
    });

    // Toolbar quick switches: the same per-user options as the Skin dialog.
    for (const pill of root.querySelectorAll("[data-lab-pref]")) {
      pill.addEventListener("click", event => {
        event.preventDefault();
        game.modules.get(MODULE_ID).api.setPref(pill.dataset.labPref, pill.dataset.labValue);
      });
    }

    // Edit a role ability reminder (stored on the role item).
    for (const button of root.querySelectorAll("[data-lab-edit-note]")) {
      button.addEventListener("click", event => this._editRoleNote(event, button));
    }

    // Quick level stepper on skills (the system's own input handles typed values).
    for (const button of root.querySelectorAll("[data-lab-step]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        const item = this.actor.items.get(button.closest("[data-item-id]")?.dataset.itemId);
        if (!item) return;
        const level = Math.max(0, (Number(item.system.level) || 0) + Number(button.dataset.labStep));
        item.update({ "system.level": level });
      });
    }

    // Header: custom role title, natural healing and therapy.
    const roleTitle = root.querySelector("[data-lab-role-title]");
    roleTitle?.addEventListener("change", event => {
      event.stopPropagation();
      this._labSetRoleTitle(roleTitle);
    });
    root.querySelector("[data-lab-heal]")?.addEventListener("click", event => this._labHeal(event));
    root.querySelector("[data-lab-portrait]")?.addEventListener("click", event => this._labEditPortrait(event));
    // SP number: ablate that location by 1 (the system ablates every equipped armor there).
    for (const loc of root.querySelectorAll("[data-lab-ablate]")) {
      loc.addEventListener("click", event => {
        event.preventDefault();
        if (this.isEditable) this.actor._ablateArmor(loc.dataset.labAblate, 1);
      });
    }
    for (const button of root.querySelectorAll("[data-lab-vital-step]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        this._labStepVital(button);
      });
    }
    root.querySelector("[data-lab-therapy]")?.addEventListener("click", event => this._labTherapy(event));

    activateGear(this, root);
    activateFight(this, root);
    activateGrenades(this, root);
    activateCyberBody(this, root);
    activateExecTeam(this, root);

    // cpr-hq panels.
    const panels = game.modules.get("cpr-hq")?.api?.panels;
    if (panels) {
      for (const element of root.querySelectorAll("[data-lab-hq]")) {
        const key = element.dataset.labHq;
        try {
          panels[key]?.activate(element, this._hqUI[key], () => this.render(false));
        } catch (err) {
          console.error(`${MODULE_ID} | cpr-hq ${key} panel listeners failed`, err);
        }
      }
    }
  }

  async _editRoleNote(event, button) {
    event.preventDefault();
    const role = this.actor.items.get(button.closest("[data-item-id]")?.dataset.itemId);
    const ability = button.dataset.labEditNote;
    if (!role || !ability) return;
    const key = noteKey(ability);
    const current = roleReminder(role, ability);
    const builtIn = ROLE_TEXT[ability] ?? "";
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("CPRSKIN.lab.role.editTitle", { ability }) },
      position: { width: 520 },
      content: `<p class="hint">${game.i18n.localize("CPRSKIN.lab.role.editHint")}</p>
        <textarea name="note" rows="6" style="width:100%">${Handlebars.escapeExpression(current)}</textarea>`,
      rejectClose: false,
      buttons: [
        { action: "save", label: "CPRSKIN.lab.role.save", icon: "fas fa-check", default: true,
          callback: (_e, b) => ({ note: b.form.elements.note.value.trim() }) },
        { action: "reset", label: "CPRSKIN.lab.role.reset", icon: "fas fa-undo", callback: () => ({ reset: true }) }
      ]
    });
    if (!result) return;
    if (result.reset || result.note === builtIn) await role.unsetFlag(MODULE_ID, `notes.${key}`);
    else await role.setFlag(MODULE_ID, `notes.${key}`, result.note);
  }
}

/**
 * cpr-hq's Downtime and Housing panels count days from the calendar date, so redraw open sheets
 * showing them when Simple Calendar moves (debounced like cpr-hq's own Downtime window).
 */
const refreshHqDates = foundry.utils.debounce(() => {
  for (const app of Object.values(ui.windows)) {
    if ((app instanceof CPRLabSheet) && app.rendered && (app._hqUI.downtime || app._hqUI.housing)) app.render(false);
  }
}, 1000);
Hooks.on("simple-calendar-date-time-change", () => refreshHqDates());
