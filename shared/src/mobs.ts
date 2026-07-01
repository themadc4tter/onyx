export interface MobDefinition {
  id: string;
  name: string;
  spriteKey: string;
  spriteUrl: string;
  maxHp: number;
}

export const MOB_DEFINITIONS: Record<string, MobDefinition> = {
  orc_scout: {
    id: "orc_scout",
    name: "Orc Scout",
    spriteKey: "mob-orc-scout",
    spriteUrl: "assets/characters/male_orc.png",
    maxHp: 10,
  },
};

export function getMobDefinition(mobId: string) {
  return MOB_DEFINITIONS[mobId] ?? null;
}
