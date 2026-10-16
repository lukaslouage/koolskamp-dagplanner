// MapLibre map with the three GPX routes and live rider markers. Base map from OpenFreeMap.
window.KK = window.KK || {};

KK.RouteMap = class {
  static STYLES = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  };

  constructor(el, routeData) {
    this.el = el;
    this.routes = {
      ardooieLoop: this.buildRoute(routeData.ardooieLoop),
      approach: this.buildRoute(routeData.approach),
      localLap: this.buildRoute(routeData.localLap),
    };
    this.kruiskalsijde = routeData.kruiskalsijde;
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

  bounds() {
    const r = this.routes;
    const all = [...r.ardooieLoop.latLngs, ...r.approach.latLngs, ...r.localLap.latLngs];
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
    const pin = (latLng, text) => marker(latLng, 'map-pin-wrap',
      `<span class="map-pin"></span><span class="map-pin__label">${text}</span>`, { anchor: 'left', offset: [-7, 0] });
    pin(r.ardooieLoop.latLngs[0], 'Start Ardooie');
    pin(this.kruiskalsijde, 'Kruiskalsijde');
    pin(r.localLap.latLngs[0], 'Finish');

    const start = r.ardooieLoop.latLngs[0];
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

  /** Adds the route lines. Runs after every style load, because a theme switch replaces the whole style. */
  addRouteLayers() {
    const map = this.map, r = this.routes, dark = this.theme === 'dark';
    // The closed stretch of road (between the green and the red flag car) as a red glow under the route lines.
    map.addSource('closure', { type: 'geojson', data: this.closureData || { type: 'FeatureCollection', features: [] } });
    // Drawn in one solid colour (red at about 38% over the map, mixed in advance): a see-through line gets darker
    // where it overlaps itself in bends and at the ends. It goes under the place names so those stay readable.
    const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol');
    map.addLayer({ id: 'closure-halo', type: 'line', source: 'closure', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': dark ? '#5F2325' : '#EDB4B4', 'line-width': 22 } }, firstLabel && firstLabel.id);
    const add = (id, route, layers) => {
      map.addSource(id, { type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route.latLngs.map(KK.RouteMap.lngLat) } } });
      layers.forEach((paint, i) => map.addLayer({ id: `${id}-${i}`, type: 'line', source: id,
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint }));
    };
    add('local-lap', r.localLap, [
      { 'line-color': '#000000', 'line-width': 10 },
      { 'line-color': '#FFD201', 'line-width': 6 },
    ]);
    add('approach', r.approach, [
      { 'line-color': dark ? '#111113' : '#FFFFFF', 'line-width': 8 },
      { 'line-color': dark ? '#B5B5B2' : '#7A7A7A', 'line-width': 5 },
    ]);
    add('ardooie-loop', r.ardooieLoop, [
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
      const latLng = p.state === 'pre' ? this.routes.ardooieLoop.latLngs[0]
        : p.state === 'finished' ? this.routes.localLap.latLngs[0]
        : this.pointAt(this.routes[p.route], p.fraction);
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

  /**
   * True when the base map is drawn, not only our own route lines: both roads and areas and the place names
   * (the names need their own font files, which come in later than the map tiles).
   */
  hasBaseMap() {
    try {
      const own = new Set(['closure', 'local-lap', 'approach', 'ardooie-loop']);
      const base = this.map.queryRenderedFeatures().filter(feature => !own.has(feature.source));
      return base.some(feature => feature.layer.type !== 'symbol') && base.some(feature => feature.layer.type === 'symbol');
    } catch (e) { return true; }
  }

  /**
   * Resolves when the map is ready to be copied: style and tiles loaded, nothing moving and the base map drawn
   * (after a theme switch the map can report "loaded" before the new tiles are even asked for). Gives up after
   * the timeout, so the export never hangs.
   */
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
   * Browsers do not reliably print a WebGL canvas, so the map is printed as a still image.
   * Call after the print layout class is set: the container then already has its print size.
   * With wait = true it waits until all tiles are loaded (export button); without, it snapshots at once (Cmd+P).
   */
  async snapshotForPrint(wait) {
    if (!this.map) return;
    this.refreshSize();
    if (wait) await this.whenSettled(15000);
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
