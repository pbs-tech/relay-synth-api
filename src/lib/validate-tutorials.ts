import {
  ENVELOPE_MAX,
  ENVELOPE_MIN,
  ENVELOPE_MIN_TIME,
  ENVELOPE_STEP,
  FILTER_FREQUENCY_MAX,
  FILTER_FREQUENCY_MIN,
  FILTER_FREQUENCY_STEP,
  FILTER_TYPES,
  OSCILLATOR_TYPES,
  type AdsrEnvelope,
  type Tutorial,
} from '../types.js';

/**
 * Checks that seed content is actually winnable through the frontend controls.
 *
 * The frontend grades an answer by string-comparing the player's live synth
 * settings against the tutorial's stored parameters, so a tutorial asking for a
 * value no control can produce is unsolvable and silently costs the player the
 * points. Running this in the seed script and in CI stops that reaching prod.
 */

const oscillatorTypes = new Set<string>(OSCILLATOR_TYPES);
const filterTypes = new Set<string>(FILTER_TYPES);

/** Tolerance for comparing against slider steps that arrive as IEEE-754 floats. */
const EPSILON = 1e-9;

function isOnStep(value: number, min: number, max: number, step: number): boolean {
  if (!Number.isFinite(value) || value < min - EPSILON || value > max + EPSILON) return false;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

function describeEnvelopeRange(isTimeStage: boolean): string {
  return isTimeStage
    ? `${ENVELOPE_MIN_TIME}, or a multiple of ${ENVELOPE_STEP} between ${ENVELOPE_STEP} and ${ENVELOPE_MAX}`
    : `a multiple of ${ENVELOPE_STEP} between ${ENVELOPE_MIN} and ${ENVELOPE_MAX}`;
}

function isReachableEnvelopeValue(value: number, isTimeStage: boolean): boolean {
  // Decay and release map a slider value of 0 onto 0.01 rather than 0.
  if (isTimeStage) {
    if (Math.abs(value - ENVELOPE_MIN_TIME) < EPSILON) return true;
    if (value < ENVELOPE_STEP - EPSILON) return false;
  }
  return isOnStep(value, ENVELOPE_MIN, ENVELOPE_MAX, ENVELOPE_STEP);
}

function validateEnvelope(
  envelope: AdsrEnvelope,
  label: string,
  path: string,
  errors: string[],
): void {
  const stages: Array<[keyof AdsrEnvelope, boolean]> = [
    ['attack', false],
    ['decay', true],
    ['sustain', false],
    ['release', true],
  ];

  for (const [stage, isTimeStage] of stages) {
    const value = envelope[stage];
    if (typeof value !== 'number') {
      errors.push(`${path}: ${label}.${stage} must be a number`);
      continue;
    }
    if (!isReachableEnvelopeValue(value, isTimeStage)) {
      errors.push(
        `${path}: ${label}.${stage} is ${value}, but the slider can only produce ${describeEnvelopeRange(isTimeStage)}`,
      );
    }
  }
}

export function validateTutorial(tutorial: Tutorial): string[] {
  const errors: string[] = [];
  const path = `tutorial ${tutorial.number ?? '?'}`;

  if (!Number.isInteger(tutorial.number) || tutorial.number < 1) {
    errors.push(`${path}: number must be a positive integer`);
  }
  for (const field of ['name', 'category', 'difficulty', 'text'] as const) {
    if (typeof tutorial[field] !== 'string' || tutorial[field].trim() === '') {
      errors.push(`${path}: ${field} must be a non-empty string`);
    }
  }
  if (!Number.isInteger(tutorial.pointsAvailable) || tutorial.pointsAvailable <= 0) {
    errors.push(`${path}: pointsAvailable must be a positive integer`);
  }

  const parameters = tutorial.synth?.parameters;
  if (!parameters) {
    errors.push(`${path}: synth.parameters is required`);
    return errors;
  }

  // The frontend's checkAnswer builds its comparison string stage by stage. Every
  // tutorial declares an oscillator so the list screen and the grader always have
  // at least one dimension to compare, and so a tutorial can never grade as
  // "correct" on an empty string.
  if (!parameters.oscillator) {
    errors.push(`${path}: synth.parameters.oscillator is required`);
  } else if (!oscillatorTypes.has(parameters.oscillator.type)) {
    errors.push(
      `${path}: oscillator.type "${parameters.oscillator.type}" is not offered by the Oscillator control (${[...oscillatorTypes].join(', ')})`,
    );
  }

  if (parameters.envelope) {
    validateEnvelope(parameters.envelope, 'envelope', path, errors);
  }
  if (parameters.filterEnvelope) {
    validateEnvelope(parameters.filterEnvelope, 'filterEnvelope', path, errors);
  }

  if (parameters.filter) {
    if (!filterTypes.has(parameters.filter.type)) {
      errors.push(
        `${path}: filter.type "${parameters.filter.type}" is not offered by the Filter Settings control (${[...filterTypes].join(', ')})`,
      );
    }
    if (
      !isOnStep(
        parameters.filter.frequency,
        FILTER_FREQUENCY_MIN,
        FILTER_FREQUENCY_MAX,
        FILTER_FREQUENCY_STEP,
      )
    ) {
      errors.push(
        `${path}: filter.frequency is ${parameters.filter.frequency}, but the cutoff slider only produces multiples of ${FILTER_FREQUENCY_STEP} from ${FILTER_FREQUENCY_MIN} to ${FILTER_FREQUENCY_MAX}`,
      );
    }
  }

  for (const field of ['note', 'duration', 'interval'] as const) {
    if (typeof tutorial.example?.[field] !== 'string' || tutorial.example[field].trim() === '') {
      errors.push(`${path}: example.${field} must be a non-empty string`);
    }
  }

  return errors;
}

export function validateTutorials(tutorials: Tutorial[]): string[] {
  const errors = tutorials.flatMap(validateTutorial);

  const numbers = tutorials.map((t) => t.number);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length > 0) {
    errors.push(`duplicate tutorial numbers: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Gaps would break the list screen's sequential progression.
  const sorted = [...numbers].sort((a, b) => a - b);
  sorted.forEach((n, index) => {
    if (n !== index + 1) {
      errors.push(
        `tutorial numbers must run 1..n with no gaps; found ${n} at position ${index + 1}`,
      );
    }
  });

  return errors;
}

export function assertValidTutorials(tutorials: Tutorial[]): void {
  const errors = validateTutorials(tutorials);
  if (errors.length > 0) {
    throw new Error(`Invalid tutorial content:\n  - ${errors.join('\n  - ')}`);
  }
}
