import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { TUNING } from '../src/core/tuning.js';
import { TANK_PROFILES } from '../src/core/systems/ai/profiles.js';

/**
 * Garde contre le retour des valeurs magiques.
 *
 * L'ancienne version avait ses constantes de gameplay éparpillées dans cinq
 * fichiers, parfois répétées avec des valeurs légèrement différentes. C'est ce
 * qui rendait toute calibration impossible : ajuster une vitesse demandait de
 * savoir où chercher, et de n'en oublier aucune.
 *
 * ─── La règle ────────────────────────────────────────────────────────────────
 *
 * Dans `src/core/`, un littéral numérique doit être **soit structurel, soit
 * nommé**. Autrement dit : aucun nombre ne peut apparaître au milieu d'une
 * expression sans qu'on puisse dire, en lisant son nom, ce qu'il représente.
 *
 * La frontière, explicite, entre ce qui va dans `tuning.ts` / `profiles.ts` et
 * ce qui peut rester une constante nommée dans un système :
 *
 *   · **réglable** — ce qu'un joueur *ressent* : vitesses, durées, rayons,
 *     quotas, portées, cônes d'erreur. Ça vit dans les tables, et le panneau
 *     de calibration l'expose ;
 *   · **structurel** — les paramètres de la méthode numérique : tolérances,
 *     plafonds d'itération, nombre d'échantillons, budgets de calcul. Changer
 *     ces valeurs ne change pas le jeu, seulement la précision ou le coût.
 *     Ça reste au plus près du code concerné, sous un nom explicite.
 *
 * Ce test ne peut pas trancher cette frontière à ma place — aucun outil ne
 * peut. Ce qu'il garantit, c'est qu'aucun nombre ne se glisse **anonymement**
 * dans la logique : tout ce qui n'est pas trivial porte un nom, donc se voit,
 * se cherche et se discute.
 */

/* ── Ce qui est toléré en clair ─────────────────────────────────────────── */

/**
 * Littéraux autorisés partout, parce qu'ils n'expriment jamais un réglage.
 *
 * `0` et `1` sont les neutres de l'addition et de la multiplication, `2` sert
 * aux moitiés et aux doublements, `0.5` au centre d'une tuile. Aucun de ces
 * nombres ne se règle : les remplacer par une constante nommée n'apprendrait
 * rien à personne.
 */
const STRUCTURAL_LITERALS = new Set(['0', '1', '2', '0.5']);

/** Fichiers qui ont le droit de contenir des valeurs de gameplay. */
const TUNING_FILES = new Set([
  'src/core/tuning.ts',
  'src/core/systems/ai/profiles.ts',
  // Formes de données : les valeurs de `TileKind` sont un encodage, pas un
  // réglage — changer `Hole: 3` ne change pas le jeu, ça casse la
  // sérialisation.
  'src/core/state.ts',
  // Arithmétique binaire du générateur pseudo-aléatoire : décalages et
  // constantes de mélange. Aucune n'a de sens de gameplay, et les nommer une à
  // une rendrait l'algorithme moins lisible, pas plus.
  'src/core/rng.ts',
]);

/** Repère une ligne qui *nomme* sa valeur : `const NOM_EN_MAJUSCULES = …`. */
const NAMED_CONSTANT = /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*(?::[^=]+)?=/;

/* ── Collecte ───────────────────────────────────────────────────────────── */

function sourceFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) found.push(path);
    }
  };

  walk(root);
  return found.sort();
}

/**
 * Retire commentaires et chaînes.
 *
 * Sans ça, la garde se déclencherait sur les nombres cités dans la prose des
 * commentaires — et ce fichier-ci en contient beaucoup.
 */
function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "''");
}

interface Offence {
  where: string;
  literal: string;
  line: string;
}

function findOffences(): Offence[] {
  const offences: Offence[] = [];

  for (const file of sourceFiles('src/core')) {
    if (TUNING_FILES.has(file)) continue;

    stripNoise(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, index) => {
        // Une ligne qui nomme sa constante est acceptable quelle que soit sa
        // valeur : c'est exactement ce qu'on demande.
        if (NAMED_CONSTANT.test(line)) return;

        // Pas de `.` ni de mot juste avant : on écarte `state.a`, `x2`, et les
        // parties décimales déjà capturées.
        for (const match of line.matchAll(/(?<![\w.$])(0x[0-9a-fA-F_]+|\d+\.?\d*(?:e[-+]?\d+)?)/gi)) {
          const literal = match[1]!;

          if (STRUCTURAL_LITERALS.has(literal)) continue;
          // Notation scientifique : une tolérance numérique, jamais un réglage.
          if (/e[-+]?\d+$/i.test(literal)) continue;
          // Hexadécimal : manipulation de bits.
          if (literal.startsWith('0x')) continue;

          offences.push({ where: `${file}:${index + 1}`, literal, line: line.trim() });
        }
      });
  }

  return offences;
}

/* ── Vérifications ──────────────────────────────────────────────────────── */

