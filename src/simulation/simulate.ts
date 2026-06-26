import type {
  MachineSpec,
  MachineStation,
  Recipe,
  Scenario,
  SimulationOutcome,
  UtilizationEntry,
  ValidationError,
} from '../domain/types';

const EPSILON = 0.000001;
const TIMER_PAUSE_POLICIES = new Set(['none', 'pauseOnEntryOrExitMove']);

interface RecipeMove {
  fromTankNumber: number;
  toTankNumber: number;
}

export function simulate(
  machine: MachineSpec,
  recipe: Recipe,
  scenario: Scenario,
): SimulationOutcome {
  const errors: ValidationError[] = [];
  const stationByTank = new Map<number, MachineStation>();

  validateMachine(machine, errors, stationByTank);
  validateScenario(scenario, errors);

  const unloadStations = machine.stations.filter(
    (station) => station.name.trim().toLowerCase() === 'unload',
  );

  if (unloadStations.length !== 1) {
    errors.push({
      code: 'machine.unloadStationCount',
      field: 'machine.stations',
      message: `Expected exactly one station named Unload, found ${unloadStations.length}.`,
    });
  }

  const unloadStation = unloadStations[0];

  validateRecipe(machine, recipe, scenario, errors, stationByTank, unloadStation);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const moveCount = recipe.stages.length;
  const moves = buildRecipeMoves(recipe, unloadStation.tankNumber);
  const stationWorkloads = new Map<number, number>();

  for (const stage of recipe.stages) {
    const current = stationWorkloads.get(stage.tankNumber) ?? 0;
    stationWorkloads.set(stage.tankNumber, current + stage.processTimeSeconds);
  }

  const utilization: UtilizationEntry[] = Array.from(stationWorkloads.entries())
    .map(([tankNumber, totalProcessTime]) => {
      const station = stationByTank.get(tankNumber);
      if (!station) {
        return undefined;
      }

      const baseWorkloadSeconds = totalProcessTime / station.numberOfPositions;
      const pauseSeconds = stationPauseSeconds(
        station,
        moves,
        scenario.moveTimeSeconds,
        totalProcessTime,
      );

      return {
        resourceId: `tank:${station.tankNumber}`,
        label: stationLabel(station),
        kind: 'station' as const,
        tankNumber: station.tankNumber,
        workloadSeconds: baseWorkloadSeconds + pauseSeconds,
        utilizationPercent: 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  utilization.push({
    resourceId: 'robot',
    label: 'Robot',
    kind: 'robot',
    workloadSeconds: (moveCount * scenario.moveTimeSeconds) / machine.robot.numberOfArms,
    utilizationPercent: 0,
  });

  const cycleTimeSeconds = Math.max(...utilization.map((entry) => entry.workloadSeconds));

  if (!Number.isFinite(cycleTimeSeconds) || cycleTimeSeconds <= 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'simulation.zeroWorkload',
          field: 'recipe.stages',
          message: 'At least one station or robot workload must be greater than zero.',
        },
      ],
    };
  }

  for (const entry of utilization) {
    entry.utilizationPercent = (entry.workloadSeconds / cycleTimeSeconds) * 100;
  }

  const totalProcessTime = recipe.stages.reduce(
    (total, stage) => total + stage.processTimeSeconds,
    0,
  );
  const oneBasketLeadTimeSeconds = totalProcessTime + moveCount * scenario.moveTimeSeconds;
  const basketsPerHour = 3600 / cycleTimeSeconds;
  const basketsPerShift = basketsPerHour * scenario.shiftLengthHours;
  const bottlenecks = utilization
    .filter((entry) => Math.abs(entry.workloadSeconds - cycleTimeSeconds) < EPSILON)
    .map((entry) => entry.label);

  return {
    ok: true,
    result: {
      cycleTimeSeconds,
      taktTimeSeconds: cycleTimeSeconds,
      oneBasketLeadTimeSeconds,
      basketsPerHour,
      basketsPerShift,
      bottlenecks,
      utilization,
      moveCount,
      unloadTankNumber: unloadStation.tankNumber,
    },
  };
}

function validateMachine(
  machine: MachineSpec,
  errors: ValidationError[],
  stationByTank: Map<number, MachineStation>,
): void {
  if (!machine.machineName.trim()) {
    errors.push({
      code: 'machine.machineNameRequired',
      field: 'machine.machineName',
      message: 'Machine name is required.',
    });
  }

  if (!Number.isFinite(machine.robot.numberOfArms) || machine.robot.numberOfArms <= 0) {
    errors.push({
      code: 'machine.robot.numberOfArms',
      field: 'machine.robot.numberOfArms',
      message: 'Robot number of arms must be greater than zero.',
    });
  }

  if (
    !Number.isFinite(machine.robot.reachableTankNumbers.from) ||
    !Number.isFinite(machine.robot.reachableTankNumbers.to) ||
    machine.robot.reachableTankNumbers.from > machine.robot.reachableTankNumbers.to
  ) {
    errors.push({
      code: 'machine.robot.reachableTankNumbers',
      field: 'machine.robot.reachableTankNumbers',
      message: 'Robot reachable tank range must be finite and ordered.',
    });
  }

  for (const station of machine.stations) {
    if (stationByTank.has(station.tankNumber)) {
      errors.push({
        code: 'machine.station.duplicateTank',
        field: 'machine.stations',
        message: `Tank ${station.tankNumber} is defined more than once.`,
      });
    }

    stationByTank.set(station.tankNumber, station);

    if (!Number.isFinite(station.numberOfPositions) || station.numberOfPositions <= 0) {
      errors.push({
        code: 'machine.station.numberOfPositions',
        field: `machine.stations.${station.tankNumber}.numberOfPositions`,
        message: `Station ${stationLabel(station)} must have at least one position.`,
      });
    }

    if (
      station.timerPausePolicy !== undefined &&
      !TIMER_PAUSE_POLICIES.has(station.timerPausePolicy)
    ) {
      errors.push({
        code: 'machine.station.timerPausePolicy',
        field: `machine.stations.${station.tankNumber}.timerPausePolicy`,
        message: `Station ${stationLabel(station)} has an unsupported timer pause policy.`,
      });
    }
  }
}

