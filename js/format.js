// Formatting helpers. All user-facing output is Dutch (Belgian) notation.
window.KK = window.KK || {};

KK.format = (function () {
  const pad = n => String(n).padStart(2, '0');

  /** "10:15" -> 615 (minutes since midnight). */
  function parseTime(value) {
    const [h, m] = String(value || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** 615.4 -> "10u15" (rounded to the minute). */
  function clock(minutes) {
    const m = Math.round(minutes);
    return `${Math.floor(m / 60)}u${pad(((m % 60) + 60) % 60)}`;
  }

  /** 615.4 -> "10:15:24". */
  function exact(minutes) {
    const t = Math.round(minutes * 60);
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
  }

  /** 18.75 -> "18 min 45 s". */
  function duration(minutes) {
    const t = Math.round(minutes * 60);
    const m = Math.floor(t / 60), s = t % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }

  /** 117.5 -> "117,5". */
  function km(value) {
    return value.toLocaleString('nl-BE', { maximumFractionDigits: 1 });
  }

  return { parseTime, clock, exact, duration, km };
})();
