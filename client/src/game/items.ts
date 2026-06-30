export type ItemRarity = "common" | "uncommon" | "rare";
export type ItemType = "material" | "consumable" | "equipment" | "quest";
export type EquipmentSlot = "head" | "chest" | "legs" | "feet" | "main_hand" | "off_hand" | "ring" | "charm";
export const EQUIPMENT_SLOTS: EquipmentSlot[] = ["main_hand", "off_hand", "head", "chest", "legs", "feet", "ring", "charm"];

export interface EquipmentStats {
  attack_damage?: number;
  power?: number;
  guard?: number;
  focus?: number;
  gathering?: number;
}

export interface EquipmentDefinition {
  slot: EquipmentSlot;
  stats: EquipmentStats;
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  maxStack: number;
  rarity: ItemRarity;
  type: ItemType;
  equipment?: EquipmentDefinition;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  moonleaf: {
    id: "moonleaf",
    name: "Moonleaf",
    description: "A pale meadow herb used in simple tonics.",
    iconUrl: "assets/objects/herb1.png",
    maxStack: 20,
    rarity: "uncommon",
    type: "material",
  },
  mystic_ruby_staff: {
    id: "mystic_ruby_staff",
    name: "Mystic Ruby Staff",
    description: "A powerful staff.",
    iconUrl: "assets/equipment/main_hand/staff2_4.png",
    maxStack: 1,
    rarity: "rare",
    type: "equipment",
    equipment: {
      slot: "main_hand",
      stats: {
        attack_damage: 8,
      },
    },
  },
};

export function getItemDefinition(itemId: string) {
  return ITEM_DEFINITIONS[itemId] ?? null;
}
