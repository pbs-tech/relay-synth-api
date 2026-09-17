import { describe, expect, it } from 'vitest';
import {
  assertValidTutorials,
  validateTutorial,
  validateTutorials,
} from '../src/lib/validate-tutorials.js';
import type { Tutorial } from '../src/types.js';

function tutorial(overrides: Partial<Tutorial> = {}): Tutorial {
  return {
    number: 1,
    name: 'Sine Waves',
    category: 'Waveforms',
    difficulty: 'Easy',
    pointsAvailable: 100,
    text: 'Some teaching copy.',
    synth: {
      polyphony: 1,
      type: 'Mono Synth',
      parameters: { oscillator: { type: 'sine' } },
    },
    example: { note: 'C4', duration: '8n', interval: '4n' },
    ...overrides,
  };
}

describe('validateTutorial', () => {
  it('accepts a minimal well-formed tutorial', () => {
    expect(validateTutorial(tutorial())).toEqual([]);
  });

  it('rejects an oscillator type the Oscillator control cannot select', () => {
    const errors = validateTutorial(
      tutorial({
        synth: {
          polyphony: 1,
          type: 'Mono Synth',
          // Tone.js supports pwm, but the frontend's select offers only four waves.
          parameters: { oscillator: { type: 'pwm' as never } },
        },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not offered by the Oscillator control');
  });

  it('requires an oscillator so the grader always has something to compare', () => {
    const errors = validateTutorial(
      tutorial({
        synth: { polyphony: 1, type: 'Mono Synth', parameters: {} },
      }),
    );
    expect(errors).toContain('tutorial 1: synth.parameters.oscillator is required');
  });

  describe('envelope reachability', () => {
    const withEnvelope = (envelope: Record<string, number>) =>
      tutorial({
        synth: {
          polyphony: 1,
          type: 'Mono Synth',
          parameters: {
            oscillator: { type: 'sine' },
            envelope: envelope as never,
          },
        },
      });

    it('accepts values on the 0.05 slider grid', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 0.35, decay: 0.7, sustain: 0.15, release: 1 }),
      );
      expect(errors).toEqual([]);
    });

    it('accepts 0 for attack and sustain', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 0, decay: 0.25, sustain: 0, release: 0.5 }),
      );
      expect(errors).toEqual([]);
    });

    it('accepts the 0.01 floor that decay and release coerce a zero slider to', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 0, decay: 0.01, sustain: 0.5, release: 0.01 }),
      );
      expect(errors).toEqual([]);
    });

    it('rejects 0 for decay and release, which the mixins coerce to 0.01', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 0, decay: 0, sustain: 0.5, release: 0 }),
      );
      expect(errors).toHaveLength(2);
      expect(errors.join()).toContain('envelope.decay is 0');
      expect(errors.join()).toContain('envelope.release is 0');
    });

    it('rejects values between slider steps', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 0.33, decay: 0.25, sustain: 0.5, release: 1 }),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('envelope.attack is 0.33');
    });

    it('rejects values beyond the slider maximum', () => {
      const errors = validateTutorial(
        withEnvelope({ attack: 2, decay: 0.25, sustain: 0.5, release: 1 }),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('envelope.attack is 2');
    });
  });

  describe('filter reachability', () => {
    const withFilter = (type: string, frequency: number) =>
      tutorial({
        synth: {
          polyphony: 1,
          type: 'Mono Synth',
          parameters: {
            oscillator: { type: 'sawtooth' },
            filter: { type: type as never, frequency },
          },
        },
      });

    it('accepts a cutoff on the 1000Hz slider grid', () => {
      expect(validateTutorial(withFilter('lowpass', 12000))).toEqual([]);
    });

    it('accepts the legacy 5000Hz cutoff used while the slider was unwired', () => {
      expect(validateTutorial(withFilter('lowpass', 5000))).toEqual([]);
    });

    it('rejects a cutoff between slider steps', () => {
      const errors = validateTutorial(withFilter('lowpass', 5500));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('cutoff slider only produces multiples of 1000');
    });

    it('rejects a cutoff below the slider minimum', () => {
      const errors = validateTutorial(withFilter('lowpass', 200));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('filter.frequency is 200');
    });

    it('rejects a filter type the control cannot select', () => {
      const errors = validateTutorial(withFilter('notch', 5000));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('not offered by the Filter Settings control');
    });
  });

  it('rejects an empty example, which would silence the tutorial synth', () => {
    const errors = validateTutorial(
      tutorial({ example: { note: '', duration: '8n', interval: '4n' } }),
    );
    expect(errors).toContain('tutorial 1: example.note must be a non-empty string');
  });
});

describe('validateTutorials', () => {
  it('rejects duplicate tutorial numbers', () => {
    const errors = validateTutorials([tutorial({ number: 1 }), tutorial({ number: 1 })]);
    expect(errors.join()).toContain('duplicate tutorial numbers: 1');
  });

  it('rejects gaps in the tutorial sequence', () => {
    const errors = validateTutorials([tutorial({ number: 1 }), tutorial({ number: 3 })]);
    expect(errors.join()).toContain('must run 1..n with no gaps');
  });

  it('accepts a contiguous sequence', () => {
    const errors = validateTutorials([
      tutorial({ number: 1 }),
      tutorial({ number: 2 }),
      tutorial({ number: 3 }),
    ]);
    expect(errors).toEqual([]);
  });
});

