import type { Facing } from "../types";

export interface NpcDefinition {
  id: string;
  name: string;
  title: string;
  zoneId: string;
  tileX: number;
  tileY: number;
  spriteKey: string;
  spriteUrl: string;
  facing?: Facing;
  dialogueId?: string;
  shopId?: string;
}

export const NPCS: NpcDefinition[] = [
  {
    id: "settlement-cooking-trainer",
    name: "John Doe",
    title: "Cooking Trainer",
    zoneId: "settlement",
    tileX: 20,
    tileY: 16,
    spriteKey: "npc001",
    spriteUrl: "assets/characters/npc001.png",
    facing: "down",
    dialogueId: "john_doe_intro",
  },
];

export function getNpcsForZone(zoneId: string) {
  return NPCS.filter(npc => npc.zoneId === zoneId);
}
