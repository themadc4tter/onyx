import { randomUUID } from "node:crypto";
import { getItemDefinition } from "@onyx/shared/items";
import type { MobMeleeImpactPayload, MobProjectileFiredPayload, MobSpawnState, Position } from "@onyx/shared/protocol";
import { hasLineOfSight } from "../config/map";
import { getEquipment, type EquipmentState } from "./equipment";

interface CombatPlayer {
  socketId: string;
  userId: string;
  zoneId: string;
  position: Position;
}

interface CombatAttackContext {
  player: CombatPlayer;
  mob: MobSpawnState;
  nowMs?: number;
}

type AutoAttackProfile =
  | {
      weaponClass: "melee";
      attackSpeedMs: number;
      damage: number;
      range: 1;
    }
  | {
      weaponClass: "ranged";
      attackSpeedMs: number;
      attackRange: number;
      damage: number;
    }
  | {
      weaponClass: "magic";
      attackSpeedMs: number;
      attackRange: number;
      damage: number;
    };

export type CombatAttackResult =
  | {
      ok: true;
      mode: "melee";
      damage: number;
      impact: MobMeleeImpactPayload;
    }
  | {
      ok: true;
      mode: "ranged" | "magic";
      damage: number;
      projectile: MobProjectileFiredPayload;
    }
  | {
      ok: false;
      error: "cooldown" | "invalid_target" | "no_line_of_sight" | "out_of_range";
    };

const UNARMED_ATTACK_SPEED_MS = 1_000;
const BASE_ATTACK_DAMAGE = 3;
const MELEE_RANGE_TILES = 1;
const COOLDOWN_GRACE_MS = 75;
const PROJECTILE_BASE_DURATION_MS = 260;
const PROJECTILE_DURATION_PER_TILE_MS = 55;
const lastAttackAtByUserId = new Map<string, number>();

export function resolveAutoAttack(context: CombatAttackContext): CombatAttackResult {
  const { player, mob } = context;
  const nowMs = context.nowMs ?? Date.now();

  if (!mob.alive) {
    return { ok: false, error: "invalid_target" };
  }

  const profile = getAutoAttackProfile(player.userId);
  const lastAttackAt = lastAttackAtByUserId.get(player.userId) ?? 0;
  if (nowMs - lastAttackAt + COOLDOWN_GRACE_MS < profile.attackSpeedMs) {
    return { ok: false, error: "cooldown" };
  }

  if (profile.weaponClass === "melee") {
    if (!isInMeleeRange(player.position, mob)) {
      return { ok: false, error: "out_of_range" };
    }

    lastAttackAtByUserId.set(player.userId, nowMs);
    return {
      ok: true,
      mode: "melee",
      damage: profile.damage,
      impact: {
        attackerSocketId: player.socketId,
        targetId: mob.id,
        originTileX: player.position.tileX,
        originTileY: player.position.tileY,
        targetTileX: mob.tileX,
        targetTileY: mob.tileY,
      },
    };
  }

  if (!isInRangedAttackRange(player.position, mob, profile.attackRange)) {
    return { ok: false, error: "out_of_range" };
  }

  if (!hasLineOfSight(player.zoneId, player.position, mob)) {
    return { ok: false, error: "no_line_of_sight" };
  }

  lastAttackAtByUserId.set(player.userId, nowMs);
  return {
    ok: true,
    mode: profile.weaponClass,
    damage: profile.damage,
    projectile: {
      projectileId: randomUUID(),
      projectileClass: profile.weaponClass,
      attackerSocketId: player.socketId,
      targetId: mob.id,
      originTileX: player.position.tileX,
      originTileY: player.position.tileY,
      targetTileX: mob.tileX,
      targetTileY: mob.tileY,
      durationMs: getProjectileDurationMs(player.position, mob),
    },
  };
}

export function applyMobDamage(mob: MobSpawnState, damage: number) {
  mob.hp = Math.max(0, mob.hp - Math.max(1, Math.floor(damage)));
  if (mob.hp > 0) return false;

  mob.alive = false;
  return true;
}

function getAutoAttackProfile(userId: string): AutoAttackProfile {
  const equipment = getEquipment(userId);
  const mainHand = equipment.slots.main_hand;

  if (!mainHand) {
    return {
      weaponClass: "melee",
      attackSpeedMs: UNARMED_ATTACK_SPEED_MS,
      damage: getAttackDamage(equipment),
      range: MELEE_RANGE_TILES,
    };
  }

  const item = getItemDefinition(mainHand.itemId);
  if (!item?.equipment || item.equipment.slot !== "main_hand") {
    return {
      weaponClass: "melee",
      attackSpeedMs: UNARMED_ATTACK_SPEED_MS,
      damage: getAttackDamage(equipment),
      range: MELEE_RANGE_TILES,
    };
  }

  if (item.equipment.weaponClass === "magic") {
    return {
      weaponClass: "magic",
      attackSpeedMs: item.equipment.attackSpeed * 1_000,
      attackRange: item.equipment.attackRange,
      damage: getAttackDamage(equipment),
    };
  }

  if (item.equipment.weaponClass === "ranged") {
    return {
      weaponClass: "ranged",
      attackSpeedMs: item.equipment.attackSpeed * 1_000,
      attackRange: item.equipment.attackRange,
      damage: getAttackDamage(equipment),
    };
  }

  return {
    weaponClass: "melee",
    attackSpeedMs: item.equipment.attackSpeed * 1_000,
    damage: getAttackDamage(equipment),
    range: MELEE_RANGE_TILES,
  };
}

function getAttackDamage(equipment: EquipmentState) {
  const bonusDamage = Object.values(equipment.slots).reduce((total, equippedItem) => {
    if (!equippedItem) return total;

    const item = getItemDefinition(equippedItem.itemId);
    return total + (item?.equipment?.stats.attack_damage ?? 0);
  }, 0);

  return BASE_ATTACK_DAMAGE + bonusDamage;
}

function isInMeleeRange(position: Position, mob: MobSpawnState) {
  return (
    Math.abs(position.tileX - mob.tileX) <= MELEE_RANGE_TILES &&
    Math.abs(position.tileY - mob.tileY) <= MELEE_RANGE_TILES
  );
}

function isInRangedAttackRange(position: Position, mob: MobSpawnState, attackRange: number) {
  return getTileCenterDistance(position, mob) <= attackRange;
}

function getProjectileDurationMs(position: Position, mob: MobSpawnState) {
  return Math.round(PROJECTILE_BASE_DURATION_MS + getTileCenterDistance(position, mob) * PROJECTILE_DURATION_PER_TILE_MS);
}

function getTileCenterDistance(from: { tileX: number; tileY: number }, to: { tileX: number; tileY: number }) {
  return Math.hypot(from.tileX - to.tileX, from.tileY - to.tileY);
}
