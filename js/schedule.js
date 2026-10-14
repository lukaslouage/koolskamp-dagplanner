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
        start: start - DUR.teamPresentationGapBeforeStart - DUR.teamPresentation, end: start - DUR.teamPresentationGapBeforeStart },
      { id: 'women-prep', lane: 'women', type: 'org', name: 'Klaarmaken voor start', shortName: 'Klaar',
        start: start - DUR.startPreparation, end: start },
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

    return { start, speed, laps, totalKm, timeAt, finish, podiumEnd, blocks, passages, locate };
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
        start: start - DUR.teamPresentationGapBeforeStart - DUR.teamPresentation, end: start - DUR.teamPresentationGapBeforeStart },
      { id: 'men-prep', lane: 'men', type: 'org', name: 'Klaarmaken voor start', shortName: 'Klaar',
        start: start - DUR.startPreparation, end: start },
    ];
    for (let i = 0; i < loops; i++) {
      const from = i * D.ardooieLoop, to = from + D.ardooieLoop;
      blocks.push({ id: `men-loop-${i + 1}`, lane: 'men', type: 'men-loop', segment: true,
        name: `Lus ${i + 1} Ardooie`, shortName: `L${i + 1}`, start: timeAt(from), end: timeAt(to), kmFrom: from, kmTo: to,
        details: [`Doorkomst startzone Ardooie om ${f.exact(timeAt(to))}`] });
    }
    blocks.push({ id: 'men-turnoff', lane: 'men', type: 'men-turnoff', name: 'Afdraai naar omloop', shortName: 'Afdraai',
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
      passages.push({ label: i === loops ? `Startzone Ardooie ${i}, afdraai` : `Startzone Ardooie ${i}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Kruiskalsijde', km: kruiskalsijdeKm, time: timeAt(kruiskalsijdeKm), key: true });
    for (let i = 0; i < laps; i++) {
      const km = firstPassageKm + i * D.localLap;
      passages.push({ label: `Doorkomst meet ${i + 1}`, km, time: timeAt(km) });
    }
    passages.push({ label: 'Finish', km: totalKm, time: finish, key: true });

    const locate = d => {
      if (d < turnoffKm) return { label: `Lus ${Math.floor(d / D.ardooieLoop) + 1} Ardooie`, route: 'ardooieLoop', fraction: (d % D.ardooieLoop) / D.ardooieLoop };
      if (d < firstPassageKm) return { label: 'Afdraai naar omloop', route: 'approach', fraction: (d - turnoffKm) / D.approachToFinish };
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

    const marginRaw = men.firstPassageTime - women.podiumEnd;
    const marginMinutes = Math.round(marginRaw);
    const ok = Number(settings.marginOk) || 0, warn = Number(settings.marginWarn) || 0;
    const status = marginRaw < 0 ? 'bad' : marginMinutes >= ok ? 'ok' : marginMinutes >= warn ? 'warn' : 'bad';
    const margin = { raw: marginRaw, minutes: marginMinutes, status, conflict: marginRaw < 0, from: women.podiumEnd, to: men.firstPassageTime };

    if (margin.conflict) {
      women.blocks.push({ id: 'women-conflict', lane: 'women', type: 'conflict', name: 'Conflict: omloop niet vrij', shortName: 'Conflict',
        start: men.firstPassageTime, end: women.podiumEnd,
        details: [`Eerste passage mannen om ${f.exact(men.firstPassageTime)}`,
                  `Einde podium vrouwen om ${f.exact(women.podiumEnd)}`, `Tekort: ${f.duration(-marginRaw)}`] });
    } else {
      women.blocks.push({ id: 'women-margin', lane: 'women', type: 'org', name: `Marge ${marginMinutes} min`, shortName: `${marginMinutes} min`,
        start: women.podiumEnd, end: men.firstPassageTime,
        details: [`Eerste passage mannen om ${f.exact(men.firstPassageTime)}`] });
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
    return { women, men, vip, margin, broadcasts, blocks, blockById: Object.fromEntries(blocks.map(b => [b.id, b])) };
  };

  /** Position of each race at a given time, used by the map and the rider cards. */
  KK.riderPositions = function (schedule, time) {
    const position = race => {
      if (time < race.start) return { state: 'pre', label: 'Nog niet gestart', detail: `Start om ${f.clock(race.start)}` };
      const d = ((time - race.start) * race.speed) / 60;
      if (d >= race.totalKm) return { state: 'finished', label: 'Aangekomen', detail: `Finish om ${f.clock(race.finish)}` };
      return { state: 'racing', ...race.locate(d), detail: `${f.km(d)} km gereden, nog ${f.km(race.totalKm - d)} km` };
    };
    return { women: position(schedule.women), men: position(schedule.men) };
  };
})();
