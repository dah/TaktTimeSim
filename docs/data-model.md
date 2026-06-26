# Data Model Notes

## Machine

Machine stations can optionally define timer behavior that affects how process
countdown overlaps with robot moves. If `timerPausePolicy` is omitted or set to
`none`, the station uses normal countdown behavior.

The U50 oven uses:

```json
"timerPausePolicy": "pauseOnEntryOrExitMove"
```

For this policy, jobs in that station stop counting down during moves into or out
of the station. Jobs in other stations continue counting down normally during
those moves. The simulator represents this as station-specific effective
workload, not as a global pause.

## Recipe

A recipe is an ordered series of process stages. Each stage references a machine
tank number and defines the required process time in seconds.

Rules:

- Process times are always stored in seconds.
- The first recipe stage is always tank `0`.
- Recipe stages describe the process path before unload.
- When the final recipe stage is complete, the robot moves the basket to the
  unload tank.
- The unload move is part of simulation behavior, not an editable recipe stage.

Example:

```json
{
  "name": "Example U50 Recipe",
  "machineName": "U50",
  "stages": [
    {
      "tankNumber": 0,
      "processTimeSeconds": 0
    },
    {
      "tankNumber": 1,
      "processTimeSeconds": 300
    }
  ]
}
```

## Saved recipes

User-saved recipes are local-only and stored in browser `localStorage` under a
versioned saved-recipes collection. Each saved entry contains the plain recipe
fields plus local metadata:

- `id`: stable local identifier for load/update/delete actions.
- `createdAt`: ISO timestamp when the saved recipe was created.
- `updatedAt`: ISO timestamp when the saved recipe was last updated.

The simulation engine still consumes plain `Recipe` data. The UI strips saved
metadata when loading a recipe into an editor.

## Recipe mix

A recipe mix is a list of recipes for the selected machine plus the target share
of production for each recipe. In the UI, saved recipes for the selected machine
are shown together as the available recipe list; assigning a percentage to a
saved recipe includes it in the mix.

```json
{
  "entries": [
    {
      "id": "recipe-1",
      "percentage": 60,
      "recipe": { "name": "Recipe A", "machineName": "U50", "stages": [] }
    },
    {
      "id": "recipe-2",
      "percentage": 40,
      "recipe": { "name": "Recipe B", "machineName": "U50", "stages": [] }
    }
  ]
}
```

Mix percentages must total 100% to run a comparison. Drafts are still saved while
the total is incomplete so users can edit without losing work.

The mix simulation uses deterministic weighted calculations:

- Mixed production weights each recipe's per-basket resource workload by its mix
  share, then uses the maximum weighted resource workload as the effective cycle
  time.

## Scenario

A scenario contains run assumptions that are separate from the machine spec and
recipe. Version 1 uses:

- `moveTimeSeconds`: finite, non-negative robot move time applied once per
  recipe stage, including the final move to unload. The default is `45`.
- `shiftLengthHours`: finite shift length greater than zero. The default is `8`.

The unload tank remains simulation behavior: users edit process stages before
unload, and the simulation appends the final unload move internally.
