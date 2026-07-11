import {
  TEST_ABILITY_LOADOUT,
  getAbilityDefinition,
  type AbilityDefinition,
  type AbilityEffectDefinition,
  type AbilityId,
  type AbilityRequirement,
} from "@onyx/shared/abilities";
import { getItemDefinition } from "@onyx/shared/items";
import type { AbilityUsePayload, MobSpawnState, Position } from "@onyx/shared/protocol";
import { getSkillLevelForXp } from "@onyx/shared/skills";
import type { ActiveStatusEffect } from "@onyx/shared/statusEffects";
import { getEquipment } from "./equipment";
import { getSkills } from "./skills";

interface AbilityPlayer {
  socketId: string;
  userId: string;
  position: Position;
}

interface ResolveAbilityUseContext {
  player: AbilityPlayer;
  payload: AbilityUsePayload;
  mobs: MobSpawnState[];
  nowMs?: number;
}

export type AbilityUseResult =
  | {
      ok: true;
      ability: AbilityDefinition;
      affectedMobIds: string[];
      damageByMobId: Map<string, number>;
      statusEffectsByMobId: Map<string, ActiveStatusEffect[]>;
    }
  | {
      ok: false;
      error: "ability_not_equipped" | "cooldown" | "invalid_ability" | "invalid_target" | "requirements_not_met";
      message: string;
    };

const COOLDOWN_GRACE_MS = 75;
const lastAbilityUseAtByUserAbility = new Map<string, number>();

export function getAbilityLoadoutPayload() {
  return TEST_ABILITY_LOADOUT;
}

export function resolveAbilityUse(context: ResolveAbilityUseContext): AbilityUseResult {
  const abilityId = getRequestedAbilityId(context.payload);
  if (!abilityId) {
    return {
      ok: false,
      error: "ability_not_equipped",
      message: "No ability is equipped in that slot.",
    };
  }

  const ability = getAbilityDefinition(abilityId);
  if (!ability) {
    return {
      ok: false,
      error: "invalid_ability",
      message: "That ability is not available.",
    };
  }

  const unmetRequirement = getUnmetAbilityRequirement(context.player.userId, ability.requirements);
  if (unmetRequirement) {
    return {
      ok: false,
      error: "requirements_not_met",
      message: getRequirementErrorMessage(ability, unmetRequirement),
    };
  }

  const targetResolution = resolveAbilityTarget(context.player, context.payload, ability, context.mobs);
  if (!targetResolution.ok) {
    return {
      ok: false,
      error: "invalid_target",
      message: targetResolution.message,
    };
  }

  const nowMs = context.nowMs ?? Date.now();
  const cooldownKey = getCooldownKey(context.player.userId, ability.id);
  const lastUsedAt = lastAbilityUseAtByUserAbility.get(cooldownKey) ?? 0;
  if (nowMs - lastUsedAt + COOLDOWN_GRACE_MS < ability.cooldownMs) {
    return {
      ok: false,
      error: "cooldown",
      message: "That ability is not ready yet.",
    };
  }

  const damageByMobId = resolveAbilityDamage(context.player, ability, context.mobs, targetResolution.selectedMob);
  const statusEffectsByMobId = resolveAbilityStatusEffects(
    context.player,
    ability,
    context.mobs,
    targetResolution.selectedMob,
    nowMs,
  );

  lastAbilityUseAtByUserAbility.set(cooldownKey, nowMs);
  return {
    ok: true,
    ability,
    affectedMobIds: getAffectedMobIds(damageByMobId, statusEffectsByMobId),
    damageByMobId,
    statusEffectsByMobId,
  };
}

function getRequestedAbilityId(payload: AbilityUsePayload): AbilityId | null {
  if (payload.abilityId) return payload.abilityId;

  const slotIndex = Number(payload.slotIndex);
  if (!Number.isInteger(slotIndex)) return null;

  return TEST_ABILITY_LOADOUT.slots.find(slot => slot.slotIndex === slotIndex)?.abilityId ?? null;
}

function getUnmetAbilityRequirement(userId: string, requirements: AbilityRequirement[]) {
  return requirements.find(requirement => !meetsAbilityRequirement(userId, requirement)) ?? null;
}

function meetsAbilityRequirement(userId: string, requirement: AbilityRequirement) {
  switch (requirement.kind) {
    case "equipped_weapon_class": {
      const equippedItem = getEquipment(userId).slots[requirement.slot];
      const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
      return item?.equipment?.slot === requirement.slot &&
        item.equipment.weaponClass === requirement.weaponClass;
    }

    case "equipped_weapon_type": {
      const equippedItem = getEquipment(userId).slots[requirement.slot];
      const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
      return item?.equipment?.slot === requirement.slot &&
        item.equipment.weaponType === requirement.weaponType;
    }

    case "skill_level": {
      const totalXp = getSkills(userId).get(requirement.skillId)?.totalXp ?? 0;
      return getSkillLevelForXp(totalXp) >= requirement.level;
    }
  }
}

