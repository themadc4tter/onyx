import { ZONES, type HerbPoolConfig } from "../config/map";
import type { HerbSpawnState, HerbStatePayload } from "@onyx/shared/protocol";

type HerbStateEmitter = (state: HerbStatePayload) => void;

export class HerbController {
  private zoneStates = new Map<string, Map<string, HerbSpawnState>>();
  private respawnTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>();

  getSpawnStates(zoneId: string) {
    return [...this.getZoneState(zoneId).values()];
  }

  getSpawnState(zoneId: string, spawnId: string) {
    return this.getZoneState(zoneId).get(spawnId) ?? null;
  }

  pickSpawn(zoneId: string, spawnId: string, emitState: HerbStateEmitter) {
    const spawn = this.getSpawnState(zoneId, spawnId);
    if (!spawn?.available) return null;

    spawn.available = false;
    emitState({ id: spawn.id, available: false });
    this.scheduleRespawn(zoneId, spawn.itemId, emitState);

    return spawn;
  }

  private getZoneState(zoneId: string) {
    let zoneState = this.zoneStates.get(zoneId);
    if (zoneState) return zoneState;

    const zone = ZONES[zoneId];
    zoneState = new Map();
    this.zoneStates.set(zoneId, zoneState);

    if (!zone) return zoneState;

    for (const spawn of zone.herbSpawns) {
      zoneState.set(spawn.id, { ...spawn, available: false });
    }

    for (const pool of zone.herbPools) {
      for (const spawn of this.sampleSpawns(pool.spawnIds, pool.maxActive)) {
        const state = zoneState.get(spawn);
        if (state) state.available = true;
      }
    }

    return zoneState;
  }

  private scheduleRespawn(zoneId: string, itemId: string, emitState: HerbStateEmitter) {
    const zone = ZONES[zoneId];
    const pool = zone?.herbPools.find(candidate => candidate.itemId === itemId);
    if (!pool) return;

    const timerKey = this.getTimerKey(zoneId, itemId);
    const timers = this.respawnTimers.get(timerKey) ?? new Set<ReturnType<typeof setTimeout>>();
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (timers.size === 0) this.respawnTimers.delete(timerKey);
      this.respawnOne(zoneId, pool, emitState);
    }, pool.respawnMs);

    timer.unref?.();
    timers.add(timer);
    this.respawnTimers.set(timerKey, timers);
  }

  private respawnOne(zoneId: string, pool: HerbPoolConfig, emitState: HerbStateEmitter) {
    const zone = ZONES[zoneId];
    if (!zone) return;

    const zoneState = this.getZoneState(zoneId);
    const candidates = pool.spawnIds
      .map(spawnId => zoneState.get(spawnId))
      .filter((spawn): spawn is HerbSpawnState => Boolean(spawn));
    const activeCount = candidates.filter(spawn => spawn.available).length;
    if (activeCount >= pool.maxActive) return;

    const inactiveSpawns = candidates.filter(spawn => !spawn.available);
    const spawn = this.pickRandom(inactiveSpawns);
    if (!spawn) return;

    spawn.available = true;
    emitState({ id: spawn.id, available: true });
  }

  private sampleSpawns(spawnIds: string[], count: number) {
    const remaining = [...spawnIds];
    const sample: string[] = [];
    const targetCount = Math.max(0, Math.min(count, remaining.length));

    while (sample.length < targetCount) {
      const index = Math.floor(Math.random() * remaining.length);
      const [spawnId] = remaining.splice(index, 1);
      sample.push(spawnId);
    }

    return sample;
  }

  private pickRandom<T>(items: T[]) {
    return items[Math.floor(Math.random() * items.length)] ?? null;
  }

  private getTimerKey(zoneId: string, itemId: string) {
    return `${zoneId}:${itemId}`;
  }
}
