import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { createEmptyEquipment, EQUIPMENT_SLOTS, type EquipmentSlot, type EquipmentState } from "../game/equipment";
import { createEmptyInventory, type InventoryState } from "../game/inventory";
import { getItemDefinition } from "@onyx/shared/items";
import {
  MAX_SKILL_LEVEL,
  SKILL_DEFINITIONS,
  getSkillProgress,
  type SkillId,
} from "@onyx/shared/skills";
import type {
  SkillXpGainedPayload,
  SkillsPayload,
  TradeCancelledPayload,
  TradeDeclinedPayload,
  TradeErrorPayload,
  TradeOfferItem,
  PlayerCombatState,
  PlayerCombatStatePayload,
  TradeRequestReceivedPayload,
  TradeRequestSentPayload,
  TradeStatePayload,
} from "@onyx/shared/protocol";
import { HudChat } from "./chat/HudChat";

type PanelId = "skills" | "inventory" | "equipment" | "social" | "settings";

interface SkillMock {
  id: SkillId;
  name: string;
  nextUnlock: string;
}

interface GameHudOverlayOptions {
  musicEnabled: boolean;
  onMusicEnabledChange: (enabled: boolean) => void;
  playerName: string;
  combat?: PlayerCombatState;
  onClearTarget?: () => void;
  skills?: SkillsPayload;
  socialPlayers?: SocialPlayer[];
  getLocalTilePosition?: () => TilePosition;
}

interface TargetProfile {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
}

interface TilePosition {
  tileX: number;
  tileY: number;
}

interface SocialPlayer {
  socketId: string;
  username: string;
  position: TilePosition;
}

const HUD_LAYER_ID = "game-hud-layer";
const HUD_INSET_PX = 12;
const SOCIAL_RANGE_TILES = 5;
const SOCIAL_REFRESH_MS = 2_000;
const DEFAULT_PLAYER_COMBAT: PlayerCombatState = {
  hp: 5,
  maxHp: 5,
  alive: true,
  combatEndsAt: 0,
  healthRegenStartedAt: 0,
  nextHealthRegenAt: 0,
};

const SKILL_UNLOCKS: Record<SkillId, string> = {
  melee: "Guarding Stance",
  ranged: "Snare Trap",
  magic: "Lesser Ward",
  mining: "Iron Veins",
  smithing: "Reinforced Buckles",
  herbalism: "Moonleaf",
  alchemy: "Mist Tonic",
  cooking: "Hearty Stew",
  fishing: "River Perch",
};

