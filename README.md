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
js/profile.js         Elevation profiles (women, men) under the map, with the rider dots
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
- Team presentation: its length is a setting per race (`womenIntroDuration`, `menIntroDuration`, default 60 min, 0 hides it); it ends at the start of the race.
- Podium starts at the finish and lasts `podiumDuration`.
- **Margin** = men's first passage at the finish line minus the end of the women's podium. Shown as "Comfortabel" (green) from `marginOk` (setting "Streefmarge"), "Beperkt" (orange) from `marginWarn` (setting "Minimummarge"), "Onvoldoende" (red) below that. A negative margin shows a red "Conflict: omloop niet vrij" block.
- The margin card shows the whole sum (`margin.parts`, `renderMarginSum` in `app.js`): women clear = the later of the end of the podium and the green flag car of the women; men come = first passage (minus the early break-away if there is one) minus the red flag car; margin = men come minus women clear. Times are rounded to the minute and the margin is the difference of those rounded times, so the sum on the screen always adds up. The card is wide next to the three other cards from 1400 px; on smaller screens it has its own row. It is also in the PDF.
- **Road closure (rode vlag, groene vlag):** each race has `womenRedFlag`/`menRedFlag` (minutes the red flag car drives ahead of the first rider) and `womenGreenFlag`/`menGreenFlag` (minutes the green flag car follows the winner), default 5 min each, in the sidebar block "Wegafsluiting". They are shown where the selected time is: on the timeline a short bar with a red and a green flag around the selected-time line in each lane whose race is on the road (red before the line, green after it; a vertical bar before the lane on phones), and on the map a red flag where the riders will be in `red` minutes, a green flag where they were `green` minutes ago and the stretch of road in between as a red glow (`KK.flagPositions`, `RouteMap.setFlags`). A flag past the start or the finish is left out. The flags and the glow are not in the PDF, which only has the settings in its summary. The margin runs from the moment the women are clear (the end of the podium or the green flag car of the women, whichever is later) to the red flag car of the men, so the red flag car of the men shortens the margin and the green flag car of the women only counts when it is later than the podium. Only the vehicles that mark the front and the rear of the race are modelled, not every car and motorbike. There is no general rule for the number of minutes (the Belgian police guidance only says the road is closed from the red to the green flag), so the values should be confirmed with the police zone or race director.
- **Early break-away (men):** `menBreakaway` (seconds, shown as m:ss, 0 to 15 min, default 0) is the lead of the first riders over the modelled group at the first passage at the finish line. It moves the first passage of the men (`men.firstRiderTime`) and with it the red flag car and the margin earlier; the finish, the average speed and the later laps do not change. The peloton time stays in the passage table (an extra row "vroege vlucht" appears) and on the first-passage card.
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
- VIP tent (`vipArrival`, `vipMenuStart`, `vipMenuEnd`): a third timeline lane with aperitif, three-course menu (soft edges, because tables do not eat at the same time) and 'free' to the end of the men's podium. Key moments are drawn as flags: a vertical line across all lanes that bends into a label under the lanes. Women's finish is yellow, men's first passage has the margin colour and men's finish is black. Each label picks the side with room (measured with the real font; the timeline has a 24 px gutter on the right for it) and moves to a second row when it would touch another label (`Timeline.horizontalHtml`). The names are used everywhere: "Aankomst vrouwen", "Eerste passage mannen", "Aankomst mannen". A yellow line marks the women's finish across all lanes, so the viewer can judge for themselves where it falls. The three times stay in order (the changed field pushes the others). On phones the lane is a third column.
- The target margin (`marginOk`) can never be lower than the minimum margin (`marginWarn`): changing one pushes the other along. Checked when the field is left, not while typing.
- Elevation profile (`js/profile.js`): one SVG per race inside the Parcours card, directly under the map and as wide as the map, built from the GPX elevation (`[lat, lon, ele]` in `data/route-data.js`). Every part of the race (Ardooie loops, approach, laps) is drawn in the timeline colours and the V and M dots follow the selected time like the map markers. The elevation is resampled every 25 m and smoothed over about 400 m; the climb is estimated (ups and downs below 1 m are ignored) and shown as "ongeveer". Both charts share one scale from 0 m to at least 100 m (guides every 50 m), so the flat course does not look like a hilly stage. The red closed stretch and the green and red flag follow the selected time on the profile as well. In the PDF the profile stays under the map (600 px wide, low charts, no note), with the passage tables beside the card, so page 2 fits on one A4 page (very long races scale page 2 down a little).
- Settings (only the values that differ from the defaults) and theme are saved in `localStorage`. Own CSS and JS files carry a `?v=` number in `index.html` that goes up with every change, so browsers never mix old and new files.
- "Deel scenario" copies a link with the current settings in the URL hash (only values that differ from the defaults, e.g. `#womenSpeed=38&womenLaps=8`). Settings in the link win over saved settings. Unknown keys and invalid values are ignored.
- On screens up to 640 px wide the timeline is vertical: time runs down, women left, men right, lane names stick to the top while scrolling, and Sporza start and end times sit in the hour column. Print is always horizontal.
- The map's time line starts at the start of the women's race (the start of the approach block) and follows it when the start time changes, until someone clicks the timeline, uses the slider or plays; "Standaard" resets it.
- Block titles in the timeline: the full name when there is room, the short name when not, and when even the short name does not fit sideways it is turned 90 degrees (read from bottom to top) as long as it fits the height of the block. A title is never cut off: it is either whole or left out. The times stay next to a turned title when the block is at least 72 px wide.
- Timeline from 8u30 to 18u30. Hover a block for exact times and kilometres. Click the timeline to select a time.
- Map with playback; rider cards show lap and kilometre.
- "Exporteer PDF" opens the PDF (two A4 landscape pages, light mode) in a new tab, without the print dialog. The tab is opened straight in the click handler (otherwise it is blocked as a pop-up) and shows "PDF wordt gemaakt" until the PDF is ready; if no tab can be opened, `koolskamp-dagplanner.pdf` is downloaded instead. Page 1: settings summary, key figures, timeline and the scenario link. Page 2: map and profile with the passage tables next to them. The print layout hangs on `html.is-printing` (page width fitted automatically by `fitPrintWidth()` so that page 1 has the A4 landscape shape, 1100 to 1400 px; map 600 x 280); `js/pdf-export.js` renders it with html-to-image, cuts it at `.detail` and puts both parts in a PDF with jsPDF. The map goes in as a still image (`RouteMap.snapshotForPrint`), because a WebGL canvas cannot be copied reliably. Cmd+P uses the same layout via `beforeprint`, but keeps the current theme.
- Theme buttons are a sun (light) and a moon (dark).

## Publishing

Hosted with GitHub Pages from the `main` branch, root folder. Every push to `main` updates the live site within a minute or two.

Base maps come from OpenFreeMap (light: `positron`, dark: `dark`) and need an internet connection. Fonts load from Google Fonts, MapLibre GL JS 4.7.1 from jsDelivr. html-to-image 1.11.11 and jsPDF 2.5.2 (also jsDelivr) load only when someone exports a PDF. The page has `noindex` so search engines do not list it.

## Hide parts of the timeline (eye)

`showBroadcast` and `showVip` (in `KK.config.defaults`, both `true`) are set with the eye in the heading of the Uitzending and VIP-tent groups in the sidebar. They only change the view: the timeline drops the broadcast bands and labels or the VIP lane (`.timeline--no-vip` shortens the lanes area through `--cut`; on phones there are two columns instead of three), and the print summary and PDF follow. The calculation and the margin are not affected. Like all settings they are saved and shared only when they differ from the default.
