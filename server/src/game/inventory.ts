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

export interface InventoryActionResult {
  ok: boolean;
  inventory: InventoryState;
  error?: string;
}

const INVENTORY_SLOT_COUNT = 24;
const INVENTORY_SAVE_DELAY_MS = 30_000;
const INVENTORY_SAVE_RETRY_MS = 30_000;
const inventories = new Map<string, InventoryState>();
const dirtyInventoryUserIds = new Set<string>();
const inventorySaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

export function markInventoryDirty(userId: string) {
  dirtyInventoryUserIds.add(userId);
  if (inventorySaveTimers.has(userId)) return;

  const timer = setTimeout(() => {
    inventorySaveTimers.delete(userId);
    flushDirtyInventory(userId).catch(error => {
      console.error(`[inventory] failed to save dirty inventory for ${userId}`, error);
      scheduleInventorySaveRetry(userId);
    });
  }, INVENTORY_SAVE_DELAY_MS);
  inventorySaveTimers.set(userId, timer);
}

export async function flushDirtyInventory(userId: string) {
  const timer = inventorySaveTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    inventorySaveTimers.delete(userId);
  }

  if (!dirtyInventoryUserIds.has(userId)) return;

  await saveInventory(userId);
  dirtyInventoryUserIds.delete(userId);
}

export async function flushAllDirtyInventories() {
  await Promise.all([...dirtyInventoryUserIds].map(userId => flushDirtyInventory(userId)));
}

function scheduleInventorySaveRetry(userId: string) {
  if (!dirtyInventoryUserIds.has(userId) || inventorySaveTimers.has(userId)) return;

  const timer = setTimeout(() => {
    inventorySaveTimers.delete(userId);
    flushDirtyInventory(userId).catch(error => {
      console.error(`[inventory] failed to retry dirty inventory save for ${userId}`, error);
      scheduleInventorySaveRetry(userId);
    });
  }, INVENTORY_SAVE_RETRY_MS);
  inventorySaveTimers.set(userId, timer);
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

function isValidSlotIndex(inventory: InventoryState, slotIndex: number) {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < inventory.slotCount;
}

export function moveInventoryItem(userId: string, fromSlotIndex: number, toSlotIndex: number): InventoryActionResult {
  const inventory = getInventory(userId);
  if (!isValidSlotIndex(inventory, fromSlotIndex) || !isValidSlotIndex(inventory, toSlotIndex)) {
    return { ok: false, inventory, error: "invalid_slot" };
  }

  if (fromSlotIndex === toSlotIndex) {
    return { ok: true, inventory };
  }

  const fromSlot = inventory.slots[fromSlotIndex];
  if (!fromSlot) {
    return { ok: false, inventory, error: "empty_source" };
  }

  const toSlot = inventory.slots[toSlotIndex];
  if (!toSlot) {
    inventory.slots[toSlotIndex] = { ...fromSlot, slotIndex: toSlotIndex };
    inventory.slots[fromSlotIndex] = null;
    return { ok: true, inventory };
  }

  if (fromSlot.itemId === toSlot.itemId) {
    const item = getItemDefinition(fromSlot.itemId);
    if (!item) {
      return { ok: false, inventory, error: "unknown_item" };
    }

    const movedQuantity = Math.min(item.maxStack - toSlot.quantity, fromSlot.quantity);
    if (movedQuantity <= 0) {
      inventory.slots[toSlotIndex] = { ...fromSlot, slotIndex: toSlotIndex };
      inventory.slots[fromSlotIndex] = { ...toSlot, slotIndex: fromSlotIndex };
      return { ok: true, inventory };
    }

    toSlot.quantity += movedQuantity;
    fromSlot.quantity -= movedQuantity;
    if (fromSlot.quantity <= 0) {
      inventory.slots[fromSlotIndex] = null;
    }
    return { ok: true, inventory };
  }

  inventory.slots[toSlotIndex] = { ...fromSlot, slotIndex: toSlotIndex };
  inventory.slots[fromSlotIndex] = { ...toSlot, slotIndex: fromSlotIndex };
  return { ok: true, inventory };
}

export function splitInventoryStack(userId: string, fromSlotIndex: number, quantity: number): InventoryActionResult {
  const inventory = getInventory(userId);
  if (!isValidSlotIndex(inventory, fromSlotIndex)) {
    return { ok: false, inventory, error: "invalid_slot" };
  }

  const fromSlot = inventory.slots[fromSlotIndex];
  if (!fromSlot) {
    return { ok: false, inventory, error: "empty_source" };
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity >= fromSlot.quantity) {
    return { ok: false, inventory, error: "invalid_quantity" };
  }

  const emptySlotIndex = inventory.slots.findIndex(slot => slot === null);
  if (emptySlotIndex === -1) {
    return { ok: false, inventory, error: "inventory_full" };
  }

  fromSlot.quantity -= quantity;
  inventory.slots[emptySlotIndex] = {
    slotIndex: emptySlotIndex,
    itemId: fromSlot.itemId,
    quantity,
  };

  return { ok: true, inventory };
}

export function deleteInventoryItem(userId: string, slotIndex: number): InventoryActionResult {
  const inventory = getInventory(userId);
  if (!isValidSlotIndex(inventory, slotIndex)) {
    return { ok: false, inventory, error: "invalid_slot" };
  }

  if (!inventory.slots[slotIndex]) {
    return { ok: false, inventory, error: "empty_source" };
  }

  inventory.slots[slotIndex] = null;
  return { ok: true, inventory };
}
