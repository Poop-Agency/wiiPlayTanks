// src/controls.ts
import { Tank } from "./tank.js";
import { Bullet } from "./bullet.js";

const keys: Record<string, boolean> = {};
let mouseX = 0;
let mouseY = 0;
let mousePressed = false;
let lastShotTime = 0;
const SHOT_COOLDOWN = 300; // 300ms entre chaque tir

document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

document.addEventListener("mousemove", (e) => {
  const canvas = document.querySelector("canvas")!;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

document.addEventListener("mousedown", () => (mousePressed = true));
document.addEventListener("mouseup", () => (mousePressed = false));

export function setupControls() {
  // Listeners are already set up
}

export function updateControls(
  player: Tank,
  otherPlayer: Tank,
  bullets: Bullet[],
  onShoot?: (bullet: Bullet) => void
) {
  const otherTanks = [otherPlayer]; // Array des autres tanks pour la collision
  
  // Contrôles de mouvement cardinaux ZQSD
  if (keys["z"] || keys["w"]) player.moveNorth(otherTanks);   // Z/W = Nord (Haut)
  if (keys["s"]) player.moveSouth(otherTanks);                 // S = Sud (Bas)
  if (keys["q"] || keys["a"]) player.moveWest(otherTanks);     // Q/A = Ouest (Gauche)
  if (keys["d"]) player.moveEast(otherTanks);                  // D = Est (Droite)

  // Contrôles alternatifs avec les flèches
  if (keys["arrowup"]) player.moveNorth(otherTanks);
  if (keys["arrowdown"]) player.moveSouth(otherTanks);
  if (keys["arrowleft"]) player.moveWest(otherTanks);
  if (keys["arrowright"]) player.moveEast(otherTanks);

  // Viser vers la souris (orienter le canon)
  player.aimAt(mouseX, mouseY);
  // Tir avec cooldown
  const now = Date.now();
  if ((mousePressed || keys[" "]) && now - lastShotTime > SHOT_COOLDOWN) {
    // Ne pas créer la balle ici, laisser le callback décider
    const bullet = player.shoot();
    lastShotTime = now;
    
    // Appeler le callback si fourni (pour le réseau)
    if (onShoot) {
      onShoot(bullet);
    }
  }
}