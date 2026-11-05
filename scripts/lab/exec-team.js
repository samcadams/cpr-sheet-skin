/**
 * Exec Teamwork: the team members an Exec gets as their Rank rises, shown under
 * the Exec role card. Drop an Actor on an open slot to fill it. Each teammate's
 * team role is free text the player or GM types in, since the module doesn't
 * ship the rulebook's descriptors.
 *
 * Stored on the role item: flags.cpr-sheet-skin.team.<slot> = { uuid, name, img, role, loyalty, loyal }.
 * name and img are a copy taken at drop time, shown when the user can't see the actor.
 *
 * Loyalty (-10..10, starts at 0): a Loyalty check is 1d6 and succeeds when the roll is under it.
 * loyal (GM toggle): "Loyal to you" replaces the Loyalty controls.
 */
import { CPRRoll } from "../../../../systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
import CPRChat from "../../../../systems/cyberpunk-red-core/modules/chat/cpr-chat.js";

const MODULE_ID = "cpr-sheet-skin";

/** The Rank at which each slot opens. */
const SLOT_RANKS = [3, 5, 9];

const LOYALTY_MIN = -10;
const LOYALTY_MAX = 10;
const clampLoyalty = value => Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, Math.trunc(Number(value) || 0)));

/** True for the Exec role (by its main ability, so a renamed or translated role still counts). */
export function isExecRole(role) {
  return role.system.mainRoleAbility === "Teamwork";
}

/** The slots for the Exec role card, or null for any other role. */
export function execTeamContext(role, editable) {
  if (!isExecRole(role)) return null;
  const rank = Number(role.system.rank) || 0;
  const team = role.getFlag(MODULE_ID, "team") ?? {};
  const slots = SLOT_RANKS.map((unlock, index) => {
    const entry = team[index];
    const slot = { index, unlock, open: rank >= unlock, editable };
    if (!entry?.uuid) return slot;
    const actor = fromUuidSync(entry.uuid);
    return {
      ...slot,
      filled: true,
      uuid: entry.uuid,
      name: actor?.name ?? entry.name,
      img: actor?.img ?? entry.img,
      missing: !actor,
      role: entry.role ?? "",
      loyalty: clampLoyalty(entry.loyalty),
      loyal: !!entry.loyal,
      gm: game.user.isGM
    };
  });
  return { slots, open: slots.filter(s => s.open).length };
}

export function activateExecTeam(sheet, root) {
  for (const slot of root.querySelectorAll("[data-lab-team-slot]")) {
    const role = sheet.actor.items.get(slot.closest("[data-item-id]")?.dataset.itemId);
    const index = slot.dataset.labTeamSlot;
    if (!role) continue;

    slot.querySelector("[data-lab-team-open]")?.addEventListener("click", event => {
      event.preventDefault();
      fromUuidSync(slot.dataset.uuid)?.sheet.render(true);
    });
    if (!sheet.isEditable) continue;

    slot.querySelector("[data-lab-team-role]")?.addEventListener("change", event => {
      event.stopPropagation();
      role.setFlag(MODULE_ID, `team.${index}.role`, event.currentTarget.value.trim());
    });
    slot.querySelector("[data-lab-team-remove]")?.addEventListener("click", event => {
      event.preventDefault();
      role.unsetFlag(MODULE_ID, `team.${index}`);
    });

    // Loyalty: -1/+1 buttons, or type a value.
    const loyalty = slot.querySelector("[data-lab-loyalty]");
    const setLoyalty = value => role.setFlag(MODULE_ID, `team.${index}.loyalty`, clampLoyalty(value));
    loyalty?.addEventListener("change", event => {
      event.stopPropagation();
      setLoyalty(loyalty.value);
    });
    for (const button of slot.querySelectorAll("[data-lab-loyalty-step]")) {
      button.addEventListener("click", event => {
        event.preventDefault();
        setLoyalty((Number(loyalty.value) || 0) + Number(button.dataset.labLoyaltyStep));
      });
    }
    slot.querySelector("[data-lab-loyalty-roll]")?.addEventListener("click", event => {
      event.preventDefault();
      rollLoyalty(sheet.actor, role.getFlag(MODULE_ID, `team.${index}`));
    });
    // GM: mark them Loyal to you (no Loyalty to track or roll), or back. The Loyalty value is kept.
    slot.querySelector("[data-lab-team-loyal]")?.addEventListener("click", event => {
      event.preventDefault();
      if (game.user.isGM) role.setFlag(MODULE_ID, `team.${index}.loyal`, !role.getFlag(MODULE_ID, `team.${index}.loyal`));
    });

    if (!slot.classList.contains("open")) continue;
    slot.addEventListener("dragover", event => {
      event.preventDefault();
      slot.classList.add("drop-target");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drop-target"));
    slot.addEventListener("drop", event => {
      // Keep the sheet's own drop handler from also treating this as a drop on the sheet.
      event.preventDefault();
      event.stopPropagation();
      slot.classList.remove("drop-target");
      dropTeammate(sheet.actor, role, index, TextEditor.getDragEventData(event));
    });
  }
}

async function dropTeammate(owner, role, index, data) {
  if (data?.type !== "Actor") {
    ui.notifications.warn(game.i18n.localize("CPRSKIN.lab.team.notActor"));
    return;
  }
  const actor = await fromUuid(data.uuid);
  if (!actor) return;
  if (actor.uuid === owner.uuid) {
    ui.notifications.warn(game.i18n.localize("CPRSKIN.lab.team.self"));
    return;
  }
  const team = role.getFlag(MODULE_ID, "team") ?? {};
  if (Object.entries(team).some(([slot, entry]) => slot !== index && entry?.uuid === actor.uuid)) {
    ui.notifications.warn(game.i18n.format("CPRSKIN.lab.team.already", { name: actor.name }));
    return;
  }
  // Replacing a teammate starts the new one with an empty team role and Loyalty 0.
  await role.setFlag(MODULE_ID, `team.${index}`, { uuid: actor.uuid, name: actor.name, img: actor.img, role: "", loyalty: 0 });
}

/** Loyalty check: 1d6 with the system's roll (Dice So Nice, chat speaker), success when it's under the teammate's Loyalty. */
async function rollLoyalty(owner, entry) {
  if (!entry?.uuid) return;
  const loyalty = clampLoyalty(entry.loyalty);
  const cprRoll = new CPRRoll(fromUuidSync(entry.uuid)?.name ?? entry.name, "1d6");
  cprRoll.calculateCritical = false;
  cprRoll.rollCard = `modules/${MODULE_ID}/templates/lab/loyalty-rollcard.hbs`;
  await cprRoll.roll();
  cprRoll.loyalty = loyalty;
  cprRoll.loyaltySuccess = cprRoll.resultTotal < loyalty;
  cprRoll.entityData = { actor: owner.id, token: owner.token?.id ?? null };
  await CPRChat.RenderRollCard(cprRoll);
}