function getRequirementErrorMessage(ability: AbilityDefinition, requirement: AbilityRequirement) {
  switch (requirement.kind) {
    case "equipped_weapon_class":
      return `${ability.name} requires a ${requirement.weaponClass} weapon.`;
    case "equipped_weapon_type":
      return `${ability.name} requires a ${requirement.weaponType}.`;
    case "skill_level":
      return `${ability.name} requires level ${requirement.level} ${requirement.skillId}.`;
  }
}

function resolveAbilityTarget(
  player: AbilityPlayer,
  payload: AbilityUsePayload,
  ability: AbilityDefinition,
  mobs: MobSpawnState[],
) {
  const targeting = ability.targeting;
  if (targeting.kind !== "selected_enemy") return { ok: true, selectedMob: null } as const;

  const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
  if (!targetId) {
    return {
      ok: false,
      message: "Select an enemy target first.",
    } as const;
  }

  const selectedMob = mobs.find(mob => mob.id === targetId) ?? null;
  if (!selectedMob?.alive) {
    return {
      ok: false,
      message: "That target is not available.",
    } as const;
  }

  if (getTileCenterDistance(player.position, selectedMob) > targeting.rangeTiles) {
    return {
      ok: false,
      message: "That target is too far away.",
    } as const;
  }

  return { ok: true, selectedMob } as const;
}

function resolveAbilityDamage(
  player: AbilityPlayer,
  ability: AbilityDefinition,
  mobs: MobSpawnState[],
  selectedMob: MobSpawnState | null,
) {
  const damageByMobId = new Map<string, number>();

  for (const effect of ability.effects) {
    if (effect.kind !== "damage") continue;

    for (const mob of getEffectTargets(player, ability, effect, mobs, selectedMob)) {
      damageByMobId.set(mob.id, (damageByMobId.get(mob.id) ?? 0) + effect.amount);
    }
  }

  return damageByMobId;
}

function resolveAbilityStatusEffects(
  player: AbilityPlayer,
  ability: AbilityDefinition,
  mobs: MobSpawnState[],
  selectedMob: MobSpawnState | null,
  nowMs: number,
) {
  const statusEffectsByMobId = new Map<string, ActiveStatusEffect[]>();

  for (const effect of ability.effects) {
    if (effect.kind !== "status_effect") continue;

    for (const mob of getEffectTargets(player, ability, effect, mobs, selectedMob)) {
      const statusEffects = statusEffectsByMobId.get(mob.id) ?? [];
      statusEffects.push({
        type: effect.statusEffectType,
        sourceId: ability.id,
        expiresAt: nowMs + effect.durationMs,
      });
      statusEffectsByMobId.set(mob.id, statusEffects);
    }
  }

  return statusEffectsByMobId;
}

function getEffectTargets(
  player: AbilityPlayer,
  ability: AbilityDefinition,
  effect: AbilityEffectDefinition,
  mobs: MobSpawnState[],
  selectedMob: MobSpawnState | null,
) {
  if (effect.target === "selected") return selectedMob?.alive ? [selectedMob] : [];

  const targeting = ability.targeting;
  if (targeting.kind !== "self_area") return [];

  return mobs.filter(mob => (
    mob.alive &&
    isMobInArea(player.position, mob, targeting.radiusTiles, targeting.shape)
  ));
}

function isMobInArea(
  position: { tileX: number; tileY: number },
  mob: { tileX: number; tileY: number },
  radiusTiles: number,
  shape: "square" | "circle",
) {
  const dx = Math.abs(position.tileX - mob.tileX);
  const dy = Math.abs(position.tileY - mob.tileY);

  if (shape === "square") {
    return Math.max(dx, dy) <= radiusTiles;
  }

  return Math.hypot(dx, dy) <= radiusTiles;
}

function getTileCenterDistance(
  position: { tileX: number; tileY: number },
  target: { tileX: number; tileY: number },
) {
  return Math.hypot(position.tileX - target.tileX, position.tileY - target.tileY);
}

function getAffectedMobIds(
  damageByMobId: Map<string, number>,
  statusEffectsByMobId: Map<string, ActiveStatusEffect[]>,
) {
  return [...new Set([...damageByMobId.keys(), ...statusEffectsByMobId.keys()])];
}

function getCooldownKey(userId: string, abilityId: AbilityId) {
  return `${userId}:${abilityId}`;
}
