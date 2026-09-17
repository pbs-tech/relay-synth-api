import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateTutorials } from '../src/lib/validate-tutorials.js';
import type { Tutorial } from '../src/types.js';

/**
 * Guards the real seed content. The original tutorial data was lost with the
 * database it lived in; this suite is what stops the replacement from drifting
 * into an unsolvable state, because a tutorial whose answer no control can
 * produce fails silently at runtime - the player just never scores.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let tutorials: Tutorial[];

beforeAll(async () => {
  const raw = await readFile(resolve(root, 'data/tutorials.json'), 'utf8');
  tutorials = (JSON.parse(raw) as { tutorials: Tutorial[] }).tutorials;
});

describe('data/tutorials.json', () => {
  it('is every tutorial reachable through the frontend controls', () => {
    expect(validateTutorials(tutorials)).toEqual([]);
  });

  it('numbers the curriculum contiguously from 1', () => {
    expect(tutorials.map((t) => t.number)).toEqual(
      Array.from({ length: tutorials.length }, (_, i) => i + 1),
    );
  });

  it('teaches each concept before combining them', () => {
    const categoryFirstAppearance = new Map<string, number>();
    for (const t of tutorials) {
      if (!categoryFirstAppearance.has(t.category)) {
        categoryFirstAppearance.set(t.category, t.number);
      }
    }
    // Waveforms are the only prerequisite-free concept, so they must come first.
    expect(categoryFirstAppearance.get('Waveforms')).toBe(1);
    // Anything combining several controls belongs after the ones that teach them.
    const soundDesignStart = categoryFirstAppearance.get('Sound Design') ?? Infinity;
    for (const [category, start] of categoryFirstAppearance) {
      if (category !== 'Sound Design') {
        expect(start).toBeLessThan(soundDesignStart);
      }
    }
  });

  it('never decreases in points as the curriculum progresses', () => {
    const points = tutorials.map((t) => t.pointsAvailable);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]!);
    }
  });

  it('uses only difficulty labels the tutorial card renders', () => {
    for (const t of tutorials) {
      expect(['Easy', 'Medium', 'Hard']).toContain(t.difficulty);
    }
  });

  it('gives every tutorial substantive teaching copy', () => {
    for (const t of tutorials) {
      expect(t.text.length, `tutorial ${t.number} text`).toBeGreaterThan(200);
    }
  });

  it('introduces at least one new parameter group with each category', () => {
    const seen = new Set<string>();
    let categoriesIntroducingSomething = 0;
    let lastCategory = '';
    for (const t of tutorials) {
      const keys = Object.keys(t.synth.parameters);
      if (t.category !== lastCategory) {
        if (keys.some((k) => !seen.has(k))) categoriesIntroducingSomething += 1;
        lastCategory = t.category;
      }
      keys.forEach((k) => seen.add(k));
    }
    expect(categoriesIntroducingSomething).toBeGreaterThanOrEqual(4);
    // By the end every control the frontend can render has been exercised.
    expect([...seen].sort()).toEqual(['envelope', 'filter', 'filterEnvelope', 'oscillator']);
  });

  it('declares Mono Synth, the only voice the frontend instantiates', () => {
    // Both setUserSynth and setTutorialSynth hardcode Tone.MonoSynth, so any
    // other type would render a control surface the player's synth cannot match.
    for (const t of tutorials) {
      expect(t.synth.type).toBe('Mono Synth');
      expect(t.synth.polyphony).toBe(1);
    }
  });
});
