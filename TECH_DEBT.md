# Tech Debt

_(Nothing open as of Phase 5.)_

## [Phase 3 — RESOLVED in Phase 5] Programmatic tileset → Kenney assets

**Resolved:** Phase 5

Replaced `buildTilesetTexture()` (programmatic canvas tiles) with the Kenney Roguelike/RPG Pack spritesheet (`roguelikeSheet_transparent.png`).

Tile indices used (0-based Phaser, 57 cols/row):
- Grass floor: 62   (row 1, col 5 — confirmed from Kenney's sample_map.tmx)
- Stone/dirt path: 119  (row 2, col 5 — confirmed from Kenney's sample_indoor.tmx)
- Tree/wall: 527  (row 9, col 14 — transparent tile; rendered over a grass base layer)

TILE_SIZE changed from 32 → 16 (world space); camera zoom 2× restores visual size.
Canvas changed from 800×600 → 640×480 to match the new tile density.
