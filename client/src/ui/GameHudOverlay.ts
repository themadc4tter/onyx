import Phaser from "phaser";

type PanelId = "skills" | "inventory" | "equipment" | "party";

interface SkillMock {
  name: string;
  level: number;
  xp: number;
  nextUnlock: string;
}

interface InventoryItemMock {
  name: string;
  count?: number;
  rarity?: "common" | "uncommon" | "rare";
}

interface EquipmentSlotMock {
  slot: string;
  item: string;
}

const HUD_LAYER_ID = "game-hud-layer";

const SKILLS: SkillMock[] = [
  { name: "Melee", level: 12, xp: 62, nextUnlock: "Guarding Stance" },
  { name: "Ranged", level: 8, xp: 34, nextUnlock: "Snare Trap" },
  { name: "Magic", level: 10, xp: 48, nextUnlock: "Lesser Ward" },
  { name: "Mining", level: 15, xp: 76, nextUnlock: "Iron Veins" },
  { name: "Smithing", level: 11, xp: 52, nextUnlock: "Reinforced Buckles" },
  { name: "Herbalism", level: 9, xp: 41, nextUnlock: "Moonleaf" },
  { name: "Alchemy", level: 7, xp: 29, nextUnlock: "Mist Tonic" },
  { name: "Cooking", level: 13, xp: 58, nextUnlock: "Hearty Stew" },
  { name: "Fishing", level: 6, xp: 25, nextUnlock: "River Perch" },
];

