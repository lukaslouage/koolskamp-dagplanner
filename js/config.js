// Static race configuration. Distances in km, durations in minutes, times in minutes since midnight.
window.KK = window.KK || {};

KK.config = {
  timelineAxis: { start: 8 * 60 + 30, end: 18 * 60 + 30 },

  distances: {
    approachToFinish: 12.5,        // Ardooie start (or loop exit) to first passage at the finish line
    approachToKruiskalsijde: 10.7, // point where the approach joins the local circuit
    ardooieLoop: 16,
    localLap: 15,
  },

  durations: {
    teamPresentation: 60,
    teamPresentationGapBeforeStart: 5,
    startPreparation: 5,
    womenBroadcastLeadBeforeFinish: 50,
  },

  defaults: {
    womenSpeed: 42,
    menSpeed: 48,
    womenStart: '10:30',
    menStart: '13:00',
    womenLaps: 7,
    menLoops: 3,
    menLaps: 8,
    podiumDuration: 20,
    marginOk: 45,
    marginWarn: 30,
    womenBroadcast: true,     // false = the women's race is not broadcast
    womenBroadcastStart: '', // empty = automatic (lead time before women finish)
    menBroadcastStart: '15:30',
  },

  limits: {
    womenLaps: { min: 1, max: 15 },
    menLoops: { min: 0, max: 10 },
    menLaps: { min: 1, max: 15 },
  },

  defaultSelectedTime: 13 * 60,
  storageKey: 'kk-dagplanner-settings',
  themeStorageKey: 'kk-dagplanner-theme',
};
