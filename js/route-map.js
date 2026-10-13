// Leaflet map with the three GPX routes and live rider markers.
window.KK = window.KK || {};

KK.RouteMap = class {
  constructor(el, routeData) {
    this.el = el;
    this.routes = {
      ardooieLoop: this.buildRoute(routeData.ardooieLoop),
      approach: this.buildRoute(routeData.approach),
      localLap: this.buildRoute(routeData.localLap),
    };
    this.kruiskalsijde = routeData.kruiskalsijde;
    this.theme = null;
    if (window.L) this.init();
  }

  static haversineKm(a, b) {
    const t = Math.PI / 180;
    const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
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

  init() {
    const L = window.L, r = this.routes;
    const map = L.map(this.el, { scrollWheelZoom: false, zoomSnap: 0.25 });
    this.map = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

    const line = (route, style) => L.polyline(route.latLngs, { opacity: 1, lineJoin: 'round', ...style }).addTo(map);
    line(r.localLap, { color: '#000', weight: 10 });
    line(r.localLap, { color: '#FFD201', weight: 6 });
    line(r.approach, { color: '#FFF', weight: 8 });
    line(r.approach, { color: '#7A7A7A', weight: 5 });
    line(r.ardooieLoop, { color: '#000', weight: 4, dashArray: '10 8' });

    const pin = (latLng, text) => L.marker(latLng, {
      icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="map-pin"></div>' }),
    }).addTo(map).bindTooltip(text, { permanent: true, direction: 'right', offset: [10, 0] });
    pin(r.ardooieLoop.latLngs[0], 'Start Ardooie');
    pin(this.kruiskalsijde, 'Kruiskalsijde');
    pin(r.localLap.latLngs[0], 'Finish');

    const rider = (race, letter) => L.marker(r.ardooieLoop.latLngs[0], {
      zIndexOffset: 1000,
      icon: L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="map-rider map-rider--${race}">${letter}</div>` }),
    }).addTo(map).bindTooltip('', { direction: 'top', offset: [0, -18] });
    this.riderMarkers = { women: rider('women', 'V'), men: rider('men', 'M') };

    map.fitBounds(L.latLngBounds([...r.ardooieLoop.latLngs, ...r.approach.latLngs, ...r.localLap.latLngs]), { padding: [24, 24] });
  }

  setTheme(theme) {
    if (!this.map || this.theme === theme) return;
    this.theme = theme;
    this.map.getPane('tilePane').style.filter = theme === 'dark'
      ? 'grayscale(0.7) invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)'
      : 'grayscale(0.7) contrast(0.95)';
  }

  setRiders(positions) {
    if (!this.map) return;
    const names = { women: 'Vrouwen', men: 'Mannen' };
    Object.entries(positions).forEach(([race, p]) => {
      const marker = this.riderMarkers[race];
      const latLng = p.state === 'pre' ? this.routes.ardooieLoop.latLngs[0]
        : p.state === 'finished' ? this.routes.localLap.latLngs[0]
        : this.pointAt(this.routes[p.route], p.fraction);
      marker.setLatLng(latLng);
      marker.setOpacity(p.state === 'racing' ? 1 : 0.5);
      marker.setTooltipContent(`${names[race]}: ${p.label}`);
    });
  }

  refreshSize() {
    if (this.map) this.map.invalidateSize();
  }
};
