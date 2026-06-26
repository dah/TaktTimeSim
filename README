# TaktTimeSim

TaktTimeSim is a local-first browser app for modeling how industrial cleaning
and coating machine process times affect productivity.

The app currently includes the U50 machine spec and a simple editable recipe
model. It runs as a Vite + TypeScript app during development and builds to
static files that can be opened locally after unzipping.

## Requirements

- Node.js 20 or newer
- npm

Check your installed versions:

```sh
node --version
npm --version
```

## Run Locally

### macOS / Linux

From the project folder:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

### Windows PowerShell

From the project folder:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Run Tests

### macOS / Linux

```sh
npm test
```

### Windows PowerShell

```powershell
npm test
```

## Build Static Files

### macOS / Linux

```sh
npm run build
```

The static build is written to:

```text
dist/
```

To test the built app directly from the filesystem:

```sh
open dist/index.html
```

On Linux, use your file manager or:

```sh
xdg-open dist/index.html
```

### Windows PowerShell

```powershell
npm run build
```

The static build is written to:

```text
dist\
```

To test the built app directly from the filesystem:

```powershell
Start-Process .\dist\index.html
```

## Preview The Production Build

Vite can also serve the production build locally.

### macOS / Linux

```sh
npm run build
npm run preview
```

### Windows PowerShell

```powershell
npm run build
npm run preview
```

Open the URL printed by Vite.

## What To Try

- Change process times and confirm the results update.
- Add or remove recipe stages.
- Increase robot move time and confirm the robot can become the bottleneck.
- Refresh the page and confirm valid edits are restored from local storage.
- Use reset to restore the bundled example recipe.

## Project Structure

```text
src/data/machines/      Static machine specs
src/data/recipes/       Bundled example recipes
src/domain/             Shared TypeScript types
src/simulation/         Pure simulation logic and tests
src/storage/            localStorage helpers
src/ui/                 Vanilla TypeScript UI
```

## Distribution Notes

The production build is static. Vite is configured with relative asset paths, so
the contents of `dist/` can be zipped, shared, unzipped, and opened locally in a
browser.
