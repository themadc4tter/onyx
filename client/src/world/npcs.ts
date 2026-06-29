import type { Facing } from "../types";

export interface NpcDefinition {
  id: string;
  name: string;
  title: string;
  zoneId: string;
  markerName?: string;
  tileX?: number;
  tileY?: number;
  spriteKey: string;
  spriteUrl: string;
  facing?: Facing;
  dialogueId?: string;
  shopId?: string;
}

export interface PlacedNpcDefinition extends NpcDefinition {
  tileX: number;
  tileY: number;
}

export const NPCS: NpcDefinition[] = [
  {
    id: "inn-cook-bob",
    name: "Bob",
    title: "Cook",
    zoneId: "inn",
    markerName: "npc_1",
    spriteKey: "npc-male-tone3",
    spriteUrl: "assets/characters/male_tone3.png",
    facing: "down",
    dialogueId: "bob_intro",
  },
];

export function getNpcsForZone(zoneId: string) {
  return NPCS.filter(npc => npc.zoneId === zoneId);
}
