/**
 * Cyber tab body view: where each piece of installed cyberware sits on the body.
 *
 * Works for any item, so new or homebrew gear always shows up. In order:
 *   1. flags.cpr-sheet-skin.body.at  set by hand with the "place on body" picker
 *   2. KNOWN[name]                   a short table of core items (spot, pair, glyph, visual)
 *   3. the item it is installed in   options sit on their foundational (eye options on that eye,
 *                                    arm options on that arm's forearm, leg options on the calf)
 *   4. system.type                   cyberEye -> eyes, cyberwareInternal -> organs, ...
 * Only system.type + isFoundational change the BODY (cyberlimb -> chrome, eye -> lens,
 * cyberaudio -> ear pickups, neuralware -> traces); everything else is a marker on its spot.
 */
import { LOC } from "./model.js";

const MODULE_ID = "cpr-sheet-skin";

/** ".x" = a spot on the limb the item hangs from (the side comes from that limb). */
const KNOWN = {
  "neural link": { at: "brain" }, "sandevistan": { at: "spine" }, "kerenzikov": { at: "spine" },
  "chipware socket": { at: "neck" }, "interface plugs": { at: ["armR.wrist", "armL.wrist"] }, "pain editor": { at: "brain" },
  "toxin binders": { at: "liver" }, "nasal filters": { at: "nose" }, "independent air supply": { at: "lungs" },
  "enhanced antibodies": { at: "heart" }, "gills": { at: "neck" },
  "subdermal armor": { at: "chest", visual: "armor" }, "skin weave": { at: "chest", visual: "armor" },
  "light tattoo": { at: "armL.forearm", glyph: "tattoo" }, "techhair": { at: "scalp" }, "biomonitor": { at: "armL.wrist" },
  "wolvers": { at: ".hand", glyph: "blades" }, "rippers": { at: ".hand", glyph: "blades" }, "scratchers": { at: ".hand", glyph: "blades" },
  "big knucks": { at: ".hand" }, "popup shield": { at: ".forearm" }, "popup melee weapon": { at: ".forearm" },
  "popup ranged weapon": { at: ".forearm" }, "popup grenade launcher": { at: ".forearm" }, "grapple hand": { at: ".hand" },
  "jump booster": { at: ".calf", glyph: "thruster", pair: true }, "grip foot": { at: ".foot" }, "skate foot": { at: ".foot" },
  "talon foot": { at: ".foot" }, "web foot": { at: ".foot" }
};
const LIMB = { cyberEye: s => `eye${s}`, cyberArm: s => `arm${s}.shoulder`, cyberLeg: s => `leg${s}.hip`, cyberAudioSuite: s => `ear${s}` };
const SUB = { cyberArm: ".forearm", cyberLeg: ".calf" };
const SPREAD = {
  cyberwareInternal: ["gut", "kidneys", "lungs", "heart", "liver"],
  cyberwareExternal: ["chest", "pelvis", "neck"],
  fashionware: ["armR.forearm", "neck", "armL.upper", "jaw"]
};

/** "R" / "L" from the name, else by order among same-type foundationals (1st right, 2nd left). */
function sideOf(item, all) {
  const n = item.name.toLowerCase();
  if (/\((r|right)\)|\bright\b/.test(n)) return "R";
  if (/\((l|left)\)|\bleft\b/.test(n)) return "L";
  return all.filter(o => o.type === item.type && o.found).indexOf(item) % 2 ? "L" : "R";
}

/**
 * @param {Array<{id, name, type, found, parent, flag}>} items  installed cyberware, parents before children
 * @returns {{ at: Object<id, {at:string[], how:string, pts:number[][], node:boolean, glyph?:string, part:string, side?:string}>,
 *             vis: Set<string>, chrome: Set<string> }}
 */
