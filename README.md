# Dry Window (entry-ada)

The best dry windows for everyday outdoor jobs (washing, mowing, cycling, painting, dog walks) in 30 Irish towns, from Met Eireann forecasts, in plain words with the reason for each.

## Layout
- `site/`: the static page. It reads only the JSON saved next to it (`site/data/forecast.json`, `site/data/warnings.json`); no live calls.
  - `windows.js` finds windows per activity (Irish time, daylight only); `warnings.js` filters and shows warnings; `fresh.js` decides what is stale; `solar.js` works out sunrise and sunset; `towns.js` is the fixed town list.
- `scripts/fetch-forecast.js`: saves the forecast (one polite request per town, 1.5 s apart) and the warnings feed. On any failure it keeps the last good files. User-Agent: `DryWindow/0.1 (+https://github.com/jimcottam1)`.
- `.github/workflows/update.yml`: runs the tests, fetches at 05:00, 11:00, 17:00 and 23:00 UTC, tests again, commits the data and deploys to GitHub Pages. Written but not yet run.
- `test/`: `node --test test/*.test.js` (offline, using small saved fixtures in `test/fixtures/`).

## Why snapshots
The Met Eireann forecast API is plain http and its https address redirects to a host that would not answer, so a page on https cannot call it (tested 2 Nov 2026). The scheduled job fetches it instead.

## Credit and rules
Forecast and warnings: Met Eireann, CC BY 4.0 with its open data conditions: warnings shown alongside the forecast must be shown unaltered and not expired. No keys, no accounts, no tracking. Town and activity are remembered in this browser only.

Status: checkpoint 2 (first working version).
