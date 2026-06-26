import { describe, expect, it } from 'vitest';
import type { MachineSpec, Recipe, Scenario } from '../domain/types';
import { simulate } from './simulate';

const scenario: Scenario = {
  moveTimeSeconds: 10,
  shiftLengthHours: 8,
};

function baseMachine(): MachineSpec {
  return {
    machineName: 'U50',
    robot: {
      numberOfArms: 1,
      basketCapacity: 1,
      reachableTankNumbers: {
        from: 0,
        to: 15,
      },
    },
    stations: [
      { tankNumber: 0, name: 'Load', numberOfPositions: 5 },
      { tankNumber: 1, name: 'Etch', numberOfPositions: 2 },
      { tankNumber: 2, name: 'Rinse', numberOfPositions: 1 },
      { tankNumber: 15, name: 'Unload', numberOfPositions: 5 },
    ],
  };
}

function baseRecipe(): Recipe {
  return {
    name: 'Example U50 Recipe',
    machineName: 'U50',
    stages: [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber: 1, processTimeSeconds: 300 },
    ],
  };
}

function ovenPauseMachine(): MachineSpec {
  return {
    ...baseMachine(),
    stations: [
      { tankNumber: 0, name: 'Load', numberOfPositions: 5 },
      { tankNumber: 1, name: 'Etch', numberOfPositions: 1 },
      { tankNumber: 2, name: 'Rinse', numberOfPositions: 1 },
      {
        tankNumber: 6,
        name: 'Oven',
        numberOfPositions: 5,
        timerPausePolicy: 'pauseOnEntryOrExitMove',
      },
      { tankNumber: 15, name: 'Unload', numberOfPositions: 5 },
    ],
  };
}

describe('simulate', () => {
  it('simulates the example U50 recipe', () => {
    const outcome = simulate(baseMachine(), baseRecipe(), scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.cycleTimeSeconds).toBe(150);
    expect(outcome.result.taktTimeSeconds).toBe(150);
    expect(outcome.result.oneBasketLeadTimeSeconds).toBe(320);
    expect(outcome.result.basketsPerHour).toBe(24);
    expect(outcome.result.basketsPerShift).toBe(192);
    expect(outcome.result.bottlenecks).toEqual(['Etch (tank 1)']);
  });

  it('detects unload station names case-insensitively', () => {
    const machine = baseMachine();
    machine.stations = machine.stations.map((station) =>
      station.tankNumber === 15 ? { ...station, name: 'unload' } : station,
    );

    const outcome = simulate(machine, baseRecipe(), scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.unloadTankNumber).toBe(15);
  });

  it('rejects recipes whose first stage is not tank 0', () => {
    const recipe = baseRecipe();
    recipe.stages[0] = { tankNumber: 1, processTimeSeconds: 300 };

    const outcome = simulate(baseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain('recipe.firstStageTank');
  });

  it('rejects unload as an editable recipe stage', () => {
    const recipe = baseRecipe();
    recipe.stages.push({ tankNumber: 15, processTimeSeconds: 10 });

    const outcome = simulate(baseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain('recipe.stage.unloadNotEditable');
  });

  it('rejects missing stations referenced by recipe stages', () => {
    const recipe = baseRecipe();
    recipe.stages.push({ tankNumber: 3, processTimeSeconds: 10 });

    const outcome = simulate(baseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain('recipe.stage.stationMissing');
  });

  it('applies station capacity to station workload', () => {
    const outcome = simulate(baseMachine(), baseRecipe(), scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const etch = outcome.result.utilization.find((entry) => entry.label === 'Etch (tank 1)');
    const robot = outcome.result.utilization.find((entry) => entry.label === 'Robot');
    expect(etch?.resourceId).toBe('tank:1');
    expect(etch?.tankNumber).toBe(1);
    expect(etch?.workloadSeconds).toBe(150);
    expect(robot?.resourceId).toBe('robot');
  });

  it('reports the robot as the bottleneck when move workload is highest', () => {
    const outcome = simulate(baseMachine(), baseRecipe(), {
      moveTimeSeconds: 200,
      shiftLengthHours: 8,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.cycleTimeSeconds).toBe(400);
    expect(outcome.result.bottlenecks).toEqual(['Robot']);
  });

  it('counts one move per recipe stage including the final unload move', () => {
    const recipe = baseRecipe();
    recipe.stages.push({ tankNumber: 2, processTimeSeconds: 30 });

    const outcome = simulate(baseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.moveCount).toBe(3);
    expect(outcome.result.oneBasketLeadTimeSeconds).toBe(360);
  });

  it('rejects all-zero station and robot workload instead of returning infinite throughput', () => {
    const recipe = baseRecipe();
    recipe.stages = recipe.stages.map((stage) => ({ ...stage, processTimeSeconds: 0 }));

    const outcome = simulate(baseMachine(), recipe, {
      moveTimeSeconds: 0,
      shiftLengthHours: 8,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain('simulation.zeroWorkload');
  });

  it('adds oven countdown pause for moves entering and exiting the oven', () => {
    const recipe = baseRecipe();
    recipe.stages = [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber: 6, processTimeSeconds: 300 },
      { tankNumber: 2, processTimeSeconds: 0 },
    ];

    const outcome = simulate(ovenPauseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const oven = outcome.result.utilization.find((entry) => entry.label === 'Oven (tank 6)');
    expect(oven?.workloadSeconds).toBe(80);
    expect(outcome.result.cycleTimeSeconds).toBe(80);
    expect(outcome.result.bottlenecks).toEqual(['Oven (tank 6)']);
  });

  it('counts the final unload move as an oven exit pause', () => {
    const recipe = baseRecipe();
    recipe.stages = [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber: 6, processTimeSeconds: 300 },
    ];

    const outcome = simulate(ovenPauseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const oven = outcome.result.utilization.find((entry) => entry.label === 'Oven (tank 6)');
    expect(oven?.workloadSeconds).toBe(80);
  });

  it('does not add oven pause time to outside station workloads', () => {
    const recipe = baseRecipe();
    recipe.stages = [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber: 1, processTimeSeconds: 100 },
      { tankNumber: 6, processTimeSeconds: 300 },
      { tankNumber: 2, processTimeSeconds: 0 },
    ];

    const outcome = simulate(ovenPauseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const etch = outcome.result.utilization.find((entry) => entry.label === 'Etch (tank 1)');
    const oven = outcome.result.utilization.find((entry) => entry.label === 'Oven (tank 6)');
    expect(etch?.workloadSeconds).toBe(100);
    expect(oven?.workloadSeconds).toBe(80);
  });

  it('does not count internal oven-to-oven moves as entry or exit pauses', () => {
    const recipe = baseRecipe();
    recipe.stages = [
      { tankNumber: 0, processTimeSeconds: 0 },
      { tankNumber: 6, processTimeSeconds: 100 },
      { tankNumber: 6, processTimeSeconds: 50 },
      { tankNumber: 2, processTimeSeconds: 0 },
    ];

    const outcome = simulate(ovenPauseMachine(), recipe, scenario);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const oven = outcome.result.utilization.find((entry) => entry.label === 'Oven (tank 6)');
    expect(oven?.workloadSeconds).toBe(50);
  });

  it('rejects unsupported station timer pause policies', () => {
    const machine = ovenPauseMachine();
    machine.stations[3] = {
      ...machine.stations[3],
      timerPausePolicy: 'badPolicy' as MachineSpec['stations'][number]['timerPausePolicy'],
    };

    const outcome = simulate(machine, baseRecipe(), scenario);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.map((error) => error.code)).toContain(
      'machine.station.timerPausePolicy',
    );
  });
});
