// src/scoring.ts
export interface PlayerScore {
  player1: number;
  player2: number;
}

export interface ScoreEvent {
  type: 'enemyKill' | 'playerKill' | 'levelComplete' | 'mineExplosion';
  target: string; // Type d'ennemi ou joueur touché
  scorer: 'player1' | 'player2';
  points: number;
}

// Points accordés selon le type d'événement
const SCORE_VALUES = {
  enemyKill: {
    brown: 100,   // Tank faible
    grey: 150,    // Tank défensif
    teal: 200,    // Tank avec missiles rapides
    yellow: 250,  // Tank rapide avec mines
    pink: 300,    // Tank offensif avec 3 balles
    green: 400,   // Tank précis avec missiles rapides
    purple: 500,  // Tank très offensif avec mines
    white: 600,   // Tank invisible
    black: 1000   // Tank le plus difficile
  },
  playerKill: 500,    // Points pour toucher l'adversaire
  levelComplete: 1000, // Bonus pour finir un niveau
  mineExplosion: 50   // Points pour faire exploser une mine
};

let currentScores: PlayerScore = { player1: 0, player2: 0 };

export function getScores(): PlayerScore {
  return { ...currentScores };
}

export function resetScores() {
  currentScores = { player1: 0, player2: 0 };
}

export function addScore(event: ScoreEvent) {
  const points = calculatePoints(event);
  currentScores[event.scorer] += points;
  
  // Envoyer event pour mettre à jour l'UI
  updateScoreDisplay();
  
  console.log(`${event.scorer} gagne ${points} points pour ${event.type}:${event.target}`);
}

function calculatePoints(event: ScoreEvent): number {
  switch (event.type) {
    case 'enemyKill':
      return SCORE_VALUES.enemyKill[event.target as keyof typeof SCORE_VALUES.enemyKill] || 100;
    case 'playerKill':
      return SCORE_VALUES.playerKill;
    case 'levelComplete':
      return SCORE_VALUES.levelComplete;
    case 'mineExplosion':
      return SCORE_VALUES.mineExplosion;
    default:
      return 0;
  }
}

function updateScoreDisplay() {
  // Mettre à jour l'affichage des scores dans l'UI
  const player1ScoreElement = document.getElementById('player1Score');
  const player2ScoreElement = document.getElementById('player2Score');
  
  if (player1ScoreElement) {
    player1ScoreElement.textContent = currentScores.player1.toString();
  }
  
  if (player2ScoreElement) {
    player2ScoreElement.textContent = currentScores.player2.toString();
  }
}

// Fonction pour obtenir le leader
export function getLeader(): 'player1' | 'player2' | 'tie' {
  if (currentScores.player1 > currentScores.player2) {
    return 'player1';
  } else if (currentScores.player2 > currentScores.player1) {
    return 'player2';
  } else {
    return 'tie';
  }
}

// Fonction pour formater le score avec des milliers séparés
export function formatScore(score: number): string {
  return score.toLocaleString();
}