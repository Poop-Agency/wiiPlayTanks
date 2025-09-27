// src/sound.ts
// Simple sound system using Web Audio API

export type SoundType = 'shoot' | 'hit' | 'explosion' | 'powerup' | 'ricochet' | 'engine' | 'enemyDestroyed';

interface SoundConfig {
  frequency: number;
  duration: number;
  volume: number;
  type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  shoot: {
    frequency: 800,
    duration: 0.1,
    volume: 0.3,
    type: 'square',
    envelope: { attack: 0.01, decay: 0.02, sustain: 0.5, release: 0.07 }
  },
  hit: {
    frequency: 400,
    duration: 0.15,
    volume: 0.4,
    type: 'sawtooth',
    envelope: { attack: 0.005, decay: 0.03, sustain: 0.3, release: 0.112 }
  },
  explosion: {
    frequency: 150,
    duration: 0.8,
    volume: 0.5,
    type: 'sawtooth',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.69 }
  },
  powerup: {
    frequency: 523.25, // C5
    duration: 0.5,
    volume: 0.3,
    type: 'sine',
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.35 }
  },
  ricochet: {
    frequency: 1200,
    duration: 0.2,
    volume: 0.2,
    type: 'triangle',
    envelope: { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.14 }
  },
  engine: {
    frequency: 80,
    duration: 0.3,
    volume: 0.15,
    type: 'sawtooth',
    envelope: { attack: 0.1, decay: 0.05, sustain: 0.8, release: 0.15 }
  },
  enemyDestroyed: {
    frequency: 220,
    duration: 1.0,
    volume: 0.4,
    type: 'square',
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.78 }
  }
};

class SoundManager {
  private context: AudioContext | null = null;
  private enabled: boolean = true;
  private masterVolume: number = 0.5;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext() {
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
      this.enabled = false;
    }
  }

  // Activer le contexte audio (requis après interaction utilisateur)
  enable() {
    if (!this.context) {
      this.initAudioContext();
    }
    
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  playSound(type: SoundType, pitch: number = 1.0, volume: number = 1.0) {
    if (!this.enabled || !this.context) return;

    try {
      const config = SOUND_CONFIGS[type];
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();

      // Configuration de l'oscillateur
      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(
        config.frequency * pitch, 
        this.context.currentTime
      );

      // Configuration du volume avec enveloppe ADSR
      const env = config.envelope;
      const finalVolume = config.volume * volume * this.masterVolume;
      
      if (env) {
        gainNode.gain.setValueAtTime(0, this.context.currentTime);
        gainNode.gain.linearRampToValueAtTime(
          finalVolume, 
          this.context.currentTime + env.attack
        );
        gainNode.gain.linearRampToValueAtTime(
          finalVolume * env.sustain, 
          this.context.currentTime + env.attack + env.decay
        );
        gainNode.gain.setValueAtTime(
          finalVolume * env.sustain,
          this.context.currentTime + config.duration - env.release
        );
        gainNode.gain.linearRampToValueAtTime(
          0,
          this.context.currentTime + config.duration
        );
      } else {
        gainNode.gain.setValueAtTime(finalVolume, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          this.context.currentTime + config.duration
        );
      }

      // Connexions
      oscillator.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Lecture
      oscillator.start(this.context.currentTime);
      oscillator.stop(this.context.currentTime + config.duration);

    } catch (error) {
      console.warn('Error playing sound:', error);
    }
  }

  // Sons spéciaux avec effets
  playExplosion() {
    // Explosion avec noise burst
    this.playSound('explosion', 0.8, 1.0);
    
    // Ajout de fréquences hautes pour l'effet crépitement
    setTimeout(() => this.playSound('hit', 2.0, 0.3), 50);
    setTimeout(() => this.playSound('hit', 1.5, 0.2), 100);
  }

  playPowerUpCollected() {
    // Arpège ascendant
    const notes = [1.0, 1.25, 1.5, 2.0]; // Do, Mi, Sol, Do (octave)
    notes.forEach((pitch, index) => {
      setTimeout(() => {
        this.playSound('powerup', pitch, 0.8);
      }, index * 100);
    });
  }

  playEnemyHit(enemyType: string) {
    // Pitch différent selon le type d'ennemi
    const pitchMap: Record<string, number> = {
      'brown': 0.8,
      'grey': 0.9,
      'teal': 1.1,
      'yellow': 1.2,
      'pink': 1.3,
      'green': 1.4,
      'purple': 1.5,
      'white': 1.6,
      'black': 0.6
    };
    
    const pitch = pitchMap[enemyType] || 1.0;
    this.playSound('enemyDestroyed', pitch);
    
    // Son d'explosion après un court délai
    setTimeout(() => this.playExplosion(), 200);
  }

  playRicochet() {
    // Ricochet avec pitch descendant
    this.playSound('ricochet');
    setTimeout(() => this.playSound('ricochet', 0.8, 0.7), 100);
  }

  // Jouer le son de moteur en boucle (pour les tanks en mouvement)
  playEngineLoop(duration: number = 300) {
    if (!this.enabled) return;
    
    this.playSound('engine', 1.0, 0.6);
    
    if (duration > 300) {
      setTimeout(() => {
        this.playEngineLoop(duration - 300);
      }, 250);
    }
  }
}

// Instance globale du gestionnaire de son
export const soundManager = new SoundManager();

// Fonction pour initialiser le son après interaction utilisateur
export function initializeSound() {
  soundManager.enable();
}

// Fonctions utilitaires pour jouer des sons spécifiques
export function playShootSound(pitch: number = 1.0) {
  soundManager.playSound('shoot', pitch);
}

export function playHitSound() {
  soundManager.playSound('hit');
}

export function playExplosionSound() {
  soundManager.playExplosion();
}

export function playPowerUpSound() {
  soundManager.playPowerUpCollected();
}

export function playRicochetSound() {
  soundManager.playRicochet();
}

export function playEnemyDestroyedSound(enemyType: string) {
  soundManager.playEnemyHit(enemyType);
}

export function playEngineSound(duration: number = 300) {
  soundManager.playEngineLoop(duration);
}