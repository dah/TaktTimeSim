import { describe, expect, it } from 'vitest';
import type { Recipe, SavedRecipe } from '../domain/types';
import {
  loadRecipeDraft,
  loadSavedRecipes,
  makeSavedRecipe,
  RECIPE_DRAFT_KEY,
  savedRecipeToRecipe,
  SAVED_RECIPES_KEY,
  saveSavedRecipes,
  updateSavedRecipeFromRecipe,
} from './localStorageStore';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const recipe: Recipe = {
  name: 'Test Recipe',
  machineName: 'U50',
  stages: [
    { tankNumber: 0, processTimeSeconds: 0 },
    { tankNumber: 1, processTimeSeconds: 120 },
  ],
};

const fallbackRecipe: Recipe = {
  name: 'Fallback',
  machineName: 'U50',
  stages: [{ tankNumber: 0, processTimeSeconds: 0 }],
};

describe('localStorageStore saved recipes', () => {
  it('returns an empty list when storage is unavailable', () => {
    expect(loadSavedRecipes(undefined)).toEqual([]);
  });

  it('returns an empty list for malformed JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_RECIPES_KEY, '{bad json');

    expect(loadSavedRecipes(storage)).toEqual([]);
  });

  it('roundtrips valid saved recipes', () => {
    const storage = new MemoryStorage();
    const savedRecipe = makeSavedRecipe(recipe, '2026-06-26T10:00:00.000Z', 'recipe-1');

    expect(saveSavedRecipes(storage, [savedRecipe])).toEqual({ ok: true });
    expect(loadSavedRecipes(storage)).toEqual([savedRecipe]);
  });

  it('keeps existing plain recipe draft compatibility', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECIPE_DRAFT_KEY, JSON.stringify(recipe));

    expect(loadRecipeDraft(storage, fallbackRecipe, 'U50')).toEqual(recipe);
  });

  it('drops invalid saved recipe entries but keeps valid ones', () => {
    const storage = new MemoryStorage();
    const savedRecipe = makeSavedRecipe(recipe, '2026-06-26T10:00:00.000Z', 'recipe-1');
    storage.setItem(
      SAVED_RECIPES_KEY,
      JSON.stringify({ version: 1, recipes: [savedRecipe, { ...savedRecipe, id: '' }] }),
    );

    expect(loadSavedRecipes(storage)).toEqual([savedRecipe]);
  });

  it('updates a saved recipe while preserving id and createdAt', () => {
    const existing = makeSavedRecipe(recipe, '2026-06-26T10:00:00.000Z', 'recipe-1');
    const changedRecipe: Recipe = { ...recipe, name: 'Changed Recipe' };

    const updated = updateSavedRecipeFromRecipe(
      existing,
      changedRecipe,
      '2026-06-26T11:00:00.000Z',
    );

    expect(updated).toEqual({
      ...changedRecipe,
      id: 'recipe-1',
      createdAt: '2026-06-26T10:00:00.000Z',
      updatedAt: '2026-06-26T11:00:00.000Z',
    });
  });

  it('strips saved recipe metadata and deep-clones stages', () => {
    const savedRecipe: SavedRecipe = makeSavedRecipe(recipe, '2026-06-26T10:00:00.000Z', 'recipe-1');
    const plainRecipe = savedRecipeToRecipe(savedRecipe);

    expect(plainRecipe).toEqual(recipe);
    expect(plainRecipe).not.toHaveProperty('id');
    plainRecipe.stages[1].processTimeSeconds = 999;
    expect(savedRecipe.stages[1].processTimeSeconds).toBe(120);
  });
});
