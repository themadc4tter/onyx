export interface InventorySlot {
  slotIndex: number;
  itemId: string;
  quantity: number;
}

export interface InventoryState {
  slotCount: number;
  slots: Array<InventorySlot | null>;
}

export function createEmptyInventory(slotCount = 24): InventoryState {
  return {
    slotCount,
    slots: Array.from({ length: slotCount }, () => null),
  };
}
