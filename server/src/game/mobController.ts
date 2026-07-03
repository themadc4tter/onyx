import { getMobDefinition, type MobBehaviorDefinition, type MobCombatDefinition } from "@onyx/shared/mobs";
import type { MobSpawnState } from "@onyx/shared/protocol";
import { ZONES } from "../config/map";
import { applyMobDamage } from "./combat";

interface MobRuntimeState extends MobSpawnState {
  spawnTileX: number;
  spawnTileY: number;
  behavior: MobBehaviorDefinition;
  combat: MobCombatDefinition;
}

interface MobControllerOptions {
  emitMobState: (zoneId: string, mob: MobSpawnState) => void;
}

export class MobController {
  private mobSpawnStates = new Map<string, Map<string, MobRuntimeState>>();

  constructor(private options: MobControllerOptions) {}

  getMobSpawnStates(zoneId: string): MobSpawnState[] {
    const zone = ZONES[zoneId];
    if (!zone) return [];

    let zoneStates = this.mobSpawnStates.get(zoneId);
    if (!zoneStates) {
      zoneStates = new Map();
      this.mobSpawnStates.set(zoneId, zoneStates);
    }

    for (const spawn of zone.mobSpawns) {
      if (zoneStates.has(spawn.id)) continue;

      const mob = getMobDefinition(spawn.mobId);
      if (!mob) {
        console.warn(`[mob]        unknown mob "${spawn.mobId}" for spawn "${spawn.id}" in zone "${zoneId}"`);
        continue;
      }

      zoneStates.set(spawn.id, {
        ...spawn,
        spawnTileX: spawn.tileX,
        spawnTileY: spawn.tileY,
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

    return [...zoneStates.values()].map(mob => this.toPayload(mob));
  }

  getMobSpawnState(zoneId: string, mobSpawnId: string): MobSpawnState | null {
    this.getMobSpawnStates(zoneId);
    const mob = this.mobSpawnStates.get(zoneId)?.get(mobSpawnId);
    return mob ? this.toPayload(mob) : null;
  }

  damageMob(zoneId: string, mobSpawnId: string, damage: number) {
    const mob = this.getMobRuntimeState(zoneId, mobSpawnId);
    if (!mob || !mob.alive) return;

    const defeated = applyMobDamage(mob, damage);
    this.emitMobState(zoneId, mob);
    if (!defeated) return;
    if (!mob.behavior.respawns) return;

    setTimeout(() => {
      const currentMob = this.getMobRuntimeState(zoneId, mobSpawnId);
      if (!currentMob) return;

      currentMob.tileX = currentMob.spawnTileX;
      currentMob.tileY = currentMob.spawnTileY;
      currentMob.hp = currentMob.maxHp;
      currentMob.alive = true;
      this.emitMobState(zoneId, currentMob);
    }, mob.behavior.respawnMs);
  }

  isMobBlockingTile(zoneId: string, tileX: number, tileY: number) {
    return this.getMobSpawnStates(zoneId).some(mob => {
      const definition = getMobDefinition(mob.mobId);
      return (
        mob.alive &&
        !definition?.playersCanRunThrough &&
        mob.tileX === tileX &&
        mob.tileY === tileY
      );
    });
  }

  private getMobRuntimeState(zoneId: string, mobSpawnId: string) {
    this.getMobSpawnStates(zoneId);
    return this.mobSpawnStates.get(zoneId)?.get(mobSpawnId) ?? null;
  }

  private emitMobState(zoneId: string, mob: MobRuntimeState) {
    this.options.emitMobState(zoneId, this.toPayload(mob));
  }

  private toPayload(mob: MobRuntimeState): MobSpawnState {
    return {
      id: mob.id,
      tileX: mob.tileX,
      tileY: mob.tileY,
      mobId: mob.mobId,
      hp: mob.hp,
      maxHp: mob.maxHp,
      alive: mob.alive,
    };
  }
}
