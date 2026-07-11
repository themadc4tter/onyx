import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { DEFAULT_ZONE_ID, getZoneMapConfig, TILESETS, ZONE_MAPS } from "../config/map";
import { createEmptyEquipment } from "../game/equipment";
import type {
  EquipmentPayload,
  HerbSpawnState,
  InventoryPayload,
  MobSpawnState,
  MoveAck,
  PlayerCombatState,
  PlayerDamagedPayload,
  PlayerDiedPayload,
  PlayerEquipmentChangedPayload,
  PlayerLeftPayload,
  PlayerMovedPayload,
  PlayerProfile,
  Position,
  RemotePlayerData,
  SkillsPayload,
  ZoneChangedPayload,
} from "@onyx/shared/protocol";
import type { AbilityLoadoutPayload } from "@onyx/shared/abilities";
import { supabase } from "../lib/supabase";
import { NpcRenderer } from "../world/NpcRenderer";
import { getNpcsForZone } from "../world/npcs";
import { WorldLabelOverlay } from "../ui/WorldLabelOverlay";
import { GameHudOverlay } from "../ui/GameHudOverlay";
import { RemotePlayerManager } from "../world/RemotePlayerManager";
import { WorldMapBuilder } from "../world/WorldMapBuilder";
import {
  HerbSpawnerManager,
  HERB_SPRITE_ASSET_KEY,
  HERB_SPRITE_URL,
} from "../world/HerbSpawnerManager";
import { MobSpawnerManager, MOB_SPRITE_ASSETS } from "../world/MobSpawnerManager";
import { TargetingManager } from "../world/TargetingManager";
import { AutoAttackController } from "../world/AutoAttackController";
import { AbilityController } from "../world/abilities/AbilityController";
import { LocalPlayerController } from "../player/LocalPlayerController";
import { PLAYER_SPRITE_KEY, PLAYER_SPRITE_URL } from "../player/playerAssets";

const CAMERA_ZOOM = 2;
const MUSIC_VOLUME = 0.35;
const MUSIC_SETTING_STORAGE_KEY = "onyx.musicEnabled";
const DEATH_OVERLAY_DELAY_MS = 800;
const DEATH_OVERLAY_FADE_MS = 1_000;
const DEATH_OVERLAY_ALPHA = 0.56;
const DEATH_OVERLAY_Z_INDEX = "9";

