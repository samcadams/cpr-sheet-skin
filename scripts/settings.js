/**
 * Settings menus: "Sheet options" (per user), "Sheet rules" (GM) and the
 * state-labels sub-modal. api.settings (set in main.js) lists them for the GM Director.
 */

const MODULE_ID = "cpr-sheet-skin";
const TEMPLATES = `modules/${MODULE_ID}/templates/settings`;

const PREF_KEYS = ["scale", "theme", "dock", "vitals", "effectsBar", "skills", "skillGroup", "hideZero", "pinned", "role", "cyberView", "cyberItems", "rollDialog"];
const RULE_KEYS = ["autoTrackArmor", "humanityStrip", "execTeam", "hiddenEffects"];
const STATES = ["warn", "danger", "psycho", "extreme"];

const api = () => game.modules.get(MODULE_ID).api;
const t = (key) => game.i18n.localize(key);

/** The groups the GM Director lists; call once i18n is ready. */
export function settingsGroups() {
  return [
    {
      id: "sheetOptions", label: t("CPRSKIN.settings.sheetOptions.name"), hint: t("CPRSKIN.settings.sheetOptions.hint"),
      menu: "sheetOptions", keys: ["prefs"]
    },
    {
      id: "sheetRules", label: t("CPRSKIN.settings.sheetRules.name"), hint: t("CPRSKIN.settings.sheetRules.hint"),
      menu: "sheetRules", keys: ["autoTrackArmor", "humanityStrip", "humanityLabels", "execTeam", "hiddenEffects"]
    }
  ];
}

class SheetOptionsForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cprskin-sheet-options",
      title: "CPRSKIN.settings.sheetOptions.name",
      template: `${TEMPLATES}/sheet-options.hbs`,
      width: 460,
      closeOnSubmit: true
    });
  }

  getData() {
    return { rows: PREF_KEYS.map((key) => ({ key, label: t(`CPRSKIN.${key}.label`), options: api().choices(key) })) };
  }

  async _updateObject(_event, formData) {
    const current = api().getPrefs();
    for (const key of PREF_KEYS) {
      if (key in formData && formData[key] !== current[key]) await api().setPref(key, formData[key]);
    }
  }
}

class StateLabelsForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cprskin-state-labels",
      title: "CPRSKIN.settings.stateLabels.title",
      template: `${TEMPLATES}/state-labels.hbs`,
      width: 460,
      closeOnSubmit: true
    });
  }

  getData() {
    const stored = game.settings.get(MODULE_ID, "humanityLabels") ?? {};
    return {
      hint: t("CPRSKIN.settings.stateLabels.hint"),
      rows: STATES.map((key) => ({ key, label: t(`CPRSKIN.lab.vitals.humanityState.${key}`), value: stored[key] ?? "" }))
    };
  }

  async _updateObject(_event, formData) {
    const labels = {};
    for (const key of STATES) {
      const value = String(formData[key] ?? "").trim();
      if (value) labels[key] = value;
    }
    await game.settings.set(MODULE_ID, "humanityLabels", labels);
  }
}

class SheetRulesForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cprskin-sheet-rules",
      title: "CPRSKIN.settings.sheetRules.name",
      template: `${TEMPLATES}/sheet-rules.hbs`,
      width: 520,
      closeOnSubmit: true
    });
  }

  getData() {
    return {
      labelsButton: t("CPRSKIN.settings.editLabels"),
      rows: RULE_KEYS.map((key) => {
        const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
        return {
          key, name: t(setting.name), hint: t(setting.hint),
          boolean: setting.type === Boolean,
          value: game.settings.get(MODULE_ID, key),
          labels: key === "humanityStrip"
        };
      })
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action=labels]").on("click", () => new StateLabelsForm().render(true));
  }

  async _updateObject(_event, formData) {
    for (const key of RULE_KEYS) {
      if (!(key in formData)) continue;
      const value = game.settings.settings.get(`${MODULE_ID}.${key}`).type === Boolean ? !!formData[key] : String(formData[key]);
      if (value !== game.settings.get(MODULE_ID, key)) await game.settings.set(MODULE_ID, key, value);
    }
  }
}

/** Register the two settings menus (call from init, after the settings). */
export function registerMenus() {
  game.settings.registerMenu(MODULE_ID, "sheetOptions", {
    name: "CPRSKIN.settings.sheetOptions.name",
    label: "CPRSKIN.settings.sheetOptions.label",
    hint: "CPRSKIN.settings.sheetOptions.hint",
    icon: "fa-solid fa-sliders",
    type: SheetOptionsForm,
    restricted: false
  });
  game.settings.registerMenu(MODULE_ID, "sheetRules", {
    name: "CPRSKIN.settings.sheetRules.name",
    label: "CPRSKIN.settings.sheetRules.label",
    hint: "CPRSKIN.settings.sheetRules.hint",
    icon: "fa-solid fa-scale-balanced",
    type: SheetRulesForm,
    restricted: true
  });
}