function validateScenario(
  scenario: Scenario,
  errors: ValidationError[],
): void {
  if (!Number.isFinite(scenario.moveTimeSeconds) || scenario.moveTimeSeconds < 0) {
    errors.push({
      code: 'scenario.moveTimeSeconds',
      field: 'scenario.moveTimeSeconds',
      message: 'Move time must be a finite, non-negative number of seconds.',
    });
  }

  if (!Number.isFinite(scenario.shiftLengthHours) || scenario.shiftLengthHours <= 0) {
    errors.push({
      code: 'scenario.shiftLengthHours',
      field: 'scenario.shiftLengthHours',
      message: 'Shift length must be a finite number of hours greater than zero.',
    });
  }
}

function validateRecipe(
  machine: MachineSpec,
  recipe: Recipe,
  scenario: Scenario,
  errors: ValidationError[],
  stationByTank: Map<number, MachineStation>,
  unloadStation?: MachineStation,
): void {
  if (!recipe.name.trim()) {
    errors.push({
      code: 'recipe.nameRequired',
      field: 'recipe.name',
      message: 'Recipe name is required.',
    });
  }

  if (recipe.machineName !== machine.machineName) {
    errors.push({
      code: 'recipe.machineMismatch',
      field: 'recipe.machineName',
      message: `Recipe targets ${recipe.machineName}, but the selected machine is ${machine.machineName}.`,
    });
  }

  if (recipe.stages.length === 0) {
    errors.push({
      code: 'recipe.stagesRequired',
      field: 'recipe.stages',
      message: 'Recipe must include at least the fixed load stage at tank 0.',
    });
    return;
  }

  if (recipe.stages[0].tankNumber !== 0) {
    errors.push({
      code: 'recipe.firstStageTank',
      field: 'recipe.stages.0.tankNumber',
      message: 'The first recipe stage must be tank 0.',
    });
  }

  for (const [index, stage] of recipe.stages.entries()) {
    const fieldPrefix = `recipe.stages.${index}`;

    if (!Number.isInteger(stage.tankNumber)) {
      errors.push({
        code: 'recipe.stage.tankInteger',
        field: `${fieldPrefix}.tankNumber`,
        message: 'Stage tank number must be an integer.',
      });
      continue;
    }

    if (!isReachable(machine, stage.tankNumber)) {
      errors.push({
        code: 'recipe.stage.tankUnreachable',
        field: `${fieldPrefix}.tankNumber`,
        message: `Tank ${stage.tankNumber} is outside the robot reachable range.`,
      });
    }

    if (!stationByTank.has(stage.tankNumber)) {
      errors.push({
        code: 'recipe.stage.stationMissing',
        field: `${fieldPrefix}.tankNumber`,
        message: `Tank ${stage.tankNumber} is not defined in the machine stations.`,
      });
    }

    if (unloadStation && stage.tankNumber === unloadStation.tankNumber) {
      errors.push({
        code: 'recipe.stage.unloadNotEditable',
        field: `${fieldPrefix}.tankNumber`,
        message: 'Unload is handled by simulation and must not be an editable recipe stage.',
      });
    }

    if (!Number.isFinite(stage.processTimeSeconds) || stage.processTimeSeconds < 0) {
      errors.push({
        code: 'recipe.stage.processTimeSeconds',
        field: `${fieldPrefix}.processTimeSeconds`,
        message: 'Process time must be a finite, non-negative number of seconds.',
      });
    }
  }

  if (unloadStation && !isReachable(machine, unloadStation.tankNumber)) {
    errors.push({
      code: 'machine.unloadUnreachable',
      field: 'machine.stations',
      message: `Unload tank ${unloadStation.tankNumber} is outside the robot reachable range.`,
    });
  }

  if (scenario.moveTimeSeconds === 0) {
    // Zero move time is valid; this branch documents that the zero-workload
    // check after workload construction handles all-zero recipes.
  }
}

function buildRecipeMoves(recipe: Recipe, unloadTankNumber: number): RecipeMove[] {
  return recipe.stages.map((stage, index) => ({
    fromTankNumber: stage.tankNumber,
    toTankNumber: recipe.stages[index + 1]?.tankNumber ?? unloadTankNumber,
  }));
}

function stationPauseSeconds(
  station: MachineStation,
  moves: RecipeMove[],
  moveTimeSeconds: number,
  totalProcessTime: number,
): number {
  if (
    totalProcessTime <= 0 ||
    station.timerPausePolicy !== 'pauseOnEntryOrExitMove' ||
    moveTimeSeconds === 0
  ) {
    return 0;
  }

  const boundaryMoveCount = moves.filter(
    (move) =>
      (move.fromTankNumber === station.tankNumber) !==
      (move.toTankNumber === station.tankNumber),
  ).length;

  return boundaryMoveCount * moveTimeSeconds;
}

function isReachable(machine: MachineSpec, tankNumber: number): boolean {
  return (
    tankNumber >= machine.robot.reachableTankNumbers.from &&
    tankNumber <= machine.robot.reachableTankNumbers.to
  );
}

function stationLabel(station: MachineStation): string {
  return `${station.name} (tank ${station.tankNumber})`;
}
