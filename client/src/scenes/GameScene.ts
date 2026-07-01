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
  PlayerEquipmentChangedPayload,
  PlayerLeftPayload,
  PlayerMovedPayload,
  PlayerProfile,
  Position,
  RemotePlayerData,
  ZoneChangedPayload,
} from "@onyx/shared/protocol";
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
import { LocalPlayerController } from "../player/LocalPlayerController";
import { PLAYER_SPRITE_KEY, PLAYER_SPRITE_URL } from "../player/playerAssets";

const CAMERA_ZOOM = 2;
const MUSIC_VOLUME = 0.35;
const MUSIC_SETTING_STORAGE_KEY = "onyx.musicEnabled";

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
  private mobSpawnStates: MobSpawnState[] = [];
  private inventory: InventoryPayload | undefined;
  private equipment: EquipmentPayload | undefined;
  private mapKey = getZoneMapConfig(DEFAULT_ZONE_ID).mapKey;

  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;

  private labelOverlay!: WorldLabelOverlay;
  private hudOverlay!: GameHudOverlay;
  private npcRenderer!: NpcRenderer;
  private remotePlayers!: RemotePlayerManager;
  private player!: LocalPlayerController;
  private worldMapBuilder!: WorldMapBuilder;
  private herbSpawners!: HerbSpawnerManager;
  private mobSpawners!: MobSpawnerManager;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
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
  }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
    this.socialPlayers = this.initPlayers;
    this.zoneId = data.zoneId ?? DEFAULT_ZONE_ID;
    this.mapKey = getZoneMapConfig(this.zoneId).mapKey;
    this.startPos = data.startPos ?? null;
    this.herbSpawnStates = data.herbSpawns ?? [];
    this.mobSpawnStates = data.mobSpawns ?? [];
    this.inventory = data.inventory;
    this.equipment = data.equipment;
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

    const spawn = this.worldMapBuilder.findSpawnTile(this.map);
    const startPosition = this.startPos ?? { ...spawn, facing: "down" as const };

    this.labelOverlay = new WorldLabelOverlay(this);
    this.player = new LocalPlayerController(
      this,
      this.socket,
      this.map,
      this.collisionLayer,
      this.labelOverlay,
      this.profile.username,
      startPosition,
    );
    this.npcRenderer = new NpcRenderer(this, this.labelOverlay);
    this.npcRenderer.render(this.worldMapBuilder.getPlacedNpcsForZone(this.zoneId, this.map));
    this.remotePlayers = new RemotePlayerManager(this, this.labelOverlay);
    this.remotePlayers.addMany(this.initPlayers);
    this.player.setEquipment(this.equipment ?? createEmptyEquipment());

    this.setupCamera();
    this.playZoneMusic();
    this.setupServerEvents();
    this.hudOverlay = new GameHudOverlay(this, this.socket, this.inventory, this.equipment, {
      musicEnabled: this.musicEnabled,
      onMusicEnabledChange: this.setMusicEnabled,
      socialPlayers: this.socialPlayers.map(player => ({
        socketId: player.socketId,
        username: player.username,
        position: {
          tileX: player.position.tileX,
          tileY: player.position.tileY,
        },
      })),
      getLocalTilePosition: () => this.player.getTilePosition(),
      onClearTarget: () => this.mobSpawners?.clearTarget(),
    });
    this.herbSpawners = new HerbSpawnerManager(this, this.socket, this.map, this.player, message => {
      this.hudOverlay.addSystemMessage(message);
    }, this.herbSpawnStates);
    this.mobSpawners = new MobSpawnerManager(this, this.socket, this.labelOverlay, {
      initialStates: this.mobSpawnStates,
      onTargetChanged: target => this.hudOverlay.setTargetProfile(target),
      addSystemMessage: message => this.hudOverlay.addSystemMessage(message),
      getLocalTilePosition: () => this.player.getTilePosition(),
      isLocalPlayerMoving: () => this.player.isMoving(),
    });
  }

  update() {
    const textInputBlocked = this.hudOverlay?.isTextInputFocused() ?? false;
    this.player.update(textInputBlocked);
    this.herbSpawners?.update(textInputBlocked);
    this.mobSpawners?.update(textInputBlocked);
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
}
