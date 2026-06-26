import type {
  MachineSpec,
  ProductionModeResult,
  RecipeMix,
  RecipeMixRecipeResult,
  RecipeMixSimulationOutcome,
  Scenario,
  UtilizationEntry,
  ValidationError,
} from '../domain/types';
import { simulate } from './simulate';

const EPSILON = 0.000001;
const ROBOT_RESOURCE_ID = 'robot';

interface WorkloadSummary {
  workloadByResource: Map<string, number>;
  templateByResource: Map<string, UtilizationEntry>;
}

export function simulateRecipeMix(
  machine: MachineSpec,
  recipeMix: RecipeMix,
  scenario: Scenario,
): RecipeMixSimulationOutcome {
  const errors: ValidationError[] = [];

  if (recipeMix.entries.length === 0) {
    errors.push({
      code: 'recipeMix.entriesRequired',
      field: 'recipeMix.entries',
      message: 'Recipe mix must include at least one recipe.',
    });
  }

  const percentageTotal = recipeMix.entries.reduce((total, entry, index) => {
    if (!Number.isFinite(entry.percentage) || entry.percentage < 0) {
      errors.push({
        code: 'recipeMix.entry.percentage',
        field: `recipeMix.entries.${index}.percentage`,
        message: 'Recipe mix percentages must be finite, non-negative numbers.',
      });
    }

    return total + entry.percentage;
  }, 0);

  if (Math.abs(percentageTotal - 100) > EPSILON) {
    errors.push({
      code: 'recipeMix.percentageTotal',
      field: 'recipeMix.entries',
      message: `Recipe mix percentages must total 100%. Current total is ${percentageTotal}%.`,
    });
  }

  const recipeResults: RecipeMixRecipeResult[] = [];

  recipeMix.entries.forEach((entry, index) => {
    if (entry.percentage <= 0) {
      return;
    }

    const outcome = simulate(machine, entry.recipe, scenario);
    if (!outcome.ok) {
      for (const error of outcome.errors) {
        errors.push({
          ...error,
          field: `recipeMix.entries.${index}.${error.field}`,
          message: `${entry.recipe.name || `Recipe ${index + 1}`}: ${error.message}`,
        });
      }
      return;
    }

    recipeResults.push({
      id: entry.id,
      recipeName: entry.recipe.name,
      percentage: entry.percentage,
      share: entry.percentage / 100,
      result: outcome.result,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const workloadSummary = summarizeWeightedWorkload(recipeResults);
  const randomCycleTimeSeconds = maxWorkload(workloadSummary.workloadByResource);
  const groupedCycleTimeSeconds = recipeResults.reduce(
    (total, recipeResult) => total + recipeResult.share * recipeResult.result.cycleTimeSeconds,
    0,
  );
  const weightedLeadTimeSeconds = recipeResults.reduce(
    (total, recipeResult) => total + recipeResult.share * recipeResult.result.oneBasketLeadTimeSeconds,
    0,
  );

  const randomMixed = productionModeResult(
    machine,
    workloadSummary,
    randomCycleTimeSeconds,
    weightedLeadTimeSeconds,
    scenario,
    bottlenecksForWorkload(workloadSummary, randomCycleTimeSeconds),
  );
  const groupedProduction = productionModeResult(
    machine,
    workloadSummary,
    groupedCycleTimeSeconds,
    weightedLeadTimeSeconds,
    scenario,
    groupedBottlenecks(recipeResults),
  );
  const throughputDeltaBasketsPerShift =
    randomMixed.basketsPerShift - groupedProduction.basketsPerShift;
  const throughputDeltaPercent =
    groupedProduction.basketsPerShift === 0
      ? 0
      : (throughputDeltaBasketsPerShift / groupedProduction.basketsPerShift) * 100;

  return {
    ok: true,
    result: {
      randomMixed,
      groupedProduction,
      recipeResults,
      throughputDeltaBasketsPerShift,
      throughputDeltaPercent,
    },
  };
}

function summarizeWeightedWorkload(recipeResults: RecipeMixRecipeResult[]): WorkloadSummary {
  const workloadByResource = new Map<string, number>();
  const templateByResource = new Map<string, UtilizationEntry>();

  for (const recipeResult of recipeResults) {
    for (const entry of recipeResult.result.utilization) {
      workloadByResource.set(
        entry.resourceId,
        (workloadByResource.get(entry.resourceId) ?? 0) + recipeResult.share * entry.workloadSeconds,
      );
      templateByResource.set(entry.resourceId, entry);
    }
  }

  return { workloadByResource, templateByResource };
}

function maxWorkload(workloadByResource: Map<string, number>): number {
  return Math.max(...workloadByResource.values());
}

function productionModeResult(
  machine: MachineSpec,
  workloadSummary: WorkloadSummary,
  cycleTimeSeconds: number,
  leadTimeSeconds: number,
  scenario: Scenario,
  bottlenecks: string[],
): ProductionModeResult {
  const basketsPerHour = 3600 / cycleTimeSeconds;

  return {
    effectiveCycleTimeSeconds: cycleTimeSeconds,
    taktTimeSeconds: cycleTimeSeconds,
    oneBasketLeadTimeSeconds: leadTimeSeconds,
    basketsPerHour,
    basketsPerShift: basketsPerHour * scenario.shiftLengthHours,
    bottlenecks,
    utilization: utilizationForCycleTime(machine, workloadSummary, cycleTimeSeconds),
  };
}

function utilizationForCycleTime(
  machine: MachineSpec,
  workloadSummary: WorkloadSummary,
  cycleTimeSeconds: number,
): UtilizationEntry[] {
  return Array.from(workloadSummary.workloadByResource.entries())
    .map(([resourceId, workloadSeconds]) => {
      const template = workloadSummary.templateByResource.get(resourceId);
      return {
        resourceId,
        label: template?.label ?? resourceId,
        kind: template?.kind ?? 'station',
        tankNumber: template?.tankNumber,
        workloadSeconds,
        utilizationPercent: (workloadSeconds / cycleTimeSeconds) * 100,
      };
    })
    .sort((left, right) => resourceOrder(machine, left.resourceId) - resourceOrder(machine, right.resourceId));
}

function bottlenecksForWorkload(
  workloadSummary: WorkloadSummary,
  cycleTimeSeconds: number,
): string[] {
  return Array.from(workloadSummary.workloadByResource.entries())
    .filter(([, workloadSeconds]) => Math.abs(workloadSeconds - cycleTimeSeconds) < EPSILON)
    .map(([resourceId]) => workloadSummary.templateByResource.get(resourceId)?.label ?? resourceId);
}

function groupedBottlenecks(recipeResults: RecipeMixRecipeResult[]): string[] {
  return recipeResults.flatMap((recipeResult) =>
    recipeResult.result.bottlenecks.map(
      (bottleneck) => `${recipeResult.recipeName}: ${bottleneck}`,
    ),
  );
}

function resourceOrder(machine: MachineSpec, resourceId: string): number {
  if (resourceId === ROBOT_RESOURCE_ID) {
    return Number.MAX_SAFE_INTEGER;
  }

  const tankNumber = Number(resourceId.replace('tank:', ''));
  const stationIndex = machine.stations.findIndex((station) => station.tankNumber === tankNumber);

  if (stationIndex >= 0) {
    return stationIndex;
  }

  return Number.MAX_SAFE_INTEGER - 1;
}
