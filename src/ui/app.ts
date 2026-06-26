import type {
  MachineSpec,
  Recipe,
  RecipeStage,
  SavedRecipe,
  Scenario,
  SimulationOutcome,
  SimulationResult,
} from '../domain/types';
import { simulate } from '../simulation/simulate';
import {
  makeSavedRecipe,
  saveRecipeDraft,
  saveSavedRecipes,
  saveScenarioDraft,
  savedRecipeToRecipe,
  updateSavedRecipeFromRecipe,
} from '../storage/localStorageStore';

interface AppOptions {
  machine: MachineSpec;
  exampleRecipe: Recipe;
  initialRecipe: Recipe;
  initialScenario: Scenario;
  defaultScenario: Scenario;
  initialSavedRecipes: SavedRecipe[];
  storage?: Storage;
}

interface StatusMessage {
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface AppState {
  recipe: Recipe;
  scenario: Scenario;
  savedRecipes: SavedRecipe[];
  activeRecipeId: string;
  selectedRecipeId: string;
  recipeDirty: boolean;
  statusMessage?: StatusMessage;
}

export function mountApp(root: HTMLElement, options: AppOptions): void {
  const matchedRecipe = options.initialSavedRecipes.find((savedRecipe) =>
    recipesMatch(savedRecipe, options.initialRecipe),
  );
  const state: AppState = {
    recipe: cloneRecipe(options.initialRecipe),
    scenario: { ...options.initialScenario },
    savedRecipes: options.initialSavedRecipes.map(cloneSavedRecipe),
    activeRecipeId: matchedRecipe?.id ?? '',
    selectedRecipeId: matchedRecipe?.id ?? '',
    recipeDirty: !matchedRecipe,
  };

  const unloadStation = options.machine.stations.find(
    (station) => station.name.trim().toLowerCase() === 'unload',
  );
  const editableStations = options.machine.stations.filter(
    (station) => station.tankNumber !== unloadStation?.tankNumber,
  );

  function render(): void {
    const focusKey = currentFocusKey(root);
    const outcome = simulate(options.machine, state.recipe, state.scenario);

    saveRecipeDraft(options.storage, state.recipe);
    saveScenarioDraft(options.storage, state.scenario);

    root.innerHTML = '';
    root.append(
      headerTemplate(),
      recipeTemplate(outcome),
      scenarioTemplate(),
      outcomeTemplate(outcome),
    );
    restoreFocus(root, focusKey);
  }

  function headerTemplate(): HTMLElement {
    const header = element('header', 'app-header');
    header.innerHTML = `
      <p class="eyebrow">Local-first productivity model</p>
      <h1>TaktTimeSim</h1>
      <p>Edit a U50 process recipe, adjust simple movement assumptions, and estimate throughput.</p>
    `;
    return header;
  }

  function recipeTemplate(outcome: SimulationOutcome): HTMLElement {
    const section = element('section', 'card');
    const titleRow = element('div', 'section-title-row');
    titleRow.innerHTML = `
      <div>
        <h2>Recipe</h2>
        <p>Machine: <strong>${escapeHtml(options.machine.machineName)}</strong></p>
      </div>
    `;

    const resetButton = element('button', 'secondary-button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset to example';
    resetButton.addEventListener('click', () => {
      state.recipe = cloneRecipe(options.exampleRecipe);
      state.scenario = { ...options.defaultScenario };
      state.activeRecipeId = '';
      state.selectedRecipeId = '';
      state.recipeDirty = true;
      state.statusMessage = { kind: 'info', text: 'Example recipe restored. Saved recipes were not changed.' };
      render();
    });
    titleRow.append(resetButton);

    const nameLabel = labelWithText('Recipe name');
    const nameInput = element('input');
    nameInput.type = 'text';
    nameInput.dataset.focusKey = 'recipe-name';
    nameInput.value = state.recipe.name;
    nameInput.addEventListener('input', () => {
      state.recipe.name = nameInput.value;
      markRecipeDirty();
      render();
    });
    nameLabel.append(nameInput);

    const table = element('table', 'stage-table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Step</th>
          <th>Tank</th>
          <th>Process time (seconds)</th>
          <th></th>
        </tr>
      </thead>
    `;
    const body = element('tbody');

    state.recipe.stages.forEach((stage, index) => {
      body.append(stageRow(stage, index));
    });

    table.append(body);

    const addButton = element('button', 'secondary-button');
    addButton.type = 'button';
    addButton.textContent = 'Add stage';
    addButton.addEventListener('click', () => {
      const fallbackTank = editableStations.find((station) => station.tankNumber !== 0)?.tankNumber ?? 0;
      state.recipe.stages.push({ tankNumber: fallbackTank, processTimeSeconds: 0 });
      markRecipeDirty();
      render();
    });

    section.append(titleRow, recipeLibraryTemplate(outcome), nameLabel, table, addButton);
    return section;
  }

  function recipeLibraryTemplate(outcome: SimulationOutcome): HTMLElement {
    const wrapper = element('div', 'recipe-library');
    const savedRecipes = visibleSavedRecipes();
    const controls = element('div', 'recipe-library-controls');

    const selectLabel = labelWithText('Saved recipes');
    const select = element('select');
    select.dataset.focusKey = 'saved-recipe-select';
    select.append(optionElement('', 'Choose saved recipe…', state.selectedRecipeId === ''));

    for (const savedRecipe of savedRecipes) {
      select.append(
        optionElement(savedRecipe.id, `${savedRecipe.name} — updated ${formatDate(savedRecipe.updatedAt)}`, savedRecipe.id === state.selectedRecipeId),
      );
    }

    select.addEventListener('change', () => {
      state.selectedRecipeId = select.value;
      render();
    });
    selectLabel.append(select);

    const actions = element('div', 'recipe-library-actions');
    const loadButton = actionButton('Load', state.selectedRecipeId === '', () => loadSelectedRecipe());
    const saveButton = actionButton('Save', !canSaveRecipe(outcome), () => saveActiveRecipe(outcome, false));
    const saveAsButton = actionButton('Save as new', !canSaveRecipe(outcome), () => saveActiveRecipe(outcome, true));
    const deleteButton = actionButton('Delete', state.selectedRecipeId === '', () => deleteSelectedRecipe());
    deleteButton.classList.add('danger-button');
    actions.append(loadButton, saveButton, saveAsButton, deleteButton);

    controls.append(selectLabel, actions);
    wrapper.append(controls);

    const hint = element('p', 'recipe-library-hint');
    hint.textContent = state.recipeDirty
      ? 'Unsaved recipe changes are kept as a draft on this device. Use Save to update your saved list.'
      : 'This recipe is saved. Draft recovery still restores the latest editor state after refresh.';
    wrapper.append(hint);

    if (state.statusMessage) {
      const message = element('p', `status-message ${state.statusMessage.kind}`);
      message.textContent = state.statusMessage.text;
      wrapper.append(message);
    }

    return wrapper;
  }

  function stageRow(stage: RecipeStage, index: number): HTMLTableRowElement {
    const row = element('tr');

    const stepCell = element('td');
    stepCell.textContent = String(index + 1);

    const tankCell = element('td');
    if (index === 0) {
      const station = options.machine.stations.find((candidate) => candidate.tankNumber === 0);
      tankCell.textContent = station ? `${station.tankNumber} - ${station.name}` : '0';
    } else {
      const select = element('select');
      select.dataset.focusKey = `stage-tank-${index}`;
      for (const station of editableStations) {
        if (station.tankNumber === 0) {
          continue;
        }

        const option = element('option');
        option.value = String(station.tankNumber);
        option.textContent = `${station.tankNumber} - ${station.name}`;
        option.selected = station.tankNumber === stage.tankNumber;
        select.append(option);
      }
      select.addEventListener('change', () => {
        stage.tankNumber = Number(select.value);
        markRecipeDirty();
        render();
      });
      tankCell.append(select);
    }

    const timeCell = element('td');
    const timeInput = element('input');
    timeInput.type = 'number';
    timeInput.min = '0';
    timeInput.step = '1';
    timeInput.dataset.focusKey = `stage-time-${index}`;
    timeInput.value = numberInputValue(stage.processTimeSeconds);
    timeInput.addEventListener('input', () => {
      stage.processTimeSeconds = parseNumberInput(timeInput.value);
      markRecipeDirty();
      render();
    });
    timeCell.append(timeInput);

    const actionCell = element('td');
    if (index > 0) {
      const removeButton = element('button', 'link-button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        state.recipe.stages.splice(index, 1);
        markRecipeDirty();
        render();
      });
      actionCell.append(removeButton);
    }

    row.append(stepCell, tankCell, timeCell, actionCell);
    return row;
  }

  function scenarioTemplate(): HTMLElement {
    const section = element('section', 'card');
    section.innerHTML = '<h2>Scenario</h2>';

    const grid = element('div', 'form-grid');
    const moveLabel = labelWithText('Robot move time (seconds)');
    const moveInput = element('input');
    moveInput.type = 'number';
    moveInput.min = '0';
    moveInput.step = '1';
    moveInput.dataset.focusKey = 'scenario-move-time';
    moveInput.value = numberInputValue(state.scenario.moveTimeSeconds);
    moveInput.addEventListener('input', () => {
      state.scenario.moveTimeSeconds = parseNumberInput(moveInput.value);
      render();
    });
    moveLabel.append(moveInput);

    const shiftLabel = labelWithText('Shift length (hours)');
    const shiftInput = element('input');
    shiftInput.type = 'number';
    shiftInput.min = '0.1';
    shiftInput.step = '0.25';
    shiftInput.dataset.focusKey = 'scenario-shift-length';
    shiftInput.value = numberInputValue(state.scenario.shiftLengthHours);
    shiftInput.addEventListener('input', () => {
      state.scenario.shiftLengthHours = parseNumberInput(shiftInput.value);
      render();
    });
    shiftLabel.append(shiftInput);

    grid.append(moveLabel, shiftLabel);
    section.append(grid);
    return section;
  }

  function outcomeTemplate(outcome: SimulationOutcome): HTMLElement {
    const section = element('section', 'card results-card');
    section.innerHTML = '<h2>Results</h2>';

    if (!outcome.ok) {
      const list = element('ul', 'error-list');
      for (const error of outcome.errors) {
        const item = element('li');
        item.textContent = error.message;
        list.append(item);
      }
      section.append(list);
      return section;
    }

    section.append(resultMetrics(outcome.result), utilizationTable(outcome.result));
    return section;
  }

  function resultMetrics(result: SimulationResult): HTMLElement {
    const grid = element('div', 'metrics-grid');
    const metrics = [
      ['Estimated takt/cycle time', formatSeconds(result.cycleTimeSeconds)],
      ['One-basket lead time', formatSeconds(result.oneBasketLeadTimeSeconds)],
      ['Baskets per hour', formatNumber(result.basketsPerHour)],
      ['Baskets per shift', formatNumber(result.basketsPerShift)],
      ['Bottleneck', result.bottlenecks.join(', ')],
    ];

    for (const [label, value] of metrics) {
      const card = element('div', 'metric');
      card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      grid.append(card);
    }

    return grid;
  }

  function utilizationTable(result: SimulationResult): HTMLElement {
    const table = element('table', 'utilization-table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Resource</th>
          <th>Workload / basket</th>
          <th>Utilization</th>
        </tr>
      </thead>
    `;
    const body = element('tbody');

    for (const entry of result.utilization) {
      const row = element('tr');
      row.innerHTML = `
        <td>${escapeHtml(entry.label)}</td>
        <td>${formatSeconds(entry.workloadSeconds)}</td>
        <td>${formatNumber(entry.utilizationPercent)}%</td>
      `;
      body.append(row);
    }

    table.append(body);
    return table;
  }

  function loadSelectedRecipe(): void {
    const savedRecipe = state.savedRecipes.find((recipe) => recipe.id === state.selectedRecipeId);

    if (!savedRecipe) {
      return;
    }

    if (state.recipeDirty && !window.confirm('Load this saved recipe and replace the current unsaved recipe changes?')) {
      return;
    }

    state.recipe = savedRecipeToRecipe(savedRecipe);
    state.activeRecipeId = savedRecipe.id;
    state.selectedRecipeId = savedRecipe.id;
    state.recipeDirty = false;
    state.statusMessage = { kind: 'success', text: `Loaded "${savedRecipe.name}".` };
    render();
  }

  function saveActiveRecipe(outcome: SimulationOutcome, forceNew: boolean): void {
    if (!canSaveRecipe(outcome)) {
      state.statusMessage = { kind: 'error', text: recipeValidationMessage(outcome) };
      render();
      return;
    }

    const existing = forceNew ? undefined : state.savedRecipes.find((recipe) => recipe.id === state.activeRecipeId);
    const nextRecipe = existing
      ? updateSavedRecipeFromRecipe(existing, state.recipe)
      : makeSavedRecipe(state.recipe);
    const nextRecipes = existing
      ? state.savedRecipes.map((recipe) => (recipe.id === existing.id ? nextRecipe : recipe))
      : [...state.savedRecipes, nextRecipe];
    const result = saveSavedRecipes(options.storage, nextRecipes);

    if (!result.ok) {
      state.statusMessage = { kind: 'error', text: result.message ?? 'Unable to save recipe.' };
      render();
      return;
    }

    state.savedRecipes = nextRecipes;
    state.activeRecipeId = nextRecipe.id;
    state.selectedRecipeId = nextRecipe.id;
    state.recipeDirty = false;
    state.statusMessage = {
      kind: 'success',
      text: existing ? `Saved changes to "${nextRecipe.name}".` : `Saved "${nextRecipe.name}".`,
    };
    render();
  }

  function deleteSelectedRecipe(): void {
    const savedRecipe = state.savedRecipes.find((recipe) => recipe.id === state.selectedRecipeId);

    if (!savedRecipe) {
      return;
    }

    if (!window.confirm(`Delete saved recipe "${savedRecipe.name}"? Current editor contents will remain open.`)) {
      return;
    }

    const nextRecipes = state.savedRecipes.filter((recipe) => recipe.id !== savedRecipe.id);
    const result = saveSavedRecipes(options.storage, nextRecipes);

    if (!result.ok) {
      state.statusMessage = { kind: 'error', text: result.message ?? 'Unable to delete recipe.' };
      render();
      return;
    }

    state.savedRecipes = nextRecipes;
    if (state.activeRecipeId === savedRecipe.id) {
      state.activeRecipeId = '';
      state.recipeDirty = true;
    }
    state.selectedRecipeId = '';
    state.statusMessage = { kind: 'success', text: `Deleted "${savedRecipe.name}".` };
    render();
  }

  function visibleSavedRecipes(): SavedRecipe[] {
    return state.savedRecipes
      .filter((recipe) => recipe.machineName === options.machine.machineName)
      .sort((left, right) => {
        const updatedDiff = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return updatedDiff || left.name.localeCompare(right.name);
      });
  }

  function markRecipeDirty(): void {
    state.recipeDirty = true;
    state.statusMessage = undefined;
  }

  render();
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}

function labelWithText(text: string): HTMLLabelElement {
  const label = element('label');
  const span = element('span');
  span.textContent = text;
  label.append(span);
  return label;
}

function optionElement(value: string, text: string, selected: boolean): HTMLOptionElement {
  const option = element('option');
  option.value = value;
  option.textContent = text;
  option.selected = selected;
  return option;
}

function actionButton(text: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = element('button', 'secondary-button');
  button.type = 'button';
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function canSaveRecipe(outcome: SimulationOutcome): boolean {
  return outcome.ok || outcome.errors.every((error) => !error.field.startsWith('recipe.') && !error.field.startsWith('machine.'));
}

function recipeValidationMessage(outcome: SimulationOutcome): string {
  if (outcome.ok) {
    return '';
  }

  return outcome.errors.find((error) => error.field.startsWith('recipe.') || error.field.startsWith('machine.'))?.message ?? 'Fix recipe errors before saving.';
}

function parseNumberInput(value: string): number {
  if (value.trim() === '') {
    return Number.NaN;
  }

  return Number(value);
}

function numberInputValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function formatSeconds(value: number): string {
  return `${formatNumber(value)} s`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

function recipesMatch(left: Recipe, right: Recipe): boolean {
  return JSON.stringify(cloneRecipe(left)) === JSON.stringify(cloneRecipe(right));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

function currentFocusKey(root: HTMLElement): string | undefined {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLElement) || !root.contains(activeElement)) {
    return undefined;
  }

  return activeElement.dataset.focusKey;
}

function restoreFocus(root: HTMLElement, focusKey: string | undefined): void {
  if (!focusKey) {
    return;
  }

  const nextElement = Array.from(root.querySelectorAll<HTMLElement>('[data-focus-key]')).find(
    (candidate) => candidate.dataset.focusKey === focusKey,
  );

  nextElement?.focus();
}
