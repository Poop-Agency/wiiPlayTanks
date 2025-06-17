export type Role = 'player1' | 'player2' | 'spectator';

export interface MoveMessage {
  type: 'move';
  id: Role;
  x: number;
  y: number;
  direction: number;
  cannonDirection: number;
}

export interface ShootMessage {
  type: 'shoot';
  id: Role;
  x: number;
  y: number;
  direction: number;
  cannonDirection: number;
}

export interface RoleMessage {
  type: 'role';
  role: Role;
}

export interface GameStateMessage {
  type: 'gameState';
  players: {
    player1: boolean;
    player2: boolean;
  };
}

export interface RequestRoleMessage {
  type: 'requestRole';
  role: Role;
}

export interface PlayerDisconnectedMessage {
  type: 'playerDisconnected';
  role: Role;
}

export interface GameStartMessage {
  type: 'gameStart';
}

export interface StopGameMessage {
  type: 'stopGame';
  initiator: Role;
}

export interface GameStopMessage {
  type: 'gameStop';
  initiator: Role;
}

export interface EnemyMoveMessage {
  type: 'enemyMove';
  enemyId: string; // Identifiant unique de l'ennemi
  x: number;
  y: number;
  direction: number;
  cannonDirection: number;
}

export interface EnemyShootMessage {
  type: 'enemyShoot';
  enemyId: string;
  x: number;
  y: number;
  cannonDirection: number;
  bulletSpeed: number;
  bulletColor: string;
}

export interface EnemyDeathMessage {
  type: 'enemyDeath';
  enemyId: string;
}
