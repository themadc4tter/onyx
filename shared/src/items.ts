export type ItemRarity = "common" | "uncommon" | "rare" | "epic";
export type ItemType = "material" | "consumable" | "equipment" | "quest";
export type EquipmentSlot = "head" | "chest" | "legs" | "feet" | "main_hand" | "off_hand" | "ring" | "charm";
export type WeaponClass = "melee" | "ranged" | "magic";
export type WeaponType = "sword" | "bow" | "staff";
export const EQUIPMENT_SLOTS: EquipmentSlot[] = ["main_hand", "off_hand", "head", "chest", "legs", "feet", "ring", "charm"];

export interface EquipmentStats {
  attack_damage?: number;
  power?: number;
  guard?: number;
  focus?: number;
  gathering?: number;
}

type NonMainHandEquipmentSlot = Exclude<EquipmentSlot, "main_hand">;

interface BaseEquipmentDefinition {
  stats: EquipmentStats;
}

type MainHandEquipmentDefinition = BaseEquipmentDefinition & {
  slot: "main_hand";
  twoHanded: boolean;
  weaponType: WeaponType;
  attackSpeed: number;
} & (
  | {
      weaponClass: "melee";
      attackRange?: never;
    }
  | {
      weaponClass: "ranged" | "magic";
      attackRange: number;
    }
);

export type EquipmentDefinition =
  | MainHandEquipmentDefinition
  | (BaseEquipmentDefinition & {
      slot: NonMainHandEquipmentSlot;
      twoHanded?: never;
      weaponClass?: never;
      weaponType?: never;
      attackSpeed?: never;
      attackRange?: never;
    });

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
      twoHanded: true,
      weaponClass: "magic",
      weaponType: "staff",
      attackSpeed: 2.8,
      attackRange: 5,
      stats: {
        attack_damage: 8,
      },
    },
  },
  bronze_sword: {
    id: "bronze_sword",
    name: "Bronze Sword",
    description: "A weak sword.",
    iconUrl: "assets/equipment/main_hand/sword1_1.png",
    maxStack: 1,
    rarity: "common",
    type: "equipment",
    equipment: {
      slot: "main_hand",
      twoHanded: false,
      weaponClass: "melee",
      weaponType: "sword",
      attackSpeed: 1.5,
      stats: {
        attack_damage: 4,
      },
    },
  },
  simple_shortbow: {
    id: "simple_shortbow",
    name: "Simple Shortbow",
    description: "A weak shortbow.",
    iconUrl: "assets/equipment/main_hand/bow1.png",
    maxStack: 1,
    rarity: "common",
    type: "equipment",
    equipment: {
      slot: "main_hand",
      twoHanded: true,
      weaponClass: "ranged",
      weaponType: "bow",
      attackSpeed: 2.5,
      attackRange: 6,
      stats: {
        attack_damage: 4,
      },
    },
  },
  wooden_buckler: {
    id: "wooden_buckler",
    name: "Wooden Buckler",
    description: "A weak shield.",
    iconUrl: "assets/equipment/off_hand/shield1_1_1.png",
    maxStack: 1,
    rarity: "common",
    type: "equipment",
    equipment: {
      slot: "off_hand",
      stats: {
        attack_damage: 3,
      },
    },
  },
};

export function getItemDefinition(itemId: string) {
  return ITEM_DEFINITIONS[itemId] ?? null;
}
