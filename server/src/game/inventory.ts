import { getItemDefinition } from "./items";

export interface InventorySlot {
  slotIndex: number;
  itemId: string;
  quantity: number;
}

export interface InventoryState {
  slotCount: number;
  slots: Array<InventorySlot | null>;
}

export interface AddItemResult {
  ok: boolean;
  addedQuantity: number;
  remainingQuantity: number;
  inventory: InventoryState;
}

const INVENTORY_SLOT_COUNT = 24;
const inventories = new Map<string, InventoryState>();

function createEmptyInventory(): InventoryState {
  return {
    slotCount: INVENTORY_SLOT_COUNT,
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, () => null),
  };
}

export function getInventory(userId: string) {
  let inventory = inventories.get(userId);
  if (!inventory) {
    inventory = createEmptyInventory();
    inventories.set(userId, inventory);
  }

  return inventory;
}

export function addItemToInventory(userId: string, itemId: string, quantity: number): AddItemResult {
  const item = getItemDefinition(itemId);
  const inventory = getInventory(userId);
  if (!item || quantity <= 0) {
    return {
      ok: false,
      addedQuantity: 0,
      remainingQuantity: quantity,
      inventory,
    };
  }

  let remainingQuantity = quantity;

  for (const slot of inventory.slots) {
    if (!slot || slot.itemId !== itemId || slot.quantity >= item.maxStack) continue;

    const added = Math.min(item.maxStack - slot.quantity, remainingQuantity);
    slot.quantity += added;
    remainingQuantity -= added;
    if (remainingQuantity === 0) break;
  }

  while (remainingQuantity > 0) {
    const emptySlotIndex = inventory.slots.findIndex(slot => slot === null);
    if (emptySlotIndex === -1) break;

    const added = Math.min(item.maxStack, remainingQuantity);
    inventory.slots[emptySlotIndex] = {
      slotIndex: emptySlotIndex,
      itemId,
      quantity: added,
    };
    remainingQuantity -= added;
  }

  return {
    ok: remainingQuantity === 0,
    addedQuantity: quantity - remainingQuantity,
    remainingQuantity,
    inventory,
  };
}
