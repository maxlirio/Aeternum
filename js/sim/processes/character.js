// The character's body over time — closed-form, so an 8-hour rest is the same whether
// computed in one step or 480.  fatigue ∈ [0,1], fitness ∈ [0,1].
import { planetHours } from '../clock.js';

const AWAKE_RATE = 1 / 18;      // fatigue per planet-hour awake
const REST_TAU = 3;             // planet-hours e-folding while resting
const TRAIN_TAU = 400;          // planet-hours of training to close 63% of the fitness gap
const TRAIN_TIRE = 1 / 9;       // training tires you faster than idling
const ROUTINE = 0.35, ROUTINE_TAU = 12;   // working days and nights' sleep settle fatigue here

export const ACTIVITIES = {
  rest: { label: 'Rest at home', desc: 'Sleep and recover. Fatigue falls.' },
  train: { label: 'Train', desc: 'Exercise. Fitness rises slowly; you come back tired.' },
  travel: { label: 'Walk home', desc: 'Your character walks home and rests once there.' },
  work: { label: 'Keep your routine', desc: 'Go to every shift, sleep at home in between. You are paid for the hours worked.', needsJob: true },
  idle: { label: 'Stay here', desc: 'Remain where you are, awake.' },
};

export function advanceBody(p, activity, seconds, planet) {
  const h = planetHours(planet, seconds);
  if (activity === 'rest') p.fatigue = p.fatigue * Math.exp(-h / REST_TAU);
  else if (activity === 'train') {
    p.fitness = 1 - (1 - p.fitness) * Math.exp(-h / TRAIN_TAU);
    p.fatigue = 1 - (1 - p.fatigue) * Math.exp(-h * TRAIN_TIRE);
  } else if (activity === 'routine') p.fatigue = ROUTINE + (p.fatigue - ROUTINE) * Math.exp(-h / ROUTINE_TAU);
  else p.fatigue = 1 - (1 - p.fatigue) * Math.exp(-h * AWAKE_RATE);
  return p;
}

export const moveSpeedFactor = p => (0.85 + 0.3 * p.fitness) * (p.fatigue > 0.8 ? 0.7 : 1);
