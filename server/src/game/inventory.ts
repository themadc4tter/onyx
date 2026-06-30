import { getItemDefinition } from "./items";
import { supabase } from "../lib/supabase";

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

interface InventoryRow {
  slot_index: number;
  item_id: string;
  quantity: number;
}

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

export function setInventory(userId: string, inventory: InventoryState) {
  inventories.set(userId, {
    slotCount: inventory.slotCount,
    slots: inventory.slots.map(slot => slot ? { ...slot } : null),
  });
}

export async function loadInventory(userId: string) {
  const inventory = createEmptyInventory();
  const { data, error } = await supabase
    .from("player_inventory")
    .select("slot_index, item_id, quantity")
    .eq("user_id", userId)
    .order("slot_index", { ascending: true });

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as InventoryRow[]) {
    const item = getItemDefinition(row.item_id);
    if (
      !item ||
      row.slot_index < 0 ||
      row.slot_index >= INVENTORY_SLOT_COUNT ||
      row.quantity <= 0
    ) {
      continue;
    }

    inventory.slots[row.slot_index] = {
      slotIndex: row.slot_index,
      itemId: row.item_id,
      quantity: Math.min(row.quantity, item.maxStack),
    };
  }

  inventories.set(userId, inventory);
  return inventory;
}

export async function saveInventory(userId: string, inventory = getInventory(userId)) {
  const rows = inventory.slots
    .filter((slot): slot is InventorySlot => Boolean(slot))
    .map(slot => ({
      user_id: userId,
      slot_index: slot.slotIndex,
      item_id: slot.itemId,
      quantity: slot.quantity,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("player_inventory")
      .upsert(rows, { onConflict: "user_id,slot_index" });

    if (error) {
      throw error;
    }
  }

  const emptySlotIndexes = inventory.slots
    .map((slot, index) => slot ? null : index)
    .filter((slotIndex): slotIndex is number => slotIndex !== null);

  if (rows.length === 0) {
    const { error } = await supabase
      .from("player_inventory")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
    return;
  }

  if (emptySlotIndexes.length > 0) {
    const { error } = await supabase
      .from("player_inventory")
      .delete()
      .eq("user_id", userId)
      .in("slot_index", emptySlotIndexes);

    if (error) {
      throw error;
    }
  }
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
