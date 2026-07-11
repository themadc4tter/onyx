import { getItemDefinition } from "@onyx/shared/items";
import type { TradeOfferItem, TradeStatePayload } from "@onyx/shared/protocol";
import type { InventoryState } from "../../game/inventory";
import type { TooltipManager } from "../tooltips/TooltipManager";
import { buildItemTooltip } from "../tooltips/tooltipBuilders";

interface TradeWindowOptions {
  tradeState: TradeStatePayload;
  inventory: InventoryState;
  tooltip: TooltipManager;
  addSystemMessage: (message: string) => void;
  onCancelTrade: () => void;
  onSetAccepted: (accepted: boolean) => void;
  onRemoveItem: (slotIndex: number) => void;
  onAddItem: (slotIndex: number, quantity: number) => void;
}

export function createTradeWindow(options: TradeWindowOptions) {
  const windowEl = document.createElement("section");
  windowEl.className = "trade-window";
  windowEl.setAttribute("aria-label", "Trade");

  const header = document.createElement("header");
  header.className = "hud-window-header";

  const title = document.createElement("div");
  title.className = "hud-window-title";
  title.textContent = `Trade with ${options.tradeState.partnerUsername}`;

  const close = document.createElement("button");
  close.className = "hud-close-button";
  close.type = "button";
  close.setAttribute("aria-label", "Cancel trade");
  close.innerHTML = "&times;";
  close.addEventListener("click", options.onCancelTrade);
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "trade-body";

  const offers = document.createElement("div");
  offers.className = "trade-offers";
  offers.append(
    createTradeOfferPanel(options, "Your offer", options.tradeState.ownOffer, options.tradeState.ownAccepted, true),
    createTradeOfferPanel(
      options,
      `${options.tradeState.partnerUsername}'s offer`,
      options.tradeState.otherOffer,
      options.tradeState.otherAccepted,
      false,
    ),
  );

  const inventoryPanel = document.createElement("div");
  inventoryPanel.className = "trade-panel";
  const inventoryTitle = document.createElement("div");
  inventoryTitle.className = "trade-inventory-title";
  inventoryTitle.textContent = options.tradeState.ownAccepted ? "Changing your offer will reset acceptance" : "Click inventory items to offer them";
  inventoryPanel.append(inventoryTitle, createTradeInventoryGrid(options));

  const actions = document.createElement("div");
  actions.className = "trade-actions";

  const acceptButton = document.createElement("button");
  acceptButton.className = "trade-action-button confirm";
  acceptButton.type = "button";
  acceptButton.textContent = options.tradeState.ownAccepted ? "Unaccept" : "Accept";
  acceptButton.addEventListener("click", () => {
    options.onSetAccepted(!options.tradeState.ownAccepted);
  });

  const cancelButton = document.createElement("button");
  cancelButton.className = "trade-action-button cancel";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", options.onCancelTrade);

  actions.append(acceptButton, cancelButton);
  body.append(offers, inventoryPanel, actions);
  windowEl.append(header, body);
  return windowEl;
}

export function getTradeCancelledMessage(reason?: string) {
  const messages: Record<string, string> = {
    cancelled: "Trade cancelled.",
    disconnect: "Trade cancelled because a player disconnected.",
    movement: "Trade cancelled because a player moved.",
    range: "Trade cancelled because you are too far apart.",
    death: "Trade cancelled because a player died.",
  };

  return messages[reason ?? ""] ?? "Trade cancelled.";
}

