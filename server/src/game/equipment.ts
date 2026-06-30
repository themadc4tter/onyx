import { addItemToInventory, getInventory, type InventoryState } from "./inventory";
import { EQUIPMENT_SLOTS, getItemDefinition, type EquipmentSlot } from "./items";
import { supabase } from "../lib/supabase";

export interface EquippedItem {
  slot: EquipmentSlot;
  itemId: string;
}

export interface EquipmentState {
  slots: Record<EquipmentSlot, EquippedItem | null>;
}

export interface EquipmentActionResult {
  ok: boolean;
  equipment: EquipmentState;
  inventory: InventoryState;
  error?: string;
}

interface EquipmentRow {
  slot: string;
  item_id: string;
}

const equipmentByUserId = new Map<string, EquipmentState>();

function createEmptyEquipment(): EquipmentState {
  return {
    slots: Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, null])) as EquipmentState["slots"],
  };
}

function isEquipmentSlot(slot: string): slot is EquipmentSlot {
  return EQUIPMENT_SLOTS.includes(slot as EquipmentSlot);
}

export function getEquipment(userId: string) {
  let equipment = equipmentByUserId.get(userId);
  if (!equipment) {
    equipment = createEmptyEquipment();
    equipmentByUserId.set(userId, equipment);
  }

  return equipment;
}

export async function loadEquipment(userId: string) {
  const equipment = createEmptyEquipment();
  const { data, error } = await supabase
    .from("player_equipment")
    .select("slot, item_id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as EquipmentRow[]) {
    const item = getItemDefinition(row.item_id);
    if (
      !isEquipmentSlot(row.slot) ||
      !item ||
      item.type !== "equipment" ||
      item.equipment?.slot !== row.slot
    ) {
      continue;
    }

    equipment.slots[row.slot] = {
      slot: row.slot,
      itemId: row.item_id,
    };
  }

  equipmentByUserId.set(userId, equipment);
  return equipment;
}

export async function saveEquipment(userId: string, equipment = getEquipment(userId)) {
  const rows = EQUIPMENT_SLOTS
    .map(slot => equipment.slots[slot])
    .filter((item): item is EquippedItem => Boolean(item))
    .map(item => ({
      user_id: userId,
      slot: item.slot,
      item_id: item.itemId,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("player_equipment")
      .upsert(rows, { onConflict: "user_id,slot" });

    if (error) {
      throw error;
    }
  }

  const emptySlots = EQUIPMENT_SLOTS.filter(slot => !equipment.slots[slot]);
  if (rows.length === 0) {
    const { error } = await supabase
      .from("player_equipment")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
    return;
  }

  if (emptySlots.length > 0) {
    const { error } = await supabase
      .from("player_equipment")
      .delete()
      .eq("user_id", userId)
      .in("slot", emptySlots);

    if (error) {
      throw error;
    }
  }
}

function getInvalidResult(userId: string, error: string): EquipmentActionResult {
  return {
    ok: false,
    equipment: getEquipment(userId),
    inventory: getInventory(userId),
    error,
  };
}

export function equipInventoryItem(userId: string, inventorySlotIndex: number): EquipmentActionResult {
  const inventory = getInventory(userId);
  if (!Number.isInteger(inventorySlotIndex) || inventorySlotIndex < 0 || inventorySlotIndex >= inventory.slotCount) {
    return getInvalidResult(userId, "invalid_slot");
  }

  const inventorySlot = inventory.slots[inventorySlotIndex];
  if (!inventorySlot) {
    return getInvalidResult(userId, "empty_source");
  }

  const item = getItemDefinition(inventorySlot.itemId);
  if (!item || item.type !== "equipment" || !item.equipment) {
    return getInvalidResult(userId, "not_equipment");
  }

  if (inventorySlot.quantity !== 1) {
    return getInvalidResult(userId, "invalid_quantity");
  }

  const equipment = getEquipment(userId);
  const targetSlot = item.equipment.slot;
  const previouslyEquipped = equipment.slots[targetSlot];

  equipment.slots[targetSlot] = {
    slot: targetSlot,
    itemId: inventorySlot.itemId,
  };

  inventory.slots[inventorySlotIndex] = previouslyEquipped
    ? {
        slotIndex: inventorySlotIndex,
        itemId: previouslyEquipped.itemId,
        quantity: 1,
      }
    : null;

  return {
    ok: true,
    equipment,
    inventory,
  };
}

export function unequipItem(userId: string, equipmentSlot: string): EquipmentActionResult {
  if (!isEquipmentSlot(equipmentSlot)) {
    return getInvalidResult(userId, "invalid_equipment_slot");
  }

  const equipment = getEquipment(userId);
  const equippedItem = equipment.slots[equipmentSlot];
  if (!equippedItem) {
    return getInvalidResult(userId, "empty_equipment_slot");
  }

  const addResult = addItemToInventory(userId, equippedItem.itemId, 1);
  if (!addResult.ok) {
    return {
      ok: false,
      equipment,
      inventory: addResult.inventory,
      error: "inventory_full",
    };
  }

  equipment.slots[equipmentSlot] = null;

  return {
    ok: true,
    equipment,
    inventory: addResult.inventory,
  };
}