describe('validateTutorial - structural failures', () => {
  it('reports a missing synth.parameters and stops there', () => {
    const errors = validateTutorial(
      tutorial({ synth: { polyphony: 1, type: 'Mono Synth' } as never }),
    );

    expect(errors).toEqual(['tutorial 1: synth.parameters is required']);
  });

  it('reports a non-numeric envelope stage rather than treating it as off-grid', () => {
    const errors = validateTutorial(
      tutorial({
        synth: {
          polyphony: 1,
          type: 'Mono Synth',
          parameters: {
            oscillator: { type: 'sine' },
            envelope: { attack: '0.5', decay: 0.25, sustain: 0.5, release: 1 } as never,
          },
        },
      }),
    );

    expect(errors).toEqual(['tutorial 1: envelope.attack must be a number']);
  });

  it('validates the filter envelope on the same grid as the amplitude envelope', () => {
    const errors = validateTutorial(
      tutorial({
        synth: {
          polyphony: 1,
          type: 'Mono Synth',
          parameters: {
            oscillator: { type: 'sine' },
            filterEnvelope: { attack: 0.33, decay: 0.25, sustain: 0.5, release: 1 } as never,
          },
        },
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('filterEnvelope.attack is 0.33');
  });

  it.each([
    ['number', { number: 0 }, 'number must be a positive integer'],
    ['name', { name: '   ' }, 'name must be a non-empty string'],
    ['category', { category: '' }, 'category must be a non-empty string'],
    ['difficulty', { difficulty: '' }, 'difficulty must be a non-empty string'],
    ['text', { text: '' }, 'text must be a non-empty string'],
    ['pointsAvailable', { pointsAvailable: 0 }, 'pointsAvailable must be a positive integer'],
    ['pointsAvailable', { pointsAvailable: 1.5 }, 'pointsAvailable must be a positive integer'],
  ])('rejects an invalid %s', (_field, override, expected) => {
    const errors = validateTutorial(tutorial(override as never));

    expect(errors.join()).toContain(expected);
  });

  it('reports a wholly missing example', () => {
    const errors = validateTutorial(tutorial({ example: undefined as never }));

    expect(errors).toHaveLength(3);
    expect(errors.join()).toContain('example.note');
    expect(errors.join()).toContain('example.duration');
    expect(errors.join()).toContain('example.interval');
  });

  it('accumulates every problem rather than stopping at the first', () => {
    const errors = validateTutorial(
      tutorial({
        name: '',
        pointsAvailable: -1,
        example: { note: '', duration: '', interval: '4n' },
      }),
    );

    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('validateTutorials - sequencing', () => {
  it('accepts an empty curriculum', () => {
    expect(validateTutorials([])).toEqual([]);
  });

  it('accepts tutorials supplied out of order, since the sort key orders them', () => {
    const errors = validateTutorials([
      tutorial({ number: 3 }),
      tutorial({ number: 1 }),
      tutorial({ number: 2 }),
    ]);

    expect(errors).toEqual([]);
  });

  it('rejects a curriculum that does not start at 1', () => {
    const errors = validateTutorials([tutorial({ number: 2 }), tutorial({ number: 3 })]);

    expect(errors.join()).toContain('must run 1..n with no gaps');
  });

  it('surfaces both a duplicate and the gap it creates', () => {
    const errors = validateTutorials([
      tutorial({ number: 1 }),
      tutorial({ number: 2 }),
      tutorial({ number: 2 }),
    ]);

    expect(errors.join()).toContain('duplicate tutorial numbers: 2');
    expect(errors.join()).toContain('must run 1..n with no gaps');
  });
});

describe('assertValidTutorials', () => {
  // This is the gate the seed script and CI call. If it stops throwing,
  // unsolvable content reaches production silently.
  it('passes valid content through without throwing', () => {
    expect(() => assertValidTutorials([tutorial({ number: 1 })])).not.toThrow();
  });

  it('throws on invalid content', () => {
    const unsolvable = tutorial({
      synth: {
        polyphony: 1,
        type: 'Mono Synth',
        parameters: {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.33, decay: 0.25, sustain: 0.5, release: 1 },
        },
      },
    });

    expect(() => assertValidTutorials([unsolvable])).toThrow('Invalid tutorial content');
  });

  it('names every problem in the message, so one seed run reports them all', () => {
    const errors = () => {
      try {
        assertValidTutorials([tutorial({ number: 1, name: '', pointsAvailable: 0 })]);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };

    const message = errors();
    expect(message).toContain('name must be a non-empty string');
    expect(message).toContain('pointsAvailable must be a positive integer');
  });

  it('accepts an empty curriculum rather than failing a fresh environment', () => {
    expect(() => assertValidTutorials([])).not.toThrow();
  });
});
