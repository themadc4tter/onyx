import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@onyx/shared/items";

export interface EquippedItem {
  slot: EquipmentSlot;
  itemId: string;
}

export interface EquipmentState {
  slots: Record<EquipmentSlot, EquippedItem | null>;
}

export function createEmptyEquipment(): EquipmentState {
  return {
    slots: Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, null])) as EquipmentState["slots"],
  };
}

export { EQUIPMENT_SLOTS };
export type { EquipmentSlot };
