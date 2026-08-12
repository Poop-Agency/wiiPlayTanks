/**
 * Point d'entrée du client.
 *
 * À ce stade (issue #5) il ne fait qu'établir le canevas et vérifier que la
 * chaîne de build fonctionne. La boucle de jeu arrive en #6, le rendu en #7.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#game');

if (!canvas) {
  throw new Error('Canevas #game introuvable dans index.html');
}

const ctx = canvas.getContext('2d');

if (!ctx) {
  throw new Error("Contexte 2D indisponible : le navigateur ne supporte pas Canvas");
}

canvas.width = 800;
canvas.height = 600;

ctx.fillStyle = '#2b2118';
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = '#d8c9a8';
ctx.font = '16px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Socle technique en place — la simulation arrive', canvas.width / 2, canvas.height / 2);
