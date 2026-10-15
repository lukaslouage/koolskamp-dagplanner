// MapLibre map with the routes of the chosen courses (local laps, approaches, loops) and live rider markers.
// Base map from OpenFreeMap.
window.KK = window.KK || {};

KK.RouteMap = class {
  static STYLES = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  };

  constructor(el, routeData) {
    this.el = el;
    this.routes = Object.fromEntries(Object.entries(routeData.routes).map(([id, points]) => [id, this.buildRoute(points)]));
    this.courses = routeData.courses;
    // On the map an approach stops where it joins the circuit, so it does not cover the yellow local lap.
    this.drawnUpTo = {};
    Object.values(this.courses).forEach(c => {
      const line = this.routes[c.approach.route].latLngs;
      let best = 0;
      line.forEach((p, i) => { if (KK.RouteMap.haversineKm(p, c.approach.join) < KK.RouteMap.haversineKm(line[best], c.approach.join)) best = i; });
      this.drawnUpTo[c.approach.route] = best;
    });
    this.shown = null; // which approaches, loops, starts and joins are on the map (see setCourses)
    this.theme = null;
  }

  static haversineKm(a, b) {
    const t = Math.PI / 180;
    const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }

  static lngLat(latLng) {
    return [latLng[1], latLng[0]];
  }

  buildRoute(points) {
    const latLngs = points.map(p => [p[0], p[1]]);
    const cumulative = [0];
    for (let i = 1; i < latLngs.length; i++) cumulative.push(cumulative[i - 1] + KK.RouteMap.haversineKm(latLngs[i - 1], latLngs[i]));
    return { latLngs, cumulative, totalKm: cumulative[cumulative.length - 1] };
  }

  /** Point at a fraction (0..1) along a route. GPX length is scaled to the official distance this way. */
  pointAt(route, fraction) {
    const target = Math.max(0, Math.min(1, fraction)) * route.totalKm;
    let i = 1;
    while (i < route.cumulative.length - 1 && route.cumulative[i] < target) i++;
    const a = route.latLngs[i - 1], b = route.latLngs[i];
    const segment = route.cumulative[i] - route.cumulative[i - 1] || 1;
    const k = (target - route.cumulative[i - 1]) / segment;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  /** What to draw for the courses of both races: [{ course: id, loops: number }, ...]. */
  static plan(courses, races) {
    const approaches = new Set(), loops = new Map(), starts = new Map(), joins = new Map();
    races.forEach(({ course: id, loops: n }) => {
      const c = courses[id];
      if (!c) return;
      approaches.add(c.approach.route);
      joins.set(c.approach.joinName + c.approach.join.join(), { name: c.approach.joinName, latLng: c.approach.join });
      if (c.loop && n > 0) loops.set(c.loop.route, true);
      starts.set(c.start, { name: `Start ${c.start}`, route: c.loop && n > 0 ? c.loop.route : c.approach.route });
    });
    return { approaches: [...approaches], loops: [...loops.keys()], starts: [...starts.values()], joins: [...joins.values()] };
  }

  bounds() {
    const r = this.routes, shown = this.shown || { approaches: Object.keys(r), loops: [] };
    const all = [...r['local-lap'].latLngs, ...shown.approaches.flatMap(id => r[id].latLngs), ...shown.loops.flatMap(id => r[id].latLngs)];
    const lats = all.map(p => p[0]), lons = all.map(p => p[1]);
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  }

  fit() {
    if (this.map) this.map.fitBounds(this.bounds(), { padding: 40, animate: false });
  }

  init(theme) {
    const ml = window.maplibregl, r = this.routes;
    const map = new ml.Map({
      container: this.el,
      style: KK.RouteMap.STYLES[theme],
      bounds: this.bounds(),
      fitBoundsOptions: { padding: 40 },
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      preserveDrawingBuffer: true, // keeps the map visible in the PDF export
    });
    this.map = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new ml.AttributionControl({ compact: false }), 'bottom-right');
    map.on('style.load', () => this.addRouteLayers());

    const marker = (latLng, className, html, options = {}) => {
      const el = document.createElement('div');
      el.className = className;
      el.innerHTML = html;
      return new ml.Marker({ element: el, ...options }).setLngLat(KK.RouteMap.lngLat(latLng)).addTo(map);
    };
    this.marker = marker;
    this.pins = [];
    this.finishPin = this.pin(r['local-lap'].latLngs[0], 'Finish');

    const start = r['local-lap'].latLngs[0];
    this.riderMarkers = {
      women: marker(start, 'map-rider map-rider--women', 'V'),
      men: marker(start, 'map-rider map-rider--men', 'M'),
    };

    // Red flag car (ahead of the riders) and green flag car (behind them), per race. The pole stands on the spot.
    const flagSvg = '<svg viewBox="0 0 14 17" aria-hidden="true"><path class="pole-outline" d="M2 17V2"/><path class="pole" d="M2 17V2"/><path class="cloth" d="M2.8 1.6h10.2l-3.1 3.8 3.1 3.8H2.8z"/></svg>';
    const flag = color => {
      const m = marker(start, `map-flag map-flag--${color}`, flagSvg, { anchor: 'bottom-left', offset: [-2, 0] });
      m.getElement().style.display = 'none';
      return m;
    };
    this.flagMarkers = { women: { red: flag('red'), green: flag('green') }, men: { red: flag('red'), green: flag('green') } };
    this.closureData = { type: 'FeatureCollection', features: [] };
    if (this.shown) this.updatePins();
    if (this.flags) this.setFlags(this.flags);

    // Refit whenever the container changes size (window resize, print layout), so the routes never end up off screen.
    if (window.ResizeObserver) {
      let last = '';
      new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        const key = `${Math.round(width)}x${Math.round(height)}`;
        if (width > 0 && key !== last) { last = key; map.resize(); this.fit(); }
      }).observe(this.el);
    }
  }

  pin(latLng, text) {
    return this.marker(latLng, 'map-pin-wrap',
      `<span class="map-pin"></span><span class="map-pin__label">${text}</span>`, { anchor: 'left', offset: [-7, 0] });
  }

  /** Start places and the points where an approach joins the circuit, for the courses on the map. */
  updatePins() {
    if (!this.map || !this.marker) return;
    this.pins.forEach(p => p.remove());
    const r = this.routes, shown = this.shown;
    this.pins = [
      ...shown.starts.map(s => this.pin(r[s.route].latLngs[0], s.name)),
      ...shown.joins.map(j => this.pin(j.latLng, j.name)),
    ];
  }

  /** GeoJSON with the lines of a list of routes. */
  lines(ids) {
    const part = id => this.drawnUpTo[id] != null ? this.routes[id].latLngs.slice(0, this.drawnUpTo[id] + 1) : this.routes[id].latLngs;
    return { type: 'FeatureCollection', features: ids.map(id => ({ type: 'Feature', properties: { id },
      geometry: { type: 'LineString', coordinates: part(id).map(KK.RouteMap.lngLat) } })) };
  }

  /**
   * Shows the courses of both races: races = [{ course, loops }]. Only the parts that are ridden are drawn; the
   * map refits when that changes.
   */
  setCourses(races) {
    const shown = KK.RouteMap.plan(this.courses, races);
    const key = JSON.stringify(shown);
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.shown = shown;
    if (!this.map) return;
    try {
      const approaches = this.map.getSource('approaches'), loops = this.map.getSource('loops');
      if (approaches) approaches.setData(this.lines(shown.approaches));
      if (loops) loops.setData(this.lines(shown.loops));
    } catch (e) { /* the style is reloading; the layers are added again with this data */ }
    this.updatePins();
    this.fit();
  }

  /** Adds the route lines. Runs after every style load, because a theme switch replaces the whole style. */
  addRouteLayers() {
    const map = this.map, dark = this.theme === 'dark';
    const shown = this.shown || { approaches: [], loops: [] };
    // The closed stretch of road (between the green and the red flag car) as a red glow under the route lines.
    map.addSource('closure', { type: 'geojson', data: this.closureData || { type: 'FeatureCollection', features: [] } });
    // Drawn in one solid colour (red at about 38% over the map, mixed in advance): a see-through line gets darker
    // where it overlaps itself in bends and at the ends. It goes under the place names so those stay readable.
    const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol');
    map.addLayer({ id: 'closure-halo', type: 'line', source: 'closure', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': dark ? '#5F2325' : '#EDB4B4', 'line-width': 22 } }, firstLabel && firstLabel.id);
    const add = (id, data, layers) => {
      map.addSource(id, { type: 'geojson', data });
      layers.forEach((paint, i) => map.addLayer({ id: `${id}-${i}`, type: 'line', source: id,
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint }));
    };
    add('local-lap', this.lines(['local-lap']), [
      { 'line-color': '#000000', 'line-width': 10 },
      { 'line-color': '#FFD201', 'line-width': 6 },
    ]);
    add('approaches', this.lines(shown.approaches), [
      { 'line-color': dark ? '#111113' : '#FFFFFF', 'line-width': 8 },
      { 'line-color': dark ? '#B5B5B2' : '#7A7A7A', 'line-width': 5 },
    ]);
    add('loops', this.lines(shown.loops), [
      { 'line-color': dark ? '#E6E6E6' : '#000000', 'line-width': 3.5, 'line-dasharray': [2.5, 2] },
    ]);
  }

  setTheme(theme) {
    if (!window.maplibregl || this.theme === theme) return;
    this.theme = theme;
    if (!this.map) {
      // Without WebGL MapLibre throws; the rest of the page must keep working.
      try { this.init(theme); } catch (e) { this.map = null; this.el.classList.add('route__map--unavailable'); }
    } else this.map.setStyle(KK.RouteMap.STYLES[theme], { diff: false });
  }

  setRiders(positions) {
    if (!this.map) return;
    const names = { women: 'Vrouwen', men: 'Mannen' };
    Object.entries(positions).forEach(([race, p]) => {
      const marker = this.riderMarkers[race];
      const latLng = this.pointAt(this.routes[p.route], p.fraction);
      marker.setLngLat(KK.RouteMap.lngLat(latLng));
      const el = marker.getElement();
      el.classList.toggle('is-idle', p.state !== 'racing');
      el.title = `${names[race]}: ${p.label}`;
    });
  }

  /** Position (lat, lon) of a place on the course: { route, fraction } from KK.flagPositions. */
  latLngFor(place) {
    return this.pointAt(this.routes[place.route], place.fraction);
  }

  /**
   * Shows the red and the green flag and the stretch of road between them (from KK.flagPositions).
   * flags = { women, men }; a race that is not on the road is null.
   */
  setFlags(flags) {
    this.flags = flags;
    if (!this.map || !this.flagMarkers) return;
    const names = { women: 'vrouwen', men: 'mannen' };
    const features = [];
    ['women', 'men'].forEach(race => {
      const info = flags[race];
      ['red', 'green'].forEach(color => {
        const marker = this.flagMarkers[race][color], place = info && info[color];
        const el = marker.getElement();
        el.style.display = place ? '' : 'none';
        if (!place) return;
        marker.setLngLat(KK.RouteMap.lngLat(this.latLngFor(place)));
        el.title = color === 'red'
          ? `Rode vlag ${names[race]}: ${info.redMinutes} min voor de eerste renner`
          : `Groene vlag ${names[race]}: ${info.greenMinutes} min na de winnaar`;
      });
      if (info && info.stretch.length > 1) {
        features.push({ type: 'Feature', properties: { race }, geometry: { type: 'LineString',
          coordinates: info.stretch.map(place => KK.RouteMap.lngLat(this.latLngFor(place))) } });
      }
    });
    this.closureData = { type: 'FeatureCollection', features };
    try {
      const source = this.map.getSource('closure');
      if (source) source.setData(this.closureData);
    } catch (e) { /* the style is reloading; the data is added again when it has loaded */ }
  }

  /** The red glow is left out of the printed map. */
  setHaloVisible(visible) {
    try { if (this.map.getLayer('closure-halo')) this.map.setLayoutProperty('closure-halo', 'visibility', visible ? 'visible' : 'none'); } catch (e) { /* not loaded */ }
  }

  refreshSize() {
    if (this.map) { this.map.resize(); this.fit(); }
  }

  /** Resolves when style and tiles are loaded and the map stands still (or after the timeout). */
  whenSettled(timeout) {
    const map = this.map, t0 = Date.now();
    return new Promise(resolve => {
      const check = () => {
        const ready = map.isStyleLoaded() && map.areTilesLoaded() && !map.isMoving();
        if (ready || Date.now() - t0 > timeout) resolve(); else setTimeout(check, 150);
      };
      setTimeout(check, 500); // gives the render after the resize and the refit time to ask for its tiles
    });
  }

  /**
   * Browsers do not reliably print a WebGL canvas, so the map is printed as a still image.
   * Call after the print layout class is set: the container then already has its print size.
   * With wait = true it waits until all tiles are loaded (export button); without, it snapshots at once (Cmd+P).
   */
  async snapshotForPrint(wait) {
    if (!this.map) return;
    this.refreshSize();
    if (wait) await this.whenSettled(10000);
    this.setHaloVisible(false);
    this.map.redraw();
    if (!this.printImage) {
      this.printImage = document.createElement('img');
      this.printImage.className = 'map-print-image';
      this.printImage.alt = '';
      this.map.getCanvas().after(this.printImage);
    }
    try { this.printImage.src = this.map.getCanvas().toDataURL('image/png'); } catch (e) { /* canvas unavailable */ }
    this.setHaloVisible(true);
  }
};
