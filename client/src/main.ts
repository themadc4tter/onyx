import Phaser from "phaser";
import { supabase } from "./lib/supabase";
import { AuthUI } from "./auth/AuthUI";
import { BootScene } from "./scenes/BootScene";

function startGame() {
  new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#1a1a2e",
    scene: [BootScene],
  });
}

async function init() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    startGame();
    return;
  }

  new AuthUI(() => startGame());
}

init();
