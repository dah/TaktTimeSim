# AGENTS.md

## Project

TaktTimeSim is a local-first browser app for modeling how industrial cleaning and coating machine process times affect productivity.

The app should stay simple to install and distribute. The intended distribution format is a zipped static web build that users can run locally on Windows or macOS, ideally by opening `index.html` directly in a browser.

## Tech Stack

- Use Vite for local development and static builds.
- Use TypeScript for application logic.
- Use plain HTML/CSS and vanilla TypeScript UI unless complexity justifies a small UI library.
- Use `localStorage` for user-created data such as recipes and scenarios.
- Use JSON files for machine specifications so specs can be modified or extended without changing simulation code.
- Use Chart.js only if charts become useful for comparing output, throughput, utilization, or bottlenecks.

## Packaging Requirements

- The production build must be static.
- The built app should work from a local file path after unzipping.
- Configure Vite with `base: './'` so generated asset paths are relative.
- Avoid server-only features, backend dependencies, databases, or install steps for end users.

## Data Model Direction

Machine specs should live as JSON files, for example:

- `src/data/machines/default-machine.json`
- additional machines under `src/data/machines/`

Recipes and scenarios should be user-editable and saved to `localStorage`.

Provide import/export JSON functionality when recipe sharing or backup becomes important.

## Architecture

Keep these concerns separate:

- Machine specs: static JSON describing stations, constraints, capacities, timing rules, and defaults.
- Recipes: user-defined process times and operating parameters.
- Simulation engine: pure TypeScript functions that accept machine spec plus recipe/scenario input and return cycle time, throughput, bottlenecks, utilization, and shift output.
- UI: form controls, saved recipe management, and result display.

Simulation logic should not directly read from the DOM or `localStorage`.

## Engineering Guidelines

- Prefer simple, explicit code over early abstraction.
- Keep simulation functions deterministic and easy to unit test.
- Preserve user data compatibility when changing saved recipe formats.
- Add focused tests around simulation math once the model becomes concrete.
- Avoid dependencies unless they reduce meaningful complexity.

