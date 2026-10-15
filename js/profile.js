// Elevation profiles under the map: one for the women's race and one for the men's race, with every part of
// the race (Ardooie loops, approach, laps) in the colours of the timeline and a dot for the current position.
// Elevation comes from the GPX files (KK.routeData, [lat, lon, ele]). Like the map, the length of a GPX route
// is scaled to the official length of that part of the course.
window.KK = window.KK || {};

KK.Profile = class {
  static LAYOUT = { height: 84, printHeight: 76, padLeft: 48, padRight: 12, padTop: 18, padBottom: 20, dotRadius: 9 };

  /** The charts are a little lower on paper, so the second page of the PDF fits. */
  static height() {
    return document.documentElement.classList.contains('is-printing') ? KK.Profile.LAYOUT.printHeight : KK.Profile.LAYOUT.height;
  }

  constructor(containers, routeData) {
    this.containers = containers; // { women: element, men: element }
    this.routes = {
      ardooieLoop: this.prepareRoute(routeData.ardooieLoop),
      approach: this.prepareRoute(routeData.approach),
      localLap: this.prepareRoute(routeData.localLap),
    };
    this.schedule = null;
    this.positions = null;
    this.key = null;
    this.charts = {};
    if (window.ResizeObserver) {
      let lastWidth = 0;
      new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        if (Math.abs(width - lastWidth) > 2 && this.schedule) { lastWidth = width; this.render(this.schedule); }
      }).observe(containers.women);
    }
  }

  /** Resamples a route every 25 m and smooths the elevation over about 400 m (the raw data is jumpy by a metre or two). */
  prepareRoute(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + KK.RouteMap.haversineKm(points[i - 1], points[i]));
    const total = cumulative[cumulative.length - 1];
    const n = Math.max(2, Math.round(total * 40));
    const raw = [];
    let j = 1;
    for (let i = 0; i <= n; i++) {
      const distance = (total * i) / n;
      while (j < cumulative.length - 1 && cumulative[j] < distance) j++;
      const span = cumulative[j] - cumulative[j - 1] || 1;
      const k = (distance - cumulative[j - 1]) / span;
      raw.push(points[j - 1][2] + (points[j][2] - points[j - 1][2]) * k);
    }
    const halfWindow = 8; // +/- 200 m
    const ele = raw.map((_, i) => {
      const from = Math.max(0, i - halfWindow), to = Math.min(raw.length - 1, i + halfWindow);
      let sum = 0;
      for (let m = from; m <= to; m++) sum += raw[m];
      return sum / (to - from + 1);
    });
    return { n, ele };
  }

  /** Elevation at a fraction (0..1) of a route. */
  eleAt(route, fraction) {
    const x = Math.max(0, Math.min(1, fraction)) * route.n;
    const i = Math.min(route.n - 1, Math.floor(x));
    return route.ele[i] + (route.ele[i + 1] - route.ele[i]) * (x - i);
  }

  /** Climbing metres of a series, ignoring ups and downs of less than a metre. */
  static climb(values) {
    let gain = 0, reference = values[0];
    values.forEach(v => {
      if (v > reference + 1) { gain += v - reference; reference = v; }
      else if (v < reference - 1) reference = v;
    });
    return gain;
  }

  /** The parts of a race (approach, loops, laps) with their elevation points. */
  segments(race) {
    return race.blocks.filter(block => block.kmFrom != null).map(block => {
      const routeKey = block.type.endsWith('loop') ? 'ardooieLoop' : block.type.endsWith('lap') ? 'localLap' : 'approach';
      const length = block.kmTo - block.kmFrom;
      const steps = Math.max(2, Math.round(length * 10));
      const points = [];
      for (let i = 0; i <= steps; i++) points.push([block.kmFrom + (length * i) / steps, this.eleAt(this.routes[routeKey], i / steps)]);
      return { id: block.id, type: block.type, name: block.name, shortName: block.shortName, from: block.kmFrom, to: block.kmTo, routeKey, points, climb: KK.Profile.climb(points.map(p => p[1])) };
    });
  }

  render(schedule) {
    this.schedule = schedule;
    const width = Math.floor(this.containers.women.clientWidth);
    if (width < 120) return;
    const races = { women: schedule.women, men: schedule.men };
    const segments = { women: this.segments(schedule.women), men: this.segments(schedule.men) };
    const key = [width, KK.Profile.height(), ...['women', 'men'].map(r => segments[r].map(s => `${s.type}:${s.from}:${s.to}`).join(','))].join('|');
    if (key !== this.key) {
      this.key = key;
      // Both charts share one scale, from 0 m to at least 100 m. The course is flat, and a tight scale would make
      // it look like a hilly stage.
      const highest = Math.max(...[...segments.women, ...segments.men].flatMap(s => s.points.map(p => p[1])));
      const yMin = 0, yMax = Math.max(100, Math.ceil((highest + 5) / 50) * 50);
      ['women', 'men'].forEach(race => this.build(race, races[race], segments[race], width, yMin, yMax));
    }
    if (this.positions) this.setRiders(this.positions);
  }

  build(raceKey, race, segments, width, yMin, yMax) {
    const f = KK.format, L = KK.Profile.LAYOUT;
    const height = KK.Profile.height();
    const plotW = width - L.padLeft - L.padRight, plotH = height - L.padTop - L.padBottom;
    const x = km => L.padLeft + (km / race.totalKm) * plotW;
    const y = m => L.padTop + (1 - (m - yMin) / (yMax - yMin)) * plotH;
    const base = L.padTop + plotH;
    const climb = Math.round(segments.reduce((sum, s) => sum + s.climb, 0) / 10) * 10;

    const parts = [];
    // Horizontal guides every 50 m. The text stays clear of the dot at km 0.
    for (let m = yMin; m <= yMax; m += 50) parts.push(
      `<line class="profile__grid" x1="${L.padLeft}" x2="${width - L.padRight}" y1="${y(m)}" y2="${y(m)}"/>
       <text x="${L.padLeft - 16}" y="${y(m) + 3.5}" text-anchor="end">${m} m</text>`);
    // Kilometre axis.
    const step = race.totalKm > 100 ? 20 : 10;
    for (let km = 0; km <= race.totalKm + 0.01; km += step) {
      parts.push(`<line class="profile__tick" x1="${x(km)}" x2="${x(km)}" y1="${base}" y2="${base + 4}"/>
        <text x="${x(km)}" y="${base + 15}" text-anchor="middle">${km}</text>`);
    }
    parts.push(`<text x="${L.padLeft - 16}" y="${base + 15}" text-anchor="end">km</text>`);
    // Every part of the race: filled area, line, label and a small title for hovering.
    segments.forEach(s => {
      const line = s.points.map(([km, m]) => `${x(km).toFixed(1)},${y(m).toFixed(1)}`);
      const area = `${x(s.from).toFixed(1)},${base} ${line.join(' ')} ${x(s.to).toFixed(1)},${base}`;
      const label = s.shortName, labelRoom = x(s.to) - x(s.from);
      parts.push(`<g class="profile__segment"><title>${s.name}, km ${f.km(s.from)} tot ${f.km(s.to)}, klim ongeveer ${Math.round(s.climb)} m</title>
        <polygon class="profile__area profile__area--${s.type}" points="${area}"/>
        <polyline class="profile__line" points="${line.join(' ')}"/></g>`);
      if (label.length * 6.4 + 6 <= labelRoom) parts.push(`<text class="profile__label" x="${(x(s.from) + x(s.to)) / 2}" y="${L.padTop - 6}" text-anchor="middle">${label}</text>`);
    });
    // Separators between the parts.
    segments.slice(1).forEach(s => parts.push(`<line class="profile__separator" x1="${x(s.from)}" x2="${x(s.from)}" y1="${L.padTop - 2}" y2="${base}"/>`));
    // The closed stretch and the two flags (filled in by setFlags), under the dot.
    parts.push(`<g class="profile__flags" data-flags="${raceKey}"></g>`);
    // The dot of this race (moved by setRiders).
    const dot = raceKey === 'women' ? ['V', 'women'] : ['M', 'men'];
    parts.push(`<g class="profile__rider profile__rider--${dot[1]}" data-rider="${raceKey}" opacity="0.5">
      <line class="profile__guide" y1="0" y2="0"/><circle r="${L.dotRadius}"/><text y="3.8" text-anchor="middle">${dot[0]}</text></g>`);

    const title = raceKey === 'women' ? 'Vrouwen' : 'Mannen';
    const chip = raceKey === 'women' ? 'chip--women' : 'chip--men';
    this.containers[raceKey].innerHTML = `<div class="profile__head"><span class="chip ${chip}"></span><b>${title}</b>
      <span class="muted">${f.km(race.totalKm)} km, klim ongeveer ${climb} m</span></div>
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Hoogteprofiel ${title.toLowerCase()}">${parts.join('')}</svg>`;
    const rider = this.containers[raceKey].querySelector('[data-rider]');
    this.charts[raceKey] = { rider, guide: rider.querySelector('.profile__guide'), flags: this.containers[raceKey].querySelector('[data-flags]'), x, y, base, segments, total: race.totalKm };
    if (this.flagData) this.setFlags(this.flagData);
  }

  /** Elevation at a distance (km) along a race. */
  eleAtKm(chart, km) {
    const segment = chart.segments.find(s => km >= s.from && km <= s.to) || chart.segments[chart.segments.length - 1];
    const length = segment.to - segment.from;
    return this.eleAt(this.routes[segment.routeKey], length ? (km - segment.from) / length : 0);
  }

  /**
   * Draws the closed stretch of road in red on the profile (from the green to the red flag car) and the two flags
   * standing on the line. `flags` is the result of KK.flagPositions: { women, men }, null for a race that is not on the road.
   */
  setFlags(flags) {
    this.flagData = flags;
    ['women', 'men'].forEach(raceKey => {
      const chart = this.charts[raceKey], info = flags && flags[raceKey];
      if (!chart || !chart.flags) return;
      if (!info) { chart.flags.innerHTML = ''; return; }
      const from = info.stretch[0].km, to = info.stretch[info.stretch.length - 1].km;
      const points = [];
      for (let km = from; km < to; km += 0.15) points.push([km, this.eleAtKm(chart, km)]);
      points.push([to, this.eleAtKm(chart, to)]);
      const line = points.map(([km, m]) => `${chart.x(km).toFixed(1)},${chart.y(m).toFixed(1)}`);
      const flag = (color, km, title) => {
        const x = chart.x(km).toFixed(1), y = chart.y(this.eleAtKm(chart, km)).toFixed(1);
        return `<g class="profile__flag profile__flag--${color}" transform="translate(${x} ${y})"><title>${title}</title>
          <path class="pole-outline" d="M0 0V-17"/><path class="pole" d="M0 0V-17"/><path class="cloth" d="M0.8 -16.4h8.4l-2.6 3.1 2.6 3.1H0.8z"/></g>`;
      };
      chart.flags.innerHTML = `<polygon class="profile__closure-area" points="${chart.x(from).toFixed(1)},${chart.base} ${line.join(' ')} ${chart.x(to).toFixed(1)},${chart.base}"/>
        <polyline class="profile__closure-line" points="${line.join(' ')}"/>`
        + (info.green ? flag('green', info.green.km, `Groene vlag: ${info.greenMinutes} min na de winnaar`) : '')
        + (info.red ? flag('red', info.red.km, `Rode vlag: ${info.redMinutes} min voor de eerste renner`) : '');
    });
  }

  /** Moves the dots to the positions of the riders (from KK.riderPositions). */
  setRiders(positions) {
    this.positions = positions;
    ['women', 'men'].forEach(raceKey => {
      const chart = this.charts[raceKey], p = positions[raceKey];
      if (!chart) return;
      const km = Math.max(0, Math.min(chart.total, p.km || 0));
      const segment = chart.segments.find(s => km >= s.from && km <= s.to) || chart.segments[chart.segments.length - 1];
      const length = segment.to - segment.from;
      const ele = this.eleAt(this.routes[segment.routeKey], length ? (km - segment.from) / length : 0);
      const cx = chart.x(km), cy = chart.y(ele);
      chart.rider.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
      chart.rider.setAttribute('opacity', p.state === 'racing' ? 1 : 0.5);
      chart.guide.setAttribute('y2', (chart.base - cy).toFixed(1));
    });
  }
};
