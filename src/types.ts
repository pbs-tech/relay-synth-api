/**
 * Domain types for Relay Synth.
 *
 * The parameter unions below are deliberately narrow: they describe exactly the
 * values the Vue frontend is able to produce. Anything outside them would make a
 * tutorial unsolvable, because the frontend grades an answer by string-comparing
 * the player's synth settings against the tutorial's. See README > Authoring tutorials.
 */

/** Waveforms offered by the Oscillator control (SynthMixin.setOscillator). */
export const OSCILLATOR_TYPES = ['triangle', 'sine', 'sawtooth', 'square'] as const;
export type OscillatorType = (typeof OSCILLATOR_TYPES)[number];

/** Filter types offered by the Filter Settings control (FilterMixin.setFilterType). */
export const FILTER_TYPES = ['bandpass', 'lowpass', 'highpass'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

/**
 * Envelope sliders (UIMixin.createEnvelopeSlider) run min 0, max 1, step 0.05,
 * so a player can only land on a multiple of 0.05.
 *
 * Decay and release additionally coerce a slider value of 0 up to 0.01, because
 * a zero-length stage would click (see EnvelopeMixin / FilterEnvelopeMixin). So
 * 0 is reachable for attack and sustain but becomes 0.01 for decay and release.
 */
export const ENVELOPE_STEP = 0.05;
export const ENVELOPE_MIN = 0;
export const ENVELOPE_MAX = 1;
/** What a slider value of 0 becomes for the time-based stages. */
export const ENVELOPE_MIN_TIME = 0.01;

/**
 * The cutoff slider (UIMixin.createFilterCutoffSlider) runs 1000..20000 in steps
 * of 1000. It went unwired for a long time, pinning every player's cutoff at
 * 5000Hz; tutorials authored during that period all use 5000, which remains a
 * valid step on the slider.
 */
export const FILTER_FREQUENCY_MIN = 1000;
export const FILTER_FREQUENCY_MAX = 20000;
export const FILTER_FREQUENCY_STEP = 1000;

export interface AdsrEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface SynthParameters {
  oscillator?: { type: OscillatorType };
  envelope?: AdsrEnvelope;
  filter?: { type: FilterType; frequency: number };
  filterEnvelope?: AdsrEnvelope;
}

export interface Synth {
  polyphony: number;
  /** Key into the frontend's SynthTypes map: "Synth" or "Mono Synth". */
  type: string;
  parameters: SynthParameters;
}

export interface Example {
  note: string;
  duration: string;
  interval: string;
}

export interface Tutorial {
  number: number;
  name: string;
  category: string;
  difficulty: string;
  pointsAvailable: number;
  text: string;
  synth: Synth;
  example: Example;
}

/** The trimmed projection used by the tutorial list screen. */
export type TutorialTitle = Pick<
  Tutorial,
  'number' | 'name' | 'category' | 'difficulty' | 'pointsAvailable'
>;

export interface UserProfile {
  userId: string;
  email: string | null;
  displayName: string;
  totalScore: number;
  tutorialsCompleted: number[];
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  displayName: string;
  totalScore: number;
  tutorialsCompleted: number[];
}
