// The map of the Parcourskaart module, in the style of race maps such as ProCyclingMaps: a calm, almost white base
// map (OpenFreeMap positron recoloured), the routes in a strong colour with a thin border and small arrows beside
// them, start and finish as black badges with the place name, the towns on the route in bold with a square on the
// line, and numbered markers for climbs and cobbles. It can render at a higher pixel ratio for a sharp export.
window.KK = window.KK || {};

KK.ParcoursMap = class {
  static STYLE = 'https://tiles.openfreemap.org/styles/positron';

  // Colours per theme. 'klassiek' keeps the original map. noCasing: roads without a white border.
  static THEMES = {
    koers: { label: 'Koers (zoals ProCyclingMaps)', bg: '#F8F8F6', water: '#C6DEEC', green: '#DAE9CF', landuse: '#ECECE9', building: null,
      road: '#DEDEDA', major: '#D2D2CD', motorway: '#C4C4BF', casing: null, rail: null, boundary: '#2A2A2A', dottedBorder: true,
      text: '#58585E', halo: '#FFFFFF', street: '#8E8E93', thinBorder: true },
    licht: { label: 'Licht', bg: '#F2F1ED', water: '#C6D4DC', green: '#DFE6D8', landuse: '#EAE9E4', building: '#E2E1DB', road: '#FFFFFF', casing: '#D6D5D0', rail: '#D2D1CC', boundary: '#B5B4AF', text: '#27272A', halo: '#FFFFFF', street: '#75747A' },
    donker: { label: 'Donker', bg: '#141518', water: '#1F2C36', green: '#1A211C', landuse: '#18191C', building: '#1E1F23', road: '#2D2F34', casing: '#222428', rail: '#292B2F', boundary: '#55575C', dottedBorder: true, text: '#C9C9CF', halo: '#141518', street: '#85858C', dark: true, thinBorder: true },
    minimaal: { label: 'Minimaal', bg: '#F7F7F4', water: '#D5DFE5', green: '#ECEFE7', landuse: '#F2F2EF', building: null, road: '#FFFFFF', casing: '#E2E2DE', rail: null, boundary: '#C9C9C4', text: '#3F3F46', halo: '#FFFFFF', street: '#8B8B90', minimal: true },
    klassiek: { label: 'Klassiek (OpenFreeMap)', original: true },
  };

  static WIDTHS = { dun: 3.5, normaal: 5, dik: 7 };

  // White icons on a black circle.
  static ICONS = {
    start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11l9-5.5z" fill="currentColor"/></svg>',
    finish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h4v4H6zM14 6h4v4h-4zM10 10h4v4h-4zM6 14h4v4H6zM14 14h4v4h-4z" fill="currentColor"/><path d="M6 6h12v12H6z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    klim: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 18.5l6.2-11 3.8 6.3 2.3-3.6 4.7 8.3z" fill="currentColor"/></svg>',
    kasseien: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.6" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.6" fill="currentColor"/><rect x="4" y="13" width="7" height="7" rx="1.6" fill="currentColor"/><rect x="13" y="13" width="7" height="7" rx="1.6" fill="currentColor"/></svg>',
    sprint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L6 13.5h5L10 21l8-11h-5.2z" fill="currentColor"/></svg>',
    voeding: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v7.5a2 2 0 0 0 1.5 1.9V21h2v-8.6A2 2 0 0 0 13 10.5V3h-1.3v5.5h-1V3H9.3v5.5h-1V3zM16.5 3c-1.4 0-2.5 2-2.5 5.5 0 2 .8 3 1.8 3.4V21h2V3z" fill="currentColor"/></svg>',
  };

  // Marked with a number on the map and listed in a table next to it.
  static NUMBERED = ['klim', 'kasseien', 'sprint'];

  /** callbacks: onMove(view), onView(), onPointMoved(id, lat, lon), onMapClick(lat, lon), onReady(). */
  constructor(el, callbacks) {
    this.el = el;
    this.callbacks = callbacks;
    this.options = { theme: 'koers', places: true, streets: false, arrows: true, width: 'normaal' };
    this.tracks = [];
    this.points = [];
    this.km = null;
    this.markers = [];
    this.kmMarkers = [];
    this.hiddenNames = [];
    this.ready = false;
  }

  init(view) {
    const ml = window.maplibregl;
    const map = new ml.Map({
      container: this.el, style: KK.ParcoursMap.STYLE, center: [3.22, 51.0], zoom: 10.5,
      attributionControl: false, preserveDrawingBuffer: true, maxCanvasSize: [8192, 8192],
      ...(view ? { center: view.center, zoom: view.zoom, bearing: view.bearing || 0 } : {}),
    });
    this.map = map;
    map.addControl(new ml.NavigationControl({ visualizePitch: false }), 'top-right');
    map.on('style.load', () => {
      // The original filters of the place-name layers, so names of towns on the route can be left out later.
      this.placeFilters = {};
      map.getStyle().layers.filter(l => l['source-layer'] === 'place' && l.type === 'symbol').forEach(l => { this.placeFilters[l.id] = l.filter || null; });
      this.addArrowImage();
      this.applyTheme();
      this.drawTracks();
      this.ready = true;
      if (this.callbacks.onReady) this.callbacks.onReady();
    });
    map.on('moveend', () => this.callbacks.onMove({ center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing() }));
    map.on('move', () => { if (this.callbacks.onView) this.callbacks.onView(); });
    map.on('click', e => { if (this.callbacks.onMapClick) this.callbacks.onMapClick(e.lngLat.lat, e.lngLat.lng); });
    if (window.ResizeObserver) {
      let last = '';
      new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect, key = `${Math.round(width)}x${Math.round(height)}`;
        if (width > 0 && key !== last) { last = key; map.resize(); }
      }).observe(this.el);
    }
  }

  // ---------- Theme ----------

  setOptions(options) {
    const themeChanged = options.theme && options.theme !== this.options.theme;
    Object.assign(this.options, options);
    if (!this.map || !this.ready) return;
    if (themeChanged) { this.ready = false; this.map.setStyle(KK.ParcoursMap.STYLE, { diff: false }); return; } // style.load redraws
    this.applyTheme();
    this.drawTracks();
  }

  get theme() { return KK.ParcoursMap.THEMES[this.options.theme] || KK.ParcoursMap.THEMES.koers; }

  /** Recolours the base map and switches its labels, layer by layer (by the kind of data each layer shows). */
  applyTheme() {
    const map = this.map, t = this.theme, o = this.options;
    const paint = (id, prop, value) => { try { map.setPaintProperty(id, prop, value); } catch (e) { /* not on this layer */ } };
    const show = (id, on) => { try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch (e) { /* ignore */ } };
    map.getStyle().layers.forEach(layer => {
      const { id, type } = layer, data = layer['source-layer'] || '';
      if (id.startsWith('pm-')) return;
      if (type === 'symbol') {
        if (data === 'place') {
          show(id, o.places && !/state/.test(id) && (!/country/.test(id) || !t.minimal));
          this.filterPlaceNames(id);
          if (!t.original) { paint(id, 'text-color', /country/.test(id) ? '#2A2A2E' : t.text); paint(id, 'text-halo-color', t.halo); paint(id, 'text-halo-width', 1.6); }
        } else if (data === 'transportation_name') {
          show(id, o.streets);
          if (!t.original) { paint(id, 'text-color', t.street); paint(id, 'text-halo-color', t.halo); }
        } else show(id, o.places && !t.minimal && !/oneway/.test(id)); // water names, airports
        return;
      }
      if (t.original) return;
      if (type === 'background') paint(id, 'background-color', t.bg);
      else if (data === 'water' && type === 'fill') paint(id, 'fill-color', t.water);
      else if (data === 'waterway') paint(id, 'line-color', t.water);
      else if (type === 'fill' && (data === 'park' || /wood|park|grass/.test(id))) paint(id, 'fill-color', t.green);
      else if (type === 'fill' && (data === 'landuse' || data === 'landcover')) paint(id, 'fill-color', t.landuse);
      else if (data === 'building') {
        show(id, !!t.building);
        if (t.building) { paint(id, 'fill-color', t.building); paint(id, 'fill-outline-color', t.building); }
      } else if (data === 'transportation' && type === 'line') {
        if (/rail/.test(id)) { show(id, !!t.rail); if (t.rail) paint(id, 'line-color', /dash/.test(id) ? t.bg : t.rail); }
        else if (/casing/.test(id)) { if (t.casing) paint(id, 'line-color', t.casing); else paint(id, 'line-opacity', 0); }
        else if (/subtle/.test(id)) paint(id, 'line-color', t.casing || t.road);
        else paint(id, 'line-color', /motorway/.test(id) ? (t.motorway || t.road) : /major/.test(id) ? (t.major || t.road) : t.road);
      } else if (data === 'transportation' && type === 'fill') paint(id, 'fill-color', t.bg);
      else if (data === 'boundary') {
        paint(id, 'line-color', /_2|country/.test(id) ? t.boundary : t.casing || t.road);
        if (t.dottedBorder && /_2|country/.test(id)) { paint(id, 'line-dasharray', [1, 2.2]); paint(id, 'line-width', 1.4); }
        if (!/_2|country/.test(id)) show(id, !t.minimal && !!t.casing); // province lines only on the busier themes
      } else if (data === 'aeroway') show(id, !t.minimal && !!t.casing);
    });
  }

  /** Leaves the grey map names out for towns that are shown in bold on the route, so no name is there twice. */
  filterPlaceNames(id) {
    if (!this.placeFilters || !(id in this.placeFilters)) return;
    const original = this.placeFilters[id];
    const names = this.hiddenNames;
    const filter = names.length
      ? ['all', ...(original ? [original] : []), ['!', ['in', ['coalesce', ['get', 'name:latin'], ['get', 'name']], ['literal', names]]]]
      : original;
    try { this.map.setFilter(id, filter); } catch (e) { /* keep the map as it is */ }
  }

  // ---------- Routes ----------

  /** A small double chevron for the direction arrows (an SDF image, so it can be coloured). */
  addArrowImage() {
    if (this.map.hasImage('pm-arrow')) return;
    const w = 40, h = 24, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [8, 20].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x + 9, 12); ctx.lineTo(x, 19); ctx.stroke(); });
    this.map.addImage('pm-arrow', ctx.getImageData(0, 0, w, h), { sdf: true, pixelRatio: 2 });
  }

  /** Light routes get a dark border, dark routes a light one, so every route stands out from the map. */
  static borderFor(color, theme) {
    const hex = String(color).replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
    return light ? (theme.dark ? '#000000' : '#1A1A1A') : (theme.dark ? '#E4E4E7' : '#FFFFFF');
  }

  setTracks(tracks) {
    this.tracks = tracks;
    if (this.ready) this.drawTracks();
  }

  /** Removes and re-adds the route layers. The first route in the list is drawn on top. */
  drawTracks() {
    const map = this.map, theme = this.theme, width = KK.ParcoursMap.WIDTHS[this.options.width] || 5;
    map.getStyle().layers.filter(l => l.id.startsWith('pm-')).forEach(l => map.removeLayer(l.id));
    Object.keys(map.getStyle().sources).filter(id => id.startsWith('pm-')).forEach(id => map.removeSource(id));
    // The routes go under the place names, so a name on the route stays readable (names have a halo).
    const firstName = map.getStyle().layers.find(l => l.type === 'symbol' && l['source-layer'] === 'place');
    const before = firstName ? firstName.id : undefined;
    const arrowColor = theme.dark ? '#E4E4E7' : '#111111';
    [...this.tracks].reverse().filter(t => t.visible !== false).forEach(track => {
      const id = `pm-${track.id}`;
      map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: track.points.map(p => [p[1], p[0]]) } } });
      const border = KK.ParcoursMap.borderFor(track.color, theme);
      const dashed = track.style === 'dashed';
      map.addLayer({ id: `${id}-casing`, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': border, 'line-width': width + (theme.thinBorder ? 2 : 3.5) } }, before);
      map.addLayer({ id: `${id}-line`, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' },
        paint: { 'line-color': track.color, 'line-width': width, ...(dashed ? { 'line-dasharray': [2, 1.4] } : {}) } }, before);
      if (this.options.arrows) {
        // Beside the line, like on race maps; the offset is in icon pixels and turns with the line.
        const size = 0.85;
        map.addLayer({ id: `${id}-arrows`, type: 'symbol', source: id,
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 230, 'icon-image': 'pm-arrow', 'icon-size': size,
            'icon-offset': [0, -(width / 2 + 9) / size], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
          paint: { 'icon-color': arrowColor } }, before);
      }
    });
  }

  /** Bounds of the visible routes and points, or null. */
  bounds() {
    const all = [...this.tracks.filter(t => t.visible !== false).flatMap(t => t.points.map(p => [p[1], p[0]])), ...this.points.map(p => [p.lon, p.lat])];
    if (!all.length) return null;
    const lons = all.map(p => p[0]), lats = all.map(p => p[1]);
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  }

  /**
   * Fits the routes in the map, keeping them free of the boxes on top of it. Each option is a padding; the one
   * that lets the map zoom in furthest wins (a box can sit above the route or beside it).
   */
  fit(paddings) {
    const b = this.bounds();
    if (!b || !this.map) return;
    const bearing = this.map.getBearing();
    let best = null;
    (Array.isArray(paddings) ? paddings : [paddings]).forEach(padding => {
      let camera = null;
      try { camera = this.map.cameraForBounds(b, { padding, bearing }); } catch (e) { /* padding too large */ }
      if (camera && (!best || camera.zoom > best.camera.zoom)) best = { camera, padding };
    });
    if (best) this.map.jumpTo({ ...best.camera, bearing });
  }

  /** Metres per CSS pixel at the centre of the map, for the scale bar. */
  metresPerPixel() {
    if (!this.map) return null;
    const lat = this.map.getCenter().lat;
    return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
  }

  // ---------- Towns on the route ----------

  /**
   * Towns (cities, towns, villages) of the base map within `km` of a visible route, with the nearest point of the
   * route: [{ name, lat, lon }]. Uses the map data of the area on screen.
   */
  townsOnRoute(km = 0.9) {
    if (!this.map) return [];
    let features = [];
    try { features = this.map.querySourceFeatures('openmaptiles', { sourceLayer: 'place' }); } catch (e) { return []; }
    const lines = this.tracks.filter(t => t.visible !== false).map(t => t.points);
    const found = new Map();
    features.forEach(f => {
      const cls = f.properties.class;
      if (!['city', 'town', 'village'].includes(cls) || !f.geometry || f.geometry.type !== 'Point') return;
      const name = f.properties['name:latin'] || f.properties['name:nl'] || f.properties.name;
      if (!name || found.has(name)) return;
      const [lon, lat] = f.geometry.coordinates;
      let best = null, bestD = km;
      lines.forEach(points => points.forEach(p => {
        const d = KK.gpx.haversineKm(p, [lat, lon]);
        if (d < bestD) { bestD = d; best = p; }
      }));
      if (best) found.set(name, { name, lat: best[0], lon: best[1], rank: cls === 'city' ? 0 : cls === 'town' ? 1 : 2 });
    });
    return [...found.values()];
  }

  setHiddenNames(names) {
    const key = JSON.stringify(names);
    if (key === JSON.stringify(this.hiddenNames)) return;
    this.hiddenNames = names;
    if (this.ready) Object.keys(this.placeFilters || {}).forEach(id => this.filterPlaceNames(id));
  }

  // ---------- Points and kilometre markers ----------

  static esc(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /** The marker element of a point: a badge for start and finish, a number, a town or a plain point. */
  static markerHtml(p) {
    const esc = KK.ParcoursMap.esc, icon = KK.ParcoursMap.ICONS[p.type] || '';
    if (p.type === 'start' || p.type === 'finish') {
      const below = p.side === 'bottom';
      return { anchor: below ? 'top' : 'bottom', className: `pm-badge pm-badge--${p.type}${below ? ' pm-badge--below' : ''}`,
        html: `${p.name ? `<span class="pm-badge__label">${esc(p.name)}</span>` : ''}<span class="pm-badge__icon">${icon}</span><span class="pm-badge__stem"></span>` };
    }
    if (KK.ParcoursMap.NUMBERED.includes(p.type)) {
      return { anchor: 'center', className: `pm-num pm-num--${p.type}`, html: `<span>${p.number || ''}</span>` };
    }
    if (p.type === 'plaats') {
      return { anchor: 'center', className: `pm-town pm-town--${p.side || 'right'}`, html: `<span class="pm-town__label">${esc(p.name)}</span>` };
    }
    if (p.type === 'voeding') {
      return { anchor: 'center', className: `pm-feed pm-point--${p.side || 'right'}`, html: `<span class="pm-feed__icon">${icon}</span>${p.name ? `<span class="pm-point__label">${esc(p.name)}</span>` : ''}` };
    }
    return { anchor: 'center', className: `pm-point pm-point--${p.side || 'right'}`, html: `<span class="pm-point__icon"></span>${p.name ? `<span class="pm-point__label">${esc(p.name)}</span>` : ''}` };
  }

  setPoints(points) {
    this.points = points;
    if (!this.map) return;
    this.markers.forEach(m => m.remove());
    this.markers = points.map(p => {
      const { anchor, className, html } = KK.ParcoursMap.markerHtml(p);
      const el = document.createElement('div');
      el.className = className;
      el.innerHTML = html;
      el.title = `${p.name || ''}${p.name ? '. ' : ''}Sleep om te verplaatsen`;
      const marker = new window.maplibregl.Marker({ element: el, anchor, draggable: true }).setLngLat([p.lon, p.lat]).addTo(this.map);
      marker.on('dragend', () => { const ll = marker.getLngLat(); this.callbacks.onPointMoved(p.id, ll.lat, ll.lng); });
      return marker;
    });
  }

  /** Kilometre markers every `step` km along one route: { points, step }. */
  setKm(km) {
    this.km = km;
    if (!this.map) return;
    this.kmMarkers.forEach(m => m.remove());
    this.kmMarkers = [];
    if (!km || !km.points || !km.step) return;
    const cum = KK.gpx.cumulative(km.points), total = cum[cum.length - 1];
    const count = Math.floor(total / km.step + 1e-9);
    if (count > 80) return; // too many to read
    for (let i = 1; i <= count; i++) {
      const d = i * km.step;
      if (total - d < km.step * 0.25) continue; // not on top of the finish
      const p = KK.gpx.pointAtKm(km.points, cum, d);
      const el = document.createElement('div');
      el.className = 'pm-km';
      el.textContent = `km ${KK.format.km(Math.round(d * 10) / 10)}`;
      this.kmMarkers.push(new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p[1], p[0]]).addTo(this.map));
    }
  }

  // ---------- Export ----------

  hasBaseMap() {
    try {
      const base = this.map.queryRenderedFeatures().filter(f => !String(f.source).startsWith('pm-'));
      return base.some(f => f.layer.type !== 'symbol') && (!this.options.places || base.some(f => f.layer.type === 'symbol'));
    } catch (e) { return true; }
  }

  /** Resolves when style, tiles and the base map with its names are drawn (or after the timeout). */
  whenSettled(timeout) {
    const map = this.map, t0 = Date.now();
    return new Promise(resolve => {
      let done = false;
      const check = () => {
        if (done) return;
        const ready = map.isStyleLoaded() && map.areTilesLoaded() && !map.isMoving() && this.hasBaseMap();
        if (ready || Date.now() - t0 > timeout) { done = true; resolve(); return; }
        map.once('idle', check);
        setTimeout(check, 400);
      };
      map.triggerRepaint();
      setTimeout(check, 300);
    });
  }

  /**
   * Draws the map at `ratio` times its size on screen and returns { url, ratio } with the ratio that was
   * really reached (the graphics card can limit it). Call restore() afterwards.
   */
  async render(ratio) {
    const map = this.map;
    this.previousRatio = map.getPixelRatio();
    map.setPixelRatio(ratio);
    await this.whenSettled(20000);
    map.redraw();
    const canvas = map.getCanvas();
    return { url: canvas.toDataURL('image/png'), ratio: canvas.width / this.el.clientWidth };
  }

  restore() {
    if (this.previousRatio) this.map.setPixelRatio(this.previousRatio);
  }
};
