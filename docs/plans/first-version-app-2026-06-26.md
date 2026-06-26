# First Version App: Plan

## Goal

Create the first runnable TaktTimeSim browser app: a Vite + TypeScript static build that loads the U50 machine spec, lets a user edit a simple recipe in seconds, runs a pure simulation function, and displays initial productivity results. The app must remain local-first and suitable for zipped static distribution.

## Background

- `AGENTS.md:11` requires Vite, TypeScript, vanilla HTML/CSS/TypeScript, JSON machine specs, and `localStorage` for user-created data.
- `AGENTS.md:21` requires production builds to be static and Vite to use `base: './'` so unzipped builds can run from local file paths.
- `AGENTS.md:39` separates machine specs, recipes, pure simulation logic, and UI/storage boundaries.
- `src/data/machines/u50.json:1` defines the initial U50 machine: one robot arm, one basket capacity, reachable tanks 0 through 15, and station capacities.
- `docs/data-model.md:3` defines recipes as ordered stage timings in seconds, starting at tank 0, with the final unload move handled by simulation rather than recipe data.
- `src/data/recipes/example-u50-recipe.json:1` provides a seed recipe targeting U50.
- No existing Vite app, simulation engine, UI, tests, or prior plan exists in this repo.

## Approach

Build a narrow vertical slice instead of a framework: `index.html` loads `src/main.ts`, which imports `u50.json` and `example-u50-recipe.json`, mounts a vanilla TypeScript UI, calls `simulate(machine, recipe, scenario)`, renders results, and saves valid user drafts to `localStorage`.

Use TypeScript modules to keep ownership boundaries clear:

- Machine specs stay static JSON under `src/data/machines/`.
- Recipes and scenarios are user/process inputs owned by UI and storage.
- Simulation is pure TypeScript and never reads the DOM, `localStorage`, or imported JSON directly.
- Storage is a thin browser adapter and never calls simulation.
- UI converts form state into typed inputs and renders either validation errors or simulation results.

Include a small scenario model in v1:

- `moveTimeSeconds`, default `10`
- `shiftLengthHours`, default `8`

This gives the robot arm a visible effect on throughput without adding a travel-time matrix before real movement timing data exists.

Use these v1 simulation conventions:

- Identify unload by exactly one station whose name matches `Unload` case-insensitively.
- Treat the basket as already available at the Load station when a recipe starts.
- Count one robot move for each transition from a recipe stage to the next recipe stage, plus one final move to unload. With the current recipe shape, that means `moveCount = recipe.stages.length`.
- Define takt/cycle time as the maximum per-basket workload across active stations and the robot.
- Define one-basket lead time as the sum of recipe process times plus `moveCount * moveTimeSeconds`.

## Work Items

1. Add the Vite app scaffold.
   - Add `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, and `src/styles.css`.
   - Configure `vite.config.ts` with `base: './'`.
   - Add scripts for `dev`, `build`, `preview`, and `test`.
   - Use `vitest` as a dev dependency for deterministic simulation tests.

2. Add shared domain types.
   - Create `src/domain/types.ts`.
   - Define `MachineSpec`, `MachineStation`, `RobotSpec`, `Recipe`, `RecipeStage`, `Scenario`, `SimulationResult`, `SimulationOutcome`, and validation error types.
   - Match the existing JSON shape instead of inventing a separate schema.
   - Keep `reachableTankNumbers` as a range object with `from` and `to`; validate reachability with inclusive range checks.
   - Do not add timing defaults to `u50.json` in v1. Scenario timing defaults live in TypeScript until real machine defaults are known.

3. Add the pure simulation module.
   - Create `src/simulation/simulate.ts`.
   - Expose `simulate(machine, recipe, scenario)`.
   - Validate machine/recipe compatibility, first stage tank `0`, finite non-negative process times, reachable tanks, non-unload editable stages, one unload station, finite non-negative move time, and positive shift length.
   - Find the unload station by case-insensitive station name `Unload`.
   - Append the unload move internally after the final recipe stage.
   - Compute takt/cycle time, one-basket lead time, baskets per hour, baskets per shift, bottleneck labels, and station/robot utilization.
   - Treat station workload as `totalProcessTimeAtTank / numberOfPositions`.
   - Treat robot workload as `(recipe.stages.length * moveTimeSeconds) / numberOfArms`, because the basket starts at Load and the final move to unload is included in that count.
   - Return validation errors instead of throwing for user-input problems.

4. Add focused simulation tests.
   - Create `src/simulation/simulate.test.ts`.
   - Cover the example U50 recipe, unload station name detection, invalid first stage, unload as recipe stage, missing station, station capacity impact, robot bottleneck, move-count behavior, and zero-workload rejection.
   - Keep tests on pure functions only.

5. Add local storage helpers.
   - Create `src/storage/localStorageStore.ts`.
   - Use versioned keys: `takttimesim.v1.recipeDraft` and `takttimesim.v1.scenarioDraft`.
   - Load defensively, falling back to the bundled example when stored data is missing, malformed, or incompatible.
   - Save only valid drafts and return non-throwing save results.

6. Add the vanilla UI.
   - Create `src/ui/app.ts`.
   - Render recipe name, read-only machine name, editable stage rows, scenario controls, reset-to-example, validation messages, and results.
   - Keep tank `0` as the fixed first stage.
   - Exclude the unload tank from editable stage choices.
   - Let users add/remove non-first stages.
   - Recompute synchronously on input changes.
   - Save to `localStorage` only when simulation input validates.

7. Wire the app entry point.
   - In `src/main.ts`, import CSS, U50 machine JSON, the example recipe JSON, storage helpers, and the UI mount function.
   - Initialize default scenario values.
   - Load saved drafts when available.
   - Mount the app into the root element.

8. Update documentation.
   - Add a short `Scenario` section to `docs/data-model.md` documenting `moveTimeSeconds`, `shiftLengthHours`, and that unload remains simulation behavior.
   - Keep this plan as the implementation checklist for v1.

9. Verify the local-first build.
   - Run `npm test`.
   - Run `npm run build`.
   - Open `dist/index.html` from the filesystem and confirm the app loads with relative asset paths.

## Result Model

The initial results panel should show:

- Estimated takt/cycle time.
- One-basket lead time.
- Baskets per hour.
- Baskets per shift.
- Bottleneck, including ties between stations and robot.
- Utilization table for active stations and the robot.

If all workloads are zero, simulation should return an error rather than an infinite throughput result.

## Decisions To Revisit Later

- Replace the unload name convention with an explicit machine-spec field if additional machines make name matching too fragile.
- Replace the single `moveTimeSeconds` value with per-route travel times once real robot movement timing is available.
- Expand metrics after the first usable screen confirms which KPIs matter most.

## References

- `AGENTS.md`
- `docs/data-model.md`
- `src/data/machines/u50.json`
- `src/data/recipes/example-u50-recipe.json`
