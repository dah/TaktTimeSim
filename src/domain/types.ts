export interface TankRange {
  from: number;
  to: number;
}

export interface RobotSpec {
  numberOfArms: number;
  basketCapacity: number;
  reachableTankNumbers: TankRange;
}

export type StationTimerPausePolicy = 'none' | 'pauseOnEntryOrExitMove';

export interface MachineStation {
  tankNumber: number;
  name: string;
  numberOfPositions: number;
  timerPausePolicy?: StationTimerPausePolicy;
}

export interface MachineSpec {
  machineName: string;
  robot: RobotSpec;
  stations: MachineStation[];
}

export interface RecipeStage {
  tankNumber: number;
  processTimeSeconds: number;
}

export interface Recipe {
  name: string;
  machineName: string;
  stages: RecipeStage[];
}

export interface SavedRecipe extends Recipe {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeMixEntry {
  id: string;
  recipe: Recipe;
  percentage: number;
}

export interface RecipeMix {
  entries: RecipeMixEntry[];
}

export interface Scenario {
  moveTimeSeconds: number;
  shiftLengthHours: number;
}

export interface ValidationError {
  code: string;
  field: string;
  message: string;
}

export interface UtilizationEntry {
  resourceId: string;
  label: string;
  kind: 'station' | 'robot';
  tankNumber?: number;
  workloadSeconds: number;
  utilizationPercent: number;
}

export interface SimulationResult {
  cycleTimeSeconds: number;
  taktTimeSeconds: number;
  oneBasketLeadTimeSeconds: number;
  basketsPerHour: number;
  basketsPerShift: number;
  bottlenecks: string[];
  utilization: UtilizationEntry[];
  moveCount: number;
  unloadTankNumber: number;
}

export interface ProductionModeResult {
  effectiveCycleTimeSeconds: number;
  taktTimeSeconds: number;
  oneBasketLeadTimeSeconds: number;
  basketsPerHour: number;
  basketsPerShift: number;
  bottlenecks: string[];
  utilization: UtilizationEntry[];
}

export interface RecipeMixRecipeResult {
  id: string;
  recipeName: string;
  percentage: number;
  share: number;
  result: SimulationResult;
}

export interface RecipeMixResult {
  mixedProduction: ProductionModeResult;
  recipeResults: RecipeMixRecipeResult[];
}

export type SimulationOutcome =
  | { ok: true; result: SimulationResult }
  | { ok: false; errors: ValidationError[] };

export type RecipeMixSimulationOutcome =
  | { ok: true; result: RecipeMixResult }
  | { ok: false; errors: ValidationError[] };
