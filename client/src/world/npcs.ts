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
    id: "settlement-blacksmith-john-smith",
    name: "John Smith",
    title: "Blacksmith",
    zoneId: "settlement",
    markerName: "npc_1",
    spriteKey: "npc004",
    spriteUrl: "assets/characters/npc004.png",
    facing: "down",
    dialogueId: "john_smith_intro",
  },
  {
    id: "settlement-fisherwoman-belinda",
    name: "Belinda",
    title: "Fisherwoman",
    zoneId: "settlement",
    markerName: "npc_2",
    spriteKey: "npc005",
    spriteUrl: "assets/characters/npc005.png",
    facing: "down",
    dialogueId: "belinda_intro",
  },
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
  {
    id: "inn-adventurer-gerald",
    name: "Gerald",
    title: "Adventurer",
    zoneId: "inn",
    markerName: "npc_2",
    spriteKey: "npc008",
    spriteUrl: "assets/characters/npc008.png",
    facing: "down",
    dialogueId: "gerald_intro",
  },
  {
    id: "bank-banker-yosef-horowitz",
    name: "Yosef Horowitz",
    title: "Banker",
    zoneId: "bank",
    markerName: "npc_1",
    spriteKey: "npc010",
    spriteUrl: "assets/characters/npc010.png",
    facing: "down",
    dialogueId: "yosef_horowitz_intro",
  },
];

export function getNpcsForZone(zoneId: string) {
  return NPCS.filter(npc => npc.zoneId === zoneId);
}
