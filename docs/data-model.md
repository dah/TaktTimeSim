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

## Recipe mix

A recipe mix is a list of recipes for the selected machine plus the target share
of production for each recipe.

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

The mix comparison uses deterministic weighted calculations:

- Random mixed production weights each recipe's per-basket resource workload by
  its mix share, then uses the maximum weighted resource workload as the
  effective cycle time.
- Grouped production weights each recipe's standalone cycle time by its mix
  share, representing producing all of one recipe before the next while keeping
  the requested output proportions.

## Scenario

A scenario contains run assumptions that are separate from the machine spec and
recipe. Version 1 uses:

- `moveTimeSeconds`: finite, non-negative robot move time applied once per
  recipe stage, including the final move to unload. The default is `10`.
- `shiftLengthHours`: finite shift length greater than zero. The default is `8`.

The unload tank remains simulation behavior: users edit process stages before
unload, and the simulation appends the final unload move internally.
