# CPR Sheet Skin: an alternative Cyberpunk RED character sheet

An opt-in character sheet for the Cyberpunk RED Core system, with one tab bar, a bold header with big
numbers, and per-user themes and view options. Requires Foundry VTT v12 and Cyberpunk RED Core v0.92.4.

The sheet extends the system's own character sheet: every roll, item action and calculation is still
the system's, and no system code is changed.

## Using it

The sheet is opt-in per actor. Open a character, click **Sheet** in the window header (Sheet
Configuration) and pick **Cyberpunk RED Sheet (CPR Sheet Skin)**. Switch back the same way; nothing on
the actor changes.

- **Tabs:** Skills, Role, Fight, Gear, Cyber, Life, Effects, plus Downtime and Workshop with CPR HQ.
- **Header:** portrait, every active role, HP and Humanity with hover spinners, a thin SP column
  (click a value to ablate), wound and Death Save status, a quiet natural-healing button and therapy rolls.
- **Themes:** HQ and Gold. The palette button beside the Eurobucks chip switches them. Themes and view
  options are per user (client settings), so each player picks their own.
- **View options:** each tab has its own pills (skills as dice or a table and grouped, role cards or
  compact, and so on).
- **Fight tab:** cards for equipped weapons and armor, with carried and stashed gear shown dimmed.
- **Gear and Cyber tabs:** sorted gear rows (pinned, equipped, carried, stashed), reload and ammo
  buttons in the row, and a body view for installed cyberware.
- **Exec team:** an Exec's team slots under the Role card (open at Rank 3, 5 and 9). Drop an Actor on
  a slot, track Loyalty and roll Loyalty checks; the GM can mark a teammate "Loyal to you".
- **Active effects bar** above the tabs, with an eye toggle to hide effects you don't need to see.
- Equipping armor tracks it on every location it covers, on this sheet and on the system sheet.

## Settings

In **Configure Settings → CPR Sheet Skin** there are two buttons:

- **Sheet options** (every user, this browser only): text size, theme, combat dock, Death Save and
  wound display, the active effects bar, and each tab's view. The same choices as the sheet's own
  pills and theme switch. **Theme Attack Check** (off by default) also shows the system's roll
  dialog for stat, skill and attack rolls in your sheet theme, with the sum (stat + skill + mods +
  Luck) over a d10 **Roll +N** button.
- **Sheet rules** (GM, whole world):
  - **Track armor when equipped** (on): equipping armor makes it the tracked armor on every location
    it covers; taking it off hands over to the best other equipped armor. Also on the system sheet.
  - **Show cyberpsychosis state label** (on): the strip under HP and Humanity at EMP 2 or below.
    Humanity keeps its colour when it's off. **Edit state labels** changes the four texts; an
    empty field uses the built-in one.
  - **Show Exec Team Slots & Loyalty Tracker** (on): the Team block under the Exec role card.
  - **Default Hidden Effects** ("Agent, Flashlight"): effect names kept out of the active effects bar
    until a user shows them. Fashionware is always hidden by default.

## Optional modules

Everything below is checked at runtime; the sheet works without any of them.

- **CPR HQ** (`cpr-hq`): Downtime and Workshop tabs, Lifestyle & Housing on the Life tab, gear upkeep
  status in Gear rows, and HQ healing benefits in the natural-healing button.
- **Better Grenades** (`mmutons-cyberpunk-red-upgraded-grenades`): Throw and Fire buttons on grenade
  ammo, launchers and Fight cards.
- **Tokenizer** (`vtta-tokenizer`): click the portrait to open it (shift-click opens the file picker).
- **Simple Calendar**: open sheets refresh their Downtime and Housing panels when the date changes.

## Macro API

```js
const api = game.modules.get("cpr-sheet-skin").api;
api.getPrefs();               // this user's options
await api.setPref("theme", "gold");
api.choices("theme");         // the allowed values of an option
api.settings.groups;          // [{ id, label, hint, menu, keys }]: the settings menus and their setting keys
```

## AI disclosure

This module was written with Claude (Anthropic's AI) under human direction and testing.

## License

Copyright (C) 2026 samcadams

This program is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for details.

The license covers this module's code and text. Cyberpunk RED, its setting, and the names used from
it belong to R. Talsorian Games.

CPR Sheet Skin is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games
and is not approved or endorsed by RTG.
