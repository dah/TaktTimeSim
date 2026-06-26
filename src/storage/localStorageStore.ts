import type { Recipe, RecipeMix, Scenario } from '../domain/types';

export const RECIPE_DRAFT_KEY = 'takttimesim.v1.recipeDraft';
export const RECIPE_MIX_DRAFT_KEY = 'takttimesim.v1.recipeMixDraft';
export const SCENARIO_DRAFT_KEY = 'takttimesim.v1.scenarioDraft';

export interface SaveResult {
  ok: boolean;
  message?: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadRecipeDraft(
  storage: StorageLike | undefined,
  fallbackRecipe: Recipe,
  machineName: string,
): Recipe {
  const stored = readJson(storage, RECIPE_DRAFT_KEY);

  if (isRecipe(stored) && stored.machineName === machineName) {
    return cloneRecipe(stored);
  }

  return cloneRecipe(fallbackRecipe);
}

export function loadRecipeMixDraft(
  storage: StorageLike | undefined,
  fallbackRecipe: Recipe,
  machineName: string,
): RecipeMix {
  const stored = readJson(storage, RECIPE_MIX_DRAFT_KEY);

  if (isRecipeMix(stored) && stored.entries.some((entry) => entry.recipe.machineName === machineName)) {
    return cloneRecipeMix({
      entries: stored.entries.filter((entry) => entry.recipe.machineName === machineName),
    });
  }

  return {
    entries: [
      {
        id: 'recipe-1',
        recipe: loadRecipeDraft(storage, fallbackRecipe, machineName),
        percentage: 100,
      },
    ],
  };
}

export function loadScenarioDraft(
  storage: StorageLike | undefined,
  fallbackScenario: Scenario,
): Scenario {
  const stored = readJson(storage, SCENARIO_DRAFT_KEY);

  if (isScenario(stored)) {
    return { ...stored };
  }

  return { ...fallbackScenario };
}

export function saveRecipeDraft(
  storage: StorageLike | undefined,
  recipe: Recipe,
): SaveResult {
  if (!isRecipe(recipe)) {
    return { ok: false, message: 'Recipe draft is not valid enough to save.' };
  }

  return writeJson(storage, RECIPE_DRAFT_KEY, recipe);
}

export function saveRecipeMixDraft(
  storage: StorageLike | undefined,
  recipeMix: RecipeMix,
): SaveResult {
  if (!isRecipeMix(recipeMix)) {
    return { ok: false, message: 'Recipe mix draft is not valid enough to save.' };
  }

  return writeJson(storage, RECIPE_MIX_DRAFT_KEY, recipeMix);
}

export function saveScenarioDraft(
  storage: StorageLike | undefined,
  scenario: Scenario,
): SaveResult {
  if (!isScenario(scenario)) {
    return { ok: false, message: 'Scenario draft is not valid enough to save.' };
  }

  return writeJson(storage, SCENARIO_DRAFT_KEY, scenario);
}

function readJson(storage: StorageLike | undefined, key: string): unknown {
  if (!storage) {
    return undefined;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(storage: StorageLike | undefined, key: string, value: unknown): SaveResult {
  if (!storage) {
    return { ok: false, message: 'localStorage is not available.' };
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to save draft.',
    };
  }
}

function isRecipeMix(value: unknown): value is RecipeMix {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isRecipeMixEntry)
  );
}

function isRecipeMixEntry(value: unknown): value is RecipeMix['entries'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.percentage === 'number' &&
    Number.isFinite(value.percentage) &&
    value.percentage >= 0 &&
    isRecipe(value.recipe)
  );
}

function isRecipe(value: unknown): value is Recipe {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.machineName === 'string' &&
    Array.isArray(value.stages) &&
    value.stages.every(isRecipeStage)
  );
}

function isRecipeStage(value: unknown): value is Recipe['stages'][number] {
  return (
    isRecord(value) &&
    Number.isInteger(value.tankNumber) &&
    typeof value.processTimeSeconds === 'number' &&
    Number.isFinite(value.processTimeSeconds)
  );
}

function isScenario(value: unknown): value is Scenario {
  return (
    isRecord(value) &&
    typeof value.moveTimeSeconds === 'number' &&
    Number.isFinite(value.moveTimeSeconds) &&
    value.moveTimeSeconds >= 0 &&
    typeof value.shiftLengthHours === 'number' &&
    Number.isFinite(value.shiftLengthHours) &&
    value.shiftLengthHours > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneRecipeMix(recipeMix: RecipeMix): RecipeMix {
  return {
    entries: recipeMix.entries.map((entry) => ({
      ...entry,
      recipe: cloneRecipe(entry.recipe),
    })),
  };
}

function cloneRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    stages: recipe.stages.map((stage) => ({ ...stage })),
  };
}
