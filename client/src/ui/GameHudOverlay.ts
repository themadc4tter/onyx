import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { createEmptyEquipment, EQUIPMENT_SLOTS, type EquipmentSlot, type EquipmentState } from "../game/equipment";
import { createEmptyInventory, type InventoryState } from "../game/inventory";
import { getItemDefinition } from "../game/items";
import { HudChat } from "./chat/HudChat";

type PanelId = "skills" | "inventory" | "equipment" | "party";

interface SkillMock {
  name: string;
  level: number;
  currentXp: number;
  totalXp: number;
  nextUnlock: string;
}

const HUD_LAYER_ID = "game-hud-layer";
const HUD_INSET_PX = 12;

const SKILLS: SkillMock[] = [
  { name: "Melee", level: 12, currentXp: 124, totalXp: 200, nextUnlock: "Guarding Stance" },
  { name: "Ranged", level: 8, currentXp: 68, totalXp: 200, nextUnlock: "Snare Trap" },
  { name: "Magic", level: 10, currentXp: 96, totalXp: 200, nextUnlock: "Lesser Ward" },
  { name: "Mining", level: 15, currentXp: 152, totalXp: 200, nextUnlock: "Iron Veins" },
  { name: "Smithing", level: 11, currentXp: 104, totalXp: 200, nextUnlock: "Reinforced Buckles" },
  { name: "Herbalism", level: 9, currentXp: 82, totalXp: 200, nextUnlock: "Moonleaf" },
  { name: "Alchemy", level: 7, currentXp: 58, totalXp: 200, nextUnlock: "Mist Tonic" },
  { name: "Cooking", level: 13, currentXp: 116, totalXp: 200, nextUnlock: "Hearty Stew" },
  { name: "Fishing", level: 6, currentXp: 50, totalXp: 200, nextUnlock: "River Perch" },
];

