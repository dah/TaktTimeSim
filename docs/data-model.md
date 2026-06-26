# Data Model Notes

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
metadata when loading a recipe into the editor.

## Scenario

A scenario contains run assumptions that are separate from the machine spec and
recipe. Version 1 uses:

- `moveTimeSeconds`: finite, non-negative robot move time applied once per
  recipe stage, including the final move to unload. The default is `10`.
- `shiftLengthHours`: finite shift length greater than zero. The default is `8`.

The unload tank remains simulation behavior: users edit process stages before
unload, and the simulation appends the final unload move internally.
