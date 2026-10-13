// Renders the two-lane day timeline (women on top, men below) into #timeline-track.
window.KK = window.KK || {};

KK.Timeline = class {
  constructor(trackEl, { onSelectTime }) {
    this.el = trackEl;
    this.onSelectTime = onSelectTime;
    this.schedule = null;
    this.layout = { laneTop: { women: 64, men: 178 } };

    // activeBlockId survives re-renders, so a tapped or clicked block keeps its tooltip.
    this.activeBlockId = null;
    this.el.addEventListener('mouseover', e => {
      const block = e.target.closest('.block');
      if (block) this.showTooltip(block.dataset.blockId);
    });
    this.el.addEventListener('mouseout', e => {
      const from = e.target.closest('.block');
      if (from && !(e.relatedTarget && from.contains(e.relatedTarget))) this.hideTooltip();
    });
    this.el.addEventListener('mouseleave', () => this.hideTooltip());
    this.el.addEventListener('click', e => {
      const block = e.target.closest('.block');
      this.activeBlockId = block ? block.dataset.blockId : null;
      const rect = this.el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const { start, end } = KK.config.timelineAxis;
      this.onSelectTime(Math.round(start + x * (end - start)));
    });
    if (window.ResizeObserver) {
      let lastWidth = 0;
      new ResizeObserver(entries => {
        const w = entries[0].contentRect.width;
        if (Math.abs(w - lastWidth) > 2 && this.schedule) { lastWidth = w; this.render(this.schedule, this.options); }
      }).observe(this.el);
    }
  }

  pct(t) {
    const { start, end } = KK.config.timelineAxis;
    return ((t - start) / (end - start)) * 100;
  }

  clamp(t) {
    const { start, end } = KK.config.timelineAxis;
    return Math.max(start, Math.min(end, t));
  }

  /** Decides how much text fits in a block of the given pixel width. */
  blockLabel(block, widthPx) {
    const f = KK.format;
    if (widthPx >= 110) {
      const nameFits = block.name.length * 9 + 20 <= widthPx;
      return { mode: 'full', title: nameFits ? block.name : block.shortName,
        lines: [block.segment ? f.clock(block.end) : `${f.clock(block.start)}-${f.clock(block.end)}`], pad: 10 };
    }
    if (widthPx >= 52) {
      return { mode: 'compact', title: block.shortName,
        lines: block.segment ? [f.clock(block.end)] : [f.clock(block.start), f.clock(block.end)], pad: 5 };
    }
    if (widthPx >= 22) return { mode: 'tiny', title: block.segment || widthPx >= 44 ? block.shortName : '', lines: [], pad: 3 };
    return { mode: 'none', title: '', lines: [], pad: 0 };
  }

  render(schedule, options) {
    this.schedule = schedule;
    this.options = options;
    const f = KK.format;
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis;
    const pxPerMinute = (this.el.clientWidth || 1400) / (axisEnd - axisStart);
    const html = [];

    for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) {
      const left = this.pct(h * 60);
      html.push(`<div class="tick" style="left:${left}%"></div><div class="tick-label" style="left:${left}%">${h}u</div>`);
    }
    if (options.showQuarterGrid) {
      for (let m = axisStart + 15; m < axisEnd; m += 15) if (m % 60) html.push(`<div class="tick tick--quarter" style="left:${this.pct(m)}%"></div>`);
    }

    html.push(`<div class="lane-bg" style="top:64px"></div><div class="lane-bg" style="top:178px"></div>`);

    schedule.broadcasts.forEach(b => {
      const a = this.clamp(b.start), z = this.clamp(b.end);
      if (z > a) html.push(`<div class="broadcast-band broadcast-band--${b.race}" style="left:${this.pct(a)}%;width:${this.pct(z) - this.pct(a)}%"></div>`);
    });

    schedule.blocks.forEach(block => {
      const a = this.clamp(block.start), z = this.clamp(block.end);
      if (z - a <= 0.01) return;
      const gap = block.segment ? 1 : 0;
      const label = this.blockLabel(block, (z - a) * pxPerMinute - gap * 2);
      const top = this.layout.laneTop[block.lane] + 8;
      html.push(`<div class="block block--${block.type}${label.mode === 'compact' ? ' block--compact' : ''}" data-block-id="${block.id}"
        style="top:${top}px;left:calc(${this.pct(a)}% + ${gap}px);width:calc(${this.pct(z) - this.pct(a)}% - ${gap * 2}px);padding:0 ${label.pad}px">
        <div class="block__title">${label.title}</div>${label.lines.map(l => `<div class="block__time">${l}</div>`).join('')}</div>`);
    });

    const inAxis = t => t >= axisStart && t <= axisEnd;
    schedule.broadcasts.forEach(b => {
      if (inAxis(b.start)) html.push(`<div class="vline vline--${b.race}-broadcast" style="left:${this.pct(b.start)}%"></div>
        <div class="vline-label vline-label--start vline-label--${b.race}" style="left:${this.pct(b.start)}%">${b.channel} ${f.clock(b.start)}</div>`);
      if (inAxis(b.end)) html.push(`<div class="vline vline--${b.race}-broadcast" style="left:${this.pct(b.end)}%"></div>
        <div class="vline-label vline-label--end vline-label--${b.race}" style="left:${this.pct(b.end)}%">einde ${f.clock(b.end)}</div>`);
    });

    const firstPassage = schedule.men.firstPassageTime;
    if (inAxis(firstPassage)) html.push(`<div class="vline vline--first-passage" style="left:${this.pct(firstPassage)}%"></div>
      <div class="vline-label vline-label--status" style="left:${this.pct(firstPassage)}%">Mannen aan de meet ${f.clock(firstPassage)}</div>`);
    if (inAxis(options.selectedTime)) html.push(`<div class="vline vline--selected" style="left:${this.pct(options.selectedTime)}%"></div>`);

    html.push(`<div class="tooltip" hidden></div>`);
    this.el.innerHTML = html.join('');
    this.tooltipEl = this.el.querySelector('.tooltip');
    if (this.activeBlockId) this.showTooltip(this.activeBlockId);
  }

  showTooltip(blockId) {
    const block = this.schedule && this.schedule.blockById[blockId];
    if (!block || !this.tooltipEl) { this.activeBlockId = null; return; }
    this.activeBlockId = blockId;
    const f = KK.format;
    const lines = [`Van ${f.exact(block.start)} tot ${f.exact(block.end)}`, `Duur ${f.duration(block.end - block.start)}`];
    if (block.kmFrom != null) lines.push(`Km ${f.km(block.kmFrom)} tot ${f.km(block.kmTo)} (${f.km(block.kmTo - block.kmFrom)} km)`);
    (block.details || []).forEach(d => lines.push(d));
    this.tooltipEl.innerHTML = `<div class="tooltip__title">${block.name}</div>${lines.map(l => `<div class="tooltip__line">${l}</div>`).join('')}`;
    const center = Math.max(10, Math.min(90, this.pct((this.clamp(block.start) + this.clamp(block.end)) / 2)));
    this.tooltipEl.style.left = center + '%';
    this.tooltipEl.style.top = block.lane === 'women' ? '168px' : '174px';
    this.tooltipEl.style.transform = block.lane === 'women' ? 'translateX(-50%)' : 'translate(-50%, -100%)';
    this.tooltipEl.style.marginLeft = '0px';
    this.tooltipEl.hidden = false;

    // Keep the tooltip inside the visible part of the scrollable timeline (phones scroll it sideways).
    const view = (this.el.closest('.timeline__scroll') || this.el).getBoundingClientRect();
    const rect = this.tooltipEl.getBoundingClientRect();
    const shift = rect.left < view.left + 4 ? view.left + 4 - rect.left
      : rect.right > view.right - 4 ? view.right - 4 - rect.right : 0;
    this.tooltipEl.style.marginLeft = `${shift}px`;
  }

  hideTooltip() {
    this.activeBlockId = null;
    if (this.tooltipEl) this.tooltipEl.hidden = true;
  }
};
