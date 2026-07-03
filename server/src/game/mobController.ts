import { getMobDefinition, type MobBehaviorDefinition, type MobCombatDefinition } from "@onyx/shared/mobs";
import type { MobSpawnState } from "@onyx/shared/protocol";
import { ZONES } from "../config/map";
import { applyMobDamage } from "./combat";

interface MobInstanceState extends MobSpawnState {
  spawnTileX: number;
  spawnTileY: number;
  instanceIndex: number;
  behavior: MobBehaviorDefinition;
  combat: MobCombatDefinition;
}

interface MobControllerOptions {
  emitMobState: (zoneId: string, mob: MobSpawnState) => void;
}

export class MobController {
  private mobInstancesByZone = new Map<string, Map<string, MobInstanceState>>();

  constructor(private options: MobControllerOptions) {}

  getMobStates(zoneId: string): MobSpawnState[] {
    const zone = ZONES[zoneId];
    if (!zone) return [];

    let zoneInstances = this.mobInstancesByZone.get(zoneId);
    if (!zoneInstances) {
      zoneInstances = new Map();
      this.mobInstancesByZone.set(zoneId, zoneInstances);
    }

    for (const spawn of zone.mobSpawns) {
      const instanceIndex = 1;
      const instanceId = getMobInstanceId(spawn.id, instanceIndex);
      if (zoneInstances.has(instanceId)) continue;

      const mob = getMobDefinition(spawn.mobId);
      if (!mob) {
        console.warn(`[mob]        unknown mob "${spawn.mobId}" for spawn "${spawn.id}" in zone "${zoneId}"`);
        continue;
      }

      zoneInstances.set(instanceId, {
        id: instanceId,
        spawnId: spawn.id,
        mobId: spawn.mobId,
        tileX: spawn.tileX,
        tileY: spawn.tileY,
        spawnTileX: spawn.tileX,
        spawnTileY: spawn.tileY,
        instanceIndex,
        behavior: {
          ...mob.behavior,
          ...spawn.behavior,
        },
        combat: {
          ...mob.combat,
          ...spawn.combat,
        },
        hp: mob.maxHp,
        maxHp: mob.maxHp,
        alive: true,
      });
    }

    return [...zoneInstances.values()].map(mob => this.toPayload(mob));
  }

  getMobState(zoneId: string, mobInstanceId: string): MobSpawnState | null {
    this.getMobStates(zoneId);
    const mob = this.mobInstancesByZone.get(zoneId)?.get(mobInstanceId);
    return mob ? this.toPayload(mob) : null;
  }

  damageMob(zoneId: string, mobInstanceId: string, damage: number) {
    const mob = this.getMobInstance(zoneId, mobInstanceId);
    if (!mob || !mob.alive) return;

    const defeated = applyMobDamage(mob, damage);
    this.emitMobState(zoneId, mob);
    if (!defeated) return;
    if (!mob.behavior.respawns) return;

    setTimeout(() => {
      const currentMob = this.getMobInstance(zoneId, mobInstanceId);
      if (!currentMob) return;

      currentMob.tileX = currentMob.spawnTileX;
      currentMob.tileY = currentMob.spawnTileY;
      currentMob.hp = currentMob.maxHp;
      currentMob.alive = true;
      this.emitMobState(zoneId, currentMob);
    }, mob.behavior.respawnMs);
  }

  isMobBlockingTile(zoneId: string, tileX: number, tileY: number) {
    return this.getMobStates(zoneId).some(mob => {
      const definition = getMobDefinition(mob.mobId);
      return (
        mob.alive &&
        !definition?.playersCanRunThrough &&
        mob.tileX === tileX &&
        mob.tileY === tileY
      );
    });
  }

  private getMobInstance(zoneId: string, mobInstanceId: string) {
    this.getMobStates(zoneId);
    return this.mobInstancesByZone.get(zoneId)?.get(mobInstanceId) ?? null;
  }

  private emitMobState(zoneId: string, mob: MobInstanceState) {
    this.options.emitMobState(zoneId, this.toPayload(mob));
  }

  private toPayload(mob: MobInstanceState): MobSpawnState {
    return {
      id: mob.id,
      spawnId: mob.spawnId,
      tileX: mob.tileX,
      tileY: mob.tileY,
      mobId: mob.mobId,
      hp: mob.hp,
      maxHp: mob.maxHp,
      alive: mob.alive,
    };
  }
}

function getMobInstanceId(spawnId: string, instanceIndex: number) {
  return `${spawnId}:${instanceIndex}`;
}
