// Reading GPX files and working with the lines in them: length, points along the line, elevation.
// Points are [lat, lon, ele] (ele 0 when the file has no elevation). No page or map code here.
window.KK = window.KK || {};

KK.gpx = (function () {
  const MAX_POINTS = 4000; // enough detail for a map; keeps saved routes small

  function haversineKm(a, b) {
    const t = Math.PI / 180;
    const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }

  /** Cumulative distance in km at every point. */
  function cumulative(points) {
    const out = [0];
    for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversineKm(points[i - 1], points[i]));
    return out;
  }

  const lengthKm = points => (points.length > 1 ? cumulative(points)[points.length - 1] : 0);

  /** Drops points closer than a few metres to the previous one, until the line has at most MAX_POINTS points. */
  function simplify(points) {
    if (points.length <= MAX_POINTS) return points;
    const total = lengthKm(points), step = total / MAX_POINTS;
    const out = [points[0]];
    let since = 0;
    for (let i = 1; i < points.length - 1; i++) {
      since += haversineKm(points[i - 1], points[i]);
      if (since >= step) { out.push(points[i]); since = 0; }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  const round = p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5, Math.round((p[2] || 0) * 10) / 10];

  /**
   * Reads a GPX text. Returns { tracks: [{ name, points }], waypoints: [{ name, lat, lon }] } or throws an Error
   * with a Dutch message. Every track (trk) and every route (rte) becomes one line; the segments of a track
   * are joined.
   */
  function parse(text, fileName = '') {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagNameNS('*', 'gpx').length) {
      throw new Error(`${fileName || 'Dit bestand'} is geen geldig GPX-bestand.`);
    }
    const byTag = (el, tag) => [...el.getElementsByTagNameNS('*', tag)];
    const text1 = (el, tag) => {
      const child = [...el.children].find(c => c.localName === tag);
      return child ? child.textContent.trim() : '';
    };
    const point = el => {
      const lat = Number(el.getAttribute('lat')), lon = Number(el.getAttribute('lon'));
      const ele = Number(text1(el, 'ele'));
      return Number.isFinite(lat) && Number.isFinite(lon) ? round([lat, lon, Number.isFinite(ele) ? ele : 0]) : null;
    };
    const baseName = fileName.replace(/\.gpx$/i, '');
    const tracks = [];
    byTag(doc, 'trk').forEach((trk, i) => {
      const points = byTag(trk, 'trkpt').map(point).filter(Boolean);
      if (points.length > 1) tracks.push({ name: text1(trk, 'name') || (baseName ? `${baseName}${i ? ` ${i + 1}` : ''}` : `Parcours ${i + 1}`), points: simplify(points) });
    });
    byTag(doc, 'rte').forEach((rte, i) => {
      const points = byTag(rte, 'rtept').map(point).filter(Boolean);
      if (points.length > 1) tracks.push({ name: text1(rte, 'name') || baseName || `Route ${i + 1}`, points: simplify(points) });
    });
    const waypoints = byTag(doc, 'wpt').map(w => {
      const p = point(w);
      return p && { name: text1(w, 'name') || 'Punt', lat: p[0], lon: p[1] };
    }).filter(Boolean);
    if (!tracks.length) throw new Error(`${fileName || 'Dit bestand'} bevat geen parcours (geen track of route met punten).`);
    return { tracks, waypoints };
  }

  /** The point at a distance (km) along a line, with the cumulative distances from cumulative(). */
  function pointAtKm(points, cum, km) {
    const d = Math.max(0, Math.min(cum[cum.length - 1], km));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const span = cum[i] - cum[i - 1] || 1, k = (d - cum[i - 1]) / span;
    const a = points[i - 1], b = points[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * k];
  }

  /** Index and distance (km) of the point of a line nearest to [lat, lon], with the cumulative distances. */
  function nearest(points, cum, lat, lon) {
    let best = 0, bestD = Infinity;
    points.forEach((p, i) => {
      const d = haversineKm(p, [lat, lon]);
      if (d < bestD) { bestD = d; best = i; }
    });
    return { index: best, km: cum[best], distanceKm: bestD };
  }

  /**
   * Elevation along one or more lines played after each other: [{ points, km }], where km is the length the
   * part should get (an official distance) or null for its GPX length. Returns { km: [...], ele: [...] }
   * sampled every 25 m and smoothed over about 400 m, plus the total length and the climb (rises below 1 m ignored).
   */
  function profile(parts) {
    const kms = [], ele = [];
    let offset = 0;
    parts.forEach(part => {
      const cum = cumulative(part.points), gpxKm = cum[cum.length - 1] || 1;
      const length = part.km || gpxKm;
      const n = Math.max(2, Math.round(length * 40));
      for (let i = 0; i <= n; i++) {
        if (i === 0 && kms.length) continue;
        const along = (gpxKm * i) / n;
        kms.push(offset + (length * i) / n);
        ele.push(pointAtKm(part.points, cum, along)[2]);
      }
      offset += length;
    });
    const half = 8;
    const smooth = ele.map((_, i) => {
      const from = Math.max(0, i - half), to = Math.min(ele.length - 1, i + half);
      let sum = 0;
      for (let m = from; m <= to; m++) sum += ele[m];
      return sum / (to - from + 1);
    });
    let climb = 0, reference = smooth[0];
    smooth.forEach(v => {
      if (v > reference + 1) { climb += v - reference; reference = v; }
      else if (v < reference - 1) reference = v;
    });
    return { km: kms, ele: smooth, totalKm: offset, climb, hasElevation: ele.some(v => v !== 0) };
  }

  return { parse, lengthKm, cumulative, pointAtKm, nearest, profile, haversineKm, simplify };
})();
