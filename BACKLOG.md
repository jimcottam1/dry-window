# Backlog

In priority order. The owner decides what's next; move an item to **Done** with its commit when it ships.

## Sprint 1 (in progress)
- **Live warnings and accurate licence wording** (Ada, branch dw-warnings): review fixes under way. Stale data must never bring back a cancelled warning; wording kept byte for byte.
- **Run the scheduled data job once by hand** before going live (needs a push to the private repo first).

## Needs the owner's decision
- **Draft wording:** 15 tag lines and the one-line reasons (see README).

## Accessibility (Iris)
- **Greyscale:** dry, light rain and dark hours become similar greys, so the strip leans on colour. Give each a second cue (pattern or texture), and check with colour-blindness filters.
- Label width: allow about 76 px for the window times (the Judge measured 11 bold characters at about 72 px).

## Done
- One frame round each day's best window, times always below, key "Best window" (6d38d46).
- Every dry day keeps its best window beyond the top three, so each gets a frame (e2b34dc, branch dw-sprint1).
- Mowing at the first forecast hour: regression test added; the code was already right, the Judge's mutation had just escaped (e2b34dc).
- Short wording for counties whose region code is unconfirmed (883fccb).
- Separate 3 s timeout for the warnings snapshot, `snapshotTimeoutMs` (6222bb4).
