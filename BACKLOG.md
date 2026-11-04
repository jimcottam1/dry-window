# Backlog

In priority order. The owner decides what's next; move an item to **Done** with its commit when it ships.

## Sprint 1 (in progress)
- **Live warnings and accurate licence wording** (Ada, branch dw-warnings): review fixes under way. Stale data must never bring back a cancelled warning; wording kept byte for byte.
- **Run the scheduled data job once by hand** before going live (needs a push to the private repo first).
- **Mowing edge case at the first forecast hour** (found by the Judge): Rowan to add the test and fix.

## Needs the owner's decision
- **Dry days outside the top three windows get no frame.** `findWindows` keeps only the top three across the forecast, so a fully dry day 4 or 5 shows no "Best window". Options: keep each day's best before the top-three cut (recommended), or add a line to the key saying only the top three are framed.
- **Draft wording:** 15 tag lines and the one-line reasons (see README).

## Accessibility (Iris)
- **Greyscale:** dry, light rain and dark hours become similar greys, so the strip leans on colour. Give each a second cue (pattern or texture), and check with colour-blindness filters.
- Label width: allow about 76 px for the window times (the Judge measured 11 bold characters at about 72 px).

## Done
- One frame round each day's best window, times always below, key "Best window" (6d38d46).
