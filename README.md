# Koolskamp Koers Dagplanner

Interactive day planning for Koolskamp Koers, to check with the organisation whether a women's race fits on the same day as the men's race. It shows a two-lane timeline, live summary cards, Sporza broadcast windows, a route map with rider positions and passage tables.

Static site: plain HTML, CSS and JavaScript. No build step, no dependencies to install. Open `index.html` in a browser, or serve the folder with GitHub Pages.

## Conventions

- **Code, file names, identifiers and comments: English.**
- **All user-facing text: Dutch (Belgian).** Time notation `10u15`, decimal comma `117,5`.
- **Do not use em dashes in user-facing text.**
- Brand: race yellow `#FFD201` and black `#000000`, corner radius 8 to 12 px, lots of white space. Women in yellow, men in black/anthracite, organisation blocks in light grey. Approach blocks are slightly lighter than the local laps of the same race.
- Look: modern dashboard style. Inter font, neutral greys, thin borders, cards with a title bar. Top bar with actions, settings in a sticky left sidebar (stacked above the content below 1024 px), results on the right.
- Must work in light and dark mode and stay readable on a projector.

## Structure

```
index.html            Page markup (Dutch copy)
css/styles.css        All styling, light/dark theme variables, print rules
js/config.js          Distances, fixed durations, default settings, limits
js/format.js          Time and number formatting (10u15, 10:15:24, 117,5)
js/schedule.js        Pure race calculations: blocks, passages, margin, broadcasts, rider positions
js/timeline.js        Renders the two-lane timeline (horizontal, or vertical on phones), tooltips, click-to-select time
js/route-map.js       MapLibre map (OpenFreeMap base map), GPX routes, rider markers, print snapshot
js/app.js             State, controls, cards, tables, theme, share link, playback, PDF export flow
js/pdf-export.js      Turns the print layout into a downloadable two-page PDF
data/route-data.js    Route coordinates generated from the GPX files
data/gpx/             Source GPX files (Strava export)
```

Scripts are loaded as classic scripts on a shared `window.KK` namespace, so the page also works when opened directly from disk (`file://`).

## Calculation rules

- Time at a point = start time + distance / average speed.
- **Women** (default 117,5 km): approach from Ardooie to the first passage at the finish line, 12,5 km (Kruiskalsijde at km 10,7), then `womenLaps` local laps of 15 km.
- **Men** (default 180,5 km): `menLoops` Ardooie loops of 16 km, turn-off to the circuit of 12,5 km (Kruiskalsijde at 10,7 km into the turn-off), then `menLaps` local laps of 15 km.
- Team presentation: 60 min, ends 5 min before the start. Start preparation: 5 min before the start.
- Podium starts at the finish and lasts `podiumDuration`.
- **Margin** = men's first passage at the finish line minus the end of the women's podium. Shown as "Comfortabel" (green) from `marginOk` (setting "Streefmarge"), "Beperkt" (orange) from `marginWarn` (setting "Minimummarge"), "Onvoldoende" (red) below that. A negative margin shows a red "Conflict: omloop niet vrij" block.
- **Sporza women** (Canvas / sporza.be), unless switched off: from 50 min before the women's finish (or a manual start time) to the end of the women's podium.
- **Sporza men** (VRT 1): from `menBroadcastStart` to the end of the men's podium.

## Route data

`data/route-data.js` is derived from the three GPX files:

| Key            | GPX file                        | Meaning                                              |
|----------------|---------------------------------|------------------------------------------------------|
| `ardooieLoop`  | `data/gpx/ardooie-loop.gpx`     | Loop in Ardooie, ridden by the men                   |
| `approach`     | `data/gpx/approach-to-finish.gpx` | Ardooie start to the finish line via Kruiskalsijde |
| `localLap`     | `data/gpx/local-lap.gpx`        | Local circuit, starts and ends at the finish line    |
| `kruiskalsijde`| (point)                         | Where the approach joins the local circuit           |

Points are `[lat, lon, elevation]`. The map scales each GPX track to the official distance, so rider positions are approximate. When a GPX file changes, regenerate `route-data.js` from it (parse `<trkpt>` lat/lon and `<ele>`, round to 5 decimals).

## Features

- All settings are visible at the top: speeds (women 36 to 46 km/u, men 42 to 50 km/u, step 0,5) and laps/loops with − and + buttons, start times, Sporza, podium duration and margin thresholds. Typed numbers are clamped to min, max and step.
- The broadcast switch sits in the same row as the women's broadcast start time (section "Uitzending"). Switched off (`womenBroadcast: false`), the broadcast band and legend item disappear and the time field is greyed out.
- VIP tent (`vipArrival`, `vipMenuStart`, `vipMenuEnd`): a third timeline lane with aperitif, three-course menu (soft edges, because tables do not eat at the same time) and 'free' to the end of the men's podium. Key moments are drawn as flags: a vertical line across all lanes that bends into a label under the lanes. Women's finish is yellow, men's first passage has the margin colour and men's finish is black. Each label picks the side with room and moves to a second row when it would touch another label (`Timeline.horizontalHtml`). The names are used everywhere: "Aankomst vrouwen", "Eerste passage mannen", "Aankomst mannen". A yellow line marks the women's finish across all lanes, so the viewer can judge for themselves where it falls. The three times stay in order (the changed field pushes the others). On phones the lane is a third column.
- The target margin (`marginOk`) can never be lower than the minimum margin (`marginWarn`): changing one pushes the other along. Checked when the field is left, not while typing.
- Settings (only the values that differ from the defaults) and theme are saved in `localStorage`. Own CSS and JS files carry a `?v=` number in `index.html` that goes up with every change, so browsers never mix old and new files.
- "Deel scenario" copies a link with the current settings in the URL hash (only values that differ from the defaults, e.g. `#womenSpeed=38&womenLaps=8`). Settings in the link win over saved settings. Unknown keys and invalid values are ignored.
- On screens up to 640 px wide the timeline is vertical: time runs down, women left, men right, lane names stick to the top while scrolling, and Sporza start and end times sit in the hour column. Print is always horizontal.
- The map's time line starts at the start of the women's race (the start of the approach block) and follows it when the start time changes, until someone clicks the timeline, uses the slider or plays; "Standaard" resets it.
- Timeline from 8u30 to 18u30. Hover a block for exact times and kilometres. Click the timeline to select a time.
- Map with playback; rider cards show lap and kilometre.
- "Exporteer PDF" downloads `koolskamp-dagplanner.pdf` (two A4 landscape pages, light mode) without the print dialog. Page 1: settings summary, key figures, timeline and the scenario link. Page 2: map with the passage tables next to it. The print layout hangs on `html.is-printing` (page 1170 px wide, map 540 x 540); `js/pdf-export.js` renders it with html-to-image, cuts it at `.detail` and puts both parts in a PDF with jsPDF. The map goes in as a still image (`RouteMap.snapshotForPrint`), because a WebGL canvas cannot be copied reliably. Cmd+P uses the same layout via `beforeprint`, but keeps the current theme.
- Theme buttons are a sun (light) and a moon (dark).

## Publishing

Hosted with GitHub Pages from the `main` branch, root folder. Every push to `main` updates the live site within a minute or two.

Base maps come from OpenFreeMap (light: `positron`, dark: `dark`) and need an internet connection. Fonts load from Google Fonts, MapLibre GL JS 4.7.1 from jsDelivr. html-to-image 1.11.11 and jsPDF 2.5.2 (also jsDelivr) load only when someone exports a PDF. The page has `noindex` so search engines do not list it.
