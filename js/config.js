// Static race configuration. Distances in km, durations in minutes, times in minutes since midnight.
window.KK = window.KK || {};

KK.config = {
  // Version of the site, shown in the footer and the PDF. Raise it with every published change that users can
  // see (see CLAUDE.md); index.html uses the same number as ?v= on its own files, so browsers fetch the new files.
  version: '2.0',
  released: '2026-10-16',

  timelineAxis: { start: 8 * 60 + 30, end: 18 * 60 + 30 },

  distances: {
    approachToFinish: 12.5,        // Ardooie start (or loop exit) to first passage at the finish line
    approachToKruiskalsijde: 10.7, // point where the approach joins the local circuit
    ardooieLoop: 16,
    localLap: 15,
  },

  durations: {
    womenBroadcastLeadBeforeFinish: 50,
  },

  defaults: {
    // Expected average speeds and the range around them (slow, fast), from ProCyclingStats:
    // men = Kampioenschap van Vlaanderen 2021 to 2026 (44,6 to 48,0, average 46,5);
    // women = flat Flemish 1.1/1.2 women's races 2022 to 2026 (mostly 38,5 to 42, average 40,7). See README.
    womenSpeed: 40.5,
    womenSpeedSlow: 38.5,
    womenSpeedFast: 42,
    menSpeed: 46.5,
    menSpeedSlow: 44.5,
    menSpeedFast: 48,
    womenStart: '10:00',
    menStart: '13:00',
    womenIntroDuration: 45,   // team presentation, minutes (ends at the start)
    menIntroDuration: 60,
    womenLaps: 7,
    menLoops: 2,
    menLaps: 9,
    podiumDuration: 25,
    marginOk: 35,
    marginWarn: 15,
    womenRedFlag: 2,          // minutes the red flag car drives ahead of the first rider (road closed from then on)
    womenGreenFlag: 3,        // minutes the green flag car follows the winner (road open again after that)
    menRedFlag: 2,
    menGreenFlag: 3,
    menBreakaway: 120,        // seconds the early break-away is ahead of the modelled group at the first passage (men only)
    vipArrival: '11:30',      // guests arrive, aperitif starts
    vipMenuStart: '12:45',    // three-course menu starts (roughly, tables do not start together)
    vipMenuEnd: '14:30',      // three-course menu is over (roughly)
    womenBroadcast: true,     // false = the women's race is not broadcast
    womenBroadcastStart: '', // empty = automatic (lead time before women finish)
    menBroadcastStart: '15:30',
    showBroadcast: true,      // the eye in the sidebar: false hides the broadcast in the timeline (view only, no effect on the calculation)
    showVip: true,            // same for the VIP tent lane
  },

  limits: {
    womenLaps: { min: 1, max: 15 },
    menLoops: { min: 0, max: 10 },
    menLaps: { min: 1, max: 15 },
  },

  storageKey: 'kk-dagplanner-settings-v2', // v2 stores only changed values; v1 held all old defaults
  variantsStorageKey: 'kk-dagplanner-variants-v1', // the variants (A, B, C) on screen: { active, reference, view, variants }
  maxVariants: 3,
  scenariosStorageKey: 'kk-dagplanner-scenarios-v1', // saved scenarios: [{ id, name, settings (changes only), savedAt }]
  activeScenarioKey: 'kk-dagplanner-active-scenario',
  sidebarStorageKey: 'kk-dagplanner-sidebar',
  themeStorageKey: 'kk-dagplanner-theme',
};