const SKILLS: SkillMock[] = SKILL_DEFINITIONS.map(skill => ({
  id: skill.id,
  name: skill.name,
  nextUnlock: SKILL_UNLOCKS[skill.id],
}));

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

  .chat-channel,
  .chat-author {
    font-weight: 700;
  }

  .hud-unit-frames {
    position: absolute;
    left: calc(var(--hud-canvas-left) + var(--hud-inset));
    top: calc(var(--hud-canvas-top) + var(--hud-inset));
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
    max-width: calc(var(--hud-canvas-width) - 24px);
  }

  .hud-target-frame {
    width: min(240px, calc(var(--hud-canvas-width) - 24px));
    padding: 8px 10px;
    display: grid;
    gap: 6px;
    background: rgba(20, 22, 21, 0.92);
    border: 1px solid rgba(229, 195, 107, 0.58);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
    pointer-events: auto;
  }

  .hud-target-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .hud-target-name {
    min-width: 0;
    color: #ffe7a8;
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-target-close {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border: 1px solid rgba(242, 234, 216, 0.18);
    background: rgba(0, 0, 0, 0.22);
    color: #f2ead8;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .hud-target-close:hover {
    border-color: #e5c36b;
    color: #ffe7a8;
  }

  .hud-target-bar {
    position: relative;
    height: 26px;
    border: 1px solid rgba(242, 234, 216, 0.16);
    background: rgba(0, 0, 0, 0.48);
    overflow: hidden;
  }

  .hud-target-fill {
    display: block;
    height: 100%;
    background: #b94646;
    transition: width 0.15s ease-out;
  }

  .hud-target-value {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f2ead8;
    font-size: 13px;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  }

  .hud-combat-frame {
    width: min(240px, calc(var(--hud-canvas-width) - 24px));
    padding: 8px 10px;
    display: grid;
    gap: 6px;
    background: rgba(20, 22, 21, 0.92);
    border: 1px solid rgba(229, 195, 107, 0.58);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
    pointer-events: auto;
  }

  .hud-combat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    min-height: 20px;
  }

  .hud-combat-name {
    min-width: 0;
    color: #ffe7a8;
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-combat-tag {
    color: #ff8f6b;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .hud-combat-bars {
    display: grid;
    gap: 2px;
  }

  .hud-combat-bar {
    position: relative;
    height: 26px;
    border: 1px solid rgba(242, 234, 216, 0.16);
    background: rgba(0, 0, 0, 0.48);
    overflow: hidden;
  }

  .hud-combat-fill {
    display: block;
    height: 100%;
    background: #b94646;
    transition: width 0.15s ease-out;
  }

  .hud-health-regen-bar {
    height: 3px;
    background: rgba(0, 0, 0, 0.48);
    overflow: hidden;
  }

  .hud-health-regen-fill {
    display: block;
    height: 100%;
    background: #7fc9a0;
    transition-property: width;
    transition-timing-function: linear;
  }

  .hud-combat-value {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f2ead8;
    font-size: 13px;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
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

  .hud-ability-bar {
    position: absolute;
    left: var(--hud-canvas-left);
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + 56px);
    width: var(--hud-canvas-width);
    display: flex;
    justify-content: center;
    gap: 10px;
    pointer-events: none;
  }

  .hud-ability-slot {
    position: relative;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 2px solid rgba(221, 198, 144, 0.6);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 44%),
      rgba(20, 22, 21, 0.84);
    box-shadow:
      inset 0 0 0 2px rgba(0, 0, 0, 0.28),
      inset 0 -8px 16px rgba(0, 0, 0, 0.18),
      0 8px 18px rgba(0, 0, 0, 0.32);
    cursor: default;
    pointer-events: auto;
  }

  .hud-ability-slot::after {
    content: "";
    position: absolute;
    inset: 8px;
    border: 1px solid rgba(242, 234, 216, 0.08);
    background: rgba(0, 0, 0, 0.18);
  }

  .hud-ability-slot:hover {
    border-color: #e5c36b;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 44%),
      rgba(49, 42, 31, 0.88);
  }

  .hud-dock {
    position: absolute;
    right: calc(100% - var(--hud-canvas-left) - var(--hud-canvas-width) + var(--hud-inset));
    bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + var(--hud-inset));
    display: grid;
    grid-template-columns: repeat(5, minmax(74px, 1fr));
    gap: 8px;
    width: min(470px, calc(var(--hud-canvas-width) - 24px));
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
  .social-player-name {
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
  .settings-summary,
  .social-summary {
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
  .social-list {
    display: grid;
    gap: 8px;
  }

  .unlock-item,
  .stat-row,
  .equipment-slot,
  .social-row {
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
  .social-role {
    color: #ffe7a8;
    font-size: 13px;
    text-align: right;
  }

  .social-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .social-empty {
    justify-content: center;
    color: rgba(242, 234, 216, 0.62);
    font-style: italic;
  }

  .social-trade-button {
    min-width: 104px;
    padding: 0 14px;
  }

  .settings-list {
    display: grid;
    gap: 8px;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 38px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(242, 234, 216, 0.08);
    font-size: 13px;
  }

  .settings-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #ffe7a8;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .settings-toggle input {
    width: 18px;
    height: 18px;
    accent-color: #e5c36b;
    cursor: pointer;
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

  .trade-window {
    position: absolute;
    left: 50%;
    top: calc(var(--hud-canvas-top) + var(--hud-inset));
    width: min(720px, calc(var(--hud-canvas-width) - 24px));
    max-height: min(620px, calc(var(--hud-canvas-height) - 24px));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    background: rgba(20, 22, 21, 0.97);
    border: 1px solid rgba(229, 195, 107, 0.7);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.58);
    pointer-events: auto;
  }

  .trade-body {
    min-height: 0;
    overflow: auto;
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .trade-offers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .trade-panel {
    min-width: 0;
    border: 1px solid rgba(242, 234, 216, 0.1);
    background: rgba(255, 255, 255, 0.035);
    padding: 10px;
  }

  .trade-panel.accepted {
    border-color: rgba(95, 191, 137, 0.86);
    background: rgba(44, 111, 72, 0.22);
    box-shadow: inset 0 0 0 1px rgba(95, 191, 137, 0.18);
  }

  .trade-panel-title {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    color: #ffe7a8;
    font-size: 13px;
    font-weight: 700;
  }

  .trade-status {
    color: rgba(242, 234, 216, 0.7);
    font-size: 12px;
    font-weight: 700;
  }

  .trade-panel.accepted .trade-status {
    color: #9af0b8;
  }

  .trade-offer-list {
    display: grid;
    gap: 6px;
    min-height: 92px;
  }

  .trade-offer-item {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    gap: 8px;
    align-items: center;
    min-height: 34px;
    padding: 6px;
    border: 1px solid rgba(242, 234, 216, 0.08);
    background: rgba(0, 0, 0, 0.22);
    color: #f2ead8;
    font-size: 12px;
  }

  .trade-offer-item.empty {
    grid-template-columns: 1fr;
    color: rgba(242, 234, 216, 0.48);
    text-align: center;
  }

  .trade-remove-button {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(242, 234, 216, 0.16);
    background: rgba(0, 0, 0, 0.24);
    color: #f2ead8;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .trade-remove-button:hover:not(:disabled) {
    border-color: rgba(242, 105, 86, 0.9);
    color: #ffb5a8;
  }

  .trade-remove-button:disabled {
    cursor: default;
    opacity: 0.38;
  }

  .trade-inventory-title {
    margin-bottom: 8px;
    color: rgba(242, 234, 216, 0.82);
    font-size: 13px;
    font-weight: 700;
  }

  .trade-inventory-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(42px, 1fr));
    gap: 7px;
  }

  .trade-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .trade-action-button {
    min-width: 86px;
    height: 32px;
    border: 1px solid rgba(221, 198, 144, 0.34);
    background: rgba(0, 0, 0, 0.24);
    color: #f2ead8;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  .trade-action-button:hover:not(:disabled) {
    border-color: #e5c36b;
    color: #ffe7a8;
  }

  .trade-action-button.confirm {
    border-color: rgba(95, 191, 137, 0.65);
  }

  .trade-action-button.cancel:hover:not(:disabled) {
    border-color: rgba(242, 105, 86, 0.9);
    color: #ffb5a8;
  }

  .trade-action-button:disabled {
    cursor: default;
    opacity: 0.42;
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

    .hud-ability-bar {
      bottom: calc(100% - var(--hud-canvas-top) - var(--hud-canvas-height) + 96px);
      gap: 8px;
    }

    .hud-ability-slot {
      width: 42px;
      height: 42px;
    }

    .skills-layout,
    .equipment-layout {
      grid-template-columns: 1fr;
    }

    .inventory-grid {
      grid-template-columns: repeat(4, minmax(42px, 1fr));
    }

    .trade-window {
      top: calc(var(--hud-canvas-top) + 8px);
      width: min(360px, calc(var(--hud-canvas-width) - 16px));
      max-height: calc(var(--hud-canvas-height) - 16px);
    }

    .trade-offers {
      grid-template-columns: 1fr;
    }

    .trade-inventory-grid {
      grid-template-columns: repeat(4, minmax(42px, 1fr));
    }
  }
`;

export class GameHudOverlay {
  private root: HTMLElement;
  private layer: HTMLDivElement;
  private unitFramesRoot: HTMLDivElement;
  private targetRoot: HTMLDivElement;
  private combatRoot: HTMLDivElement;
  private windowRoot: HTMLDivElement;
  private tradeRoot: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private activePanel: PanelId | null = null;
  private selectedSkill = SKILLS[0];
  private buttons = new Map<PanelId, HTMLButtonElement>();
  private chat: HudChat;
  private inventory: InventoryState;
  private equipment: EquipmentState;
  private musicEnabled: boolean;
  private selectedInventorySlotIndex: number | null = null;
  private selectedEquipmentSlot: EquipmentSlot | null = null;
  private draggedInventorySlotIndex: number | null = null;
  private socialPlayers: SocialPlayer[] = [];
  private socialRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private tradeState: TradeStatePayload | null = null;
  private targetProfile: TargetProfile | null = null;
  private combat: PlayerCombatState;
  private skillXpById = new Map<SkillId, number>();
  private combatTagTimer: ReturnType<typeof setTimeout> | null = null;
  private healthRegenAnimationFrame: number | null = null;
  private playerName: string;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    initialInventory?: InventoryState,
    initialEquipment?: EquipmentState,
    private options?: GameHudOverlayOptions,
  ) {
    const root = document.getElementById("game-root");
    if (!root) throw new Error("Missing #game-root element for game HUD");

    this.inventory = initialInventory ?? createEmptyInventory();
    this.equipment = initialEquipment ?? createEmptyEquipment();
    this.combat = options?.combat ?? DEFAULT_PLAYER_COMBAT;
    this.setSkillsPayload(options?.skills);
    this.playerName = options?.playerName ?? "You";
    this.musicEnabled = options?.musicEnabled ?? true;
    this.socialPlayers = options?.socialPlayers ?? [];
    this.root = root;
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.layer = this.ensureLayer(root);
    this.unitFramesRoot = document.createElement("div");
    this.unitFramesRoot.className = "hud-unit-frames";
    this.layer.appendChild(this.unitFramesRoot);
    this.combatRoot = document.createElement("div");
    this.unitFramesRoot.appendChild(this.combatRoot);
    this.targetRoot = document.createElement("div");
    this.unitFramesRoot.appendChild(this.targetRoot);
    this.windowRoot = document.createElement("div");
    this.windowRoot.className = "hud-window-root";
    this.layer.appendChild(this.windowRoot);
    this.tradeRoot = document.createElement("div");
    this.tradeRoot.className = "hud-window-root";
    this.layer.appendChild(this.tradeRoot);
    this.chat = new HudChat(this.socket);

    this.scheduleCombatTagExpiry();
    this.render();
    this.updateCanvasBounds();

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resize", this.updateCanvasBounds);
    this.socket.on("inventory:changed", this.handleInventoryChanged);
    this.socket.on("equipment:changed", this.handleEquipmentChanged);
    this.socket.on("skills:changed", this.handleSkillsChanged);
    this.socket.on("skill:xpGained", this.handleSkillXpGained);
    this.socket.on("player:combat", this.handleCombatChanged);
    this.socket.on("trade:request", this.handleTradeRequest);
    this.socket.on("trade:requestSent", this.handleTradeRequestSent);
    this.socket.on("trade:declined", this.handleTradeDeclined);
    this.socket.on("trade:started", this.handleTradeStateChanged);
    this.socket.on("trade:updated", this.handleTradeStateChanged);
    this.socket.on("trade:cancelled", this.handleTradeCancelled);
    this.socket.on("trade:completed", this.handleTradeCompleted);
    this.socket.on("trade:error", this.handleTradeError);
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.updateCanvasBounds);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  destroy = () => {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resize", this.updateCanvasBounds);
    this.stopSocialRefresh();
    if (this.combatTagTimer) clearTimeout(this.combatTagTimer);
    if (this.healthRegenAnimationFrame) cancelAnimationFrame(this.healthRegenAnimationFrame);
    this.socket.off("inventory:changed", this.handleInventoryChanged);
    this.socket.off("equipment:changed", this.handleEquipmentChanged);
    this.socket.off("skills:changed", this.handleSkillsChanged);
    this.socket.off("skill:xpGained", this.handleSkillXpGained);
    this.socket.off("player:combat", this.handleCombatChanged);
    this.socket.off("trade:request", this.handleTradeRequest);
    this.socket.off("trade:requestSent", this.handleTradeRequestSent);
    this.socket.off("trade:declined", this.handleTradeDeclined);
    this.socket.off("trade:started", this.handleTradeStateChanged);
    this.socket.off("trade:updated", this.handleTradeStateChanged);
    this.socket.off("trade:cancelled", this.handleTradeCancelled);
    this.socket.off("trade:completed", this.handleTradeCompleted);
    this.socket.off("trade:error", this.handleTradeError);
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
    this.layer.appendChild(this.createAbilityBar());
    this.renderCombatFrame();
    this.layer.appendChild(this.createDock());
  }

  setCombatState(combat: PlayerCombatState) {
    this.combat = combat;
    this.scheduleCombatTagExpiry();
    this.renderCombatFrame();
  }

  private isInCombat() {
    return Date.now() < this.combat.combatEndsAt;
  }

  private shouldShowHealthRegenBar() {
    return (
      this.combat.alive &&
      this.combat.hp > 0 &&
      this.combat.hp < this.combat.maxHp &&
      !this.isInCombat() &&
      this.combat.healthRegenStartedAt > 0 &&
      this.combat.nextHealthRegenAt > Date.now()
    );
  }

  private getHealthRegenProgress() {
    const totalMs = this.combat.nextHealthRegenAt - this.combat.healthRegenStartedAt;
    if (totalMs <= 0) return 0;

    return Phaser.Math.Clamp((Date.now() - this.combat.healthRegenStartedAt) / totalMs, 0, 1);
  }

  private animateHealthRegenFill(fill: HTMLSpanElement) {
    const progress = this.getHealthRegenProgress();
    const remainingMs = Math.max(0, this.combat.nextHealthRegenAt - Date.now());

    fill.style.width = `${Math.round(progress * 100)}%`;
    fill.style.transitionDuration = "0ms";

    this.healthRegenAnimationFrame = requestAnimationFrame(() => {
      this.healthRegenAnimationFrame = null;
      fill.style.transitionDuration = `${remainingMs}ms`;
      fill.style.width = "100%";
    });
  }

  // The server only pushes combat state on qualifying events (damage dealt/taken,
  // mob aggro), not on a recurring tick. To hide the "In Combat" tag exactly when
  // the timer runs out — rather than leaving it stuck on until the next event —
  // schedule a local re-render for that moment using the absolute expiry timestamp
  // the server already sent us.
  private scheduleCombatTagExpiry() {
    if (this.combatTagTimer) {
      clearTimeout(this.combatTagTimer);
      this.combatTagTimer = null;
    }

    const msRemaining = this.combat.combatEndsAt - Date.now();
    if (msRemaining <= 0) return;

    this.combatTagTimer = setTimeout(() => {
      this.combatTagTimer = null;
      this.renderCombatFrame();
    }, msRemaining);
  }

  private renderCombatFrame() {
    if (this.healthRegenAnimationFrame) {
      cancelAnimationFrame(this.healthRegenAnimationFrame);
      this.healthRegenAnimationFrame = null;
    }

    this.combatRoot.replaceChildren();

    const hpRatio = this.combat.maxHp > 0
      ? Phaser.Math.Clamp(this.combat.hp / this.combat.maxHp, 0, 1)
      : 0;

    const frame = document.createElement("section");
    frame.className = "hud-combat-frame";
    frame.setAttribute("aria-label", "Health");

    const header = document.createElement("div");
    header.className = "hud-combat-header";

    const name = document.createElement("span");
    name.className = "hud-combat-name";
    name.textContent = this.playerName;

    header.append(name);

    if (this.isInCombat()) {
      const tag = document.createElement("span");
      tag.className = "hud-combat-tag";
      tag.textContent = "In Combat";
      header.append(tag);
    }

    const bar = document.createElement("div");
    bar.className = "hud-combat-bar";

    const fill = document.createElement("span");
    fill.className = "hud-combat-fill";
    fill.style.width = `${Math.round(hpRatio * 100)}%`;

    const value = document.createElement("span");
    value.className = "hud-combat-value";
    value.textContent = `${this.combat.hp}/${this.combat.maxHp}`;

    bar.append(fill, value);

    const bars = document.createElement("div");
    bars.className = "hud-combat-bars";
    bars.append(bar);

    if (this.shouldShowHealthRegenBar()) {
      const regenBar = document.createElement("div");
      regenBar.className = "hud-health-regen-bar";
      regenBar.setAttribute("aria-label", "Next health regeneration");

      const regenFill = document.createElement("span");
      regenFill.className = "hud-health-regen-fill";

      regenBar.append(regenFill);
      bars.append(regenBar);
      this.animateHealthRegenFill(regenFill);
    }

    frame.append(header, bars);
    this.combatRoot.appendChild(frame);
  }

  setTargetProfile(target: TargetProfile | null) {
    this.targetProfile = target;
    this.renderTargetFrame();
  }

  private renderTargetFrame() {
    this.targetRoot.replaceChildren();
    if (!this.targetProfile) return;

    const hpRatio = this.targetProfile.maxHp > 0
      ? Phaser.Math.Clamp(this.targetProfile.hp / this.targetProfile.maxHp, 0, 1)
      : 0;

    const frame = document.createElement("section");
    frame.className = "hud-target-frame";
    frame.setAttribute("aria-label", "Target");

    const header = document.createElement("div");
    header.className = "hud-target-header";

    const name = document.createElement("span");
    name.className = "hud-target-name";
    name.textContent = this.targetProfile.name;

    const close = document.createElement("button");
    close.className = "hud-target-close";
    close.type = "button";
    close.setAttribute("aria-label", "Clear target");
    close.innerHTML = "&times;";
    close.addEventListener("click", () => this.requestClearTarget());

    header.append(name, close);

    const bar = document.createElement("div");
    bar.className = "hud-target-bar";

    const fill = document.createElement("span");
    fill.className = "hud-target-fill";
    fill.style.width = `${Math.round(hpRatio * 100)}%`;

    const value = document.createElement("span");
    value.className = "hud-target-value";
    value.textContent = `${this.targetProfile.hp}/${this.targetProfile.maxHp}`;

    bar.append(fill, value);
    frame.append(header, bar);
    this.targetRoot.appendChild(frame);
  }

  private requestClearTarget() {
    if (this.options?.onClearTarget) {
      this.options.onClearTarget();
      return;
    }

    this.setTargetProfile(null);
  }

  private createAbilityBar() {
    const bar = document.createElement("div");
    bar.className = "hud-ability-bar";
    bar.setAttribute("aria-label", "Ability slots");

    for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
      const slotNumber = slotIndex + 1;
      const button = document.createElement("button");
      button.className = "hud-ability-slot";
      button.type = "button";
      button.title = `Ability slot ${slotNumber}`;
      button.setAttribute("aria-label", `Ability slot ${slotNumber}`);
      bar.appendChild(button);
    }

    return bar;
  }

  private createDock() {
    const dock = document.createElement("nav");
    dock.className = "hud-dock";
    dock.setAttribute("aria-label", "Game panels");

    const panels: Array<{ id: PanelId; label: string; title: string }> = [
      { id: "equipment", label: "Equipment", title: "Equipment" },
      { id: "inventory", label: "Inventory", title: "Inventory" },
      { id: "skills", label: "Skills", title: "Skills" },
      { id: "social", label: "Social", title: "Social" },
      { id: "settings", label: "Settings", title: "Settings" },
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
    this.syncSocialRefresh();
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
      this.syncSocialRefresh();
      this.renderActivePanel();
    });

    const body = panel.querySelector<HTMLDivElement>(".hud-window-body")!;
    if (this.activePanel === "skills") body.appendChild(this.createSkillsPanel());
    if (this.activePanel === "inventory") body.appendChild(this.createInventoryPanel());
    if (this.activePanel === "equipment") body.appendChild(this.createEquipmentPanel());
    if (this.activePanel === "social") body.appendChild(this.createSocialPanel());
    if (this.activePanel === "settings") body.appendChild(this.createSettingsPanel());

    this.windowRoot.appendChild(panel);
  }

  private createSkillsPanel() {
    const layout = document.createElement("div");
    layout.className = "skills-layout";

    const list = document.createElement("div");
    list.className = "skill-list";

    for (const skill of SKILLS) {
      const progress = getSkillProgress(this.getSkillTotalXp(skill.id));
      const xpMeta = progress.isMaxLevel
        ? `${this.formatNumber(progress.totalXp)} XP`
        : `${this.formatNumber(progress.xpIntoLevel)}/${this.formatNumber(progress.xpForNextLevel)} (${progress.percentToNextLevel}%)`;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `skill-row${skill.id === this.selectedSkill.id ? " active" : ""}`;
      row.innerHTML = `
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level">${progress.level}</span>
        <span class="xp-bar"><span class="xp-fill" style="width: ${progress.percentToNextLevel}%"></span></span>
        <span class="xp-meta">${xpMeta}</span>
      `;
      row.addEventListener("click", () => {
        this.selectedSkill = skill;
        this.renderActivePanel();
      });
      list.appendChild(row);
    }

    const detail = document.createElement("div");
    detail.className = "skill-detail";
    const selectedProgress = getSkillProgress(this.getSkillTotalXp(this.selectedSkill.id));
    const selectedXpLine = selectedProgress.isMaxLevel
      ? `${this.formatNumber(selectedProgress.totalXp)} XP earned.`
      : `${this.formatNumber(selectedProgress.xpIntoLevel)} of ${this.formatNumber(selectedProgress.xpForNextLevel)} XP toward level ${selectedProgress.level + 1}.`;
    detail.innerHTML = `
      <div class="detail-title">${this.selectedSkill.name}</div>
      <p class="detail-copy">Level ${selectedProgress.level}. ${selectedXpLine}</p>
      <div class="unlock-list">
        <div class="unlock-item"><span>Next unlock</span><strong>${this.selectedSkill.nextUnlock}</strong></div>
        <div class="unlock-item"><span>At level 20</span><strong>Branch perk</strong></div>
        <div class="unlock-item"><span>At level ${MAX_SKILL_LEVEL}</span><strong>Mastery cap</strong></div>
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
    if (this.tradeState) {
      this.renderTradeWindow();
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

  private setSkillsPayload(skillsPayload?: SkillsPayload) {
    this.skillXpById = new Map(SKILL_DEFINITIONS.map(skill => [skill.id, 0]));

    for (const skill of skillsPayload?.skills ?? []) {
      this.skillXpById.set(skill.skillId, skill.totalXp);
    }
  }

  private getSkillTotalXp(skillId: SkillId) {
    return this.skillXpById.get(skillId) ?? 0;
  }

  private getSkillName(skillId: SkillId) {
    return SKILL_DEFINITIONS.find(skill => skill.id === skillId)?.name ?? skillId;
  }

  private handleSkillsChanged = (skillsPayload: SkillsPayload) => {
    this.setSkillsPayload(skillsPayload);
    if (this.activePanel === "skills") {
      this.renderActivePanel();
    }
  };

  private handleSkillXpGained = (payload: SkillXpGainedPayload) => {
    if (payload.xpGained <= 0) return;

    this.skillXpById.set(payload.skillId, payload.totalXp);
    this.addSystemMessage(`+${this.formatNumber(payload.xpGained)} ${this.getSkillName(payload.skillId)} XP`);
    if (this.activePanel === "skills") {
      this.renderActivePanel();
    }
  };

  private handleCombatChanged = (combat: PlayerCombatStatePayload) => {
    this.setCombatState(combat);
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

  private formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  private formatStatName(stat: string) {
    return stat
      .split("_")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private createSocialPanel() {
    const panel = document.createElement("div");
    panel.className = "social-summary";

    const title = document.createElement("div");
    title.className = "detail-title";
    title.textContent = "Nearby Players";
    panel.appendChild(title);

    const list = document.createElement("div");
    list.className = "social-list";

    const nearbyPlayers = this.getNearbySocialPlayers();

    if (nearbyPlayers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "social-row social-empty";
      empty.textContent = "There are no players nearby.";
      list.appendChild(empty);
    } else {
      for (const player of nearbyPlayers) {
        const row = document.createElement("div");
        row.className = "social-row";

        const name = document.createElement("span");
        name.className = "social-player-name";
        name.textContent = player.username;

        const button = document.createElement("button");
        button.className = "hud-action-button social-trade-button";
        button.type = "button";
        button.textContent = "Trade";
        button.disabled = Boolean(this.tradeState);
        button.addEventListener("click", () => {
          this.socket.emit("trade:request", { targetSocketId: player.socketId });
        });

        row.append(name, button);
        list.appendChild(row);
      }
    }

    panel.appendChild(list);
    return panel;
  }

  private createSettingsPanel() {
    const panel = document.createElement("div");
    panel.className = "settings-summary";
    panel.innerHTML = `
      <div class="settings-list">
        <div class="settings-row">
          <span class="stat-label">Music</span>
          <label class="settings-toggle">
            <input class="settings-music-toggle" type="checkbox" ${this.musicEnabled ? "checked" : ""}>
            <span>${this.musicEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </div>
    `;

    const toggle = panel.querySelector<HTMLInputElement>(".settings-music-toggle")!;
    toggle.addEventListener("change", () => {
      this.musicEnabled = toggle.checked;
      this.options?.onMusicEnabledChange(toggle.checked);
      if (this.activePanel === "settings") this.renderActivePanel();
    });

    return panel;
  }

  setSocialPlayers(players: SocialPlayer[]) {
    this.socialPlayers = players;
    if (this.activePanel === "social") this.renderActivePanel();
  }

  addSocialPlayer(player: SocialPlayer) {
    this.socialPlayers = this.socialPlayers
      .filter(existing => existing.socketId !== player.socketId)
      .concat(player);
    if (this.activePanel === "social") this.renderActivePanel();
  }

  updateSocialPlayerPosition(socketId: string, position: TilePosition) {
    this.socialPlayers = this.socialPlayers.map(player =>
      player.socketId === socketId
        ? { ...player, position }
        : player,
    );
  }

  removeSocialPlayer(socketId: string) {
    this.socialPlayers = this.socialPlayers.filter(player => player.socketId !== socketId);
    if (this.activePanel === "social") this.renderActivePanel();
  }

  private getNearbySocialPlayers() {
    const localPosition = this.options?.getLocalTilePosition?.();
    if (!localPosition) return [];

    return this.socialPlayers.filter(player => {
      const dx = Math.abs(player.position.tileX - localPosition.tileX);
      const dy = Math.abs(player.position.tileY - localPosition.tileY);
      return Math.max(dx, dy) <= SOCIAL_RANGE_TILES;
    });
  }

  private syncSocialRefresh() {
    if (this.activePanel === "social") {
      this.startSocialRefresh();
      return;
    }

    this.stopSocialRefresh();
  }

  private startSocialRefresh() {
    if (this.socialRefreshTimer) return;

    this.socialRefreshTimer = setInterval(() => {
      if (this.activePanel === "social") {
        this.renderActivePanel();
      }
    }, SOCIAL_REFRESH_MS);
  }

  private stopSocialRefresh() {
    if (!this.socialRefreshTimer) return;

    clearInterval(this.socialRefreshTimer);
    this.socialRefreshTimer = null;
  }

  private handleTradeRequest = (payload: TradeRequestReceivedPayload) => {
    if (!payload?.requestId || !payload.fromUsername) return;

    const accepted = window.confirm(`${payload.fromUsername} wants to trade.`);
    this.socket.emit(accepted ? "trade:accept" : "trade:decline", {
      requestId: payload.requestId,
    });
  };

  private handleTradeRequestSent = (payload: TradeRequestSentPayload) => {
    this.addSystemMessage(`Trade request sent to ${payload.targetUsername ?? "player"}.`);
  };

  private handleTradeDeclined = (payload: TradeDeclinedPayload) => {
    this.addSystemMessage(`${payload.byUsername ?? "Player"} declined your trade request.`);
  };

  private handleTradeStateChanged = (state: TradeStatePayload) => {
    this.tradeState = state;
    this.selectedInventorySlotIndex = null;
    this.renderTradeWindow();
    if (this.activePanel === "social" || this.activePanel === "inventory") {
      this.renderActivePanel();
    }
  };

  private handleTradeCancelled = (payload: TradeCancelledPayload) => {
    this.tradeState = null;
    this.renderTradeWindow();
    this.addSystemMessage(this.getTradeCancelledMessage(payload?.reason));
    if (this.activePanel === "social" || this.activePanel === "inventory") {
      this.renderActivePanel();
    }
  };

  private handleTradeCompleted = () => {
    this.tradeState = null;
    this.renderTradeWindow();
    this.addSystemMessage("Trade completed.");
    if (this.activePanel === "social" || this.activePanel === "inventory") {
      this.renderActivePanel();
    }
  };

  private handleTradeError = (payload: TradeErrorPayload) => {
    this.addSystemMessage(payload?.message ?? "Trade action failed.");
  };

  private renderTradeWindow() {
    this.tradeRoot.replaceChildren();
    if (!this.tradeState) return;

    const windowEl = document.createElement("section");
    windowEl.className = "trade-window";
    windowEl.setAttribute("aria-label", "Trade");

    const header = document.createElement("header");
    header.className = "hud-window-header";

    const title = document.createElement("div");
    title.className = "hud-window-title";
    title.textContent = `Trade with ${this.tradeState.partnerUsername}`;

    const close = document.createElement("button");
    close.className = "hud-close-button";
    close.type = "button";
    close.setAttribute("aria-label", "Cancel trade");
    close.innerHTML = "&times;";
    close.addEventListener("click", () => this.socket.emit("trade:cancel"));
    header.append(title, close);

    const body = document.createElement("div");
    body.className = "trade-body";

    const offers = document.createElement("div");
    offers.className = "trade-offers";
    offers.append(
      this.createTradeOfferPanel("Your offer", this.tradeState.ownOffer, this.tradeState.ownAccepted, true),
      this.createTradeOfferPanel(
        `${this.tradeState.partnerUsername}'s offer`,
        this.tradeState.otherOffer,
        this.tradeState.otherAccepted,
        false,
      ),
    );

    const inventoryPanel = document.createElement("div");
    inventoryPanel.className = "trade-panel";
    const inventoryTitle = document.createElement("div");
    inventoryTitle.className = "trade-inventory-title";
    inventoryTitle.textContent = this.tradeState.ownAccepted ? "Changing your offer will reset acceptance" : "Click inventory items to offer them";
    inventoryPanel.append(inventoryTitle, this.createTradeInventoryGrid());

    const actions = document.createElement("div");
    actions.className = "trade-actions";

    const acceptButton = document.createElement("button");
    acceptButton.className = "trade-action-button confirm";
    acceptButton.type = "button";
    acceptButton.textContent = this.tradeState.ownAccepted ? "Unaccept" : "Accept";
    acceptButton.addEventListener("click", () => {
      this.socket.emit("trade:setAccepted", { accepted: !this.tradeState?.ownAccepted });
    });

    const cancelButton = document.createElement("button");
    cancelButton.className = "trade-action-button cancel";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.socket.emit("trade:cancel"));

    actions.append(acceptButton, cancelButton);
    body.append(offers, inventoryPanel, actions);
    windowEl.append(header, body);
    this.tradeRoot.appendChild(windowEl);
  }

  private createTradeOfferPanel(titleText: string, offer: TradeOfferItem[], accepted: boolean, isOwnOffer: boolean) {
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
        list.appendChild(this.createTradeOfferItem(offeredItem, isOwnOffer));
      }
    }

    panel.appendChild(list);
    return panel;
  }

  private createTradeOfferItem(offeredItem: TradeOfferItem, isOwnOffer: boolean) {
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
      this.socket.emit("trade:removeItem", { slotIndex: offeredItem.slotIndex });
    });
    row.appendChild(remove);

    return row;
  }

  private createTradeInventoryGrid() {
    const grid = document.createElement("div");
    grid.className = "trade-inventory-grid";
    const offeredSlotIndexes = new Set(this.tradeState?.ownOffer.map(item => item.slotIndex) ?? []);

    for (let slotIndex = 0; slotIndex < this.inventory.slots.length; slotIndex += 1) {
      const slotItem = this.inventory.slots[slotIndex];
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
      slot.title = item ? `${item.name}\n${item.description}` : "";

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

        slot.addEventListener("click", () => this.offerInventorySlot(slotIndex));
      }

      grid.appendChild(slot);
    }

    return grid;
  }

  private offerInventorySlot(slotIndex: number) {
    const slot = this.inventory.slots[slotIndex];
    if (!slot) return;

    let quantity = 1;
    if (slot.quantity > 1) {
      const itemName = getItemDefinition(slot.itemId)?.name ?? slot.itemId;
      const requestedQuantity = window.prompt(`Offer how many ${itemName}?`, String(slot.quantity));
      if (requestedQuantity === null) return;

      quantity = Number(requestedQuantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > slot.quantity) {
        this.addSystemMessage(`Enter a whole number from 1 to ${slot.quantity}.`);
        return;
      }
    }

    this.socket.emit("trade:addItem", { slotIndex, quantity });
  }

  private getTradeCancelledMessage(reason?: string) {
    const messages: Record<string, string> = {
      cancelled: "Trade cancelled.",
      disconnect: "Trade cancelled because a player disconnected.",
      movement: "Trade cancelled because a player moved.",
      range: "Trade cancelled because you are too far apart.",
      death: "Trade cancelled because a player died.",
    };

    return messages[reason ?? ""] ?? "Trade cancelled.";
  }

  private getPanelTitle(panelId: PanelId) {
    const titles: Record<PanelId, string> = {
      skills: "Skills",
      inventory: "Inventory",
      equipment: "Equipment",
      social: "Social",
      settings: "Settings",
    };
    return titles[panelId];
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !this.isTextInputFocused()) {
      event.preventDefault();
      this.chat.focusInput();
      return;
    }

    if (event.key !== "Escape" || this.isTextInputFocused()) return;

    if (this.activePanel) {
      this.activePanel = null;
      this.syncSocialRefresh();
      this.renderActivePanel();
      return;
    }

    if (this.targetProfile) {
      this.requestClearTarget();
    }
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
