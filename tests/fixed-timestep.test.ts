import { describe, expect, test } from 'bun:test';

import { FixedTimestep, MAX_CATCHUP_TICKS, MAX_FRAME_SECONDS } from '../src/client/loop.js';
import { DT, TICK_RATE } from '../src/core/tick.js';

/**
 * Le défaut le plus grave de la version précédente : la simulation avançait
 * d'un pas par `requestAnimationFrame`. Sur un écran 144 Hz le jeu tournait
 * 2,4× plus vite que sur un 60 Hz, ce qui rendait toute idée de « vitesse
 * fidèle à l'original » vide de sens — et a corrompu la calibration des
 * vitesses documentée dans `src/core/tuning.ts`.
 *
 * Ces tests verrouillent la propriété qui corrige ça : le nombre de pas de
 * simulation ne dépend que du temps écoulé, jamais de la cadence d'affichage.
 */

/** Fait tourner l'accumulateur sur une durée donnée, à une fréquence donnée. */
function simulate(seconds: number, displayHz: number): number {
  const timestep = new FixedTimestep();
  const frameSeconds = 1 / displayHz;
  const frames = Math.round(seconds * displayHz);

  let ticks = 0;
  for (let i = 0; i < frames; i++) {
    ticks += timestep.advance(frameSeconds);
  }
  return ticks;
}

describe('la cadence de simulation est indépendante de l\'affichage', () => {
  test('10 s produisent le même nombre de pas à 60, 75, 144 et 240 Hz', () => {
    const expected = 10 * TICK_RATE;
    const results = [60, 75, 144, 240].map((hz) => simulate(10, hz));

    for (const ticks of results) {
      // ±1 pas : le résidu de la dernière frame peut basculer d'un côté ou de
      // l'autre selon l'arrondi flottant. C'est un pas sur 600.
      expect(Math.abs(ticks - expected)).toBeLessThanOrEqual(1);
    }

    // Le point qui compte vraiment : toutes les fréquences s'accordent entre
    // elles. L'ancienne boucle aurait donné 600 contre 1440.
    expect(Math.max(...results) - Math.min(...results)).toBeLessThanOrEqual(1);
  });

  test('une cadence irrégulière ne dérive pas sur 30 s simulées', () => {
    const timestep = new FixedTimestep();

    // Frames de durée variable, comme un vrai navigateur sous charge.
    // Suite déterministe pour que l'échec soit reproductible.
    let pseudo = 1;
    let elapsed = 0;
    let ticks = 0;

    while (elapsed < 30) {
      pseudo = (pseudo * 1103515245 + 12345) % 2147483648;
      const frameSeconds = 0.004 + (pseudo / 2147483648) * 0.02; // 4 à 24 ms
      elapsed += frameSeconds;
      ticks += timestep.advance(frameSeconds);
    }

    expect(Math.abs(ticks - elapsed * TICK_RATE)).toBeLessThanOrEqual(1);
  });
});

describe('protection contre la spirale de la mort', () => {
  test('une frame très longue ne demande jamais plus que le plafond', () => {
    const timestep = new FixedTimestep();

    // Dix secondes de gel, comme un onglet mis en arrière-plan.
    expect(timestep.advance(10)).toBe(MAX_CATCHUP_TICKS);
  });

  test('le temps excédentaire est abandonné, pas reporté', () => {
    const timestep = new FixedTimestep();
    timestep.advance(10);

    // Si le retard était resté dans l'accumulateur, cette frame normale
    // redemanderait un rattrapage — et le cycle ne s'arrêterait jamais.
    expect(timestep.advance(1 / 60)).toBe(1);
  });

  test('MAX_FRAME_SECONDS correspond bien au plafond de pas', () => {
    expect(MAX_FRAME_SECONDS).toBeCloseTo(MAX_CATCHUP_TICKS * DT, 12);
  });
});

describe('résidu d\'interpolation', () => {
  test('alpha reste dans [0, 1)', () => {
    const timestep = new FixedTimestep();

    for (let i = 0; i < 1000; i++) {
      timestep.advance(1 / 144);
      expect(timestep.alpha).toBeGreaterThanOrEqual(0);
      expect(timestep.alpha).toBeLessThan(1);
    }
  });

  test('une demi-période laisse un résidu proche de la moitié', () => {
    const timestep = new FixedTimestep();
    timestep.advance(DT / 2);

    expect(timestep.alpha).toBeCloseTo(0.5, 9);
  });

  test('un affichage plus lent que la simulation ne produit aucun résidu perdu', () => {
    const timestep = new FixedTimestep();

    // 30 Hz d'affichage : deux pas de simulation par frame, résidu nul.
    expect(timestep.advance(1 / 30)).toBe(2);
    expect(timestep.alpha).toBeCloseTo(0, 9);
  });
});

describe('cas limites', () => {
  test('un temps écoulé nul ne produit aucun pas', () => {
    const timestep = new FixedTimestep();
    expect(timestep.advance(0)).toBe(0);
  });

  test('un temps écoulé négatif est ignoré plutôt que de reculer l\'horloge', () => {
    const timestep = new FixedTimestep();
    timestep.advance(DT / 2);
    const before = timestep.alpha;

    expect(timestep.advance(-5)).toBe(0);
    expect(timestep.alpha).toBe(before);
  });

  test('reset repart de zéro', () => {
    const timestep = new FixedTimestep();
    timestep.advance(DT * 0.75);
    timestep.reset();

    expect(timestep.alpha).toBe(0);
    expect(timestep.advance(DT / 2)).toBe(0);
  });
});
