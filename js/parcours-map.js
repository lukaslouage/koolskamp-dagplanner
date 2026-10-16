// The map of the Parcourskaart module: OpenFreeMap (positron) recoloured into a few themes, the loaded routes as
// lines with a border and optional direction arrows, points with an icon and a label, and kilometre markers.
// It can render at a higher pixel ratio for a sharp export.
window.KK = window.KK || {};

KK.ParcoursMap = class {
  static STYLE = 'https://tiles.openfreemap.org/styles/positron';

  // Colours per theme. 'klassiek' keeps the original map.
  static THEMES = {
    licht: { label: 'Licht', bg: '#F2F1ED', water: '#C6D4DC', green: '#DFE6D8', landuse: '#EAE9E4', building: '#E2E1DB', road: '#FFFFFF', casing: '#D6D5D0', rail: '#D2D1CC', boundary: '#B5B4AF', text: '#27272A', halo: '#FFFFFF', street: '#75747A' },
    donker: { label: 'Donker', bg: '#141518', water: '#1F2C36', green: '#1A211C', landuse: '#18191C', building: '#1E1F23', road: '#2D2F34', casing: '#222428', rail: '#292B2F', boundary: '#3A3C41', text: '#D9D9DE', halo: '#141518', street: '#85858C', dark: true },
    minimaal: { label: 'Minimaal', bg: '#F7F7F4', water: '#D5DFE5', green: '#ECEFE7', landuse: '#F2F2EF', building: null, road: '#FFFFFF', casing: '#E2E2DE', rail: null, boundary: '#C9C9C4', text: '#3F3F46', halo: '#FFFFFF', street: '#8B8B90', minimal: true },
    klassiek: { label: 'Klassiek (OpenFreeMap)', original: true },
  };

  static WIDTHS = { dun: 3, normaal: 4.5, dik: 6.5 };

  static ICONS = {
    start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M7 4h11l-2.6 3.6L18 11H7z" fill="currentColor"/></svg>',
    finish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M7 4h12v8H7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 4h3v2.7H7zM13 4h3v2.7h-3zM10 6.7h3v2.6h-3zM16 6.7h3v2.6h-3zM7 9.3h3V12H7zM13 9.3h3V12h-3z" fill="currentColor"/></svg>',
    punt: '',
    klim: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19l6.5-11 4 6.5 2.5-4L21 19z" fill="currentColor"/></svg>',
    sprint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor"/></svg>',
    voeding: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v3l-1 1v2c2 1 3 2.5 3 4.5V21a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8.5C7 10.5 8 9 10 8V6L9 5z" fill="currentColor"/></svg>',
  };

  /** callbacks: onMove(view), onPointMoved(id, lat, lon), onMapClick(lat, lon), onReady(). */
  constructor(el, callbacks) {
    this.el = el;
    this.callbacks = callbacks;
    this.options = { theme: 'licht', places: true, streets: false, arrows: true, width: 'normaal' };
    this.tracks = [];
    this.points = [];
    this.km = null;
    this.markers = [];
    this.kmMarkers = [];
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
      this.addArrowImage();
      this.applyTheme();
      this.drawTracks();
      this.ready = true;
      if (this.callbacks.onReady) this.callbacks.onReady();
    });
    map.on('moveend', () => this.callbacks.onMove({ center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing() }));
    map.on('click', e => { if (this.callbacks.onMapClick) this.callbacks.onMapClick(e.lngLat.lat, e.lngLat.lng, e.point); });
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

  get theme() { return KK.ParcoursMap.THEMES[this.options.theme] || KK.ParcoursMap.THEMES.licht; }

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
          show(id, o.places && !/country|state/.test(id));
          if (!t.original) { paint(id, 'text-color', t.text); paint(id, 'text-halo-color', t.halo); paint(id, 'text-halo-width', 1.6); }
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
        else if (/casing|subtle/.test(id)) paint(id, 'line-color', t.casing);
        else paint(id, 'line-color', t.road);
      } else if (data === 'transportation' && type === 'fill') paint(id, 'fill-color', t.bg);
      else if (data === 'boundary') paint(id, 'line-color', t.boundary);
      else if (data === 'aeroway') show(id, !t.minimal);
    });
  }

  // ---------- Routes ----------

  /** A chevron for the direction arrows, drawn once (an SDF image, so each route can colour it). */
  addArrowImage() {
    if (this.map.hasImage('pm-arrow')) return;
    const size = 32, c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(9, 7); ctx.lineTo(25, 16); ctx.lineTo(9, 25); ctx.lineTo(13, 16);
    ctx.closePath();
    ctx.fill();
    this.map.addImage('pm-arrow', ctx.getImageData(0, 0, size, size), { sdf: true, pixelRatio: 2 });
  }

  /** Light routes get a dark border, dark routes a light one, so every route stands out from the map. */
  static borderFor(color, theme) {
    const hex = String(color).replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
    return light ? (theme.dark ? '#000000' : '#111111') : (theme.dark ? '#E4E4E7' : '#FFFFFF');
  }

  setTracks(tracks) {
    this.tracks = tracks;
    if (this.ready) this.drawTracks();
  }

  /** Removes and re-adds the route layers. The first route in the list is drawn on top. */
  drawTracks() {
    const map = this.map, theme = this.theme, width = KK.ParcoursMap.WIDTHS[this.options.width] || 4.5;
    map.getStyle().layers.filter(l => l.id.startsWith('pm-')).forEach(l => map.removeLayer(l.id));
    Object.keys(map.getStyle().sources).filter(id => id.startsWith('pm-')).forEach(id => map.removeSource(id));
    // The routes go under the place names, so a name on the route stays readable (names have a halo).
    const firstName = map.getStyle().layers.find(l => l.type === 'symbol' && l['source-layer'] === 'place');
    const before = firstName ? firstName.id : undefined;
    [...this.tracks].reverse().filter(t => t.visible !== false).forEach(track => {
      const id = `pm-${track.id}`;
      map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: track.points.map(p => [p[1], p[0]]) } } });
      const border = KK.ParcoursMap.borderFor(track.color, theme);
      const dashed = track.style === 'dashed';
      map.addLayer({ id: `${id}-casing`, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': border, 'line-width': width + (dashed ? 2.5 : 3.5), 'line-opacity': dashed ? 0.85 : 1 } }, before);
      map.addLayer({ id: `${id}-line`, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' },
        paint: { 'line-color': track.color, 'line-width': width, ...(dashed ? { 'line-dasharray': [2, 1.4] } : {}) } }, before);
      if (this.options.arrows) {
        map.addLayer({ id: `${id}-arrows`, type: 'symbol', source: id,
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 90, 'icon-image': 'pm-arrow', 'icon-size': (width + 3) / 9,
            'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
          paint: { 'icon-color': border, 'icon-opacity': 0.9 } }, before);
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

  /** Fits the routes in the map, keeping room for the title (top) and the legend (bottom). */
  fit(padding) {
    const b = this.bounds();
    if (b && this.map) this.map.fitBounds(b, { padding, animate: false, bearing: this.map.getBearing() });
  }

  // ---------- Points and kilometre markers ----------

  setPoints(points) {
    this.points = points;
    if (!this.map) return;
    this.markers.forEach(m => m.remove());
    this.markers = points.map(p => {
      const el = document.createElement('div');
      el.className = `pm-point pm-point--${p.type} pm-point--${p.side || 'right'}`;
      el.innerHTML = `<span class="pm-point__icon">${KK.ParcoursMap.ICONS[p.type] || ''}</span>${p.name ? `<span class="pm-point__label">${KK.ParcoursMap.esc(p.name)}</span>` : ''}`;
      el.title = 'Sleep om te verplaatsen';
      const marker = new window.maplibregl.Marker({ element: el, anchor: 'center', draggable: true }).setLngLat([p.lon, p.lat]).addTo(this.map);
      marker.on('dragend', () => { const ll = marker.getLngLat(); this.callbacks.onPointMoved(p.id, ll.lat, ll.lng); });
      return marker;
    });
  }

  /** Kilometre markers every `step` km along one route: { points, step, labels }. */
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
      el.textContent = KK.format.km(Math.round(d * 10) / 10);
      this.kmMarkers.push(new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p[1], p[0]]).addTo(this.map));
    }
  }

  static esc(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
