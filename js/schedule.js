// Pure race calculations. No DOM access here.
// Time at a point = start time + distance / average speed.
window.KK = window.KK || {};

(function () {
  const { distances: D, durations: DUR, limits } = KK.config;
  const f = KK.format;

  const clampInt = (value, { min, max }, fallback) => {
    const n = Math.round(Number(value));
    return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
  };

  /** Length of a team presentation in minutes; an empty or negative value counts as no presentation. */
  const introMinutes = value => Math.max(0, Number(value) || 0);

  function timeAtFactory(start, speed) {
    return km => start + (km * 60) / speed;
  }

  function buildWomen(s) {
    const start = f.parseTime(s.womenStart);
    const speed = Number(s.womenSpeed);
    const laps = clampInt(s.womenLaps, limits.womenLaps, 7);
    const timeAt = timeAtFactory(start, speed);

    const firstPassageKm = D.approachToFinish;
    const kruiskalsijdeKm = D.approachToKruiskalsijde;
    const totalKm = firstPassageKm + D.localLap * laps;
    const finish = timeAt(totalKm);
    const podiumEnd = finish + Number(s.podiumDuration || 0);

    const blocks = [
      { id: 'women-intro', lane: 'women', type: 'women-intro', name: 'Ploegvoorstelling', shortName: 'Ploegv.',
        start: start - introMinutes(s.womenIntroDuration), end: start },
      { id: 'women-approach', lane: 'women', type: 'women-approach', name: 'Aanloop', shortName: 'Aanloop',
        start: timeAt(0), end: timeAt(firstPassageKm), kmFrom: 0, kmTo: firstPassageKm,
        details: [`Kruiskalsijde km ${f.km(kruiskalsijdeKm)} om ${f.exact(timeAt(kruiskalsijdeKm))}`,
                  `Eerste doorkomst meet om ${f.exact(timeAt(firstPassageKm))}`] },
    ];
    for (let i = 0; i < laps; i++) {
      const from = firstPassageKm + i * D.localLap, to = from + D.localLap;
      blocks.push({ id: `women-lap-${i + 1}`, lane: 'women', type: 'women-lap', segment: true,
        name: `Ronde ${i + 1}`, shortName: `R${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [i === laps - 1 ? `Finish om ${f.exact(timeAt(to))}` : `Doorkomst meet om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: 'women-podium', lane: 'women', type: 'women-podium', name: 'Podium', shortName: 'Podium', start: finish, end: podiumEnd });

    const passages = [
      { label: 'Start Ardooie', km: 0, time: timeAt(0), key: true },
      { label: 'Kruiskalsijde', km: kruiskalsijdeKm, time: timeAt(kruiskalsijdeKm), key: true },
    ];
    for (let i = 0; i < laps; i++) {
      const km = firstPassageKm + i * D.localLap;
      passages.push({ label: `Doorkomst meet ${i + 1}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Finish', km: totalKm, time: finish, key: true });

    const locate = d => d < firstPassageKm
      ? { label: 'Aanloop', route: 'approach', fraction: d / D.approachToFinish }
      : locateLap(d, firstPassageKm, laps);

    return { start, speed, laps, totalKm, timeAt, finish, podiumEnd, firstPassageTime: timeAt(firstPassageKm), blocks, passages, locate };
  }

  function buildMen(s) {
    const start = f.parseTime(s.menStart);
    const speed = Number(s.menSpeed);
    const loops = clampInt(s.menLoops, limits.menLoops, 4);
    const laps = clampInt(s.menLaps, limits.menLaps, 7);
    const timeAt = timeAtFactory(start, speed);

    const turnoffKm = D.ardooieLoop * loops;
    const kruiskalsijdeKm = turnoffKm + D.approachToKruiskalsijde;
    const firstPassageKm = turnoffKm + D.approachToFinish;
    const totalKm = firstPassageKm + D.localLap * laps;
    const finish = timeAt(totalKm);
    const podiumEnd = finish + Number(s.podiumDuration || 0);

    const blocks = [
      { id: 'men-intro', lane: 'men', type: 'men-intro', name: 'Ploegvoorstelling', shortName: 'Ploegv.',
        start: start - introMinutes(s.menIntroDuration), end: start },
    ];
    for (let i = 0; i < loops; i++) {
      const from = i * D.ardooieLoop, to = from + D.ardooieLoop;
      blocks.push({ id: `men-loop-${i + 1}`, lane: 'men', type: 'men-loop', segment: true,
        name: `Lus ${i + 1} Ardooie`, shortName: `L${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [`Doorkomst startzone Ardooie om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: 'men-turnoff', lane: 'men', type: 'men-turnoff', name: 'Aanloop', shortName: 'Aanloop',
      start: timeAt(turnoffKm), end: timeAt(firstPassageKm), kmFrom: turnoffKm, kmTo: firstPassageKm,
      details: [`Kruiskalsijde km ${f.km(kruiskalsijdeKm)} om ${f.exact(timeAt(kruiskalsijdeKm))}`,
                `Eerste doorkomst meet om ${f.exact(timeAt(firstPassageKm))}`] });
    for (let i = 0; i < laps; i++) {
      const from = firstPassageKm + i * D.localLap, to = from + D.localLap;
      blocks.push({ id: `men-lap-${i + 1}`, lane: 'men', type: 'men-lap', segment: true,
        name: `Ronde ${i + 1}`, shortName: `R${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [i === laps - 1 ? `Finish om ${f.exact(timeAt(to))}` : `Doorkomst meet om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: 'men-podium', lane: 'men', type: 'men-podium', name: 'Podium', shortName: 'Podium', start: finish, end: podiumEnd });

    const passages = [{ label: 'Start Ardooie', km: 0, time: timeAt(0), key: true }];
    for (let i = 1; i <= loops; i++) {
      const km = i * D.ardooieLoop;
      passages.push({ label: i === loops ? `Startzone Ardooie ${i}, aanloop` : `Startzone Ardooie ${i}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Kruiskalsijde', km: kruiskalsijdeKm, time: timeAt(kruiskalsijdeKm), key: true });
    for (let i = 0; i < laps; i++) {
      const km = firstPassageKm + i * D.localLap;
      passages.push({ label: `Doorkomst meet ${i + 1}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Finish', km: totalKm, time: finish, key: true });

    const locate = d => {
      if (d < turnoffKm) return { label: `Lus ${Math.floor(d / D.ardooieLoop) + 1} Ardooie`, route: 'ardooieLoop', fraction: (d % D.ardooieLoop) / D.ardooieLoop };
      if (d < firstPassageKm) return { label: 'Aanloop', route: 'approach', fraction: (d - turnoffKm) / D.approachToFinish };
      return locateLap(d, firstPassageKm, laps);
    };

    return { start, speed, loops, laps, totalKm, timeAt, finish, podiumEnd, blocks, passages, locate,
      kruiskalsijdeKm, kruiskalsijdeTime: timeAt(kruiskalsijdeKm), firstPassageKm, firstPassageTime: timeAt(firstPassageKm) };
  }

  function locateLap(d, lapStartKm, laps) {
    const n = Math.min(laps, Math.floor((d - lapStartKm) / D.localLap) + 1);
    return { label: `Ronde ${n} van ${laps}`, route: 'localLap', fraction: (d - lapStartKm - (n - 1) * D.localLap) / D.localLap };
  }

  /**
   * Builds the full day schedule from user settings.
   * Margin = men's first passage at the finish line minus end of the women's podium.
   */
  /**
   * VIP tent: aperitif, three-course menu, then free. The menu times are approximate (not all tables
   * eat at the same time), so the times are kept in order instead of being refused. 'Free' runs to the
   * end of the men's podium, the end of the race.
   */
  function buildVip(s, women, men) {
    const arrival = f.parseTime(s.vipArrival);
    const menuStart = Math.max(arrival, f.parseTime(s.vipMenuStart));
    const menuEnd = Math.max(menuStart, f.parseTime(s.vipMenuEnd));
    const raceEnd = Math.max(menuEnd, men.podiumEnd);
    return {
      arrival, menuStart, menuEnd, raceEnd,
      blocks: [
        { id: 'vip-aperitif', lane: 'vip', type: 'vip-aperitif', name: 'Aperitief', shortName: 'Aperitief',
          start: arrival, end: menuStart, details: [`Gasten komen toe om ${f.exact(arrival)}`] },
        { id: 'vip-menu', lane: 'vip', type: 'vip-menu', name: '3-gangenmenu', shortName: '3 gangen',
          start: menuStart, end: menuEnd, details: ['Tijden bij benadering: niet alle tafels eten tegelijk'] },
        { id: 'vip-free', lane: 'vip', type: 'vip-free', name: 'Vrij', shortName: 'Vrij',
          start: menuEnd, end: raceEnd, details: ['Drank à volonte tot het einde van de koers'] },
      ],
    };
  }

  KK.computeSchedule = function (settings) {
    const women = buildWomen(settings);
    const men = buildMen(settings);

    // The circuit must be clear for the men's red flag car, not only for the men: it passes the finish line
    // menRedFlag minutes before the first rider. It is free for the men once the women are done: the end of
    // the podium or, if later, the green flag car of the women's race.
    const minutes = value => Math.max(0, Number(value) || 0);
    // An early break-away is ahead of the modelled group when the men first reach the circuit. The red flag car
    // drives ahead of the first rider, so it is the break-away that decides when the road must be clear.
    men.breakaway = Math.min(15, minutes(Number(settings.menBreakaway) / 60));
    men.firstRiderTime = men.firstPassageTime - men.breakaway;
    if (men.breakaway > 0) {
      const index = men.passages.findIndex(p => p.label === 'Doorkomst meet 1');
      if (index >= 0) men.passages.splice(index, 0, { label: 'Doorkomst meet 1, vroege vlucht', km: men.firstPassageKm, time: men.firstRiderTime });
    }
    const closures = {
      women: { lane: 'women', start: women.firstPassageTime - minutes(settings.womenRedFlag), end: women.finish + minutes(settings.womenGreenFlag),
        red: minutes(settings.womenRedFlag), green: minutes(settings.womenGreenFlag) },
      men: { lane: 'men', start: men.firstRiderTime - minutes(settings.menRedFlag), end: men.finish + minutes(settings.menGreenFlag),
        red: minutes(settings.menRedFlag), green: minutes(settings.menGreenFlag) },
    };
    const womenClear = Math.max(women.podiumEnd, closures.women.end);
    const marginRaw = closures.men.start - womenClear;
    // The sum is shown with times rounded to the minute, so the margin is the difference of those rounded times
    // (it can differ by a minute from the exact difference, but then the sum on the screen always adds up).
    const marginMinutes = Math.round(closures.men.start) - Math.round(womenClear);
    const ok = Number(settings.marginOk) || 0, warn = Number(settings.marginWarn) || 0;
    const conflict = marginMinutes < 0;
    const status = conflict ? 'bad' : marginMinutes >= ok ? 'ok' : marginMinutes >= warn ? 'warn' : 'bad';
    const margin = { raw: marginRaw, minutes: marginMinutes, status, conflict, from: womenClear, to: closures.men.start,
      // The parts of the sum: women clear = the later of the end of the podium and the green flag car of the women;
      // men come = first rider (the break-away if there is one) minus the red flag car.
      parts: { womenFinish: women.finish, podiumMinutes: minutes(settings.podiumDuration), podiumEnd: women.podiumEnd,
        womenGreenMinutes: closures.women.green, womenGreenEnd: closures.women.end, womenClear,
        menPeloton: men.firstPassageTime, menBreakawaySeconds: Math.round(men.breakaway * 60), menFirstRider: men.firstRiderTime,
        menRedMinutes: closures.men.red, menRed: closures.men.start } };

    if (margin.conflict) {
      women.blocks.push({ id: 'women-conflict', lane: 'women', type: 'conflict', name: 'Conflict: weg niet vrij', shortName: 'Conflict',
        start: closures.men.start, end: womenClear,
        details: [`Rode vlag mannen om ${f.exact(closures.men.start)} (eerste passage om ${f.exact(men.firstRiderTime)})`,
                  `Weg vrij na vrouwen om ${f.exact(womenClear)}`, `Tekort: ${f.duration(-marginRaw)}`] });
    } else {
      women.blocks.push({ id: 'women-margin', lane: 'women', type: 'org', name: `Marge ${marginMinutes} min`, shortName: `${marginMinutes} min`,
        start: womenClear, end: closures.men.start,
        details: [`Weg vrij na vrouwen om ${f.exact(womenClear)}`, `Rode vlag mannen om ${f.exact(closures.men.start)} (eerste passage om ${f.exact(men.firstRiderTime)})`] });
    }

    const womenBroadcastStart = settings.womenBroadcastStart
      ? f.parseTime(settings.womenBroadcastStart)
      : women.finish - DUR.womenBroadcastLeadBeforeFinish;
    const broadcasts = [
      { race: 'men', channel: 'VRT 1', start: f.parseTime(settings.menBroadcastStart), end: men.podiumEnd },
    ];
    if (settings.womenBroadcast !== false) {
      broadcasts.unshift({ race: 'women', channel: 'Canvas', start: womenBroadcastStart, end: women.podiumEnd });
    }

    const vip = buildVip(settings, women, men);
    const blocks = [...women.blocks, ...men.blocks, ...vip.blocks];
    return { women, men, vip, margin, closures, broadcasts, blocks, blockById: Object.fromEntries(blocks.map(b => [b.id, b])) };
  };

  /**
   * Where the red flag car (ahead of the riders) and the green flag car (behind them) are at a given time, and the
   * stretch of road between them. The red flag car is where the riders will be in `red` minutes, the green flag car
   * where they were `green` minutes ago. A flag past the start or the finish is left out; the stretch then ends
   * at the start or the finish. Returns { women, men }, each null while that race is not on the road.
   */
  KK.flagPositions = function (schedule, time) {
    const result = {};
    ['women', 'men'].forEach(key => {
      const race = schedule[key], closure = schedule.closures[key];
      if (time < race.start || time >= race.finish) { result[key] = null; return; }
      const distanceAt = t => ((t - race.start) * race.speed) / 60;
      const place = d => ({ km: d, ...race.locate(Math.min(d, race.totalKm - 0.001)) });
      const dRed = distanceAt(time + closure.red), dGreen = distanceAt(time - closure.green);
      const from = Math.max(0, dGreen), to = Math.min(race.totalKm, dRed);
      const stretch = [];
      const step = 0.15;
      for (let d = from; d < to; d += step) stretch.push(place(d));
      stretch.push(place(to));
      result[key] = { red: dRed < race.totalKm ? place(dRed) : null, green: dGreen > 0 ? place(dGreen) : null, stretch, redMinutes: closure.red, greenMinutes: closure.green };
    });
    return result;
  };

  /**
   * The speed range of a race (womenSpeedSlow/Fast, menSpeedSlow/Fast) turned into two extreme cases for the margin.
   * Worst: the women ride slow and the men fast (the women are clear late, the men come early). Best: the opposite.
   * Everything else stays as set. The expected speed always lies inside the range.
   */
  KK.speedCases = function (settings) {
    const value = (key, fallback) => (Number.isFinite(Number(settings[key])) && settings[key] !== '' ? Number(settings[key]) : fallback);
    const women = Number(settings.womenSpeed), men = Number(settings.menSpeed);
    const range = (race, expected) => ({
      slow: Math.min(expected, value(`${race}SpeedSlow`, expected)),
      fast: Math.max(expected, value(`${race}SpeedFast`, expected)),
    });
    const w = range('women', women), m = range('men', men);
    return {
      worst: { ...settings, womenSpeed: w.slow, menSpeed: m.fast },
      best: { ...settings, womenSpeed: w.fast, menSpeed: m.slow },
    };
  };

  /** Schedules of the worst and the best case (see KK.speedCases). */
  KK.computeRange = function (settings) {
    const cases = KK.speedCases(settings);
    return { worst: KK.computeSchedule(cases.worst), best: KK.computeSchedule(cases.best) };
  };

  /** Position of each race at a given time, used by the map and the rider cards. */
  KK.riderPositions = function (schedule, time) {
    const position = race => {
      if (time < race.start) return { state: 'pre', km: 0, label: 'Nog niet gestart', detail: `Start om ${f.clock(race.start)}` };
      const d = ((time - race.start) * race.speed) / 60;
      if (d >= race.totalKm) return { state: 'finished', km: race.totalKm, label: 'Aangekomen', detail: `Finish om ${f.clock(race.finish)}` };
      return { state: 'racing', km: d, ...race.locate(d), detail: `${f.km(d)} km gereden, nog ${f.km(race.totalKm - d)} km` };
    };
    return { women: position(schedule.women), men: position(schedule.men) };
  };
})();
