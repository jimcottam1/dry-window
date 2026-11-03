# Dry Window (entry-ada)

Best dry windows for everyday outdoor jobs in Irish towns, from Met Éireann forecasts.

- `site/`: the static page (HTML, CSS, JS, data files). The page reads only JSON saved with the site.
- `scripts/`: snapshot fetcher (to come); `make-sample.js` writes the sketch's sample data.
- `test/`: tests, run with `node --test`.

Status: checkpoint 1 (sketch). Sample data only, no live fetching yet.

Credit: forecast and warnings from Met Éireann (CC BY 4.0 with its open data conditions). Warnings must be shown unaltered.
