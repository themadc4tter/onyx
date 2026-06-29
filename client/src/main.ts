import Phaser from "phaser";
import { supabase } from "./lib/supabase";
import { AuthUI } from "./auth/AuthUI";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

function startGame() {
  new Phaser.Game({
    type: Phaser.AUTO,
    width: 640,
    height: 480,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: "#1a1a2e",
    pixelArt: true,
    scene: [BootScene, GameScene],
  });
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    startGame();
    return;
  }

  new AuthUI(() => startGame());
}

init();
