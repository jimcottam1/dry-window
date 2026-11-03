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



## Draft wording for the owner to agree
All words people see are drafts. The headline (tag) lines, chosen by how good the best window is:

| Activity | Good | Okay | None |
|---|---|---|---|
| Washing out | A grand drying day | A bit of a gamble | Not a drying day |
| Mow the lawn | Mower weather | Damp grass risk | Leave the mower |
| Cycle | Bikes out | Bring a coat | Bring a coat, or stay in |
| Paint the fence | Paint while it lasts | Tight for painting | Too damp to paint |
| Walk the dog | A fine walking spell | A quick one | The dog will cope |

That is 15 tag lines (the brief said 26; I count 15 tags). Other draft wording: the one-line reasons in `site/windows.js` (`reason` for each activity), the notes "Nothing good before ..." and "No good window ...", the rain line, the day-by-day sentences, the share message, and the link notes in `site/app.js`.

## Visible rules
- Washing out: Dry, wind under 36 km/h, in daylight, at least 3 hours.
- Mow the lawn: Dry, and dry for the 2 hours before, wind under 30 km/h, in daylight, at least 3 hours.
- Cycle: Little or no rain, wind under 30 km/h, 3 degrees or warmer, in daylight, at least 2 hours.
- Paint the fence: Dry, 8 to 25 degrees, humidity under 85%, wind under 30 km/h, in daylight, at least 4 hours.
- Walk the dog: Little or no rain, wind under 40 km/h, in daylight, at least 2 hours.

Status: checkpoint 3 (polish). `node --test test/*.test.js`: 58 tests.
