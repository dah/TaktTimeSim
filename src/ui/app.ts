import type {
  MachineSpec,
  ProductionModeResult,
  Recipe,
  RecipeMix,
  RecipeMixEntry,
  RecipeMixSimulationOutcome,
  RecipeStage,
  SavedRecipe,
  Scenario,
  SimulationOutcome,
} from '../domain/types';
import { simulate } from '../simulation/simulate';
import { simulateRecipeMix } from '../simulation/simulateRecipeMix';
import {
  makeSavedRecipe,
  saveRecipeDraft,
  saveRecipeMixDraft,
  saveSavedRecipes,
  saveScenarioDraft,
  savedRecipeToRecipe,
  updateSavedRecipeFromRecipe,
} from '../storage/localStorageStore';

interface AppOptions {
  machine: MachineSpec;
  exampleRecipe: Recipe;
  initialRecipeMix: RecipeMix;
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
  recipeMix: RecipeMix;
  scenario: Scenario;
  savedRecipes: SavedRecipe[];
  activeRecipeIds: Record<string, string>;
  editingEntryId?: string;
  dirtyRecipeIds: Set<string>;
  statusMessages: Record<string, StatusMessage | undefined>;
}

export function mountApp(root: HTMLElement, options: AppOptions): void {
  const initialRecipeMix = cloneRecipeMix(options.initialRecipeMix);
  const state: AppState = {
    recipeMix: initialRecipeMix,
    scenario: { ...options.initialScenario },
    savedRecipes: options.initialSavedRecipes.map(cloneSavedRecipe),
    activeRecipeIds: {},
    editingEntryId: initialRecipeMix.entries[0]?.id,
    dirtyRecipeIds: new Set(),
    statusMessages: {},
  };
  let nextRecipeNumber = state.recipeMix.entries.length + 1;

  for (const entry of state.recipeMix.entries) {
    initializeRecipeLibraryState(entry);
  }

  const unloadStation = options.machine.stations.find(
    (station) => station.name.trim().toLowerCase() === 'unload',
  );
  const editableStations = options.machine.stations.filter(
    (station) => station.tankNumber !== unloadStation?.tankNumber,
  );

  function render(): void {
    const focusKey = currentFocusKey(root);
    resetUnlinkedRecipePercentages();
    const outcome = simulateRecipeMix(options.machine, state.recipeMix, state.scenario);

    saveRecipeMixDraft(options.storage, state.recipeMix);
    saveScenarioDraft(options.storage, state.scenario);
    if (state.recipeMix.entries[0]) {
      saveRecipeDraft(options.storage, state.recipeMix.entries[0].recipe);
    }

    root.innerHTML = '';
    root.append(
      headerTemplate(),
      recipeMixTemplate(),
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
      <p>Edit a U50 recipe mix, adjust simple movement assumptions, and estimate mixed production throughput.</p>
    `;
    return header;
  }

  function recipeMixTemplate(): HTMLElement {
    const section = element('section', 'card');
    const titleRow = element('div', 'section-title-row');
    titleRow.innerHTML = `
      <div>
        <h2>Recipe mix</h2>
        <p>Machine: <strong>${escapeHtml(options.machine.machineName)}</strong></p>
      </div>
    `;

    const resetButton = element('button', 'secondary-button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset to example';
    resetButton.addEventListener('click', () => {
      state.recipeMix = exampleRecipeMix();
      state.scenario = { ...options.defaultScenario };
      state.activeRecipeIds = {};
      state.editingEntryId = state.recipeMix.entries[0]?.id;
      state.dirtyRecipeIds = new Set();
      state.statusMessages = {};
      nextRecipeNumber = 2;
      for (const entry of state.recipeMix.entries) {
        initializeRecipeLibraryState(entry);
        markRecipeDirty(entry.id, 'Example recipe restored. Saved recipes were not changed.', true);
      }
      render();
    });
    titleRow.append(resetButton);

    const total = state.recipeMix.entries.reduce((sum, entry) => sum + entry.percentage, 0);
    const totalText = element('p', 'percentage-total');
    totalText.textContent = `Mix total: ${formatNumber(total)}%`;

    const availableRecipes = availableRecipesTemplate();

    const editor = element('div', 'recipe-panels');
    const activeEntry = currentEditorEntry();
    if (activeEntry) {
      editor.append(recipePanel(activeEntry));
    }

    const addButton = element('button', 'secondary-button');
    addButton.type = 'button';
    addButton.textContent = 'Add recipe';
    addButton.addEventListener('click', () => {
      const recipe = cloneRecipe(options.exampleRecipe);
      recipe.name = `Recipe ${nextRecipeNumber}`;
      const entry: RecipeMixEntry = {
        id: nextRecipeId(),
        recipe,
        percentage: 0,
      };
      state.recipeMix.entries.push(entry);
      state.editingEntryId = entry.id;
      markRecipeDirty(entry.id);
      render();
    });

    section.append(titleRow, totalText, availableRecipes, editor, addButton);
    return section;
  }

  function availableRecipesTemplate(): HTMLElement {
    const wrapper = element('div', 'available-recipes');
    wrapper.innerHTML = '<h3>Available recipes</h3>';
    const savedRecipes = visibleSavedRecipes();

    if (savedRecipes.length === 0) {
      const empty = element('p', 'recipe-library-hint');
      empty.textContent = 'Save recipes to make them available for mixed production.';
      wrapper.append(empty);
      return wrapper;
    }

    const table = element('table', 'available-recipes-table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Recipe</th>
          <th>Last saved</th>
          <th>Mix percentage</th>
          <th></th>
        </tr>
      </thead>
    `;
    const body = element('tbody');

    for (const savedRecipe of savedRecipes) {
      const entry = findMixEntryForSavedRecipe(savedRecipe);
      const row = element('tr');
      const nameCell = element('td');
      nameCell.textContent = savedRecipe.name || 'Untitled recipe';

      const updatedCell = element('td');
      updatedCell.textContent = formatDate(savedRecipe.updatedAt);

      const percentageCell = element('td');
      const percentageInput = element('input');
      percentageInput.type = 'number';
      percentageInput.min = '0';
      percentageInput.step = '1';
      percentageInput.dataset.focusKey = `available-recipe-${savedRecipe.id}-percentage`;
      percentageInput.value = numberInputValue(entry?.percentage ?? 0);
      percentageInput.addEventListener('input', () => {
        setSavedRecipePercentage(savedRecipe, parseNumberInput(percentageInput.value));
        render();
      });
      percentageCell.append(percentageInput);

      const actionCell = element('td');
      const editButton = element('button', 'secondary-button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => {
        const entryToEdit = ensureSavedRecipeEntry(savedRecipe);
        state.editingEntryId = entryToEdit.id;
        render();
      });
      const deleteButton = element('button', 'link-button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deleteSavedRecipe(savedRecipe));
      actionCell.append(editButton, deleteButton);

      row.append(nameCell, updatedCell, percentageCell, actionCell);
      body.append(row);
    }

    table.append(body);
    wrapper.append(table);
    return wrapper;
  }

  function recipePanel(entry: RecipeMixEntry): HTMLElement {
    const panel = element('div', 'recipe-panel');
    const header = element('div', 'recipe-panel-header');
    header.innerHTML = `<h3>${escapeHtml(entry.recipe.name || 'Untitled recipe')}</h3>`;

    const actions = element('div', 'recipe-panel-actions');
    const duplicateButton = element('button', 'secondary-button');
    duplicateButton.type = 'button';
    duplicateButton.textContent = 'Duplicate';
    duplicateButton.addEventListener('click', () => {
      const recipe = cloneRecipe(entry.recipe);
      recipe.name = `${recipe.name} copy`;
      const duplicate: RecipeMixEntry = {
        id: nextRecipeId(),
        recipe,
        percentage: 0,
      };
      state.recipeMix.entries.push(duplicate);
      state.editingEntryId = duplicate.id;
      markRecipeDirty(duplicate.id);
      render();
    });
    actions.append(duplicateButton);

    if (state.recipeMix.entries.length > 1) {
      const removeButton = element('button', 'link-button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        state.recipeMix.entries = state.recipeMix.entries.filter((candidate) => candidate.id !== entry.id);
        delete state.activeRecipeIds[entry.id];
        delete state.statusMessages[entry.id];
        state.dirtyRecipeIds.delete(entry.id);
        if (state.editingEntryId === entry.id) {
          state.editingEntryId = state.recipeMix.entries[0]?.id;
        }
        render();
      });
      actions.append(removeButton);
    }

    header.append(actions);

    const recipeOutcome = simulate(options.machine, entry.recipe, state.scenario);
    const grid = element('div', 'form-grid');
    const nameLabel = labelWithText('Recipe name');
    const nameInput = element('input');
    nameInput.type = 'text';
    nameInput.dataset.focusKey = `recipe-${entry.id}-name`;
    nameInput.value = entry.recipe.name;
    nameInput.addEventListener('input', () => {
      entry.recipe.name = nameInput.value;
      markRecipeDirty(entry.id);
      render();
    });
    nameLabel.append(nameInput);

    grid.append(nameLabel);

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
    entry.recipe.stages.forEach((stage, index) => {
      body.append(stageRow(entry, stage, index));
    });
    table.append(body);

    const addStageButton = element('button', 'secondary-button');
    addStageButton.type = 'button';
    addStageButton.textContent = 'Add stage';
    addStageButton.addEventListener('click', () => {
      const fallbackTank = editableStations.find((station) => station.tankNumber !== 0)?.tankNumber ?? 0;
      entry.recipe.stages.push({ tankNumber: fallbackTank, processTimeSeconds: 0 });
      markRecipeDirty(entry.id);
      render();
    });

    panel.append(header, recipeSaveActionsTemplate(entry, recipeOutcome), grid, table, addStageButton);
    return panel;
  }

  function recipeSaveActionsTemplate(entry: RecipeMixEntry, outcome: SimulationOutcome): HTMLElement {
    const wrapper = element('div', 'recipe-library');
    const actions = element('div', 'recipe-library-actions');
    const saveButton = actionButton('Save', !canSaveRecipe(outcome), () => saveActiveRecipe(entry, outcome, false));
    const saveAsButton = actionButton('Save as new', !canSaveRecipe(outcome), () => saveActiveRecipe(entry, outcome, true));
    actions.append(saveButton, saveAsButton);

    wrapper.append(actions);

    const hint = element('p', 'recipe-library-hint');
    const activeRecipe = state.savedRecipes.find((savedRecipe) => savedRecipe.id === state.activeRecipeIds[entry.id]);
    hint.textContent = state.dirtyRecipeIds.has(entry.id)
      ? 'Unsaved recipe changes are kept as a draft on this device. Use Save to update your saved list.'
      : activeRecipe
        ? `Saved as "${activeRecipe.name}". Draft recovery still restores the latest mix after refresh.`
        : 'Draft recovery still restores the latest mix after refresh.';
    wrapper.append(hint);

    const message = state.statusMessages[entry.id];
    if (message) {
      const messageNode = element('p', `status-message ${message.kind}`);
      messageNode.textContent = message.text;
      wrapper.append(messageNode);
    }

    return wrapper;
  }

  function stageRow(entry: RecipeMixEntry, stage: RecipeStage, index: number): HTMLTableRowElement {
    const row = element('tr');

    const stepCell = element('td');
    stepCell.textContent = String(index + 1);

    const tankCell = element('td');
    if (index === 0) {
      const station = options.machine.stations.find((candidate) => candidate.tankNumber === 0);
      tankCell.textContent = station ? `${station.tankNumber} - ${station.name}` : '0';
    } else {
      const select = element('select');
      select.dataset.focusKey = `recipe-${entry.id}-stage-tank-${index}`;
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
        markRecipeDirty(entry.id);
        render();
      });
      tankCell.append(select);
    }

    const timeCell = element('td');
    const timeInput = element('input');
    timeInput.type = 'number';
    timeInput.min = '0';
    timeInput.step = '1';
    timeInput.dataset.focusKey = `recipe-${entry.id}-stage-time-${index}`;
    timeInput.value = numberInputValue(stage.processTimeSeconds);
    timeInput.addEventListener('input', () => {
      stage.processTimeSeconds = parseNumberInput(timeInput.value);
      markRecipeDirty(entry.id);
      render();
    });
    timeCell.append(timeInput);

    const actionCell = element('td');
    if (index > 0) {
      const removeButton = element('button', 'link-button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        entry.recipe.stages.splice(index, 1);
        markRecipeDirty(entry.id);
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

  function outcomeTemplate(outcome: RecipeMixSimulationOutcome): HTMLElement {
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

    const summary = element('div', 'metrics-grid');
    const metrics = [
      ['Mixed baskets/shift', formatNumber(outcome.result.mixedProduction.basketsPerShift)],
      ['Mixed baskets/hour', formatNumber(outcome.result.mixedProduction.basketsPerHour)],
      ['Effective takt/cycle time', formatSeconds(outcome.result.mixedProduction.effectiveCycleTimeSeconds)],
      ['Weighted one-basket lead time', formatSeconds(outcome.result.mixedProduction.oneBasketLeadTimeSeconds)],
    ];

    for (const [label, value] of metrics) {
      const card = element('div', 'metric');
      card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      summary.append(card);
    }

    section.append(summary, productionModeTemplate('Mixed production', outcome.result.mixedProduction));
    return section;
  }

  function productionModeTemplate(title: string, result: ProductionModeResult): HTMLElement {
    const container = element('div', 'mode-result');
    container.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
    container.append(resultMetrics(result), utilizationTable(result));
    return container;
  }

  function resultMetrics(result: ProductionModeResult): HTMLElement {
    const grid = element('div', 'metrics-grid');
    const metrics = [
      ['Effective takt/cycle time', formatSeconds(result.effectiveCycleTimeSeconds)],
      ['Weighted one-basket lead time', formatSeconds(result.oneBasketLeadTimeSeconds)],
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

  function utilizationTable(result: ProductionModeResult): HTMLElement {
    const table = element('table', 'utilization-table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Resource</th>
          <th>Weighted workload / basket</th>
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

  function findMixEntryForSavedRecipe(savedRecipe: SavedRecipe): RecipeMixEntry | undefined {
    return state.recipeMix.entries.find((entry) => state.activeRecipeIds[entry.id] === savedRecipe.id);
  }

  function ensureSavedRecipeEntry(savedRecipe: SavedRecipe): RecipeMixEntry {
    const existing = findMixEntryForSavedRecipe(savedRecipe);

    if (existing) {
      state.activeRecipeIds[existing.id] = savedRecipe.id;
      if (!state.dirtyRecipeIds.has(existing.id)) {
        existing.recipe = savedRecipeToRecipe(savedRecipe);
      }
      return existing;
    }

    const entry: RecipeMixEntry = {
      id: nextRecipeId(),
      recipe: savedRecipeToRecipe(savedRecipe),
      percentage: 0,
    };
    state.recipeMix.entries.push(entry);
    state.activeRecipeIds[entry.id] = savedRecipe.id;
    state.dirtyRecipeIds.delete(entry.id);
    return entry;
  }

  function setSavedRecipePercentage(savedRecipe: SavedRecipe, percentage: number): void {
    const entry = ensureSavedRecipeEntry(savedRecipe);
    entry.percentage = percentage;
    state.statusMessages[entry.id] = undefined;
  }

  function currentEditorEntry(): RecipeMixEntry | undefined {
    return state.recipeMix.entries.find((entry) => entry.id === state.editingEntryId)
      ?? state.recipeMix.entries[0];
  }

  function resetUnlinkedRecipePercentages(): void {
    if (state.savedRecipes.length === 0) {
      return;
    }

    for (const entry of state.recipeMix.entries) {
      if (!state.activeRecipeIds[entry.id]) {
        entry.percentage = 0;
      }
    }
  }

  function saveActiveRecipe(entry: RecipeMixEntry, outcome: SimulationOutcome, forceNew: boolean): void {
    if (!canSaveRecipe(outcome)) {
      state.statusMessages[entry.id] = { kind: 'error', text: recipeValidationMessage(outcome) };
      render();
      return;
    }

    const activeRecipeId = state.activeRecipeIds[entry.id] ?? '';
    const existing = forceNew ? undefined : state.savedRecipes.find((recipe) => recipe.id === activeRecipeId);
    const nextRecipe = existing
      ? updateSavedRecipeFromRecipe(existing, entry.recipe)
      : makeSavedRecipe(entry.recipe);
    const nextRecipes = existing
      ? state.savedRecipes.map((recipe) => (recipe.id === existing.id ? nextRecipe : recipe))
      : [...state.savedRecipes, nextRecipe];
    const result = saveSavedRecipes(options.storage, nextRecipes);

    if (!result.ok) {
      state.statusMessages[entry.id] = { kind: 'error', text: result.message ?? 'Unable to save recipe.' };
      render();
      return;
    }

    state.savedRecipes = nextRecipes;
    state.activeRecipeIds[entry.id] = nextRecipe.id;
    state.dirtyRecipeIds.delete(entry.id);
    state.statusMessages[entry.id] = {
      kind: 'success',
      text: existing ? `Saved changes to "${nextRecipe.name}".` : `Saved "${nextRecipe.name}".`,
    };
    render();
  }

  function deleteSavedRecipe(savedRecipe: SavedRecipe): void {
    if (!window.confirm(`Delete saved recipe "${savedRecipe.name}"? It will be removed from the current mix.`)) {
      return;
    }

    const deletedEntryIds = state.recipeMix.entries
      .filter((entry) => state.activeRecipeIds[entry.id] === savedRecipe.id)
      .map((entry) => entry.id);
    const nextRecipes = state.savedRecipes.filter((recipe) => recipe.id !== savedRecipe.id);
    const result = saveSavedRecipes(options.storage, nextRecipes);

    if (!result.ok) {
      const entry = findMixEntryForSavedRecipe(savedRecipe);
      if (entry) {
        state.statusMessages[entry.id] = { kind: 'error', text: result.message ?? 'Unable to delete recipe.' };
      }
      render();
      return;
    }

    state.savedRecipes = nextRecipes;
    state.recipeMix.entries = state.recipeMix.entries.filter(
      (entry) => !deletedEntryIds.includes(entry.id),
    );

    for (const entryId of deletedEntryIds) {
      delete state.activeRecipeIds[entryId];
      delete state.statusMessages[entryId];
      state.dirtyRecipeIds.delete(entryId);
    }

    if (state.editingEntryId && deletedEntryIds.includes(state.editingEntryId)) {
      state.editingEntryId = state.recipeMix.entries[0]?.id;
    }
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

  function initializeRecipeLibraryState(entry: RecipeMixEntry): void {
    const mappedSavedRecipeIds = new Set(Object.values(state.activeRecipeIds));
    const matchedRecipe = state.savedRecipes.find(
      (savedRecipe) => !mappedSavedRecipeIds.has(savedRecipe.id) && recipesMatch(savedRecipe, entry.recipe),
    );

    if (matchedRecipe) {
      state.activeRecipeIds[entry.id] = matchedRecipe.id;
      state.dirtyRecipeIds.delete(entry.id);
    } else {
      state.activeRecipeIds[entry.id] = '';
      state.dirtyRecipeIds.add(entry.id);
    }
  }

  function markRecipeDirty(entryId: string, message?: string, detachFromSavedRecipe = false): void {
    state.dirtyRecipeIds.add(entryId);
    if (detachFromSavedRecipe) {
      state.activeRecipeIds[entryId] = '';
    }
    if (message) {
      state.statusMessages[entryId] = { kind: 'info', text: message };
    } else {
      state.statusMessages[entryId] = undefined;
    }
  }

  function exampleRecipeMix(): RecipeMix {
    return {
      entries: [
        {
          id: 'recipe-1',
          recipe: cloneRecipe(options.exampleRecipe),
          percentage: 100,
        },
      ],
    };
  }

  function nextRecipeId(): string {
    const id = `recipe-${Date.now().toString(36)}-${nextRecipeNumber}`;
    nextRecipeNumber += 1;
    return id;
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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
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
