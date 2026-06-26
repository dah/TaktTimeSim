import { describe, expect, it } from 'vitest';
import type { MachineSpec, Recipe, RecipeMix, Scenario } from '../domain/types';
import { simulateRecipeMix } from './simulateRecipeMix';

const scenario: Scenario = {
  moveTimeSeconds: 0,
  shiftLengthHours: 1,
};

function machine(): MachineSpec {
  return {
    machineName: 'U50',
    robot: {
      numberOfArms: 1,
      basketCapacity: 1,
      reachableTankNumbers: { from: 0, to: 15 },
    },
    stations: [
      { tankNumber: 0, name: 'Load', numberOfPositions: 1 },
      { tankNumber: 1, name: 'Etch', numberOfPositions: 1 },
      { tankNumber: 2, name: 'Rinse', numberOfPositions: 1 },
      { tankNumber: 15, name: 'Unload', numberOfPositions: 1 },
    ],
  };
}

function recipe(name: string, tankNumber: number, processTimeSeconds: number): Recipe {
  return {
    name,
    machineName: 'U50',
    stages: [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber, processTimeSeconds },
    ],
  };
}

function mix(entries: RecipeMix['entries']): RecipeMix {
  return { entries };
}

describe('simulateRecipeMix', () => {
  it('calculates mixed production from weighted resource workloads', () => {
    const outcome = simulateRecipeMix(
      machine(),
      mix([
        { id: 'a', recipe: recipe('Etch heavy', 1, 100), percentage: 50 },
        { id: 'b', recipe: recipe('Rinse heavy', 2, 100), percentage: 50 },
      ]),
      scenario,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.mixedProduction.effectiveCycleTimeSeconds).toBe(50);
    expect(outcome.result.mixedProduction.basketsPerShift).toBe(72);
    expect(outcome.result.mixedProduction.bottlenecks).toEqual(['Etch (tank 1)', 'Rinse (tank 2)']);
  });

  it('keeps the shared bottleneck when recipes use the same limiting station', () => {
    const outcome = simulateRecipeMix(
      machine(),
      mix([
        { id: 'a', recipe: recipe('Etch A', 1, 100), percentage: 25 },
        { id: 'b', recipe: recipe('Etch B', 1, 100), percentage: 75 },
      ]),
      scenario,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.mixedProduction.effectiveCycleTimeSeconds).toBe(100);
    expect(outcome.result.mixedProduction.bottlenecks).toEqual(['Etch (tank 1)']);
  });

  it('rejects percentage totals that do not equal 100', () => {
    const outcome = simulateRecipeMix(
      machine(),
      mix([{ id: 'a', recipe: recipe('Etch', 1, 100), percentage: 50 }]),
      scenario,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain('recipeMix.percentageTotal');
  });

  it('ignores invalid draft recipes at 0%', () => {
    const invalidRecipe = recipe('', 99, 100);

    const outcome = simulateRecipeMix(
      machine(),
      mix([
        { id: 'a', recipe: recipe('Etch', 1, 100), percentage: 100 },
        { id: 'b', recipe: invalidRecipe, percentage: 0 },
      ]),
      scenario,
    );

    expect(outcome.ok).toBe(true);
  });

  it('prefixes active recipe validation errors with the mix entry path', () => {
    const outcome = simulateRecipeMix(
      machine(),
      mix([{ id: 'a', recipe: recipe('Bad', 99, 100), percentage: 100 }]),
      scenario,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.some((error) => error.field.startsWith('recipeMix.entries.0.'))).toBe(true);
    expect(outcome.errors.map((error) => error.code)).toContain('recipe.stage.stationMissing');
  });
});