const INVENTORY: Array<InventoryItemMock | null> = [
  { name: "Copper Ore", count: 18 },
  { name: "Moonleaf", count: 6, rarity: "uncommon" },
  { name: "Repair Kit", count: 2 },
  { name: "Mist Tonic", count: 3, rarity: "uncommon" },
  { name: "Iron Dagger", rarity: "rare" },
  null,
  { name: "Raw Trout", count: 7 },
  { name: "Coal", count: 11 },
  null,
  null,
  { name: "Guild Token", count: 1, rarity: "rare" },
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

const EQUIPMENT: EquipmentSlotMock[] = [
  { slot: "Head", item: "Cloth Hood" },
  { slot: "Chest", item: "Padded Tunic" },
  { slot: "Legs", item: "Traveler Pants" },
  { slot: "Boots", item: "Worn Boots" },
  { slot: "Main Hand", item: "Bronze Sword" },
  { slot: "Off Hand", item: "Wooden Buckler" },
  { slot: "Tool", item: "Copper Pickaxe" },
  { slot: "Charm", item: "Empty" },
];

const CSS = `
  #${HUD_LAYER_ID} {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    font-family: Arial, Helvetica, sans-serif;
    color: #f2ead8;
  }

  .hud-chat {
    position: absolute;
    left: max(16px, env(safe-area-inset-left));
    bottom: max(16px, env(safe-area-inset-bottom));
    width: min(360px, calc(100vw - 120px));
    min-height: 132px;
    background: rgba(13, 17, 22, 0.58);
    border: 1px solid rgba(221, 198, 144, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    pointer-events: auto;
  }

  .hud-chat-log {
    height: 104px;
    padding: 10px 12px 4px;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.35;
  }

  .hud-chat-line {
    margin-bottom: 4px;
    color: rgba(242, 234, 216, 0.86);
    text-shadow: 0 1px 1px #000;
  }

  .hud-chat-line.system { color: #e5c36b; }
  .hud-chat-line.party { color: #83c7ff; }

  .hud-chat-input {
    width: calc(100% - 16px);
    height: 24px;
    margin: 0 8px 8px;
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
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(2, 42px);
    gap: 8px;
    pointer-events: auto;
  }

  .hud-dock-button {
    width: 42px;
    height: 42px;
    border: 1px solid rgba(221, 198, 144, 0.5);
    background: rgba(23, 27, 29, 0.86);
    color: #f2ead8;
    font-size: 11px;
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
    right: max(72px, calc(env(safe-area-inset-right) + 72px));
    bottom: max(16px, env(safe-area-inset-bottom));
    width: min(520px, calc(100vw - 32px));
    max-height: min(430px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    background: rgba(20, 22, 21, 0.96);
    border: 1px solid rgba(229, 195, 107, 0.64);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    pointer-events: auto;
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
    gap: 8px;
    align-items: center;
    padding: 8px;
    border: 1px solid rgba(242, 234, 216, 0.1);
    background: rgba(255, 255, 255, 0.035);
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
    height: 100%;
    background: #5fbf89;
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

  .inventory-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    color: rgba(242, 234, 216, 0.8);
    font-size: 13px;
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
    bottom: 3px;
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
    gap: 8px;
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
      width: min(310px, calc(100vw - 86px));
      min-height: 112px;
    }

    .hud-chat-log {
      height: 84px;
      font-size: 12px;
    }

    .hud-window {
      left: 12px;
      right: 12px;
      bottom: 72px;
      width: auto;
      max-height: calc(100vh - 92px);
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

  constructor(private scene: Phaser.Scene) {
    const root = document.getElementById("game-root");
    if (!root) throw new Error("Missing #game-root element for game HUD");

    this.root = root;
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.layer = this.ensureLayer(root);
    this.windowRoot = document.createElement("div");
    this.windowRoot.className = "hud-window-root";
    this.layer.appendChild(this.windowRoot);

    this.render();

    window.addEventListener("keydown", this.handleKeyDown);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  destroy = () => {
    window.removeEventListener("keydown", this.handleKeyDown);
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
    this.layer.appendChild(this.createChat());
    this.layer.appendChild(this.createDock());
  }

  private createChat() {
    const chat = document.createElement("section");
    chat.className = "hud-chat";
    chat.setAttribute("aria-label", "Chat");
    chat.innerHTML = `
      <div class="hud-chat-log">
        <div class="hud-chat-line system">Welcome to Onyx.</div>
        <div class="hud-chat-line">Mira: Iron veins are up near the north path.</div>
        <div class="hud-chat-line party">Party: Meet at the dungeon gate?</div>
        <div class="hud-chat-line">Rowan: Bringing tonics.</div>
      </div>
      <input class="hud-chat-input" type="text" placeholder="Press Enter to chat" />
    `;
    return chat;
  }

  private createDock() {
    const dock = document.createElement("nav");
    dock.className = "hud-dock";
    dock.setAttribute("aria-label", "Game panels");

    const panels: Array<{ id: PanelId; label: string; title: string }> = [
      { id: "equipment", label: "EQ", title: "Equipment" },
      { id: "inventory", label: "BAG", title: "Inventory" },
      { id: "skills", label: "SK", title: "Skills" },
      { id: "party", label: "PTY", title: "Party" },
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
    panel.className = "hud-window";
    panel.setAttribute("aria-label", this.getPanelTitle(this.activePanel));
    panel.innerHTML = `
      <header class="hud-window-header">
        <div class="hud-window-title">${this.getPanelTitle(this.activePanel)}</div>
        <button class="hud-close-button" type="button" aria-label="Close">×</button>
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
      const row = document.createElement("button");
      row.type = "button";
      row.className = `skill-row${skill.name === this.selectedSkill.name ? " active" : ""}`;
      row.innerHTML = `
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level">${skill.level}</span>
        <span class="xp-bar"><span class="xp-fill" style="width: ${skill.xp}%"></span></span>
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
    const filledSlots = INVENTORY.filter(Boolean).length;
    panel.innerHTML = `
      <div class="inventory-header">
        <span>${filledSlots} / ${INVENTORY.length} slots</span>
        <strong>1,284 coins</strong>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "inventory-grid";

    for (const item of INVENTORY) {
      const slot = document.createElement("div");
      slot.className = ["inventory-slot", item ? "filled" : "", item?.rarity ?? ""].filter(Boolean).join(" ");
      slot.textContent = item?.name ?? "";
      if (item?.count) {
        const count = document.createElement("span");
        count.className = "item-count";
        count.textContent = String(item.count);
        slot.appendChild(count);
      }
      grid.appendChild(slot);
    }

    panel.appendChild(grid);
    return panel;
  }

  private createEquipmentPanel() {
    const layout = document.createElement("div");
    layout.className = "equipment-layout";

    const slots = document.createElement("div");
    slots.className = "equipment-grid";
    for (const entry of EQUIPMENT) {
      const slot = document.createElement("div");
      slot.className = "equipment-slot";
      slot.innerHTML = `<span class="slot-label">${entry.slot}</span><strong class="slot-item">${entry.item}</strong>`;
      slots.appendChild(slot);
    }

    const stats = document.createElement("aside");
    stats.className = "equipment-stats";
    stats.innerHTML = `
      <div class="detail-title">Character</div>
      <div class="stat-list">
        <div class="stat-row"><span class="stat-label">Power</span><strong class="stat-value">18</strong></div>
        <div class="stat-row"><span class="stat-label">Guard</span><strong class="stat-value">11</strong></div>
        <div class="stat-row"><span class="stat-label">Focus</span><strong class="stat-value">14</strong></div>
        <div class="stat-row"><span class="stat-label">Gathering</span><strong class="stat-value">+6</strong></div>
      </div>
    `;

    layout.append(slots, stats);
    return layout;
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
    if (event.key !== "Escape" || !this.activePanel) return;
    this.activePanel = null;
    this.renderActivePanel();
  };
}
