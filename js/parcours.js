// Controller of the Parcourskaart module: load GPX files, style the routes and points, lay out the image
// (title, legend, elevation profile) and export it as a PNG. Everything is kept in this browser (localStorage).
(function () {
  const { config, format: f } = KK;
  const $ = id => document.getElementById(id);
  const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STORAGE = 'kk-parcours-v1';

  // Image formats: shape (width / height) and the size in pixels for print (300 dpi on paper) and for screens.
  const FORMATS = {
    'a4-l': { file: 'a4-liggend', label: 'A4 liggend', ratio: 297 / 210, print: [3508, 2480], web: [1754, 1240], paper: true },
    'a4-p': { file: 'a4-staand', label: 'A4 staand', ratio: 210 / 297, print: [2480, 3508], web: [1240, 1754], paper: true },
    'a3-l': { file: 'a3-liggend', label: 'A3 liggend', ratio: 420 / 297, print: [4961, 3508], web: [2480, 1754], paper: true },
    'a3-p': { file: 'a3-staand', label: 'A3 staand', ratio: 297 / 420, print: [3508, 4961], web: [1754, 2480], paper: true },
    wide: { file: 'breed', label: 'Breed 16:9 (site, scherm)', ratio: 16 / 9, print: [3840, 2160], web: [1920, 1080] },
    square: { file: 'vierkant', label: 'Vierkant 1:1 (sociale media)', ratio: 1, print: [2160, 2160], web: [1080, 1080] },
    portrait: { file: 'staand-4x5', label: 'Staand 4:5 (Instagram)', ratio: 4 / 5, print: [2160, 2700], web: [1080, 1350] },
  };
  const TYPES = [['start', 'Start'], ['km0', 'Km 0'], ['finish', 'Finish'], ['plaats', 'Plaats'], ['klim', 'Helling'], ['kasseien', 'Kasseien'], ['sprint', 'Sprint'], ['voeding', 'Bevoorrading'], ['afval', 'Afvalzone'], ['punt', 'Punt']];
  // Words for the legend, per kind of point.
  const KEY = { start: 'Vertrek', km0: 'Km 0, officiële start', finish: 'Aankomst', klim: 'Helling', kasseien: 'Kasseien', sprint: 'Sprint', voeding: 'Bevoorrading', afval: 'Afvalzone' };
  // Kinds of points shown on the elevation profile.
  const ON_PROFILE = ['start', 'km0', 'finish', ...KK.ParcoursMap.NUMBERED, ...KK.ParcoursMap.ZONES];
  const SIDES = [['right', 'Rechts'], ['left', 'Links'], ['top', 'Boven'], ['bottom', 'Onder']];
  const COLORS = ['#FFD201', '#18181B', '#7A7A7A', '#E4572E', '#2E86DE', '#2F9E5B'];
  const MAX_AREA = 16.7e6; // Safari cannot make a larger canvas

  const DEFAULTS = {
    style: 2, title: 'Koolskamp Koers', subtitle: '', format: 'a4-l', quality: 'print', theme: 'koers', width: 'normaal',
    places: true, streets: false, shields: true, arrows: true, kmTrack: '', kmStep: 5, showTitle: true, showLegend: true, showProfile: true,
    profileSource: '', tracks: [], points: [], view: null,
  };

  const state = load();
  let addMode = false, exporting = false;

  // ---------- Storage ----------

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (raw && typeof raw === 'object') {
        // Maps saved before the race-map style (style 2) switch to it once; the points get their new kinds.
        if (raw.style !== 2) { raw.theme = 'koers'; raw.style = 2; }
        return { ...DEFAULTS, ...raw,
          tracks: Array.isArray(raw.tracks) ? raw.tracks.filter(t => t && t.id && Array.isArray(t.points) && t.points.length > 1) : [],
          points: Array.isArray(raw.points) ? raw.points.filter(p => p && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [] };
      }
    } catch (e) { /* storage unavailable or broken: start fresh */ }
    return { ...DEFAULTS, tracks: [], points: [] };
  }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
    catch (e) { message('De kaart kon niet bewaard worden in deze browser (te groot of een privévenster). Ze blijft staan tot je de pagina sluit.', 'warn'); }
  }

  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function message(text, kind = '') {
    const el = $('pm-message');
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = !text;
    clearTimeout(message.timer);
    if (text && kind !== 'warn') message.timer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // ---------- Map ----------

  const pmap = new KK.ParcoursMap($('pm-map'), {
    onMove: view => { state.view = view; save(); },
    onView: () => renderScale(),
    onLabelMoved: (id, lat, lon) => {
      const track = state.tracks.find(t => t.id === id);
      if (track) { track.labelPos = { lat, lon }; track.labelAuto = false; save(); }
    },
    onPointMoved: (id, lat, lon) => {
      const p = state.points.find(x => x.id === id);
      if (p) { Object.assign(p, snap(lat, lon)); save(); pmap.setPoints(state.points); }
    },
    onMapClick: (lat, lon) => {
      if (!addMode) return;
      const point = { id: newId('p'), type: 'punt', name: 'Nieuw punt', side: 'right', ...snap(lat, lon) };
      state.points.push(point);
      setAddMode(false);
      changed('points');
      const input = document.querySelector(`[data-point="${point.id}"] [data-field="name"]`);
      if (input) { input.focus(); input.select(); }
    },
    onReady: () => {
      syncMap();
      if (!state.view) fit();
      setTimeout(placeLabels, 300);
    },
  });

  /** Puts a clicked or dragged point on the nearest route when it is within a few pixels of it. */
  function snap(lat, lon) {
    const map = pmap.map, click = map.project([lon, lat]);
    let best = null, bestD = 24;
    state.tracks.filter(t => t.visible !== false).forEach(t => t.points.forEach(p => {
      const s = map.project([p[1], p[0]]), d = Math.hypot(s.x - click.x, s.y - click.y);
      if (d < bestD) { bestD = d; best = p; }
    }));
    return best ? { lat: best[0], lon: best[1] } : { lat, lon };
  }

  /** Climbs, cobbles and sprints are numbered in list order; every point gets its km along the kilometre route. */
  function decoratePoints() {
    const track = state.tracks.find(t => t.id === state.kmTrack);
    const cum = track ? KK.gpx.cumulative(track.points) : null;
    const scale = track && track.km ? track.km / cum[cum.length - 1] : 1;
    let n = 0;
    return state.points.map(p => ({ ...p,
      number: KK.ParcoursMap.NUMBERED.includes(p.type) ? ++n : null,
      km: track ? KK.gpx.nearest(track.points, cum, p.lat, p.lon).km * scale : null }));
  }

  function syncMap(what = 'all') {
    if (what === 'all' || what === 'tracks') { pmap.setTracks(state.tracks); pmap.setLabels(lapLabels()); }
    if (what === 'all' || what === 'points' || what === 'km') {
      pmap.setPoints(decoratePoints());
      // Towns shown in bold on the route, and start and finish, are left out of the grey map names.
      pmap.setHiddenNames(state.points.filter(p => ['plaats', 'start', 'finish'].includes(p.type) && p.name).flatMap(p => [p.name, p.name.charAt(0) + p.name.slice(1).toLowerCase()]));
    }
    if (what === 'all' || what === 'tracks' || what === 'km') {
      const track = state.tracks.find(t => t.id === state.kmTrack && t.visible !== false);
      pmap.setKm(track ? { points: track.points, step: Number(state.kmStep) } : null);
    }
  }

  /** Labels of the routes that have one: name, length and the lines of text (split at "/"). */
  function lapLabels() {
    return state.tracks.filter(t => t.label && t.visible !== false).map(t => {
      let pos = t.labelPos;
      if (!pos) {
        // First place: the middle of the route's area (inside a loop); it can be dragged from there.
        const lats = t.points.map(p => p[0]), lons = t.points.map(p => p[1]);
        pos = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
      }
      return { id: t.id, lat: pos.lat, lon: pos.lon, name: t.name, km: trackKm(t), color: t.color,
        rows: String(t.laps || '').split('/').map(r => r.trim()).filter(Boolean) };
    });
  }

  /**
   * Gives labels without a place one: the free spot nearest to their route, not on a route, a point or a box.
   * Tries a grid of spots on the map; the label can be dragged from there.
   */
  function placeLabels() {
    const map = pmap.map;
    const todo = state.tracks.filter(t => t.label && !t.labelPos && t.visible !== false);
    if (!map || !pmap.ready || !todo.length) return;
    const wrap = document.querySelector('.pm-mapwrap').getBoundingClientRect();
    const rect = el => { const r = el.getBoundingClientRect(); return { x0: r.left - wrap.left, y0: r.top - wrap.top, x1: r.right - wrap.left, y1: r.bottom - wrap.top }; };
    const boxes = [...['pm-key', 'pm-list', 'pm-scale'].map($).filter(el => !el.hidden),
      ...document.querySelectorAll('#pm-map .maplibregl-marker:not(.pm-lap)')].map(rect);
    const dots = state.tracks.filter(t => t.visible !== false).flatMap(t => t.points.filter((_, i) => i % 2 === 0).map(p => {
      const s = map.project([p[1], p[0]]);
      return { id: t.id, x: s.x, y: s.y };
    }));
    todo.forEach(t => {
      const el = document.querySelector(`.pm-lap[data-track="${t.id}"]`);
      const w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 60, m = 12, step = 14;
      const own = dots.filter(d => d.id === t.id);
      let best = null;
      for (let y = m; y + h < wrap.height - m; y += step) {
        for (let x = m; x + w < wrap.width - m; x += step) {
          const x1 = x + w, y1 = y + h;
          let score = 0;
          boxes.forEach(b => { if (b.x0 < x1 + m && b.x1 > x - m && b.y0 < y1 + m && b.y1 > y - m) score += 1e5; });
          if (best && score >= best.score) continue;
          dots.forEach(d => { if (d.x > x - m && d.x < x1 + m && d.y > y - m && d.y < y1 + m) score += 400; });
          if (best && score >= best.score) continue;
          let near = Infinity;
          own.forEach(d => { const dx = Math.max(x - d.x, 0, d.x - x1), dy = Math.max(y - d.y, 0, d.y - y1); near = Math.min(near, dx * dx + dy * dy); });
          score += Math.sqrt(near);
          if (!best || score < best.score) best = { score, x, y };
        }
      }
      if (!best) return;
      const ll = map.unproject([best.x + w / 2, best.y + h / 2]);
      t.labelPos = { lat: ll.lat, lon: ll.lng };
      t.labelAuto = true;
      boxes.push({ x0: best.x, y0: best.y, x1: best.x + w, y1: best.y + h });
    });
    save();
    pmap.setLabels(lapLabels());
  }

  /** Fits the routes in the map, leaving room for the title and the legend. */
  function fit() {
    const wrap = document.querySelector('.pm-mapwrap').getBoundingClientRect();
    const u = parseFloat(getComputedStyle($('pm-artboard')).getPropertyValue('--u')) || 8;
    const box = el => (el.hidden ? null : el.getBoundingClientRect());
    const key = box($('pm-key')), list = box($('pm-list')), scale = box($('pm-scale'));
    const edge = 7 * u, gap = 2 * u; // room for the start and finish badges, which stand out from their point
    // The key (top left) sits above the route or to its left; the list (bottom right) below it or to its right.
    const keyOptions = key ? [{ top: key.bottom - wrap.top + gap }, { left: key.right - wrap.left + gap }] : [{}];
    const listOptions = list ? [{ bottom: wrap.bottom - list.top + gap }, { right: wrap.right - list.left + gap }] : [{}];
    const scaleBottom = scale ? wrap.bottom - scale.top + gap : edge;
    const paddings = [];
    keyOptions.forEach(k => listOptions.forEach(l => paddings.push({
      top: Math.max(edge + 3 * u, k.top || 0), left: Math.max(edge, k.left || 0),
      bottom: Math.max(scaleBottom, l.bottom || 0), right: Math.max(edge + 3 * u, l.right || 0),
    })));
    pmap.fit(paddings);
    // Labels that were placed automatically look for a new spot; dragged labels stay where they are.
    if (state.tracks.some(t => t.labelAuto)) {
      state.tracks.forEach(t => { if (t.labelAuto) delete t.labelPos; });
      pmap.setLabels(lapLabels());
      setTimeout(placeLabels, 300);
    }
  }

  // ---------- Routes ----------

  function addTracks(tracks, waypoints = []) {
    const firstLoad = !state.tracks.length;
    tracks.forEach(t => {
      state.tracks.push({ id: newId('t'), name: t.name, color: COLORS[state.tracks.length % COLORS.length], style: 'solid', visible: true, points: t.points });
    });
    waypoints.forEach(w => state.points.push({ id: newId('p'), type: 'punt', name: w.name, side: 'right', lat: w.lat, lon: w.lon }));
    // A first route gets a start and a finish (one point when it ends where it started).
    if (firstLoad && !state.points.length && tracks.length) {
      const pts = tracks[0].points, a = pts[0], z = pts[pts.length - 1];
      if (KK.gpx.haversineKm(a, z) < 0.3) state.points.push({ id: newId('p'), type: 'finish', name: 'START EN FINISH', side: 'top', lat: a[0], lon: a[1] });
      else {
        state.points.push({ id: newId('p'), type: 'start', name: 'START', side: 'top', lat: a[0], lon: a[1] });
        state.points.push({ id: newId('p'), type: 'finish', name: 'FINISH', side: 'top', lat: z[0], lon: z[1] });
      }
    }
    if (!state.kmTrack && state.tracks.length) {
      state.kmTrack = state.tracks[0].id;
      // About eight kilometre markers on the first route.
      const total = KK.gpx.lengthKm(state.tracks[0].points);
      state.kmStep = [1, 2, 5, 10, 20].find(step => total / step <= 8) || 20;
    }
    if (!state.profileSource && state.tracks.length) state.profileSource = state.tracks[0].id;
    changed('all');
    requestAnimationFrame(fit);
    if (pmap.map) pmap.map.once('idle', () => { addTowns(true); setTimeout(placeLabels, 150); });
  }

  async function loadFiles(files) {
    const gpxFiles = [...files].filter(file => /\.gpx$/i.test(file.name) || file.type.includes('gpx'));
    if (!gpxFiles.length) { message('Kies een GPX-bestand (.gpx).', 'warn'); return; }
    const tracks = [], waypoints = [], errors = [];
    for (const file of gpxFiles) {
      try {
        const result = KK.gpx.parse(await file.text(), file.name);
        tracks.push(...result.tracks);
        waypoints.push(...result.waypoints);
      } catch (e) { errors.push(e.message); }
    }
    if (tracks.length) addTracks(tracks, waypoints);
    const loaded = tracks.length ? `${tracks.length === 1 ? '1 parcours' : `${tracks.length} parcours`} geladen${waypoints.length ? `, ${waypoints.length} punten` : ''}.` : '';
    message([loaded, ...errors].filter(Boolean).join(' '), errors.length ? 'warn' : 'ok');
  }

  /** The three Koolskamp Koers routes with their official lengths, and the start, Kruiskalsijde and finish. */
  function loadPreset() {
    const r = KK.routeData, strip = pts => pts.map(p => [p[0], p[1], p[2] || 0]);
    state.tracks = state.tracks.filter(t => !t.id.startsWith('kk-'));
    state.points = state.points.filter(p => !String(p.id).startsWith('kk-'));
    state.tracks.unshift(
      { id: 'kk-lap', name: 'Lokale ronde', color: '#FFD201', style: 'solid', visible: true, km: config.distances.localLap, points: strip(r.localLap) },
      { id: 'kk-approach', name: 'Aanloop naar de finish', color: '#7A7A7A', style: 'solid', visible: true, km: config.distances.approachToFinish, points: strip(r.approach) },
      { id: 'kk-loop', name: 'Lus Ardooie', color: '#18181B', style: 'double', visible: true, km: config.distances.ardooieLoop, points: strip(r.ardooieLoop) },
    );
    const d = config.defaults, laps = n => `${n} ${n === 1 ? 'ronde' : 'rondes'}`;
    Object.assign(state.tracks[0], { label: true, laps: `Mannen ${laps(d.menLaps)} / Vrouwen ${laps(d.womenLaps)}` });
    Object.assign(state.tracks[2], { label: true, laps: `Mannen ${laps(d.menLoops)}` });
    state.points.push(
      { id: 'kk-start', type: 'start', name: 'ARDOOIE', side: 'top', lat: r.ardooieLoop[0][0], lon: r.ardooieLoop[0][1] },
      { id: 'kk-kruis', type: 'punt', name: 'Kruiskalsijde', side: 'right', lat: r.kruiskalsijde[0], lon: r.kruiskalsijde[1] },
      { id: 'kk-finish', type: 'finish', name: 'KOOLSKAMP', side: 'top', lat: r.localLap[0][0], lon: r.localLap[0][1] },
    );
    if (!state.title || state.title === DEFAULTS.title) state.title = 'Koolskamp Koers';
    if (!state.subtitle) state.subtitle = 'Kampioenschap van Vlaanderen';
    state.kmTrack = 'kk-lap';
    state.kmStep = 5;
    state.profileSource = 'kk-men';
    changed('all');
    requestAnimationFrame(fit);
    message('De parcours van Koolskamp Koers zijn geladen.', 'ok');
    // Once the map of the area is loaded: the towns along the route.
    if (pmap.map) pmap.map.once('idle', () => { addTowns(true); setTimeout(placeLabels, 150); });
  }

  const trackKm = t => t.km || KK.gpx.lengthKm(t.points);

  /** Adds the towns of the map that lie on a route, as bold names with a square on the line. */
  function addTowns(quiet = false) {
    const have = new Set(state.points.map(p => p.name.toLowerCase()));
    const towns = pmap.townsOnRoute().filter(t => !have.has(t.name.toLowerCase()));
    towns.forEach(t => state.points.push({ id: newId('p'), type: 'plaats', name: t.name, side: 'right', lat: t.lat, lon: t.lon }));
    changed('points');
    if (!quiet || towns.length) message(towns.length ? `${towns.length === 1 ? '1 plaats' : `${towns.length} plaatsen`} langs het parcours toegevoegd. Verwijder wat je niet wil tonen.` : 'Geen nieuwe plaatsen gevonden langs het parcours. Zoom eventueel in en probeer opnieuw.', 'ok');
  }

  // ---------- Elevation profile ----------

  /** Profile sources: every route, and for the Koolskamp routes the full women's and men's race. */
  function profileOptions() {
    const options = state.tracks.map(t => [t.id, t.name]);
    const has = id => state.tracks.some(t => t.id === id);
    if (has('kk-lap') && has('kk-approach')) {
      const d = config.defaults, lap = config.distances.localLap, approach = config.distances.approachToFinish, loop = config.distances.ardooieLoop;
      if (has('kk-loop')) options.unshift(['kk-men', `Volledige koers mannen (${f.km(d.menLoops * loop + approach + d.menLaps * lap)} km)`]);
      options.unshift(['kk-women', `Volledige koers vrouwen (${f.km(approach + d.womenLaps * lap)} km)`]);
    }
    return options;
  }

  /** The parts of the chosen profile: [{ points, km }] and the colour of the profile. */
  function profileParts() {
    const byId = id => state.tracks.find(t => t.id === id);
    const d = config.defaults;
    const repeat = (track, n) => Array.from({ length: n }, () => ({ points: track.points, km: track.km }));
    if (state.profileSource === 'kk-men' || state.profileSource === 'kk-women') {
      const lap = byId('kk-lap'), approach = byId('kk-approach'), loop = byId('kk-loop');
      if (!lap || !approach) return null;
      const men = state.profileSource === 'kk-men';
      if (men && !loop) return null;
      return { parts: [...(men ? repeat(loop, d.menLoops) : []), { points: approach.points, km: approach.km }, ...repeat(lap, men ? d.menLaps : d.womenLaps)], color: lap.color,
        name: men ? 'Mannen' : 'Vrouwen' };
    }
    const track = byId(state.profileSource) || state.tracks[0];
    return track ? { parts: [{ points: track.points, km: track.km }], color: track.color, name: track.name } : null;
  }

  /**
   * Where the points lie on the profile: [{ id, type, number, km }]. A point counts on every part it lies on
   * (within 150 m), so a climb on a lap shows every lap; the finish line is crossed at the start or end of a part.
   * Start and km 0 count once.
   */
  function profileMarks(parts) {
    const pts = decoratePoints().filter(p => ON_PROFILE.includes(p.type));
    const marks = [];
    const add = (p, km) => {
      if (marks.some(m => m.id === p.id && Math.abs(m.km - km) < 0.5)) return;
      if ((p.type === 'start' || p.type === 'km0') && marks.some(m => m.id === p.id)) return;
      marks.push({ id: p.id, type: p.type, number: p.number, km });
    };
    let offset = 0;
    parts.forEach(part => {
      const cum = KK.gpx.cumulative(part.points), gpxKm = cum[cum.length - 1] || 1, length = part.km || gpxKm;
      const ends = [[part.points[0], 0], [part.points[part.points.length - 1], length]];
      pts.forEach(p => {
        const near = q => KK.gpx.haversineKm(q, [p.lat, p.lon]) < 0.15;
        if (p.type === 'finish' && ends.some(([q]) => near(q))) { ends.forEach(([q, at]) => { if (near(q)) add(p, offset + at); }); return; }
        const n = KK.gpx.nearest(part.points, cum, p.lat, p.lon);
        if (n.distanceKm < 0.15) add(p, offset + (n.km * length) / gpxKm);
      });
      offset += length;
    });
    return marks.sort((a, b) => a.km - b.km);
  }

  /** One icon of the profile as SVG: a circle with the glyph of the kind of point, or a number. */
  function profileIcon(m, cx, cy, r) {
    const icons = KK.ParcoursMap.ICONS;
    if (m.type === 'finish') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pm-checker)" stroke="#111111" stroke-width="${(r * 0.16).toFixed(2)}"/>`;
    const zone = KK.ParcoursMap.ZONES.includes(m.type);
    const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${zone ? '#6FC0DC' : '#111111'}" stroke="#FFFFFF" stroke-width="${(r * 0.14).toFixed(2)}"/>`;
    if (m.number) return `${circle}<text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" class="pm-profile__num" style="font-size:${(r * 1.05).toFixed(1)}px">${m.number}</text>`;
    if (m.type === 'km0') return `${circle}<text x="${cx}" y="${cy}" text-anchor="middle" class="pm-profile__num"><tspan x="${cx}" dy="${(-0.12 * r).toFixed(1)}" style="font-size:${(r * 0.55).toFixed(1)}px">km</tspan><tspan x="${cx}" dy="${(0.85 * r).toFixed(1)}" style="font-size:${(r * 0.95).toFixed(1)}px">0</tspan></text>`;
    const s = r * 1.3;
    return `${circle}<svg x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" viewBox="0 0 24 24" style="color:#FFFFFF">${(icons[m.type] || '').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
  }

  function renderProfile() {
    const el = $('pm-profile');
    el.hidden = !state.showProfile || !state.tracks.length;
    if (el.hidden) return;
    const source = profileParts();
    const W = el.clientWidth, H = el.clientHeight;
    if (!source || W < 50) { el.innerHTML = ''; return; }
    const p = KK.gpx.profile(source.parts);
    if (!p.hasElevation) { el.innerHTML = '<div class="pm-profile__empty">Dit GPX-bestand heeft geen hoogtegegevens.</div>'; return; }
    const u = parseFloat(getComputedStyle($('pm-artboard')).getPropertyValue('--u')) || 8;
    const L = 5.8 * u, R = 2.6 * u, band = 2.6 * u, xOf = km => L + (km / p.totalKm) * (W - L - R);
    // Icons in a row above the profile; an icon that would touch the one before it goes one row lower.
    const all = profileMarks(source.parts);
    // A zone shows as a light blue strip at every passage, with its icon only the first time.
    const strips = all.filter(m => KK.ParcoursMap.ZONES.includes(m.type));
    const marks = all.filter(m => !KK.ParcoursMap.ZONES.includes(m.type) || strips.find(z => z.id === m.id) === m).map(m => {
      const final = m.type === 'finish' && p.totalKm - m.km < 0.3;
      const big = m.type === 'start' || final;
      return { ...m, final, x: xOf(m.km), r: (big ? 1.35 : m.type === 'finish' ? 0.85 : 1.05) * u };
    });
    // Start and finish passages keep the top row; the other icons take it where there is room, else the row below.
    const row0 = 5.3 * u, rowGap = 2.6 * u, top = [];
    const fits = m => top.every(o => Math.abs(o.x - m.x) >= o.r + m.r + 0.5 * u);
    const order = m => (m.type === 'start' || m.type === 'finish' ? 0 : 1);
    [...marks].sort((a, b) => order(a) - order(b) || a.km - b.km).forEach(m => {
      const lane = order(m) === 0 || fits(m) ? 0 : 1;
      if (lane === 0) top.push(m);
      m.cy = row0 + lane * rowGap;
    });
    const T = Math.max(...marks.map(m => m.cy + m.r), row0 + 1.4 * u) + 1.4 * u, B = H - band;
    const peak = Math.max(...p.ele), yMax = Math.max(100, Math.ceil((peak + 10) / 50) * 50);
    const yOf = e => T + (1 - Math.max(0, e) / yMax) * (B - T);
    const eleAt = km => { let i = 0; while (i < p.km.length - 1 && p.km[i] < km) i++; return p.ele[i]; };
    const line = p.km.map((k, i) => `${i ? 'L' : 'M'}${xOf(k).toFixed(1)},${yOf(p.ele[i]).toFixed(1)}`).join('');
    const area = `${line}L${xOf(p.totalKm).toFixed(1)},${B}L${xOf(0).toFixed(1)},${B}Z`;
    const yStep = yMax > 300 ? 100 : 50, grid = [];
    for (let e = yStep; e <= yMax; e += yStep) {
      grid.push(`<line class="pm-profile__grid" x1="${L}" x2="${W - R}" y1="${yOf(e)}" y2="${yOf(e)}"/><text class="pm-profile__axis" x="${L - 0.8 * u}" y="${yOf(e) + 0.45 * u}" text-anchor="end">${e} m</text>`);
    }
    // The black band with the kilometres: the places of the points in bold, round numbers in between where there is room.
    const labelY = B + band / 2, gap = 3.4 * u, taken = [];
    const free = x => x < W - R - 10 * u && taken.every(t => Math.abs(t - x) >= gap);
    const kmLabels = [];
    const kmLabel = (km, x, cls, anchor = 'middle') => { kmLabels.push(`<text class="${cls}" x="${x}" y="${labelY}" dy="0.36em" text-anchor="${anchor}">${f.km(Math.round(km * 10) / 10)}</text>`); taken.push(x); };
    kmLabel(p.totalKm, W - R - 0.6 * u, 'pm-profile__bandkm pm-profile__bandkm--mark', 'end');
    kmLabels[0] = kmLabels[0].replace(/<\/text>$/, ' km</text>');
    marks.filter(m => !m.final && (m.type === 'finish' || m.type === 'km0')).forEach(m => {
      const x = Math.max(m.x, L + 1.6 * u);
      if (free(x)) kmLabel(m.km, x, 'pm-profile__bandkm pm-profile__bandkm--mark');
    });
    const steps = [5, 10, 20, 25, 50, 100], xStep = steps.find(s => p.totalKm / s <= 10) || 100;
    for (let k = 0; k < p.totalKm; k += xStep) { const x = k === 0 ? L + 0.6 * u : xOf(k); if (free(x)) kmLabel(k, x, 'pm-profile__bandkm', k === 0 ? 'start' : 'middle'); }
    const leaders = marks.map(m => `<line class="pm-profile__lead" x1="${m.x}" x2="${m.x}" y1="${m.cy + m.r}" y2="${yOf(eleAt(m.km))}"/>`);
    const icons = marks.map(m => profileIcon(m, m.x, m.cy, m.r));
    const border = KK.ParcoursMap.borderFor(source.color, pmap.theme), ck = (0.55 * u).toFixed(2);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="--fs:${(1.45 * u).toFixed(1)}px">
      <defs><pattern id="pm-checker" width="${ck * 2}" height="${ck * 2}" patternUnits="userSpaceOnUse"><rect width="${ck * 2}" height="${ck * 2}" fill="#FFFFFF"/><rect width="${ck}" height="${ck}" fill="#111111"/><rect x="${ck}" y="${ck}" width="${ck}" height="${ck}" fill="#111111"/></pattern></defs>
      <text class="pm-profile__title" x="${L}" y="${2.3 * u}"><tspan class="pm-profile__name">${esc(source.name)}</tspan><tspan dx="${1 * u}">${f.km(Math.round(p.totalKm * 10) / 10)} km, klim ongeveer ${Math.round(p.climb / 10) * 10} m</tspan></text>
 ${grid.join('')}
      ${strips.map(z => `<rect class="pm-profile__zone" x="${(xOf(z.km) - 0.3 * u).toFixed(1)}" y="${T}" width="${(0.6 * u).toFixed(1)}" height="${B - T}"/>`).join('')}
      <path d="${area}" fill="${source.color}" fill-opacity="0.9"/>
      <path d="${line}" fill="none" stroke="${border}" stroke-width="${Math.max(1, 0.18 * u).toFixed(2)}" stroke-linejoin="round"/>
      ${leaders.join('')}
      <rect class="pm-profile__band" x="${L}" y="${B}" width="${W - L - R}" height="${band}"/>
      ${kmLabels.join('')}
      ${icons.join('')}
    </svg>`;
  }

  // ---------- Layout of the image ----------

  /** The image keeps the shape of the chosen format and fills the space next to the sidebar. */
  function layout() {
    const format = FORMATS[state.format] || FORMATS['a4-l'];
    const stage = $('pm-stage'), art = $('pm-artboard');
    const availW = stage.clientWidth, availH = Math.max(380, window.innerHeight - 60 - 64);
    let w = availW, h = w / format.ratio;
    if (h > availH) { h = availH; w = h * format.ratio; }
    w = Math.max(560, Math.floor(w));
    h = Math.floor(w / format.ratio);
    art.style.width = `${w}px`;
    art.style.height = `${h}px`;
    art.style.setProperty('--u', `${(Math.min(w, h) / 100).toFixed(3)}px`);
  }

  function renderArtboard() {
    const art = $('pm-artboard'), theme = KK.ParcoursMap.THEMES[state.theme] || KK.ParcoursMap.THEMES.licht;
    art.dataset.dark = theme.dark ? 'true' : 'false';
    // The box top left: yellow head with the title, then the legend (kinds of points used, and the routes).
    const visible = state.tracks.filter(t => t.visible !== false);
    const used = Object.keys(KEY).filter(type => state.points.some(p => p.type === type));
    const showKey = (state.showTitle && state.title) || (state.showLegend && (visible.length || used.length));
    $('pm-key').hidden = !showKey;
    $('pm-key-title').textContent = state.showTitle && state.title ? state.title : 'Legende';
    $('pm-key-sub').textContent = state.showTitle ? state.subtitle : '';
    $('pm-key-sub').hidden = !state.showTitle || !state.subtitle;
    const lineBorder = t => KK.ParcoursMap.borderFor(t.color, theme.original ? KK.ParcoursMap.THEMES.licht : theme);
    const lineSample = t => {
      const style = t.style || 'solid', striped = style === 'double' || style === 'neutral';
      const stripe = striped ? `<line x1="3" y1="5" x2="37" y2="5" stroke="${KK.ParcoursMap.contrast(t.color)}" stroke-width="2"${style === 'neutral' ? ' stroke-dasharray="3 3"' : ''}/>` : '';
      return `<svg class="pm-key__line" viewBox="0 0 40 10" aria-hidden="true"><line x1="3" y1="5" x2="37" y2="5" stroke="${lineBorder(t)}" stroke-width="${striped ? 9 : 7}" stroke-linecap="round"/><line x1="3" y1="5" x2="37" y2="5" stroke="${t.color}" stroke-width="${striped ? 7 : 5}" stroke-linecap="${style === 'dashed' ? 'butt' : 'round'}"${style === 'dashed' ? ' stroke-dasharray="7 4"' : ''}/>${stripe}</svg>`;
    };
    const keyIcon = type => `<span class="pm-key__icon pm-key__icon--${type}">${type === 'km0' ? '<span class="pm-zero"><small>km</small>0</span>' : KK.ParcoursMap.ICONS[type]}</span>`;
    $('pm-key-items').hidden = !state.showLegend;
    $('pm-key-items').innerHTML = !state.showLegend ? '' : [
      ...used.map(type => `<div class="pm-key__item">${keyIcon(type)}<span>${KEY[type]}</span></div>`),
      ...visible.map(t => `<div class="pm-key__item">${lineSample(t)}<span>${esc(t.name)}</span><span class="pm-key__km">${f.km(Math.round(trackKm(t) * 10) / 10)} km</span></div>`),
    ].join('');
    // The box bottom right: the numbered climbs, cobbles and sprints with their km.
    const numbered = decoratePoints().filter(p => p.number);
    $('pm-list').hidden = !state.showLegend || !numbered.length;
    $('pm-list').innerHTML = numbered.map(p => `<div class="pm-list__row"><span class="pm-num pm-num--small"><span>${p.number}</span></span><span class="pm-key__icon pm-key__icon--${p.type}">${KK.ParcoursMap.ICONS[p.type]}</span><span class="pm-list__name">${esc(p.name)}</span>${p.km != null ? `<span class="pm-list__km">km ${f.km(Math.round(p.km * 10) / 10)}</span>` : ''}</div>`).join('');
    renderScale();
    renderProfile();
    const [w, h] = targetSize();
    const format = FORMATS[state.format];
    $('pm-size').textContent = `${w} × ${h} px${format.paper ? (state.quality === 'print' ? ', 300 dpi op papier' : ', 150 dpi op papier') : ''}`;
  }

  /** North arrow and a scale bar with a round length (1, 2, 5, 10 or 20 km) of about a tenth of the image. */
  function renderScale() {
    const mpp = pmap.metresPerPixel(), width = $('pm-artboard').clientWidth;
    if (!mpp) { $('pm-scale').hidden = true; return; }
    const target = (width * 0.12) * mpp / 1000;
    const km = [0.5, 1, 2, 5, 10, 20, 50].find(k => k >= target * 0.7) || 50;
    $('pm-scale').hidden = false;
    $('pm-scale-line').style.width = `${(km * 1000) / mpp}px`;
    $('pm-scale-label').textContent = `${f.km(km)} km`;
  }

  /** Size of the exported image in pixels, at most MAX_AREA pixels. */
  function targetSize() {
    const format = FORMATS[state.format] || FORMATS['a4-l'];
    let [w, h] = format[state.quality === 'web' ? 'web' : 'print'];
    if (w * h > MAX_AREA) { const k = Math.sqrt(MAX_AREA / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
    return [w, h];
  }

  // ---------- Sidebar ----------

  const eyeIcon = on => on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M2 2l20 20"/></svg>';
  const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');

  function renderLists() {
    $('pm-tracks').innerHTML = state.tracks.length ? state.tracks.map((t, i) => `
      <div class="pm-track${t.visible === false ? ' is-hidden' : ''}" data-track="${esc(t.id)}">
        <div class="pm-track__top">
        <input type="color" class="pm-color" data-field="color" value="${esc(t.color)}" aria-label="Kleur van ${esc(t.name)}">
        <input type="text" class="pm-text pm-track__name" data-field="name" value="${esc(t.name)}" maxlength="60" aria-label="Naam van het parcours"><span class="pm-track__km">${f.km(Math.round(trackKm(t) * 10) / 10)} km</span>
        </div>
        <div class="pm-track__meta"><select class="pm-mini" data-field="style" aria-label="Stijl van de lijn">${options(KK.ParcoursMap.LINE_STYLES, t.style || 'solid')}</select>
        <button type="button" class="pm-icon" data-action="label" aria-pressed="${!!t.label}" title="Label met naam en lengte op de kaart, bijvoorbeeld voor een lokale ronde"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h12l6 7-6 7H3z"/><path d="M7 12h5"/></svg></button>
        <button type="button" class="pm-icon" data-action="toggle" aria-pressed="${t.visible !== false}" title="Tonen of verbergen">${eyeIcon(t.visible !== false)}</button>
        <button type="button" class="pm-icon" data-action="up" title="Naar boven (bovenop)"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>
        <button type="button" class="pm-icon" data-action="delete" title="Verwijderen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
        ${t.label ? `<input type="text" class="pm-text pm-track__laps" data-field="laps" value="${esc(t.laps || '')}" maxlength="80" placeholder="Onder het label, bv. Mannen 9 rondes / Vrouwen 7 rondes" aria-label="Tekst onder het label (een schuine streep begint een nieuwe regel)">` : ''}
      </div>`).join('') : '<p class="settings__note">Nog geen parcours. Laad een GPX of de parcours van Koolskamp Koers.</p>';

    $('pm-points').innerHTML = state.points.map(p => `
      <div class="pm-point-row" data-point="${esc(p.id)}">
        <select class="pm-mini" data-field="type" aria-label="Soort punt">${options(TYPES, p.type)}</select>
        <input type="text" class="pm-text" data-field="name" value="${esc(p.name)}" maxlength="60" aria-label="Naam van het punt">
        <select class="pm-mini" data-field="side" aria-label="Plaats van het label">${options(SIDES, p.side || 'right')}</select>
        <button type="button" class="pm-icon" data-action="delete-point" title="Verwijderen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`).join('');

    $('pm-km-track').innerHTML = options([['', 'Geen'], ...state.tracks.map(t => [t.id, t.name])], state.kmTrack);
    $('pm-profile-source').innerHTML = options(profileOptions(), state.profileSource);
    $('pm-km-step').value = String(state.kmStep);
  }

  function syncControls() {
    $('pm-theme').value = state.theme;
    $('pm-width').value = state.width;
    $('pm-places').checked = state.places;
    $('pm-streets').checked = state.streets;
    $('pm-shields').checked = state.shields;
    $('pm-arrows').checked = state.arrows;
    $('pm-format').value = state.format;
    $('pm-quality').value = state.quality;
    $('pm-show-title').checked = state.showTitle;
    $('pm-show-legend').checked = state.showLegend;
    $('pm-show-profile').checked = state.showProfile;
    if (document.activeElement !== $('pm-title-input')) $('pm-title-input').value = state.title;
    if (document.activeElement !== $('pm-subtitle-input')) $('pm-subtitle-input').value = state.subtitle;
  }

  /** After a change: save, update the sidebar where needed, the image and the map. */
  function changed(what = 'all', { lists = true } = {}) {
    save();
    if (lists) renderLists();
    renderArtboard();
    if (what !== 'none') syncMap(what);
  }

  function setAddMode(on) {
    addMode = on;
    $('pm-add-point').setAttribute('aria-pressed', String(on));
    $('pm-add-point').textContent = on ? 'Klik op de kaart' : 'Punt toevoegen';
    $('pm-add-hint').hidden = !on;
    $('pm-artboard').classList.toggle('is-adding', on);
  }

  // ---------- Export ----------

  async function exportPng() {
    if (exporting) return;
    if (!state.tracks.length) { message('Laad eerst een parcours.', 'warn'); return; }
    exporting = true;
    const art = $('pm-artboard'), img = $('pm-snapshot');
    $('export-overlay').hidden = false;
    setAddMode(false);
    try {
      const [w] = targetSize();
      const shot = await pmap.render(w / art.clientWidth);
      pmap.map.getCanvas().after(img); // inside the map, under the points and kilometre markers
      img.src = shot.url;
      await img.decode();
      art.classList.add('is-exporting');
      const theme = KK.ParcoursMap.THEMES[state.theme] || KK.ParcoursMap.THEMES.licht;
      const canvas = await KK.pdfExport.capture(art, { pixelRatio: shot.ratio, backgroundColor: theme.dark ? '#141518' : '#FFFFFF' });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const slug = (state.title || 'parcours').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parcours';
      const name = `${slug}-${FORMATS[state.format].file}.png`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      message(`Opgeslagen als ${name} (${canvas.width} × ${canvas.height} px).`, 'ok');
    } catch (e) {
      message('De afbeelding kon niet gemaakt worden. Controleer je internetverbinding en probeer opnieuw.', 'warn');
    } finally {
      art.classList.remove('is-exporting');
      img.removeAttribute('src');
      pmap.restore();
      $('export-overlay').hidden = true;
      exporting = false;
    }
  }

  // ---------- Wiring ----------

  $('pm-theme').innerHTML = options(Object.entries(KK.ParcoursMap.THEMES).map(([k, t]) => [k, t.label]), state.theme);
  $('pm-format').innerHTML = options(Object.entries(FORMATS).map(([k, v]) => [k, v.label]), state.format);

  $('pm-file').addEventListener('change', e => { loadFiles(e.target.files); e.target.value = ''; });
  $('pm-preset').addEventListener('click', loadPreset);
  $('pm-reset').addEventListener('click', () => {
    if (!window.confirm('Alle parcours, punten en instellingen van de kaart wissen?')) return;
    Object.assign(state, { ...DEFAULTS, tracks: [], points: [] });
    syncControls();
    pmap.setOptions({ theme: state.theme, places: state.places, streets: state.streets, shields: state.shields, arrows: state.arrows, width: state.width });
    layout();
    changed('all');
  });

  $('pm-tracks').addEventListener('input', e => {
    const row = e.target.closest('[data-track]'), field = e.target.dataset.field;
    const track = row && state.tracks.find(t => t.id === row.dataset.track);
    if (!track || !field) return;
    track[field] = e.target.value;
    if (field === 'name') pmap.setLabels(lapLabels());
    // Typing a name only changes the legend; the list is not redrawn, so the field keeps its focus.
    if (field === 'laps') { save(); pmap.setLabels(lapLabels()); return; }
    changed(field === 'name' ? 'none' : 'tracks', { lists: field !== 'name' && field !== 'color' });
  });
  $('pm-tracks').addEventListener('click', e => {
    const button = e.target.closest('[data-action]'), row = e.target.closest('[data-track]');
    if (!button || !row) return;
    const i = state.tracks.findIndex(t => t.id === row.dataset.track);
    if (i < 0) return;
    const action = button.dataset.action;
    if (action === 'toggle') state.tracks[i].visible = state.tracks[i].visible === false;
    else if (action === 'label') { state.tracks[i].label = !state.tracks[i].label; setTimeout(placeLabels, 50); }
    else if (action === 'up' && i > 0) state.tracks.splice(i - 1, 0, state.tracks.splice(i, 1)[0]);
    else if (action === 'delete') {
      if (!window.confirm(`"${state.tracks[i].name}" verwijderen?`)) return;
      const [removed] = state.tracks.splice(i, 1);
      if (state.kmTrack === removed.id) state.kmTrack = '';
      if (state.profileSource === removed.id) state.profileSource = state.tracks[0] ? state.tracks[0].id : '';
    }
    changed('tracks');
  });

  $('pm-points').addEventListener('input', e => {
    const row = e.target.closest('[data-point]'), field = e.target.dataset.field;
    const point = row && state.points.find(p => p.id === row.dataset.point);
    if (!point || !field) return;
    point[field] = e.target.value;
    changed('points', { lists: false });
  });
  $('pm-points').addEventListener('click', e => {
    const button = e.target.closest('[data-action="delete-point"]'), row = e.target.closest('[data-point]');
    if (!button || !row) return;
    state.points = state.points.filter(p => p.id !== row.dataset.point);
    changed('points');
  });
  $('pm-add-point').addEventListener('click', () => setAddMode(!addMode));
  $('pm-towns').addEventListener('click', () => {
    if (!state.tracks.length) { message('Laad eerst een parcours.', 'warn'); return; }
    addTowns();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && addMode) setAddMode(false); });

  const mapOption = (id, key, prop = 'checked') => $(id).addEventListener('change', e => {
    state[key] = e.target[prop];
    pmap.setOptions({ [key]: state[key] });
    changed('none', { lists: false });
  });
  mapOption('pm-theme', 'theme', 'value');
  mapOption('pm-width', 'width', 'value');
  mapOption('pm-places', 'places');
  mapOption('pm-streets', 'streets');
  mapOption('pm-shields', 'shields');
  mapOption('pm-arrows', 'arrows');
  $('pm-km-track').addEventListener('change', e => { state.kmTrack = e.target.value; changed('km', { lists: false }); });
  $('pm-km-step').addEventListener('change', e => { state.kmStep = Number(e.target.value); changed('km', { lists: false }); });
  $('pm-fit').addEventListener('click', fit);

  $('pm-format').addEventListener('change', e => {
    state.format = e.target.value;
    layout();
    changed('none', { lists: false });
    setTimeout(fit, 60); // after the map has its new size
  });
  $('pm-quality').addEventListener('change', e => { state.quality = e.target.value; changed('none', { lists: false }); });
  $('pm-title-input').addEventListener('input', e => { state.title = e.target.value; changed('none', { lists: false }); });
  $('pm-subtitle-input').addEventListener('input', e => { state.subtitle = e.target.value; changed('none', { lists: false }); });
  [['pm-show-title', 'showTitle'], ['pm-show-legend', 'showLegend'], ['pm-show-profile', 'showProfile']].forEach(([id, key]) =>
    $(id).addEventListener('change', e => { state[key] = e.target.checked; changed('none', { lists: false }); }));
  $('pm-profile-source').addEventListener('change', e => { state.profileSource = e.target.value; changed('none', { lists: false }); });
  $('pm-export').addEventListener('click', exportPng);
  $('pm-export-top').addEventListener('click', exportPng);

  // GPX files dropped on the image.
  const stage = $('pm-stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('is-dropping'); });
  stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('is-dropping'); });
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('is-dropping'); loadFiles(e.dataTransfer.files); });

  // The page theme (light or dark), shared with Raceday.
  function setPageTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('is-active', b.dataset.themeChoice === theme));
    if (persist) try { localStorage.setItem(config.themeStorageKey, theme); } catch (e) { /* storage unavailable */ }
  }
  let pageTheme = null;
  try { pageTheme = localStorage.getItem(config.themeStorageKey); } catch (e) { /* storage unavailable */ }
  setPageTheme(pageTheme === 'light' || pageTheme === 'dark' ? pageTheme : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => setPageTheme(b.dataset.themeChoice, true)));

  const released = new Date(`${config.released}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  $('credits-version').textContent = `v${config.version}`;
  $('credits-version').parentElement.insertAdjacentHTML('afterend', `<span class="credits__sep" aria-hidden="true">·</span><span>bijgewerkt op ${released}</span>`);

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); renderArtboard(); }, 120); });

  syncControls();
  renderLists();
  layout();
  renderArtboard();
  pmap.setOptions({ theme: state.theme, places: state.places, streets: state.streets, shields: state.shields, arrows: state.arrows, width: state.width });
  if (window.maplibregl) {
    try { pmap.init(state.view); } catch (e) { $('pm-map').classList.add('route__map--unavailable'); }
  }
})();