const CSS = `
  #${HUD_LAYER_ID} {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    font-family: Arial, Helvetica, sans-serif;
    color: #f2ead8;
    --hud-canvas-left: 0px;
    --hud-canvas-top: 0px;
    --hud-canvas-width: 100vw;
    --hud-canvas-height: 100vh;
    --hud-inset: ${HUD_INSET_PX}px;
  }

  .hud-chat {
    position: absolute;
    left: calc(var(--hud-canvas-left) + var(--hud-inset));
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + var(--hud-inset));
    width: min(360px, calc(var(--hud-canvas-width) - 24px));
    min-height: 132px;
    background: rgba(13, 17, 22, 0.58);
    border: 1px solid rgba(221, 198, 144, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    pointer-events: auto;
  }

  .hud-chat-log {
    height: 104px;
    padding: 10px 12px 4px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.35;
  }

  .hud-chat-line {
    margin-bottom: 4px;
    color: rgba(242, 234, 216, 0.86);
    text-shadow: 0 1px 1px #000;
    overflow-wrap: anywhere;
  }

  .hud-chat-line.system { color: #e5c36b; }
  .hud-chat-line.zone .chat-channel { color: #7fc9a0; }
  .hud-chat-line.world .chat-channel { color: #e5c36b; }
  .hud-chat-line.party .chat-channel { color: #83c7ff; }

  .chat-channel,
  .chat-author {
    font-weight: 700;
  }

  .hud-chat-controls {
    display: grid;
    grid-template-columns: 78px 1fr;
    gap: 6px;
    margin: 0 8px 8px;
  }

  .hud-chat-channel {
    height: 24px;
    border: 1px solid rgba(221, 198, 144, 0.22);
    background: rgba(0, 0, 0, 0.34);
    color: rgba(242, 234, 216, 0.9);
    font: inherit;
    font-size: 12px;
    outline: none;
  }

  .hud-chat-input {
    width: 100%;
    height: 24px;
    padding: 0 8px;
    border: 1px solid rgba(221, 198, 144, 0.22);
    background: rgba(0, 0, 0, 0.34);
    color: rgba(242, 234, 216, 0.8);
    font: inherit;
    font-size: 12px;
    outline: none;
  }

  .hud-dock {
    position: absolute;
    right: calc(100% - var(--hud-canvas-left) - var(--hud-canvas-width) + var(--hud-inset));
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + var(--hud-inset));
    display: grid;
    grid-template-columns: repeat(4, minmax(82px, 1fr));
    gap: 8px;
    width: min(408px, calc(var(--hud-canvas-width) - 24px));
    pointer-events: auto;
  }

  .hud-dock-button {
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border: 1px solid rgba(221, 198, 144, 0.5);
    background: rgba(23, 27, 29, 0.86);
    color: #f2ead8;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 6px 14px rgba(0, 0, 0, 0.35);
  }

  .hud-dock-button:hover,
  .hud-dock-button.active {
    border-color: #e5c36b;
    background: rgba(49, 42, 31, 0.94);
    color: #ffe7a8;
  }

  .hud-window-root {
    position: absolute;
    inset: 0;
    z-index: 20;
    pointer-events: none;
  }

  .hud-window {
    position: absolute;
    right: calc(100% - var(--hud-canvas-left) - var(--hud-canvas-width) + var(--hud-inset));
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + 58px);
    width: min(520px, calc(var(--hud-canvas-width) - 24px));
    max-height: min(430px, calc(var(--hud-canvas-height) - 82px));
    display: flex;
    flex-direction: column;
    background: rgba(20, 22, 21, 0.96);
    border: 1px solid rgba(229, 195, 107, 0.64);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    pointer-events: auto;
  }

  .hud-window-skills {
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + 58px);
    max-height: min(720px, calc(var(--hud-canvas-height) - 82px));
  }

  .hud-window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid rgba(229, 195, 107, 0.22);
    background: rgba(48, 39, 26, 0.62);
  }

  .hud-window-title {
    font-size: 15px;
    font-weight: 700;
    color: #ffe7a8;
  }

  .hud-close-button {
    width: 28px;
    height: 28px;
    border: 1px solid rgba(242, 234, 216, 0.18);
    background: rgba(0, 0, 0, 0.22);
    color: #f2ead8;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }

  .hud-close-button:hover {
    border-color: #e5c36b;
    color: #ffe7a8;
  }

  .hud-window-body {
    min-height: 0;
    overflow: auto;
    padding: 14px;
  }

  .skills-layout {
    display: grid;
    grid-template-columns: minmax(190px, 230px) 1fr;
    gap: 14px;
  }

  .skill-list {
    display: grid;
    gap: 7px;
  }

  .skill-row {
    display: grid;
    grid-template-columns: 1fr 34px;
    gap: 6px 8px;
    align-items: center;
    padding: 7px 8px;
    border: 1px solid rgba(242, 234, 216, 0.1);
    background: rgba(255, 255, 255, 0.035);
    color: #f2ead8;
    cursor: pointer;
  }

  .skill-row.active {
    border-color: rgba(229, 195, 107, 0.66);
    background: rgba(229, 195, 107, 0.12);
  }

  .skill-name,
  .stat-label,
  .slot-label,
  .party-name {
    font-size: 13px;
  }

  .skill-level {
    font-size: 13px;
    font-weight: 700;
    text-align: right;
    color: #ffe7a8;
  }

  .xp-bar,
  .vital-bar {
    grid-column: 1 / -1;
    height: 6px;
    background: rgba(0, 0, 0, 0.42);
    overflow: hidden;
  }

  .xp-fill,
  .vital-fill {
    display: block;
    height: 100%;
    background: #5fbf89;
  }

  .xp-meta {
    grid-column: 1 / -1;
    color: rgba(242, 234, 216, 0.7);
    font-size: 11px;
    line-height: 1;
    text-align: right;
  }

  .skill-detail,
  .equipment-stats,
  .party-summary {
    border: 1px solid rgba(242, 234, 216, 0.1);
    background: rgba(255, 255, 255, 0.035);
    padding: 12px;
  }

  .detail-title {
    margin-bottom: 8px;
    color: #ffe7a8;
    font-size: 17px;
    font-weight: 700;
  }

  .detail-copy {
    margin-bottom: 12px;
    color: rgba(242, 234, 216, 0.78);
    font-size: 13px;
    line-height: 1.4;
  }

  .unlock-list,
  .stat-list,
  .party-list {
    display: grid;
    gap: 8px;
  }

  .unlock-item,
  .stat-row,
  .equipment-slot,
  .party-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(242, 234, 216, 0.08);
    font-size: 13px;
  }

  .inventory-header,
  .equipment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    color: rgba(242, 234, 216, 0.8);
    font-size: 13px;
  }

  .inventory-actions,
  .equipment-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .inventory-action-button {
    min-width: 62px;
    height: 28px;
    border: 1px solid rgba(221, 198, 144, 0.34);
    background: rgba(0, 0, 0, 0.24);
    color: #f2ead8;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  .inventory-action-button:hover:not(:disabled),
  .inventory-action-button.drag-over {
    border-color: #e5c36b;
    color: #ffe7a8;
  }

  .inventory-action-button.delete:hover:not(:disabled),
  .inventory-action-button.delete.drag-over {
    border-color: rgba(242, 105, 86, 0.9);
    color: #ffb5a8;
  }

  .inventory-action-button:disabled {
    cursor: default;
    opacity: 0.42;
  }

  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(42px, 1fr));
    gap: 8px;
  }

  .inventory-slot {
    position: relative;
    aspect-ratio: 1;
    min-height: 44px;
    border: 1px solid rgba(242, 234, 216, 0.12);
    background: rgba(0, 0, 0, 0.24);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    color: rgba(242, 234, 216, 0.58);
    font-size: 10px;
    text-align: center;
    cursor: default;
  }

  .inventory-slot.filled {
    cursor: grab;
  }

  .inventory-slot.filled:active {
    cursor: grabbing;
  }

  .inventory-slot.selected {
    outline: 2px solid #e5c36b;
    outline-offset: 2px;
  }

  .inventory-slot.drag-over {
    border-color: #e5c36b;
    background: rgba(229, 195, 107, 0.16);
  }

  .inventory-item-icon {
    width: 22px;
    height: 22px;
    image-rendering: pixelated;
    object-fit: contain;
  }

  .inventory-item-name {
    position: absolute;
    left: 3px;
    right: 3px;
    bottom: 3px;
    color: rgba(242, 234, 216, 0.82);
    font-size: 9px;
    line-height: 1.05;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 1px #000;
  }

  .inventory-slot.filled {
    color: #f2ead8;
    border-color: rgba(221, 198, 144, 0.34);
    background: rgba(255, 255, 255, 0.055);
  }

  .inventory-slot.uncommon { border-color: rgba(95, 191, 137, 0.7); }
  .inventory-slot.rare { border-color: rgba(114, 173, 255, 0.78); }

  .item-count {
    position: absolute;
    right: 4px;
    top: 3px;
    color: #ffe7a8;
    font-size: 11px;
    font-weight: 700;
    text-shadow: 0 1px 1px #000;
  }

  .equipment-layout {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 14px;
  }

  .equipment-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 8px;
  }

  .equipment-slot-frame {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .equipment-slot-label {
    color: rgba(242, 234, 216, 0.82);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.1;
  }

  .equipment-slot {
    min-height: 66px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    cursor: pointer;
  }

  .equipment-slot.filled {
    border-color: rgba(221, 198, 144, 0.34);
    background: rgba(255, 255, 255, 0.055);
  }

  .equipment-slot.uncommon { border-color: rgba(95, 191, 137, 0.7); }
  .equipment-slot.rare { border-color: rgba(114, 173, 255, 0.78); }

  .equipment-slot.selected {
    outline: 2px solid #e5c36b;
    outline-offset: 2px;
  }

  .equipment-slot-main {
    min-width: 0;
    display: grid;
    grid-template-columns: 26px 1fr;
    gap: 7px;
    align-items: center;
    flex: 1;
  }

  .equipment-slot.empty .equipment-slot-main {
    grid-template-columns: 1fr;
  }

  .equipment-slot-empty {
    color: rgba(242, 234, 216, 0.46);
  }

  .equipment-slot-text {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .equipment-item-icon {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
    object-fit: contain;
  }

  .equipment-slot .slot-item {
    text-align: left;
    overflow-wrap: anywhere;
  }

  .equipment-stat-line {
    color: rgba(242, 234, 216, 0.68);
    font-size: 11px;
    line-height: 1.2;
  }

  .slot-item,
  .stat-value,
  .party-role {
    color: #ffe7a8;
    font-size: 13px;
    text-align: right;
  }

  .party-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .hud-action-button {
    min-height: 34px;
    border: 1px solid rgba(221, 198, 144, 0.34);
    background: rgba(0, 0, 0, 0.24);
    color: #f2ead8;
    cursor: pointer;
    font-weight: 700;
  }

  .hud-action-button:hover {
    border-color: #e5c36b;
    color: #ffe7a8;
  }

  @media (max-width: 700px) {
    .hud-chat {
      width: min(310px, calc(var(--hud-canvas-width) - 24px));
      min-height: 112px;
    }

    .hud-chat-log {
      height: 84px;
      font-size: 12px;
    }

    .hud-window {
      left: calc(var(--hud-canvas-left) + var(--hud-inset));
      right: calc(100% - var(--hud-canvas-left) - var(--hud-canvas-width) + var(--hud-inset));
      bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + 58px);
      width: auto;
      max-height: calc(var(--hud-canvas-height) - 82px);
    }

    .hud-window-skills {
      max-height: calc(var(--hud-canvas-height) - 82px);
    }

    .hud-dock {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: min(260px, calc(var(--hud-canvas-width) - 24px));
    }

    .skills-layout,
    .equipment-layout {
      grid-template-columns: 1fr;
    }

    .inventory-grid {
      grid-template-columns: repeat(4, minmax(42px, 1fr));
    }
  }
`;

