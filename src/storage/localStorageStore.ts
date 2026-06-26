import type { Recipe, SavedRecipe, Scenario } from '../domain/types';

export const RECIPE_DRAFT_KEY = 'takttimesim.v1.recipeDraft';
export const SCENARIO_DRAFT_KEY = 'takttimesim.v1.scenarioDraft';
export const SAVED_RECIPES_KEY = 'takttimesim.v1.savedRecipes';

export interface SaveResult {
  ok: boolean;
  message?: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

interface SavedRecipesEnvelope {
  version: 1;
  recipes: SavedRecipe[];
}

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

export function loadSavedRecipes(storage: StorageLike | undefined): SavedRecipe[] {
  const stored = readJson(storage, SAVED_RECIPES_KEY);
  const entries = savedRecipeEntries(stored);
  const deduped = new Map<string, SavedRecipe>();

  for (const entry of entries) {
    if (!isSavedRecipe(entry)) {
      continue;
    }

    const savedRecipe = cloneSavedRecipe(entry);
    const existing = deduped.get(savedRecipe.id);

    if (!existing || Date.parse(savedRecipe.updatedAt) >= Date.parse(existing.updatedAt)) {
      deduped.set(savedRecipe.id, savedRecipe);
    }
  }

  return Array.from(deduped.values());
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

export function saveScenarioDraft(
  storage: StorageLike | undefined,
  scenario: Scenario,
): SaveResult {
  if (!isScenario(scenario)) {
    return { ok: false, message: 'Scenario draft is not valid enough to save.' };
  }

  return writeJson(storage, SCENARIO_DRAFT_KEY, scenario);
}

export function saveSavedRecipes(
  storage: StorageLike | undefined,
  recipes: SavedRecipe[],
): SaveResult {
  if (!recipes.every(isSavedRecipe)) {
    return { ok: false, message: 'Saved recipes contain invalid entries.' };
  }

  const envelope: SavedRecipesEnvelope = {
    version: 1,
    recipes: recipes.map(cloneSavedRecipe),
  };

  return writeJson(storage, SAVED_RECIPES_KEY, envelope);
}

export function makeSavedRecipe(
  recipe: Recipe,
  timestamp = new Date().toISOString(),
  id = makeLocalId(),
): SavedRecipe {
  return {
    ...cloneRecipe(recipe),
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateSavedRecipeFromRecipe(
  existing: SavedRecipe,
  recipe: Recipe,
  timestamp = new Date().toISOString(),
): SavedRecipe {
  return {
    ...cloneRecipe(recipe),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: timestamp,
  };
}

export function savedRecipeToRecipe(savedRecipe: SavedRecipe): Recipe {
  return cloneRecipe(savedRecipe);
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

function savedRecipeEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && value.version === 1 && Array.isArray(value.recipes)) {
    return value.recipes;
  }

  return [];
}

function isSavedRecipe(value: unknown): value is SavedRecipe {
  return (
    isRecipe(value) &&
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
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

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function cloneRecipe(recipe: Recipe): Recipe {
  return {
    name: recipe.name,
    machineName: recipe.machineName,
    stages: recipe.stages.map((stage) => ({ ...stage })),
  };
}

function cloneSavedRecipe(recipe: SavedRecipe): SavedRecipe {
  return {
    ...cloneRecipe(recipe),
    id: recipe.id,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `recipe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
