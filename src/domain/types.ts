export interface TankRange {
  from: number;
  to: number;
}

export interface RobotSpec {
  numberOfArms: number;
  basketCapacity: number;
  reachableTankNumbers: TankRange;
}

export interface MachineStation {
  tankNumber: number;
  name: string;
  numberOfPositions: number;
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
  label: string;
  kind: 'station' | 'robot';
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

export type SimulationOutcome =
  | { ok: true; result: SimulationResult }
  | { ok: false; errors: ValidationError[] };
