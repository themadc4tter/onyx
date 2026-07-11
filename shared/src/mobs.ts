export type MobAggression = "passive" | "aggressive";
export type MobChaseMode = "leashed" | "unlimited";

export interface MobBehaviorDefinition {
  aggression: MobAggression;
  wanderRadius: number;
  aggroRadius: number;
  leashRadius: number;
  chaseMode: MobChaseMode;
  respawns: boolean;
  respawnMs: number;
  evadeRestoresHp: boolean;
}

export interface MobCombatDefinition {
  attackRange: number;
  attackSpeedMs: number;
  damage: number;
}

export interface MobDefinition {
  id: string;
  name: string;
  spriteKey: string;
  spriteUrl: string;
  maxHp: number;
  playersCanRunThrough: boolean;
  behavior: MobBehaviorDefinition;
  combat: MobCombatDefinition;
}

export const MOB_DEFINITIONS: Record<string, MobDefinition> = {
  orc_scout: {
    id: "orc_scout",
    name: "Orc Scout",
    spriteKey: "mob-orc-scout",
    spriteUrl: "assets/characters/male_orc.png",
    maxHp: 25,
    playersCanRunThrough: false,
    behavior: {
      aggression: "aggressive",
      wanderRadius: 5,
      aggroRadius: 5,
      leashRadius: 20,
      chaseMode: "leashed",
      respawns: true,
      respawnMs: 10_000,
      evadeRestoresHp: true,
    },
    combat: {
      attackRange: 1,
      attackSpeedMs: 2_000,
      damage: 5,
    },
  },
};

export function getMobDefinition(mobId: string) {
  return MOB_DEFINITIONS[mobId] ?? null;
}