export class GameHudOverlay {
  private root: HTMLElement;
  private layer: HTMLDivElement;
  private windowRoot: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private activePanel: PanelId | null = null;
  private selectedSkill = SKILLS[0];
  private buttons = new Map<PanelId, HTMLButtonElement>();
  private chat: HudChat;
  private inventory: InventoryState;
  private equipment: EquipmentState;
  private selectedInventorySlotIndex: number | null = null;
  private selectedEquipmentSlot: EquipmentSlot | null = null;
  private draggedInventorySlotIndex: number | null = null;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    initialInventory?: InventoryState,
    initialEquipment?: EquipmentState,
  ) {
    const root = document.getElementById("game-root");
    if (!root) throw new Error("Missing #game-root element for game HUD");

    this.inventory = initialInventory ?? createEmptyInventory();
    this.equipment = initialEquipment ?? createEmptyEquipment();
    this.root = root;
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.layer = this.ensureLayer(root);
    this.windowRoot = document.createElement("div");
    this.windowRoot.className = "hud-window-root";
    this.layer.appendChild(this.windowRoot);
    this.chat = new HudChat(this.socket);

    this.render();
    this.updateCanvasBounds();

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resize", this.updateCanvasBounds);
    this.socket.on("inventory:changed", this.handleInventoryChanged);
    this.socket.on("equipment:changed", this.handleEquipmentChanged);
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.updateCanvasBounds);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  destroy = () => {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resize", this.updateCanvasBounds);
    this.socket.off("inventory:changed", this.handleInventoryChanged);
    this.socket.off("equipment:changed", this.handleEquipmentChanged);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.updateCanvasBounds);
    this.chat.destroy();
    this.layer.remove();
    this.styleEl.remove();
  };

  private ensureLayer(root: HTMLElement) {
    const existingLayer = root.querySelector<HTMLDivElement>(`#${HUD_LAYER_ID}`);
    existingLayer?.remove();

    const layer = document.createElement("div");
    layer.id = HUD_LAYER_ID;
    root.appendChild(layer);
    return layer;
  }

  private render() {
    this.layer.appendChild(this.chat.element);
    this.layer.appendChild(this.createDock());
  }

  private createDock() {
    const dock = document.createElement("nav");
    dock.className = "hud-dock";
    dock.setAttribute("aria-label", "Game panels");

    const panels: Array<{ id: PanelId; label: string; title: string }> = [
      { id: "equipment", label: "Equipment", title: "Equipment" },
      { id: "inventory", label: "Inventory", title: "Inventory" },
      { id: "skills", label: "Skills", title: "Skills" },
      { id: "party", label: "Party", title: "Party" },
    ];

    for (const panel of panels) {
      const button = document.createElement("button");
      button.className = "hud-dock-button";
      button.type = "button";
      button.textContent = panel.label;
      button.title = panel.title;
      button.setAttribute("aria-label", panel.title);
      button.addEventListener("click", () => this.togglePanel(panel.id));
      this.buttons.set(panel.id, button);
      dock.appendChild(button);
    }

    return dock;
  }

  private togglePanel(panelId: PanelId) {
    this.activePanel = this.activePanel === panelId ? null : panelId;
    this.renderActivePanel();
  }

  private renderActivePanel() {
    this.windowRoot.replaceChildren();

    for (const [panelId, button] of this.buttons) {
      button.classList.toggle("active", panelId === this.activePanel);
    }

    if (!this.activePanel) return;

    const panel = document.createElement("section");
    panel.className = `hud-window hud-window-${this.activePanel}`;
    panel.setAttribute("aria-label", this.getPanelTitle(this.activePanel));
    panel.innerHTML = `
      <header class="hud-window-header">
        <div class="hud-window-title">${this.getPanelTitle(this.activePanel)}</div>
        <button class="hud-close-button" type="button" aria-label="Close">&times;</button>
      </header>
      <div class="hud-window-body"></div>
    `;

    panel.querySelector<HTMLButtonElement>(".hud-close-button")?.addEventListener("click", () => {
      this.activePanel = null;
      this.renderActivePanel();
    });

    const body = panel.querySelector<HTMLDivElement>(".hud-window-body")!;
    if (this.activePanel === "skills") body.appendChild(this.createSkillsPanel());
    if (this.activePanel === "inventory") body.appendChild(this.createInventoryPanel());
    if (this.activePanel === "equipment") body.appendChild(this.createEquipmentPanel());
    if (this.activePanel === "party") body.appendChild(this.createPartyPanel());

    this.windowRoot.appendChild(panel);
  }

  private createSkillsPanel() {
    const layout = document.createElement("div");
    layout.className = "skills-layout";

    const list = document.createElement("div");
    list.className = "skill-list";

    for (const skill of SKILLS) {
      const percent = Math.round((skill.currentXp / skill.totalXp) * 100);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `skill-row${skill.name === this.selectedSkill.name ? " active" : ""}`;
      row.innerHTML = `
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level">${skill.level}</span>
        <span class="xp-bar"><span class="xp-fill" style="width: ${percent}%"></span></span>
        <span class="xp-meta">${skill.currentXp}/${skill.totalXp} (${percent}%)</span>
      `;
      row.addEventListener("click", () => {
        this.selectedSkill = skill;
        this.renderActivePanel();
      });
      list.appendChild(row);
    }

    const detail = document.createElement("div");
    detail.className = "skill-detail";
    detail.innerHTML = `
      <div class="detail-title">${this.selectedSkill.name}</div>
      <p class="detail-copy">Level ${this.selectedSkill.level}. Progress is mocked for now, but this panel is sized for XP, unlocks, and specialization choices.</p>
      <div class="unlock-list">
        <div class="unlock-item"><span>Next unlock</span><strong>${this.selectedSkill.nextUnlock}</strong></div>
        <div class="unlock-item"><span>At level 20</span><strong>Branch perk</strong></div>
        <div class="unlock-item"><span>At level 30</span><strong>Dungeon recipe</strong></div>
      </div>
    `;

    layout.append(list, detail);
    return layout;
  }

  private createInventoryPanel() {
    const panel = document.createElement("div");
    const filledSlots = this.inventory.slots.filter(Boolean).length;
    panel.innerHTML = `
      <div class="inventory-header">
        <span>${filledSlots} / ${this.inventory.slotCount} slots</span>
        <div class="inventory-actions">
          <button class="inventory-action-button equip" type="button">Equip</button>
          <button class="inventory-action-button split" type="button">Split</button>
          <button class="inventory-action-button delete" type="button">Delete</button>
        </div>
      </div>
    `;

    const selectedSlot = this.getSelectedInventorySlot();
    const selectedItem = selectedSlot ? getItemDefinition(selectedSlot.itemId) : null;
    const equipButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.equip")!;
    const splitButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.split")!;
    const deleteButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.delete")!;
    equipButton.disabled = !selectedSlot || selectedItem?.type !== "equipment" || !selectedItem.equipment || selectedSlot.quantity !== 1;
    splitButton.disabled = !selectedSlot || selectedSlot.quantity <= 1;
    deleteButton.disabled = !selectedSlot;
    equipButton.addEventListener("click", () => this.equipSelectedInventoryItem());
    splitButton.addEventListener("click", () => this.promptSplitSelectedInventoryStack());
    deleteButton.addEventListener("click", () => this.confirmDeleteSelectedInventoryItem());
    deleteButton.addEventListener("dragover", event => {
      if (this.draggedInventorySlotIndex === null) return;
      event.preventDefault();
      deleteButton.classList.add("drag-over");
    });
    deleteButton.addEventListener("dragleave", () => deleteButton.classList.remove("drag-over"));
    deleteButton.addEventListener("drop", event => {
      event.preventDefault();
      deleteButton.classList.remove("drag-over");
      if (this.draggedInventorySlotIndex === null) return;
      this.confirmDeleteInventoryItem(this.draggedInventorySlotIndex);
      this.draggedInventorySlotIndex = null;
    });

    const grid = document.createElement("div");
    grid.className = "inventory-grid";

    for (let slotIndex = 0; slotIndex < this.inventory.slots.length; slotIndex += 1) {
      const slotItem = this.inventory.slots[slotIndex];
      const item = slotItem ? getItemDefinition(slotItem.itemId) : null;
      const slot = document.createElement("div");
      slot.className = [
        "inventory-slot",
        item ? "filled" : "",
        item?.rarity ?? "",
        this.selectedInventorySlotIndex === slotIndex ? "selected" : "",
      ].filter(Boolean).join(" ");
      slot.title = item ? `${item.name}\n${item.description}` : "";
      slot.dataset.slotIndex = String(slotIndex);

      if (slotItem) {
        slot.draggable = true;
        slot.addEventListener("click", () => this.selectInventorySlot(slotIndex));
        slot.addEventListener("dblclick", () => this.equipInventoryItem(slotIndex));
        slot.addEventListener("contextmenu", event => {
          event.preventDefault();
          this.selectInventorySlot(slotIndex);
          this.promptSplitInventoryStack(slotIndex);
        });
        slot.addEventListener("dragstart", event => {
          this.draggedInventorySlotIndex = slotIndex;
          event.dataTransfer?.setData("text/plain", String(slotIndex));
          event.dataTransfer?.setDragImage(slot, slot.clientWidth / 2, slot.clientHeight / 2);
        });
        slot.addEventListener("dragend", () => {
          this.draggedInventorySlotIndex = null;
          this.clearInventoryDragState();
        });
      }

      slot.addEventListener("dragover", event => {
        if (this.draggedInventorySlotIndex === null || this.draggedInventorySlotIndex === slotIndex) return;
        event.preventDefault();
        slot.classList.add("drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", event => {
        event.preventDefault();
        slot.classList.remove("drag-over");
        const fromSlotIndex = this.getDraggedSlotIndex(event);
        this.draggedInventorySlotIndex = null;
        if (fromSlotIndex === null || fromSlotIndex === slotIndex) return;
        this.socket.emit("inventory:move", { fromSlotIndex, toSlotIndex: slotIndex });
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

  private getSelectedInventorySlot() {
    if (this.selectedInventorySlotIndex === null) return null;
    return this.inventory.slots[this.selectedInventorySlotIndex] ?? null;
  }

  private selectInventorySlot(slotIndex: number) {
    this.selectedInventorySlotIndex = this.selectedInventorySlotIndex === slotIndex ? null : slotIndex;
    if (this.activePanel === "inventory") this.renderActivePanel();
  }

  private equipSelectedInventoryItem() {
    if (this.selectedInventorySlotIndex === null) return;
    this.equipInventoryItem(this.selectedInventorySlotIndex);
  }

  private equipInventoryItem(slotIndex: number) {
    const slot = this.inventory.slots[slotIndex];
    const item = slot ? getItemDefinition(slot.itemId) : null;
    if (!slot || item?.type !== "equipment" || !item.equipment || slot.quantity !== 1) return;

    this.socket.emit("equipment:equip", { inventorySlotIndex: slotIndex });
  }

  private getDraggedSlotIndex(event: DragEvent) {
    const transferValue = event.dataTransfer?.getData("text/plain");
    const parsedTransferValue = transferValue ? Number(transferValue) : NaN;
    if (Number.isInteger(parsedTransferValue)) return parsedTransferValue;
    return this.draggedInventorySlotIndex;
  }

  private clearInventoryDragState() {
    this.windowRoot
      .querySelectorAll(".inventory-slot.drag-over, .inventory-action-button.drag-over")
      .forEach(element => element.classList.remove("drag-over"));
  }

  private promptSplitSelectedInventoryStack() {
    if (this.selectedInventorySlotIndex === null) return;
    this.promptSplitInventoryStack(this.selectedInventorySlotIndex);
  }

  private promptSplitInventoryStack(slotIndex: number) {
    const slot = this.inventory.slots[slotIndex];
    if (!slot || slot.quantity <= 1) return;

    const itemName = getItemDefinition(slot.itemId)?.name ?? slot.itemId;
    const defaultQuantity = Math.floor(slot.quantity / 2);
    const requestedQuantity = window.prompt(`Split how many ${itemName}?`, String(defaultQuantity));
    if (requestedQuantity === null) return;

    const quantity = Number(requestedQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity >= slot.quantity) {
      this.addSystemMessage(`Enter a whole number from 1 to ${slot.quantity - 1}.`);
      return;
    }

    this.socket.emit("inventory:split", { fromSlotIndex: slotIndex, quantity });
  }

  private confirmDeleteSelectedInventoryItem() {
    if (this.selectedInventorySlotIndex === null) return;
    this.confirmDeleteInventoryItem(this.selectedInventorySlotIndex);
  }

  private confirmDeleteInventoryItem(slotIndex: number) {
    const slot = this.inventory.slots[slotIndex];
    if (!slot) return;

    const itemName = getItemDefinition(slot.itemId)?.name ?? slot.itemId;
    const quantityLabel = slot.quantity > 1 ? `${slot.quantity} ` : "";
    if (!window.confirm(`Delete ${quantityLabel}${itemName}? This cannot be undone.`)) return;

    this.socket.emit("inventory:delete", { slotIndex });
  }

  private handleInventoryChanged = (inventory: InventoryState) => {
    this.inventory = inventory;
    if (
      this.selectedInventorySlotIndex !== null &&
      !this.inventory.slots[this.selectedInventorySlotIndex]
    ) {
      this.selectedInventorySlotIndex = null;
    }
    if (this.activePanel === "inventory") {
      this.renderActivePanel();
    }
  };

  private handleEquipmentChanged = (equipment: EquipmentState) => {
    this.equipment = equipment;
    if (
      this.selectedEquipmentSlot !== null &&
      !this.equipment.slots[this.selectedEquipmentSlot]
    ) {
      this.selectedEquipmentSlot = null;
    }
    if (this.activePanel === "equipment") {
      this.renderActivePanel();
    }
  };

  private createEquipmentPanel() {
    const panel = document.createElement("div");
    const equippedSlots = Object.values(this.equipment.slots).filter(Boolean).length;
    panel.innerHTML = `
      <div class="equipment-header">
        <span>${equippedSlots} / ${EQUIPMENT_SLOTS.length} equipped</span>
        <div class="equipment-actions">
          <button class="inventory-action-button unequip" type="button">Unequip</button>
        </div>
      </div>
    `;

    const unequipButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.unequip")!;
    unequipButton.disabled = !this.getSelectedEquipmentItem();
    unequipButton.addEventListener("click", () => this.unequipSelectedEquipmentItem());

    const layout = document.createElement("div");
    layout.className = "equipment-layout";

    const slots = document.createElement("div");
    slots.className = "equipment-grid";
    for (const equipmentSlot of EQUIPMENT_SLOTS) {
      slots.appendChild(this.createEquipmentSlot(equipmentSlot));
    }

    const stats = document.createElement("aside");
    stats.className = "equipment-stats";
    stats.appendChild(this.createEquipmentStatsPanel());

    layout.append(slots, stats);
    panel.appendChild(layout);
    return panel;
  }

  private createEquipmentSlot(equipmentSlot: EquipmentSlot) {
    const equippedItem = this.equipment.slots[equipmentSlot];
    const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
    const frame = document.createElement("div");
    frame.className = "equipment-slot-frame";

    const label = document.createElement("span");
    label.className = "equipment-slot-label";
    label.textContent = this.formatEquipmentSlot(equipmentSlot);
    frame.appendChild(label);

    const slot = document.createElement("div");
    slot.className = [
      "equipment-slot",
      item ? "filled" : "",
      item ? "" : "empty",
      item?.rarity ?? "",
      this.selectedEquipmentSlot === equipmentSlot ? "selected" : "",
    ].filter(Boolean).join(" ");
    slot.title = item ? `${item.name}\n${item.description}` : "";
    slot.addEventListener("click", () => this.selectEquipmentSlot(equipmentSlot));
    slot.addEventListener("dblclick", () => this.unequipEquipmentItem(equipmentSlot));

    const main = document.createElement("div");
    main.className = "equipment-slot-main";

    if (item) {
      const icon = document.createElement("img");
      icon.className = "equipment-item-icon";
      icon.src = item.iconUrl;
      icon.alt = item.name;
      main.appendChild(icon);
    }

    const text = document.createElement("div");
    text.className = "equipment-slot-text";

    const itemName = document.createElement("strong");
    itemName.className = item ? "slot-item" : "slot-item equipment-slot-empty";
    itemName.textContent = item?.name ?? "Empty";
    text.appendChild(itemName);

    const statSummary = item?.equipment?.stats ? this.formatStatSummary(item.equipment.stats) : "";
    if (statSummary) {
      const statLine = document.createElement("span");
      statLine.className = "equipment-stat-line";
      statLine.textContent = statSummary;
      text.appendChild(statLine);
    }

    main.appendChild(text);
    slot.appendChild(main);
    frame.appendChild(slot);

    return frame;
  }

  private getSelectedEquipmentItem() {
    if (this.selectedEquipmentSlot === null) return null;
    return this.equipment.slots[this.selectedEquipmentSlot] ?? null;
  }

  private selectEquipmentSlot(equipmentSlot: EquipmentSlot) {
    this.selectedEquipmentSlot = this.selectedEquipmentSlot === equipmentSlot ? null : equipmentSlot;
    if (this.activePanel === "equipment") this.renderActivePanel();
  }

  private unequipSelectedEquipmentItem() {
    if (this.selectedEquipmentSlot === null) return;
    this.unequipEquipmentItem(this.selectedEquipmentSlot);
  }

  private unequipEquipmentItem(equipmentSlot: EquipmentSlot) {
    if (!this.equipment.slots[equipmentSlot]) return;
    this.socket.emit("equipment:unequip", { slot: equipmentSlot });
  }

  private createEquipmentStatsPanel() {
    const container = document.createElement("div");
    const title = document.createElement("div");
    title.className = "detail-title";
    title.textContent = "Character";
    container.appendChild(title);

    const statList = document.createElement("div");
    statList.className = "stat-list";
    const totals = this.getEquipmentStatTotals();
    const statEntries = Object.entries(totals);

    if (statEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "stat-row";
      empty.innerHTML = `<span class="stat-label">Equipment bonuses</span><strong class="stat-value">None</strong>`;
      statList.appendChild(empty);
    } else {
      for (const [stat, value] of statEntries) {
        const row = document.createElement("div");
        row.className = "stat-row";
        row.innerHTML = `<span class="stat-label">${this.formatStatName(stat)}</span><strong class="stat-value">+${value}</strong>`;
        statList.appendChild(row);
      }
    }

    container.appendChild(statList);
    return container;
  }

  private getEquipmentStatTotals() {
    const totals: Record<string, number> = {};
    for (const equippedItem of Object.values(this.equipment.slots)) {
      const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
      if (!item?.equipment?.stats) continue;

      for (const [stat, value] of Object.entries(item.equipment.stats)) {
        if (typeof value !== "number" || value === 0) continue;
        totals[stat] = (totals[stat] ?? 0) + value;
      }
    }

    return totals;
  }

  private formatStatSummary(stats: object) {
    return Object.entries(stats as Record<string, number | undefined>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0)
      .map(([stat, value]) => `+${value} ${this.formatStatName(stat)}`)
      .join(", ");
  }

  private formatEquipmentSlot(slot: EquipmentSlot) {
    const labels: Record<EquipmentSlot, string> = {
      head: "Head",
      chest: "Chest",
      legs: "Legs",
      feet: "Boots",
      main_hand: "Main Hand",
      off_hand: "Off Hand",
      ring: "Ring",
      charm: "Charm",
    };
    return labels[slot];
  }

  private formatStatName(stat: string) {
    return stat
      .split("_")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private createPartyPanel() {
    const panel = document.createElement("div");
    panel.className = "party-summary";
    panel.innerHTML = `
      <div class="detail-title">Party</div>
      <p class="detail-copy">Mock party state for dungeon prep, ready checks, and social play.</p>
      <div class="party-list">
        <div class="party-row"><span class="party-name">Olive</span><strong class="party-role">Ready</strong></div>
        <div class="party-row"><span class="party-name">Mira</span><strong class="party-role">Gathering</strong></div>
        <div class="party-row"><span class="party-name">Rowan</span><strong class="party-role">At gate</strong></div>
      </div>
      <div class="party-actions">
        <button class="hud-action-button" type="button">Invite</button>
        <button class="hud-action-button" type="button">Ready Check</button>
      </div>
    `;
    return panel;
  }

  private getPanelTitle(panelId: PanelId) {
    const titles: Record<PanelId, string> = {
      skills: "Skills",
      inventory: "Inventory",
      equipment: "Equipment",
      party: "Party",
    };
    return titles[panelId];
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !this.isTextInputFocused()) {
      event.preventDefault();
      this.chat.focusInput();
      return;
    }

    if (event.key !== "Escape" || !this.activePanel) return;
    this.activePanel = null;
    this.renderActivePanel();
  };

  isTextInputFocused() {
    return this.chat.isFocused();
  }

  addSystemMessage(message: string) {
    this.chat.addSystemMessage(message);
  }

  private updateCanvasBounds = () => {
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const left = Math.round(canvasRect.left - rootRect.left);
    const top = Math.round(canvasRect.top - rootRect.top);

    this.layer.style.setProperty("--hud-canvas-left", `${left}px`);
    this.layer.style.setProperty("--hud-canvas-top", `${top}px`);
    this.layer.style.setProperty("--hud-canvas-width", `${Math.round(canvasRect.width)}px`);
    this.layer.style.setProperty("--hud-canvas-height", `${Math.round(canvasRect.height)}px`);
  };

}
