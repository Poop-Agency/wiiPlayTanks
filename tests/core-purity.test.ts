import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Garde-fou architectural : `src/core/` doit rester une simulation pure.
 *
 * Ce test est volontairement mis en place AVANT qu'il y ait du code à protéger.
 * L'expérience de la version précédente est que ces règles ne se maintiennent
 * pas toutes seules : `Math.random()` et les appels DOM s'infiltrent un par un,
 * et le jour où on veut faire tourner la logique côté serveur il est trop tard.
 *
 * Les trois règles vérifiées ici sont détaillées dans `src/core/README.md`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'src', 'core');

/** Symboles interdits dans `core/`, avec la raison — affichée en cas d'échec. */
const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; symbol: string; why: string }> = [
  // --- Dépendances au navigateur : empêchent l'exécution côté serveur ---
  { pattern: /\bdocument\b/, symbol: 'document', why: 'DOM' },
  { pattern: /\bwindow\b/, symbol: 'window', why: 'DOM' },
  { pattern: /\bnavigator\b/, symbol: 'navigator', why: 'DOM' },
  { pattern: /\blocalStorage\b/, symbol: 'localStorage', why: 'DOM' },
  { pattern: /\bsessionStorage\b/, symbol: 'sessionStorage', why: 'DOM' },
  { pattern: /\brequestAnimationFrame\b/, symbol: 'requestAnimationFrame', why: 'DOM' },
  { pattern: /\bCanvasRenderingContext2D\b/, symbol: 'CanvasRenderingContext2D', why: 'DOM' },
  { pattern: /\bHTMLCanvasElement\b/, symbol: 'HTMLCanvasElement', why: 'DOM' },

  // --- Sources d'indéterminisme : cassent la prédiction réseau et les tests ---
  { pattern: /\bMath\s*\.\s*random\b/, symbol: 'Math.random()', why: 'indéterminisme' },
  { pattern: /\bDate\s*\.\s*now\b/, symbol: 'Date.now()', why: 'indéterminisme' },
  { pattern: /\bnew\s+Date\b/, symbol: 'new Date()', why: 'indéterminisme' },
  { pattern: /\bperformance\s*\.\s*now\b/, symbol: 'performance.now()', why: 'indéterminisme' },
];

/** Alias de modules que `core/` n'a pas le droit d'importer. */
const FORBIDDEN_IMPORT_PREFIXES = ['@client', '@server', '@shared'];

/**
 * Retire commentaires et littéraux de chaînes, pour qu'une mention en
 * commentaire (« ne jamais utiliser Math.random ici ») ne déclenche pas
 * de faux positif.
 *
 * Le contenu interpolé des gabarits (`${...}`) est **conservé** : c'est du code
 * exécutable, il doit rester soumis aux règles.
 *
 * Limite connue : les littéraux d'expression régulière contenant `/` ou des
 * guillemets peuvent être mal découpés. Aucun n'existe dans `core/`, et le
 * test d'auto-vérification plus bas signalerait une dérive de ce parseur.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < source.length && source[i] !== quote) {
        i += source[i] === '\\' ? 2 : 1;
      }
      i++;
      out += ' ';
      continue;
    }

    if (char === '`') {
      i++;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        // Interpolation : on garde le code, on jette le texte autour.
        if (source[i] === '$' && source[i + 1] === '{') {
          out += ' ';
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (depth > 0) out += source[i];
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      out += ' ';
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

/** Liste récursivement les fichiers TypeScript d'un dossier. */
function listTypeScriptFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // Le dossier n'existe pas encore.
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

/** Extrait les spécificateurs de tous les `import ... from '...'` et `export ... from '...'`. */
function extractImportSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  // Les chaînes ayant été retirées, on relit la source brute pour les imports.
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    specifiers.push(match[1]!);
  }
  return specifiers;
}

const coreFiles = listTypeScriptFiles(CORE);

describe('src/core/ reste une simulation pure', () => {
  test('aucun symbole DOM ni source d\'indéterminisme', () => {
    const violations: string[] = [];

    for (const file of coreFiles) {
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      const lines = code.split('\n');

      for (const [index, line] of lines.entries()) {
        for (const { pattern, symbol, why } of FORBIDDEN) {
          if (pattern.test(line)) {
            violations.push(
              `${relative(ROOT, file)}:${index + 1} — ${symbol} interdit (${why})`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('aucun import sortant de core/', () => {
    const violations: string[] = [];

    for (const file of coreFiles) {
      for (const specifier of extractImportSpecifiers(readFileSync(file, 'utf8'))) {
        const location = `${relative(ROOT, file)} → ${specifier}`;

        if (FORBIDDEN_IMPORT_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
          violations.push(`${location} (core/ ne doit dépendre d'aucune autre couche)`);
          continue;
        }

        // Un chemin relatif ne doit jamais sortir de src/core/.
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          if (!target.startsWith(CORE + sep)) {
            violations.push(`${location} (sort de src/core/)`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('le détecteur lui-même fonctionne', () => {
  // Sans ces cas, un parseur cassé rendrait le garde-fou silencieusement inutile.

  test('ignore les mentions en commentaire et en chaîne', () => {
    const sample = [
      '// on n\'utilise jamais Math.random() ici',
      '/* ni Date.now() en bloc */',
      'const label = "document";',
      'const other = `window`;',
    ].join('\n');

    const stripped = stripCommentsAndStrings(sample);

    expect(/Math\s*\.\s*random/.test(stripped)).toBe(false);
    expect(/Date\s*\.\s*now/.test(stripped)).toBe(false);
    expect(/\bdocument\b/.test(stripped)).toBe(false);
    expect(/\bwindow\b/.test(stripped)).toBe(false);
  });

  test('détecte le vrai code, y compris dans une interpolation', () => {
    expect(/Math\s*\.\s*random/.test(stripCommentsAndStrings('const x = Math.random();'))).toBe(true);
    expect(/Date\s*\.\s*now/.test(stripCommentsAndStrings('const t = `${Date.now()}`;'))).toBe(true);
    expect(/\bdocument\b/.test(stripCommentsAndStrings('document.title = "x";'))).toBe(true);
  });
});
