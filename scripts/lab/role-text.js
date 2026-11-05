/**
 * Short, paraphrased reminders for the core Role Abilities, shown on the skin
 * sheet's Role tab. They are table reminders written for this module, not
 * rulebook text: check the core rules for the full details. A player or GM
 * can replace any of them on a character (stored on the role item's flags).
 */
export const ROLE_TEXT = {
  // Rockerboy
  "Charismatic Impact":
    "Influence people who are fans of your work: roll to get favours, information or help from them. The bigger the ask, the harder the roll.",

  // Solo
  "Combat Awareness":
    "Your Rank is a pool of points you split between the sub-abilities below, and move between them as the rules allow.",
  "Damage Deflection": "Reduces the damage you take from hits.",
  "Fumble Recovery": "With enough points here, you ignore critical failures on your attacks.",
  "Initiative Reaction": "Adds to your Initiative rolls.",
  "Precision Attack": "Adds to your attack rolls.",
  "Spot Weakness": "Adds to the damage of your attacks.",
  "Threat Detection": "Adds to Perception checks to spot threats and ambushes.",

  // Netrunner
  "Interface":
    "Added to your NET Actions in a Netrun (Backdoor, Cloak, Control, Eye-Dee, Pathfinder, Scanner, Slide, Virus, Zap). A higher Rank also gives you more NET Actions per turn.",

  // Tech
  "Maker":
    "Your Maker Rank is spread across the four expertises below, which let you repair, upgrade, build and invent gear.",
  "Field Expertise": "Make quick, temporary fixes and repair gear in the field.",
  "Upgrade Expertise": "Improve an item you already have.",
  "Fabrication Expertise": "Build items from materials, given time and tools.",
  "Invention Expertise": "Design items that don't exist yet.",

  // Medtech
  "Medicine":
    "Your Medicine Rank is spread across Surgery and the Medical Tech specialties below.",
  "Surgery": "Treat injuries that need surgery.",
  "Surgery Skill": "Roll your Surgery skill.",
  "Medical Tech (Pharmaceuticals)": "Make medical drugs from materials.",
  "Medical Tech (Cryosystem Operation)": "Operate cryo equipment, such as putting a dying patient on ice.",
  "Medical Tech Skill": "Roll your Medical Tech skill.",

  // Media
  "Credibility":
    "People believe what you publish. Roll to pick up rumours and leads; your stories reach and convince more people as your Rank rises.",

  // Exec
  "Teamwork":
    "You lead a team of employees, and get corporate perks that improve with your Rank.",

  // Lawman
  "Backup":
    "Call your agency for backup. A higher Rank brings more, and better-equipped, help.",

  // Fixer
  "Operator":
    "You know people who can get things others can't. Your Rank sets how far your network reaches.",
  "Haggle": "Roll to get a better price when you deal through your contacts.",

  // Nomad
  "Moto":
    "You can call on your family's vehicles; a higher Rank gives you more and better ones."
};

/** The reminder for an ability: the character's own note first, then the built-in one. */
export function roleReminder(role, abilityName) {
  const own = role.getFlag("cpr-sheet-skin", `notes.${noteKey(abilityName)}`);
  return own ?? ROLE_TEXT[abilityName] ?? "";
}

/** Flag keys can't contain dots; ability names can't contain much else, so slugify them. */
export function noteKey(abilityName) {
  return abilityName.replace(/[^A-Za-z0-9]+/g, "_");
}