function createTradeOfferPanel(
  options: TradeWindowOptions,
  titleText: string,
  offer: TradeOfferItem[],
  accepted: boolean,
  isOwnOffer: boolean,
) {
  const panel = document.createElement("div");
  panel.className = `trade-panel${accepted ? " accepted" : ""}`;

  const title = document.createElement("div");
  title.className = "trade-panel-title";

  const name = document.createElement("span");
  name.textContent = titleText;

  const status = document.createElement("span");
  status.className = "trade-status";
  status.textContent = accepted ? "Accepted" : "Editing";

  title.append(name, status);
  panel.appendChild(title);

  const list = document.createElement("div");
  list.className = "trade-offer-list";

  if (offer.length === 0) {
    const empty = document.createElement("div");
    empty.className = "trade-offer-item empty";
    empty.textContent = "Nothing offered";
    list.appendChild(empty);
  } else {
    for (const offeredItem of offer) {
      list.appendChild(createTradeOfferItem(options, offeredItem, isOwnOffer));
    }
  }

  panel.appendChild(list);
  return panel;
}

function createTradeOfferItem(options: TradeWindowOptions, offeredItem: TradeOfferItem, isOwnOffer: boolean) {
  const item = getItemDefinition(offeredItem.itemId);
  const row = document.createElement("div");
  row.className = "trade-offer-item";

  if (item) {
    const icon = document.createElement("img");
    icon.className = "inventory-item-icon";
    icon.src = item.iconUrl;
    icon.alt = item.name;
    row.appendChild(icon);
  } else {
    const spacer = document.createElement("span");
    row.appendChild(spacer);
  }

  const name = document.createElement("span");
  name.textContent = `${item?.name ?? offeredItem.itemId}${offeredItem.quantity > 1 ? ` x${offeredItem.quantity}` : ""}`;
  row.appendChild(name);

  const remove = document.createElement("button");
  remove.className = "trade-remove-button";
  remove.type = "button";
  remove.innerHTML = "&times;";
  remove.disabled = !isOwnOffer;
  remove.addEventListener("click", () => {
    options.onRemoveItem(offeredItem.slotIndex);
  });
  row.appendChild(remove);

  return row;
}

function createTradeInventoryGrid(options: TradeWindowOptions) {
  const grid = document.createElement("div");
  grid.className = "trade-inventory-grid";
  const offeredSlotIndexes = new Set(options.tradeState.ownOffer.map(item => item.slotIndex));

  for (let slotIndex = 0; slotIndex < options.inventory.slots.length; slotIndex += 1) {
    const slotItem = options.inventory.slots[slotIndex];
    const item = slotItem ? getItemDefinition(slotItem.itemId) : null;
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = [
      "inventory-slot",
      item ? "filled" : "",
      item?.rarity ?? "",
      offeredSlotIndexes.has(slotIndex) ? "selected" : "",
    ].filter(Boolean).join(" ");
    slot.disabled = !slotItem;
    if (slotItem && item) {
      options.tooltip.attach(slot, () => buildItemTooltip(item, {
        quantity: slotItem.quantity,
        context: "trade",
      }));
    }

    if (slotItem && item) {
      const icon = document.createElement("img");
      icon.className = "inventory-item-icon";
      icon.src = item.iconUrl;
      icon.alt = item.name;
      slot.appendChild(icon);

      const name = document.createElement("span");
      name.className = "inventory-item-name";
      name.textContent = item.name;
      slot.appendChild(name);

      if (slotItem.quantity > 1) {
        const count = document.createElement("span");
        count.className = "item-count";
        count.textContent = String(slotItem.quantity);
        slot.appendChild(count);
      }

      slot.addEventListener("click", () => offerInventorySlot(options, slotIndex));
    }

    grid.appendChild(slot);
  }

  return grid;
}

function offerInventorySlot(options: TradeWindowOptions, slotIndex: number) {
  const slot = options.inventory.slots[slotIndex];
  if (!slot) return;

  let quantity = 1;
  if (slot.quantity > 1) {
    const itemName = getItemDefinition(slot.itemId)?.name ?? slot.itemId;
    const requestedQuantity = window.prompt(`Offer how many ${itemName}?`, String(slot.quantity));
    if (requestedQuantity === null) return;

    quantity = Number(requestedQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > slot.quantity) {
      options.addSystemMessage(`Enter a whole number from 1 to ${slot.quantity}.`);
      return;
    }
  }

  options.onAddItem(slotIndex, quantity);
}
