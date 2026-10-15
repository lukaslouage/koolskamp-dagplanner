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

  /** The course of a race (start place, optional loop, approach), or the first course for an unknown id. */
  function courseOf(id) {
    const courses = KK.routeData.courses;
    return courses[id] ? { id, ...courses[id] } : { id: Object.keys(courses)[0], ...Object.values(courses)[0] };
  }

  /**
   * One race: team presentation, loops around the start place (if the course has a loop), the approach to the
   * finish line, the local laps and the podium. key is 'women' or 'men'; the settings are read with that prefix.
   * Distances are the official ones of each part; the map scales the GPX lines to them.
   */
  function buildRace(key, s) {
    const course = courseOf(s[`${key}Course`]);
    const start = f.parseTime(s[`${key}Start`]);
    const speed = Number(s[`${key}Speed`]);
    const loops = course.loop ? clampInt(s[`${key}Loops`], limits[`${key}Loops`], 0) : 0;
    const laps = clampInt(s[`${key}Laps`], limits[`${key}Laps`], 7);
    const timeAt = timeAtFactory(start, speed);
    const loopKm = course.loop ? course.loop.km : 0, approach = course.approach, lapKm = D.localLap;
    const place = course.start;

    const turnoffKm = loopKm * loops;
    const joinKm = turnoffKm + approach.joinKm;
    const firstPassageKm = turnoffKm + approach.km;
    const totalKm = firstPassageKm + lapKm * laps;
    const finish = timeAt(totalKm);
    const podiumEnd = finish + Number(s.podiumDuration || 0);

    const blocks = [
      { id: `${key}-intro`, lane: key, type: `${key}-intro`, name: 'Ploegvoorstelling', shortName: 'Ploegv.',
        start: start - introMinutes(s[`${key}IntroDuration`]), end: start },
    ];
    for (let i = 0; i < loops; i++) {
      const from = i * loopKm, to = from + loopKm;
      blocks.push({ id: `${key}-loop-${i + 1}`, lane: key, type: `${key}-loop`, segment: true, route: course.loop.route,
        name: `Lus ${i + 1} ${place}`, shortName: `L${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [`Doorkomst startzone ${place} om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: `${key}-approach`, lane: key, type: `${key}-approach`, name: 'Aanloop', shortName: 'Aanloop', route: approach.route,
      start: timeAt(turnoffKm), end: timeAt(firstPassageKm), kmFrom: turnoffKm, kmTo: firstPassageKm,
      details: [`${approach.joinName} km ${f.km(joinKm)} om ${f.exact(timeAt(joinKm))}`,
                `Eerste doorkomst meet om ${f.exact(timeAt(firstPassageKm))}`] });
    for (let i = 0; i < laps; i++) {
      const from = firstPassageKm + i * lapKm, to = from + lapKm;
      blocks.push({ id: `${key}-lap-${i + 1}`, lane: key, type: `${key}-lap`, segment: true, route: 'local-lap',
        name: `Ronde ${i + 1}`, shortName: `R${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [i === laps - 1 ? `Finish om ${f.exact(timeAt(to))}` : `Doorkomst meet om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: `${key}-podium`, lane: key, type: `${key}-podium`, name: 'Podium', shortName: 'Podium', start: finish, end: podiumEnd });

    const passages = [{ label: `Start ${place}`, km: 0, time: timeAt(0), key: true }];
    for (let i = 1; i <= loops; i++) {
      const km = i * loopKm;
      passages.push({ label: i === loops ? `Startzone ${place} ${i}, aanloop` : `Startzone ${place} ${i}`, km, time: timeAt(km) });
    }
    passages.push({ label: approach.joinName, km: joinKm, time: timeAt(joinKm), key: true });
    for (let i = 0; i < laps; i++) {
      const km = firstPassageKm + i * lapKm;
      passages.push({ label: `Doorkomst meet ${i + 1}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Finish', km: totalKm, time: finish, key: true });

    /** Where on the course a distance is: a label and a route with the fraction along it (for map and profile). */
    const locate = d => {
      if (d < turnoffKm) return { label: `Lus ${Math.floor(d / loopKm) + 1} ${place}`, route: course.loop.route, fraction: (d % loopKm) / loopKm };
      if (d < firstPassageKm) return { label: 'Aanloop', route: approach.route, fraction: (d - turnoffKm) / approach.km };
      return locateLap(d, firstPassageKm, laps);
    };

    return { key, course, start, speed, loops, laps, totalKm, timeAt, finish, podiumEnd, blocks, passages, locate,
      joinKm, joinName: approach.joinName, joinTime: timeAt(joinKm), firstPassageKm, firstPassageTime: timeAt(firstPassageKm) };
  }

  function locateLap(d, lapStartKm, laps) {
    const n = Math.min(laps, Math.floor((d - lapStartKm) / D.localLap) + 1);
    return { label: `Ronde ${n} van ${laps}`, route: 'local-lap', fraction: (d - lapStartKm - (n - 1) * D.localLap) / D.localLap };
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
    const women = buildRace('women', settings);
    const men = buildRace('men', settings);

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

  /** Position of each race at a given time, used by the map and the rider cards. */
  KK.riderPositions = function (schedule, time) {
    const position = race => {
      // Before the start the riders wait at the start place, after the finish at the finish line.
      const startRoute = race.loops > 0 ? race.course.loop.route : race.course.approach.route;
      if (time < race.start) return { state: 'pre', km: 0, route: startRoute, fraction: 0, label: 'Nog niet gestart', detail: `Start om ${f.clock(race.start)}` };
      const d = ((time - race.start) * race.speed) / 60;
      if (d >= race.totalKm) return { state: 'finished', km: race.totalKm, route: 'local-lap', fraction: 0, label: 'Aangekomen', detail: `Finish om ${f.clock(race.finish)}` };
      return { state: 'racing', km: d, ...race.locate(d), detail: `${f.km(d)} km gereden, nog ${f.km(race.totalKm - d)} km` };
    };
    return { women: position(schedule.women), men: position(schedule.men) };
  };
})();