export function place(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  const counters = {}, out = {}, vis = new Set(), chrome = new Set();
  const next = (key, list) => { counters[key] = (counters[key] ?? -1) + 1; return list[counters[key] % list.length]; };
  const limbOf = item => {
    if (!item) return null;
    if (LIMB[item.type] && item.found) return { type: item.type, side: sideOf(item, items) };
    return limbOf(byId.get(item.parent));
  };
  const how = key => game.i18n.localize(`CPRSKIN.lab.cyberBody.how.${key}`);

  for (const item of items) {
    const known = KNOWN[item.name.toLowerCase()], limb = limbOf(item), parent = byId.get(item.parent);
    let at, by;
    if (item.flag && [].concat(item.flag).every(a => LOC[a])) { at = [].concat(item.flag); by = how("hand"); }
    else if (known) {
      at = [].concat(known.at).map(a => (a.startsWith(".") ? `${limb ? (limb.type === "cyberLeg" ? "leg" : "arm") + limb.side : "armR"}${a}` : a));
      if (known.pair && limb) at.push(at[0].replace(/(arm|leg)[RL]/, (_m, p) => p + (limb.side === "R" ? "L" : "R")));
      by = how("known");
    } else if (item.found && LIMB[item.type]) { at = [LIMB[item.type](sideOf(item, items))]; by = how("type"); }
    else if (parent && limb) { at = [LIMB[limb.type](limb.side).replace(/\.(shoulder|hip)$/, "") + (SUB[limb.type] ?? "")]; by = game.i18n.format("CPRSKIN.lab.cyberBody.how.parent", { name: parent.name }); }
    else if (parent && out[parent.id]) { at = [...out[parent.id].at]; by = game.i18n.format("CPRSKIN.lab.cyberBody.how.parent", { name: parent.name }); }
    else {
      by = how("type");
      at = [SPREAD[item.type] ? next(item.type, SPREAD[item.type]) : { neuralWare: "brain", borgware: "spine" }[item.type] ?? "chest"];
    }

    // Structural changes come from the type, so any foundational limb, eye, ear or neural link shows.
    if (item.found && (item.type === "cyberArm" || item.type === "cyberLeg")) chrome.add(at[0].split(".")[0]);
    if (item.found && item.type === "cyberEye") vis.add(at[0]);
    if (item.found && item.type === "cyberAudioSuite") { vis.add("earR"); vis.add("earL"); }
    if (item.found && item.type === "neuralWare") vis.add("neural");
    if (known?.visual) vis.add(known.visual);

    const structural = item.found && (LIMB[item.type] || item.type === "neuralWare");
    out[item.id] = {
      at, how: by,
      node: !structural && !known?.visual,
      glyph: known?.glyph,
      side: item.found && LIMB[item.type] && item.type !== "cyberAudioSuite" ? sideOf(item, items) : null,
      part: item.found && item.type === "cyberEye" ? at[0]
        : item.found && item.type === "neuralWare" ? "neural"
          : item.found && item.type === "cyberAudioSuite" ? "earR"
            : item.found && LIMB[item.type] ? at[0].split(".")[0]
              : known?.visual ?? item.id
    };
  }

  // Several markers on one spot: fan them out a little so lines and markers don't stack.
  // Around an eye or ear they fan outwards, away from the face.
  const seen = {};
  for (const item of items) {
    const r = out[item.id];
    r.pts = r.at.map(a => {
      const base = LOC[a] ?? LOC.chest;
      if (!r.node || r.glyph) return base;
      const n = (seen[a] = (seen[a] ?? -1) + 1), side = Math.sign(base[0] - 150) || 1;
      if (/^(eye|ear)/.test(a)) return [base[0] + side * [9, 11, 8, 14][n % 4], base[1] + [-6, 2, 9, -1][n % 4]];
      return [base[0] + [0, 7, -7, 0, 7][n % 5], base[1] + [0, 6, 6, 12, -6][n % 5]];
    });
  }
  return { at: out, vis, chrome };
}

/** Human name of a spot: "Right arm · forearm", "Gut". */
export function spotName(key) {
  const [base, sub] = key.split(".");
  const m = /^(arm|leg|eye|ear)([RL])$/.exec(base);
  const part = m
    ? game.i18n.format("CPRSKIN.lab.cyberBody.side", { side: game.i18n.localize(`CPRSKIN.lab.cyberBody.${m[2] === "R" ? "right" : "left"}`), part: game.i18n.localize(`CPRSKIN.lab.cyberBody.spot.${m[1]}`) })
    : game.i18n.localize(`CPRSKIN.lab.cyberBody.spot.${base}`);
  return sub ? `${part} · ${game.i18n.localize(`CPRSKIN.lab.cyberBody.spot.${sub}`)}` : part;
}

/** The hand-placed spot stored on an item (flags.cpr-sheet-skin.body.at). */
export const handFlag = item => item.getFlag(MODULE_ID, "body.at") ?? null;
