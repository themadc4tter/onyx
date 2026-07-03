import { getMobDefinition, type MobBehaviorDefinition, type MobCombatDefinition } from "@onyx/shared/mobs";
import type { MobSpawnState } from "@onyx/shared/protocol";
import { isTileWalkable, ZONES } from "../config/map";
import { applyMobDamage } from "./combat";

interface MobInstanceState extends MobSpawnState {
  spawnTileX: number;
  spawnTileY: number;
  instanceIndex: number;
  behavior: MobBehaviorDefinition;
  combat: MobCombatDefinition;
  nextWanderAt: number;
}

interface MobControllerOptions {
  emitMobState: (zoneId: string, mob: MobSpawnState) => void;
  isPlayerOccupyingTile?: (zoneId: string, tileX: number, tileY: number) => boolean;
}

const MOB_TICK_MS = 250;
const MOB_WANDER_MOVE_MS = 1_200;
const MOB_WANDER_JITTER_MS = 1_800;
const CARDINAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export class MobController {
  private mobInstancesByZone = new Map<string, Map<string, MobInstanceState>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private options: MobControllerOptions) {}

  start() {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      this.tick(Date.now());
    }, MOB_TICK_MS);
    this.tickTimer.unref?.();
  }

  stop() {
    if (!this.tickTimer) return;

    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

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
        nextWanderAt: this.getNextWanderAt(Date.now()),
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
      currentMob.nextWanderAt = this.getNextWanderAt(Date.now());
      this.emitMobState(zoneId, currentMob);
    }, mob.behavior.respawnMs);
  }

  isMobBlockingTile(zoneId: string, tileX: number, tileY: number, ignoredMobId?: string) {
    return this.getMobStates(zoneId).some(mob => {
      const definition = getMobDefinition(mob.mobId);
      return (
        mob.id !== ignoredMobId &&
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

  private tick(nowMs: number) {
    for (const [zoneId, mobs] of this.mobInstancesByZone) {
      for (const mob of mobs.values()) {
        this.tickMob(zoneId, mob, nowMs);
      }
    }
  }

  private tickMob(zoneId: string, mob: MobInstanceState, nowMs: number) {
    if (!mob.alive || mob.behavior.wanderRadius <= 0 || nowMs < mob.nextWanderAt) return;

    mob.nextWanderAt = this.getNextWanderAt(nowMs);
    const nextTile = this.getWanderStep(zoneId, mob);
    if (!nextTile) return;

    mob.tileX = nextTile.tileX;
    mob.tileY = nextTile.tileY;
    this.emitMobState(zoneId, mob);
  }

  private getWanderStep(zoneId: string, mob: MobInstanceState) {
    const candidates = shuffle(CARDINAL_DIRECTIONS)
      .map(direction => ({
        tileX: mob.tileX + direction.x,
        tileY: mob.tileY + direction.y,
      }))
      .filter(tile => this.canMobMoveTo(zoneId, mob, tile.tileX, tile.tileY));

    return candidates[0] ?? null;
  }

  private canMobMoveTo(zoneId: string, mob: MobInstanceState, tileX: number, tileY: number) {
    if (!isTileWalkable(zoneId, tileX, tileY)) return false;
    if (getTileDistance(tileX, tileY, mob.spawnTileX, mob.spawnTileY) > mob.behavior.wanderRadius) return false;
    if (this.options.isPlayerOccupyingTile?.(zoneId, tileX, tileY)) return false;

    return !this.isMobBlockingTile(zoneId, tileX, tileY, mob.id);
  }

  private getNextWanderAt(nowMs: number) {
    return nowMs + MOB_WANDER_MOVE_MS + Math.floor(Math.random() * MOB_WANDER_JITTER_MS);
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

function getTileDistance(fromX: number, fromY: number, toX: number, toY: number) {
  return Math.hypot(fromX - toX, fromY - toY);
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