describe('aucune valeur magique dans la logique', () => {
  test('tout littéral non structurel de src/core porte un nom', () => {
    const offences = findOffences();

    const report = offences
      .map((offence) => `${offence.where} — « ${offence.literal} » dans : ${offence.line}`)
      .join('\n');

    expect(report).toBe('');
  });

  test('la garde détecte bien une valeur magique introduite', () => {
    // Auto-vérification : un test de garde qui ne peut pas échouer ne garde
    // rien. On s'assure que le motif reconnaît le cas qu'il doit attraper.
    const magic = stripNoise('const step = tank.speed * 3.7 * DT;');
    expect(NAMED_CONSTANT.test(magic)).toBe(false);
    expect(/(?<![\w.$])(\d+\.?\d*)/.exec(magic)?.[1]).toBe('3.7');
  });

  test('la garde accepte une constante nommée', () => {
    expect(NAMED_CONSTANT.test('const MAX_BOUNCES_PER_TICK = 8;')).toBe(true);
    expect(NAMED_CONSTANT.test('export const TICK_RATE = 60;')).toBe(true);
    expect(NAMED_CONSTANT.test('const SEPARATION_EPSILON: number = 1e-6;')).toBe(true);
    // Une variable ordinaire n'est pas une constante nommée.
    expect(NAMED_CONSTANT.test('const speed = 3.7;')).toBe(false);
  });

  test('les commentaires ne déclenchent pas la garde', () => {
    expect(stripNoise('// on vise 736 px en 4 s\nconst a = b;')).not.toContain('736');
    expect(stripNoise('/* 2,7× trop lent */ const a = b;')).not.toContain('2,7');
  });
});

describe('aucun réglage figé au chargement', () => {
  /**
   * `const X = TUNING.…` en portée de module capture la valeur **une fois**, à
   * l'import. Le panneau de calibration a beau écrire dans la table ensuite, le
   * code qui lit cette copie garde l'ancienne valeur — et rien ne le signale :
   * le curseur bouge, l'affichage suit, le jeu non.
   *
   * C'est exactement ce qui était arrivé au couloir de menace de `threat.ts`.
   * Une fonction, ou une lecture sur place, relit la table à chaque appel.
   */
  const FROZEN_READ = /^\s*(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*[^;]*\bTUNING\./;

  test('aucun module ne recopie TUNING dans une constante', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles('src')) {
      if (file === join('src', 'core', 'tuning.ts')) continue;

      stripNoise(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          // Seule la portée de module est concernée : à l'intérieur d'une
          // fonction, la lecture se refait à chaque appel.
          if (line.startsWith(' ') || line.startsWith('\t')) return;
          if (FROZEN_READ.test(line)) offenders.push(`${file}:${index + 1} — ${line.trim()}`);
        });
    }

    expect(offenders).toEqual([]);
  });

  test('la garde reconnaît la forme fautive', () => {
    expect(FROZEN_READ.test('const CORRIDOR = TUNING.tank.sizeTiles;')).toBe(true);
    expect(FROZEN_READ.test('export const HALF = TUNING.tank.sizeTiles / 2;')).toBe(true);
    // Une lecture différée, elle, est correcte.
    expect(FROZEN_READ.test('function corridor() { return TUNING.tank.sizeTiles; }')).toBe(false);
  });
});

/* ── Complétude des tables ──────────────────────────────────────────────── */

describe('les tables de réglage sont exploitables', () => {
  /** Chemins `section.champ` de toutes les valeurs numériques d'un objet. */
  function numericPaths(value: unknown, prefix = ''): string[] {
    if (typeof value === 'number') return [prefix];
    if (typeof value !== 'object' || value === null) return [];

    return Object.entries(value).flatMap(([key, child]) =>
      numericPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  test('toutes les valeurs de TUNING sont finies', () => {
    // Une valeur non finie ferait diverger la simulation sans rien signaler.
    const table = TUNING as unknown as Record<string, unknown>;
    for (const path of numericPaths(table)) {
      const value = path
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], table);

      expect(Number.isFinite(value)).toBe(true);
    }
  });

  test('les profils couvrent les dix couleurs et les trois alias de joueur', () => {
    expect(Object.keys(TANK_PROFILES).sort()).toEqual(
      [
        'ash',
        'black',
        'brown',
        'green',
        'pink',
        'player',
        'player2',
        'player3',
        'player4',
        'purple',
        'teal',
        'white',
        'yellow',
      ].sort(),
    );
  });

  test('les tables sont modifiables en place', () => {
    // Le panneau de calibration écrit directement dedans : un `Object.freeze`
    // ou un `as const` de trop le rendrait inopérant, et le seul moment où on
    // s'en apercevrait serait manette en main.
    const before = TUNING.tank.speedTilesPerSecond;
    TUNING.tank.speedTilesPerSecond = before + 1;
    expect(TUNING.tank.speedTilesPerSecond).toBe(before + 1);
    TUNING.tank.speedTilesPerSecond = before;

    const rate = TANK_PROFILES.brown.turretRateRadiansPerSecond;
    TANK_PROFILES.brown.turretRateRadiansPerSecond = rate + 1;
    expect(TANK_PROFILES.brown.turretRateRadiansPerSecond).toBe(rate + 1);
    TANK_PROFILES.brown.turretRateRadiansPerSecond = rate;
  });
});
