# Dry Window: notes for agents

The best dry windows for everyday outdoor jobs in Irish towns, from Met Éireann forecasts, in plain words. A static site for GitHub Pages: a scheduled GitHub Action fetches the forecast and warnings into `site/data/`, and the page works out the windows in the browser. Built in the blue-sky competition (winner, 83/100); see README.md for the layout, the window rules and the draft wording.

## Commands
- `node --test test/*.test.js`: offline tests. Must pass before any commit.
- `node scripts/fetch-forecast.js`: real fetch from Met Éireann (polite: one request per town, 1.5 s apart). Run only when asked; never in tests.
- Preview: `npx serve site -l <port>` (use 4100 to 4199; Chrome blocks 5061).

## Team
Lead: **Ada**. Developer: **Pip**. Shared specialists: **Sage** (sources and licences), **Iris** (design and accessibility), **Rowan** (testing). Reviewer: **the Judge** (Opus). Agent definitions are in `.claude/agents/`. Everyone keeps a progress log in `C:\Users\jim_c\competition-board\agents\<name>\diary.md`.

## How we work
- **Test first**, offline, with small saved fixtures of the real formats; break the code on purpose to prove each key test bites, and log which breakages were caught.
- Each change in its own worktree branch; the Judge reviews it; the orchestrator verifies, merges and previews; **nothing is pushed without the owner's "push"**.
- Check anything visible at desktop width and in a 390 × 844 iframe, with no console errors, in one browser tab you created yourself; close it and stop your server when done. The PC is short of memory: never run more than one server.
- Words readers see are drafts until the owner agrees them.

## Rules
- **Met Éireann data** (Met Éireann Custom Open Data Licence, 22 May 2018: based on CC BY 4.0 but its own licence): credit it; warnings shown with the forecast must be **unaltered and current**, and expired warnings removed. Say what the licence is accurately.
- Only permitted sources (check `robots.txt` and terms); honest User-Agent `DryWindow/0.1 (+https://github.com/jimcottam1)`; never get round blocks.
- No keys, accounts, tracking or third-party scripts. Saved town and activity stay in the browser only.
- A failed fetch keeps the last good data; stale data is flagged on the page.
- Escape everything shown on the page; only http(s) links.
