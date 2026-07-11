import { getItemDefinition } from "@onyx/shared/items";
import type { InventoryState } from "../../game/inventory";
import type { TooltipManager } from "../tooltips/TooltipManager";
import { buildItemTooltip } from "../tooltips/tooltipBuilders";

interface InventoryPanelOptions {
  inventory: InventoryState;
  selectedSlotIndex: number | null;
  tooltip: TooltipManager;
  getDraggedSlotIndex: () => number | null;
  setDraggedSlotIndex: (slotIndex: number | null) => void;
  onSelectSlot: (slotIndex: number) => void;
  onEquipSlot: (slotIndex: number) => void;
  onSplitSlot: (slotIndex: number) => void;
  onDeleteSlot: (slotIndex: number) => void;
  onMoveSlot: (fromSlotIndex: number, toSlotIndex: number) => void;
}

export function createInventoryPanel(options: InventoryPanelOptions) {
  const panel = document.createElement("div");
  const filledSlots = options.inventory.slots.filter(Boolean).length;
  panel.innerHTML = `
    <div class="inventory-header">
      <span>${filledSlots} / ${options.inventory.slotCount} slots</span>
      <div class="inventory-actions">
        <button class="inventory-action-button equip" type="button">Equip</button>
        <button class="inventory-action-button split" type="button">Split</button>
        <button class="inventory-action-button delete" type="button">Delete</button>
      </div>
    </div>
  `;

  const selectedSlot = getSelectedInventorySlot(options);
  const selectedItem = selectedSlot ? getItemDefinition(selectedSlot.itemId) : null;
  const equipButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.equip")!;
  const splitButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.split")!;
  const deleteButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.delete")!;
  equipButton.disabled = !selectedSlot || selectedItem?.type !== "equipment" || !selectedItem.equipment || selectedSlot.quantity !== 1;
  splitButton.disabled = !selectedSlot || selectedSlot.quantity <= 1;
  deleteButton.disabled = !selectedSlot;
  equipButton.addEventListener("click", () => {
    if (options.selectedSlotIndex !== null) options.onEquipSlot(options.selectedSlotIndex);
  });
  splitButton.addEventListener("click", () => {
    if (options.selectedSlotIndex !== null) options.onSplitSlot(options.selectedSlotIndex);
  });
  deleteButton.addEventListener("click", () => {
    if (options.selectedSlotIndex !== null) options.onDeleteSlot(options.selectedSlotIndex);
  });
  deleteButton.addEventListener("dragover", event => {
    if (options.getDraggedSlotIndex() === null) return;
    event.preventDefault();
    deleteButton.classList.add("drag-over");
  });
  deleteButton.addEventListener("dragleave", () => deleteButton.classList.remove("drag-over"));
  deleteButton.addEventListener("drop", event => {
    event.preventDefault();
    deleteButton.classList.remove("drag-over");
    const draggedSlotIndex = options.getDraggedSlotIndex();
    if (draggedSlotIndex === null) return;
    options.onDeleteSlot(draggedSlotIndex);
    options.setDraggedSlotIndex(null);
  });

  const grid = document.createElement("div");
  grid.className = "inventory-grid";

  for (let slotIndex = 0; slotIndex < options.inventory.slots.length; slotIndex += 1) {
    const slotItem = options.inventory.slots[slotIndex];
    const item = slotItem ? getItemDefinition(slotItem.itemId) : null;
    const slot = document.createElement("div");
    slot.className = [
      "inventory-slot",
      item ? "filled" : "",
      item?.rarity ?? "",
      options.selectedSlotIndex === slotIndex ? "selected" : "",
    ].filter(Boolean).join(" ");
    slot.dataset.slotIndex = String(slotIndex);
    if (slotItem && item) {
      options.tooltip.attach(slot, () => buildItemTooltip(item, {
        quantity: slotItem.quantity,
        context: "inventory",
      }));
    }

    if (slotItem) {
      slot.draggable = true;
      slot.addEventListener("click", () => options.onSelectSlot(slotIndex));
      slot.addEventListener("dblclick", () => options.onEquipSlot(slotIndex));
      slot.addEventListener("contextmenu", event => {
        event.preventDefault();
        options.onSelectSlot(slotIndex);
        options.onSplitSlot(slotIndex);
      });
      slot.addEventListener("dragstart", event => {
        options.tooltip.hide();
        options.setDraggedSlotIndex(slotIndex);
        event.dataTransfer?.setData("text/plain", String(slotIndex));
        event.dataTransfer?.setDragImage(slot, slot.clientWidth / 2, slot.clientHeight / 2);
      });
      slot.addEventListener("dragend", () => {
        options.setDraggedSlotIndex(null);
        clearInventoryDragState(panel);
      });
    }

    slot.addEventListener("dragover", event => {
      const draggedSlotIndex = options.getDraggedSlotIndex();
      if (draggedSlotIndex === null || draggedSlotIndex === slotIndex) return;
      event.preventDefault();
      slot.classList.add("drag-over");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", event => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const fromSlotIndex = getDraggedSlotIndex(event, options.getDraggedSlotIndex());
      options.setDraggedSlotIndex(null);
      if (fromSlotIndex === null || fromSlotIndex === slotIndex) return;
      options.onMoveSlot(fromSlotIndex, slotIndex);
    });

    if (item) {
      const icon = document.createElement("img");
      icon.className = "inventory-item-icon";
      icon.src = item.iconUrl;
      icon.alt = item.name;
      slot.appendChild(icon);

      const name = document.createElement("span");
      name.className = "inventory-item-name";
      name.textContent = item.name;
      slot.appendChild(name);
    }

    if (slotItem && slotItem.quantity > 1) {
      const count = document.createElement("span");
      count.className = "item-count";
      count.textContent = String(slotItem.quantity);
      slot.appendChild(count);
    }
    grid.appendChild(slot);
  }

  panel.appendChild(grid);
  return panel;
}

function getSelectedInventorySlot(options: InventoryPanelOptions) {
  if (options.selectedSlotIndex === null) return null;
  return options.inventory.slots[options.selectedSlotIndex] ?? null;
}

function getDraggedSlotIndex(event: DragEvent, fallbackSlotIndex: number | null) {
  const transferValue = event.dataTransfer?.getData("text/plain");
  const parsedTransferValue = transferValue ? Number(transferValue) : NaN;
  if (Number.isInteger(parsedTransferValue)) return parsedTransferValue;
  return fallbackSlotIndex;
}

function clearInventoryDragState(panel: HTMLElement) {
  panel
    .querySelectorAll(".inventory-slot.drag-over, .inventory-action-button.drag-over")
    .forEach(element => element.classList.remove("drag-over"));
}
