import type {
  MachineSpec,
  ProductionModeResult,
  Recipe,
  RecipeMix,
  RecipeMixEntry,
  RecipeMixSimulationOutcome,
  RecipeStage,
  Scenario,
} from '../domain/types';
import { simulateRecipeMix } from '../simulation/simulateRecipeMix';
import { saveRecipeDraft, saveRecipeMixDraft, saveScenarioDraft } from '../storage/localStorageStore';

interface AppOptions {
  machine: MachineSpec;
  exampleRecipe: Recipe;
  initialRecipeMix: RecipeMix;
  initialScenario: Scenario;
  defaultScenario: Scenario;
  storage?: Storage;
}

interface AppState {
  recipeMix: RecipeMix;
  scenario: Scenario;
}

export function mountApp(root: HTMLElement, options: AppOptions): void {
  const state: AppState = {
    recipeMix: cloneRecipeMix(options.initialRecipeMix),
    scenario: { ...options.initialScenario },
  };
  let nextRecipeNumber = state.recipeMix.entries.length + 1;

  const unloadStation = options.machine.stations.find(
    (station) => station.name.trim().toLowerCase() === 'unload',
  );
  const editableStations = options.machine.stations.filter(
    (station) => station.tankNumber !== unloadStation?.tankNumber,
  );

  function render(): void {
    const focusKey = currentFocusKey(root);
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
      <p>Edit a U50 recipe mix, adjust simple movement assumptions, and compare mixed versus grouped production throughput.</p>
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
      nextRecipeNumber = 2;
      render();
    });
    titleRow.append(resetButton);

    const total = state.recipeMix.entries.reduce((sum, entry) => sum + entry.percentage, 0);
    const totalText = element('p', 'percentage-total');
    totalText.textContent = `Mix total: ${formatNumber(total)}%`;

    const panels = element('div', 'recipe-panels');
    state.recipeMix.entries.forEach((entry) => {
      panels.append(recipePanel(entry));
    });

    const addButton = element('button', 'secondary-button');
    addButton.type = 'button';
    addButton.textContent = 'Add recipe';
    addButton.addEventListener('click', () => {
      const recipe = cloneRecipe(options.exampleRecipe);
      recipe.name = `Recipe ${nextRecipeNumber}`;
      state.recipeMix.entries.push({
        id: nextRecipeId(),
        recipe,
        percentage: 0,
      });
      nextRecipeNumber += 1;
      render();
    });

    section.append(titleRow, totalText, panels, addButton);
    return section;
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
      state.recipeMix.entries.push({
        id: nextRecipeId(),
        recipe,
        percentage: 0,
      });
      render();
    });
    actions.append(duplicateButton);

    if (state.recipeMix.entries.length > 1) {
      const removeButton = element('button', 'link-button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        state.recipeMix.entries = state.recipeMix.entries.filter((candidate) => candidate.id !== entry.id);
        render();
      });
      actions.append(removeButton);
    }

    header.append(actions);

    const grid = element('div', 'form-grid');
    const nameLabel = labelWithText('Recipe name');
    const nameInput = element('input');
    nameInput.type = 'text';
    nameInput.dataset.focusKey = `recipe-${entry.id}-name`;
    nameInput.value = entry.recipe.name;
    nameInput.addEventListener('input', () => {
      entry.recipe.name = nameInput.value;
      render();
    });
    nameLabel.append(nameInput);

    const percentageLabel = labelWithText('Mix percentage');
    const percentageInput = element('input');
    percentageInput.type = 'number';
    percentageInput.min = '0';
    percentageInput.step = '1';
    percentageInput.dataset.focusKey = `recipe-${entry.id}-percentage`;
    percentageInput.value = numberInputValue(entry.percentage);
    percentageInput.addEventListener('input', () => {
      entry.percentage = parseNumberInput(percentageInput.value);
      render();
    });
    percentageLabel.append(percentageInput);
    grid.append(nameLabel, percentageLabel);

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
      render();
    });

    panel.append(header, grid, table, addStageButton);
    return panel;
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

    const comparison = element('div', 'metrics-grid');
    const metrics = [
      ['Random mixed baskets/shift', formatNumber(outcome.result.randomMixed.basketsPerShift)],
      ['Grouped baskets/shift', formatNumber(outcome.result.groupedProduction.basketsPerShift)],
      ['Difference baskets/shift', formatSignedNumber(outcome.result.throughputDeltaBasketsPerShift)],
      ['Difference percent', `${formatSignedNumber(outcome.result.throughputDeltaPercent)}%`],
    ];

    for (const [label, value] of metrics) {
      const card = element('div', 'metric');
      card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      comparison.append(card);
    }

    const modes = element('div', 'mode-results');
    modes.append(
      productionModeTemplate('Random mixed production', outcome.result.randomMixed),
      productionModeTemplate('Grouped production', outcome.result.groupedProduction),
    );

    section.append(comparison, modes);
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
    return `recipe-${Date.now().toString(36)}-${nextRecipeNumber}`;
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

function formatSignedNumber(value: number): string {
  const formatted = formatNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
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