function readMusicEnabledSetting() {
  return localStorage.getItem(MUSIC_SETTING_STORAGE_KEY) !== "false";
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: PlayerProfile;
  private initPlayers: RemotePlayerData[] = [];
  private socialPlayers: RemotePlayerData[] = [];
  private zoneId: string = DEFAULT_ZONE_ID;
  private startPos: Position | null = null;
  private herbSpawnStates: HerbSpawnState[] = [];
  private mobStates: MobSpawnState[] = [];
  private inventory: InventoryPayload | undefined;
  private equipment: EquipmentPayload | undefined;
  private skills: SkillsPayload | undefined;
  private abilities: AbilityLoadoutPayload | undefined;
  private combat: PlayerCombatState | undefined;
  private deathNotice = false;
  private pendingDeathNotice = false;
  private mapKey = getZoneMapConfig(DEFAULT_ZONE_ID).mapKey;

  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private obstacleLayer: Phaser.Tilemaps.TilemapLayer | null = null;

  private labelOverlay!: WorldLabelOverlay;
  private hudOverlay!: GameHudOverlay;
  private npcRenderer!: NpcRenderer;
  private remotePlayers!: RemotePlayerManager;
  private player!: LocalPlayerController;
  private worldMapBuilder!: WorldMapBuilder;
  private herbSpawners!: HerbSpawnerManager;
  private mobSpawners!: MobSpawnerManager;
  private targeting!: TargetingManager;
  private autoAttack!: AutoAttackController;
  private abilityController!: AbilityController;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private deathOverlay: HTMLDivElement | null = null;
  private musicEnabled = readMusicEnabledSetting();

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: {
    socket: Socket;
    profile: PlayerProfile;
    initPlayers: RemotePlayerData[];
    zoneId?: string;
    startPos?: Position;
    herbSpawns?: HerbSpawnState[];
    mobSpawns?: MobSpawnState[];
    inventory?: InventoryPayload;
    equipment?: EquipmentPayload;
    skills?: SkillsPayload;
    abilities?: AbilityLoadoutPayload;
    combat?: PlayerCombatState;
    deathNotice?: boolean;
  }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
    this.socialPlayers = this.initPlayers;
    this.zoneId = data.zoneId ?? DEFAULT_ZONE_ID;
    this.mapKey = getZoneMapConfig(this.zoneId).mapKey;
    this.startPos = data.startPos ?? null;
    this.herbSpawnStates = data.herbSpawns ?? [];
    this.mobStates = data.mobSpawns ?? [];
    this.inventory = data.inventory;
    this.equipment = data.equipment;
    this.skills = data.skills;
    this.abilities = data.abilities;
    this.combat = data.combat;
    this.deathNotice = data.deathNotice ?? false;
    this.pendingDeathNotice = false;
  }

  preload() {
    this.showLoadingIndicator();

    const zoneMap = getZoneMapConfig(this.zoneId);
    this.mapKey = zoneMap.mapKey;

    this.load.tilemapTiledJSON(zoneMap.mapKey, zoneMap.mapUrl);
    if (!this.cache.audio.exists(zoneMap.musicKey)) {
      this.load.audio(zoneMap.musicKey, zoneMap.musicUrl);
    }
    for (const tileset of TILESETS) {
      this.load.xml(tileset.sourceKey, tileset.sourceUrl);
      this.load.image(tileset.imageKey, tileset.imageUrl);
    }
    this.load.image(PLAYER_SPRITE_KEY, PLAYER_SPRITE_URL);
    if (!this.textures.exists(HERB_SPRITE_ASSET_KEY)) {
      this.load.image(HERB_SPRITE_ASSET_KEY, HERB_SPRITE_URL);
    }
    for (const asset of MOB_SPRITE_ASSETS) {
      if (!this.textures.exists(asset.key)) {
        this.load.image(asset.key, asset.url);
      }
    }
    for (const npc of getNpcsForZone(this.zoneId)) {
      if (!this.textures.exists(npc.spriteKey)) {
        this.load.image(npc.spriteKey, npc.spriteUrl);
      }
    }
  }

  create() {
    this.worldMapBuilder = new WorldMapBuilder(this);
    const builtMap = this.worldMapBuilder.build(this.mapKey);
    this.map = builtMap.map;
    this.collisionLayer = builtMap.collisionLayer;
    this.obstacleLayer = builtMap.obstacleLayer;

    const spawn = this.worldMapBuilder.findSpawnTile(this.map);
    const startPosition = this.startPos ?? { ...spawn, facing: "down" as const };

    this.labelOverlay = new WorldLabelOverlay(this);
    this.player = new LocalPlayerController(
      this,
      this.socket,
      this.map,
      this.collisionLayer,
      this.obstacleLayer,
      this.labelOverlay,
      this.profile.username,
      startPosition,
      (tileX, tileY) => this.mobSpawners?.isBlockingTile(tileX, tileY) ?? false,
    );
    this.npcRenderer = new NpcRenderer(this, this.labelOverlay);
    this.npcRenderer.render(this.worldMapBuilder.getPlacedNpcsForZone(this.zoneId, this.map));
    this.remotePlayers = new RemotePlayerManager(this, this.labelOverlay);
    this.remotePlayers.addMany(this.initPlayers);
    this.player.setEquipment(this.equipment ?? createEmptyEquipment());

    this.setupCamera();
    this.playZoneMusic();
    this.setupServerEvents();
    this.abilityController = new AbilityController(this, this.socket);
    this.hudOverlay = new GameHudOverlay(this, this.socket, this.inventory, this.equipment, {
      musicEnabled: this.musicEnabled,
      onMusicEnabledChange: this.setMusicEnabled,
      playerName: this.profile.username,
      combat: this.combat,
      abilities: this.abilities,
      skills: this.skills,
      socialPlayers: this.socialPlayers.map(player => ({
        socketId: player.socketId,
        username: player.username,
        position: {
          tileX: player.position.tileX,
          tileY: player.position.tileY,
        },
      })),
      getLocalTilePosition: () => this.player.getTilePosition(),
      onClearTarget: () => this.targeting?.clearTarget(),
      onAbilitySlotUse: slotIndex => this.abilityController.useSlot(slotIndex, this.targeting?.getTarget()?.id),
    });
    if (this.deathNotice) {
      this.hudOverlay.addSystemMessage("You died and respawned at the settlement.");
    }
    this.herbSpawners = new HerbSpawnerManager(this, this.socket, this.map, this.player, message => {
      this.hudOverlay.addSystemMessage(message);
    }, this.herbSpawnStates);
    this.targeting = new TargetingManager(this, {
      onTargetChanged: target => this.hudOverlay.setTargetProfile(target),
    });
    this.mobSpawners = new MobSpawnerManager(this, this.socket, {
      initialStates: this.mobStates,
      onMobClicked: mob => this.targeting.selectTarget(mob),
      onMobChanged: mob => this.targeting.refreshTarget(mob),
    });
    this.autoAttack = new AutoAttackController(this, this.socket, {
      getTarget: () => this.targeting.getTarget(),
      getEquipment: () => this.equipment ?? createEmptyEquipment(),
      getLocalTilePosition: () => this.player.getTilePosition(),
      hasLineOfSight: (from, to) => this.hasLineOfSight(from, to),
      getMobWorldPosition: mobId => this.mobSpawners?.getMobWorldPosition(mobId) ?? null,
      isLocalPlayerMoving: () => this.player.isMoving(),
      onActiveChanged: active => this.targeting.setAutoAttackActive(active),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeDeathOverlay, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.removeDeathOverlay, this);
  }

  update() {
    const textInputBlocked = this.hudOverlay?.isTextInputFocused() ?? false;
    this.player.update(textInputBlocked);
    this.herbSpawners?.update(textInputBlocked);
    this.autoAttack?.update(textInputBlocked);
    this.targeting?.update();
  }

  private showLoadingIndicator() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const barBg = this.add.rectangle(cx, cy, 200, 10, 0x333333).setDepth(10);
    const bar = this.add.rectangle(cx - 100, cy, 0, 10, 0x00ff88).setOrigin(0, 0.5).setDepth(10);
    const label = this.add.text(cx, cy - 20, "Loading...", { fontSize: "12px", color: "#aaaaaa" }).setOrigin(0.5).setDepth(10);

    this.load.on("progress", (v: number) => {
      bar.width = 200 * v;
    });
    this.load.on("complete", () => {
      barBg.destroy();
      bar.destroy();
      label.destroy();
    });
  }

  private setupCamera() {
    const camera = this.cameras.main;
    camera.setZoom(CAMERA_ZOOM);

    const visibleWorldWidth = camera.width / CAMERA_ZOOM;
    const visibleWorldHeight = camera.height / CAMERA_ZOOM;
    const boundsX = Math.min(0, (this.map.widthInPixels - visibleWorldWidth) / 2);
    const boundsY = Math.min(0, (this.map.heightInPixels - visibleWorldHeight) / 2);
    const boundsWidth = Math.max(this.map.widthInPixels, visibleWorldWidth);
    const boundsHeight = Math.max(this.map.heightInPixels, visibleWorldHeight);

    camera.setBounds(boundsX, boundsY, boundsWidth, boundsHeight);
    camera.startFollow(this.player.container, true);
  }

  private hasLineOfSight(
    from: { tileX: number; tileY: number },
    to: { tileX: number; tileY: number },
  ) {
    if (!this.map || !this.collisionLayer) return true;
    if (!this.isInsideMap(from.tileX, from.tileY) || !this.isInsideMap(to.tileX, to.tileY)) return false;

    const fromX = from.tileX + 0.5;
    const fromY = from.tileY + 0.5;
    const toX = to.tileX + 0.5;
    const toY = to.tileY + 0.5;
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(distance * 8));
    const checkedTiles = new Set<string>();

    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const tileX = Math.floor(fromX + (toX - fromX) * progress);
      const tileY = Math.floor(fromY + (toY - fromY) * progress);

      if ((tileX === from.tileX && tileY === from.tileY) || (tileX === to.tileX && tileY === to.tileY)) {
        continue;
      }

      const key = `${tileX},${tileY}`;
      if (checkedTiles.has(key)) continue;
      checkedTiles.add(key);

      if (!this.isInsideMap(tileX, tileY) || this.collisionLayer.hasTileAt(tileX, tileY)) {
        return false;
      }
    }

    return true;
  }

  private isInsideMap(tileX: number, tileY: number) {
    return Boolean(this.map && tileX >= 0 && tileX < this.map.width && tileY >= 0 && tileY < this.map.height);
  }

  private playZoneMusic() {
    const { musicKey } = getZoneMapConfig(this.zoneId);

    for (const config of Object.values(ZONE_MAPS)) {
      this.sound.stopByKey(config.musicKey);
    }

    this.currentMusic = this.sound.add(musicKey, {
      loop: true,
      volume: MUSIC_VOLUME,
    });

    const startMusic = () => {
      if (!this.musicEnabled) return;
      if (!this.currentMusic?.isPlaying) {
        this.currentMusic?.play();
      }
    };

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, startMusic);
      return;
    }

    startMusic();
  }

  private setMusicEnabled = (enabled: boolean) => {
    this.musicEnabled = enabled;
    localStorage.setItem(MUSIC_SETTING_STORAGE_KEY, String(enabled));

    if (!enabled) {
      this.currentMusic?.pause();
      return;
    }

    const resumeMusic = () => {
      if (this.currentMusic && !this.currentMusic.isPlaying) {
        this.currentMusic.play();
      }
    };

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, resumeMusic);
      return;
    }

    resumeMusic();
  };

  private setupServerEvents() {
    this.socket.on("move:ack", (ack: MoveAck | Position) => {
      this.player.handleMoveAck(ack);
    });

    this.socket.on("player:joined", (data: RemotePlayerData) => {
      this.remotePlayers.add(data);
      this.socialPlayers = this.socialPlayers
        .filter(player => player.socketId !== data.socketId)
        .concat(data);
      this.hudOverlay?.addSocialPlayer({
        socketId: data.socketId,
        username: data.username,
        position: {
          tileX: data.position.tileX,
          tileY: data.position.tileY,
        },
      });
    });

    this.socket.on("player:moved", (data: PlayerMovedPayload) => {
      this.remotePlayers.move(data.socketId, data.tileX, data.tileY, data.facing);
      this.socialPlayers = this.socialPlayers.map(player =>
        player.socketId === data.socketId
          ? {
              ...player,
              position: {
                tileX: data.tileX,
                tileY: data.tileY,
                facing: data.facing,
              },
            }
          : player,
      );
      this.hudOverlay?.updateSocialPlayerPosition(data.socketId, {
        tileX: data.tileX,
        tileY: data.tileY,
      });
    });

    this.socket.on("player:equipmentChanged", (data: PlayerEquipmentChangedPayload) => {
      this.remotePlayers.updateEquipment(data.socketId, data.equipment);
    });

    this.socket.on("equipment:changed", (equipment: EquipmentPayload) => {
      this.equipment = equipment;
      this.player.setEquipment(equipment);
    });

    this.socket.on("player:damaged", (payload: PlayerDamagedPayload) => {
      this.combat = payload.combat;
      this.hudOverlay?.setCombatState(payload.combat);
      this.player.playHitFeedback(payload.damage);
    });

    this.socket.on("player:died", (_payload: PlayerDiedPayload) => {
      this.pendingDeathNotice = true;
      this.targeting?.clearTarget();
      this.autoAttack?.stop();
      this.playDeathSequence();
    });

    this.socket.on("player:left", (data: PlayerLeftPayload) => {
      this.remotePlayers.remove(data.socketId);
      this.socialPlayers = this.socialPlayers.filter(player => player.socketId !== data.socketId);
      this.hudOverlay?.removeSocialPlayer(data.socketId);
    });

    this.socket.on("zone:changed", (payload: ZoneChangedPayload) => {
      this.socket.removeAllListeners();
      this.scene.restart({
        socket: this.socket,
        profile: this.profile,
        initPlayers: payload.initPlayers,
        zoneId: payload.zoneId,
        startPos: payload.position,
        herbSpawns: payload.herbSpawns ?? [],
        mobSpawns: payload.mobSpawns ?? [],
        inventory: payload.inventory,
        equipment: payload.equipment,
        skills: payload.skills,
        abilities: payload.abilities,
        combat: payload.combat,
        deathNotice: this.pendingDeathNotice,
      });
    });

    this.socket.on("disconnect", async () => {
      const { width, height } = this.scale;
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setScrollFactor(0).setDepth(30);
      this.add
        .text(width / 2, height / 2, "Connection lost\nReturning to menu...", {
          fontSize: "14px",
          color: "#ff4444",
          align: "center",
          lineSpacing: 6,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(31);

      await supabase.auth.signOut();
      setTimeout(() => window.location.reload(), 3000);
    });
  }

  private playDeathSequence() {
    this.player.playDeathFade();
    this.createDeathOverlay();
  }

  private createDeathOverlay() {
    if (this.deathOverlay) return;

    const root = document.getElementById("game-root");
    if (!root) return;

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      background: "#6d6d6d",
      opacity: "0",
      pointerEvents: "none",
      transition: `opacity ${DEATH_OVERLAY_FADE_MS}ms ease-in-out ${DEATH_OVERLAY_DELAY_MS}ms`,
      zIndex: DEATH_OVERLAY_Z_INDEX,
    });
    root.appendChild(overlay);
    this.deathOverlay = overlay;
    this.updateDeathOverlayBounds();

    window.addEventListener("resize", this.updateDeathOverlayBounds);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateDeathOverlayBounds);
    requestAnimationFrame(() => {
      if (this.deathOverlay) this.deathOverlay.style.opacity = String(DEATH_OVERLAY_ALPHA);
    });
  }

  private updateDeathOverlayBounds = () => {
    if (!this.deathOverlay) return;

    const root = document.getElementById("game-root");
    if (!root) return;

    const canvasRect = this.game.canvas.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    Object.assign(this.deathOverlay.style, {
      left: `${Math.round(canvasRect.left - rootRect.left)}px`,
      top: `${Math.round(canvasRect.top - rootRect.top)}px`,
      width: `${Math.round(canvasRect.width)}px`,
      height: `${Math.round(canvasRect.height)}px`,
    });
  };

  private removeDeathOverlay = () => {
    window.removeEventListener("resize", this.updateDeathOverlayBounds);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.updateDeathOverlayBounds);
    this.deathOverlay?.remove();
    this.deathOverlay = null;
  }
}
