# Tech Debt

## [Phase 3] Programmatic tileset instead of Kenney assets

**Introduced:** Phase 3  
**Target:** Phase 5 (Tiled + second zone)

The map tileset (`client/src/scenes/GameScene.ts` → `buildTilesetTexture`) is drawn programmatically using Phaser's canvas API rather than loading the Kenney Roguelike/RPG Pack spritesheet. The decision was made because tile indices in `roguelikeSheet_transparent.png` could not be verified without downloading the asset, and hardcoding wrong indices would have broken the map on first run.

**What to do in Phase 5:**
1. Download the [Kenney Roguelike/RPG Pack](https://kenney.nl/assets/roguelike-rpg-pack) and place `roguelikeSheet_transparent.png` in `client/public/assets/`.
2. Open the included `_tilemap.txt` or XML file to identify tile indices for grass, dirt path, and tree/wall.
3. In `GameScene.ts`, replace `buildTilesetTexture()` with a `preload()` that loads the PNG:
   ```ts
   preload() {
     this.load.image("tileset", "assets/roguelikeSheet_transparent.png");
   }
   ```
4. Update `buildTilemap()` to pass the correct `tileWidth` (16), `tileHeight` (16), `margin` (0), and `spacing` (1) to `addTilesetImage`.
5. Update `TILE` constants in `client/src/config/map.ts` to match the real indices from the sheet.
6. Update `MAP_DATA` if the new tile layout calls for a redesigned map.

The server-side map config (`server/src/config/map.ts`) is unaffected — it only cares about which tiles are walkable, not the visual asset.
