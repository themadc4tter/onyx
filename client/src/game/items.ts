export type ItemRarity = "common" | "uncommon" | "rare";
export type ItemType = "material" | "consumable" | "equipment" | "quest";

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  maxStack: number;
  rarity: ItemRarity;
  type: ItemType;
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
};

export function getItemDefinition(itemId: string) {
  return ITEM_DEFINITIONS[itemId] ?? null;
}
