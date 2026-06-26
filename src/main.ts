import './styles.css';
import u50Machine from './data/machines/u50.json';
import exampleU50Recipe from './data/recipes/example-u50-recipe.json';
import type { MachineSpec, Recipe, Scenario } from './domain/types';
import { loadRecipeDraft, loadScenarioDraft } from './storage/localStorageStore';
import { mountApp } from './ui/app';

const machine = u50Machine as MachineSpec;
const exampleRecipe = exampleU50Recipe as Recipe;
const defaultScenario: Scenario = {
  moveTimeSeconds: 10,
  shiftLengthHours: 8,
};

const storage = getLocalStorage();
const initialRecipe = loadRecipeDraft(storage, exampleRecipe, machine.machineName);
const initialScenario = loadScenarioDraft(storage, defaultScenario);
const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

mountApp(root, {
  machine,
  exampleRecipe,
  initialRecipe,
  initialScenario,
  defaultScenario,
  storage,
});

function getLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
