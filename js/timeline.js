// Renders the two-lane day timeline into #timeline-track.
// Wide screens: time runs left to right, women on top, men below.
// Phones (and never in print): time runs top to bottom, women left, men right.
window.KK = window.KK || {};

KK.Timeline = class {
  static VERTICAL_QUERY = '(max-width: 640px)';
  // Vertical layout in px: sticky lane header, hour axis column, gap between lanes, minutes to px.
  static V = { head: 52, pad: 14, axis: 48, gap: 8, pxPerMinute: 2.2 };

  constructor(trackEl, { onSelectTime }) {
    this.el = trackEl;
    this.onSelectTime = onSelectTime;
    this.schedule = null;
    this.vertical = false;
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
      const { start, end } = KK.config.timelineAxis;
      const fraction = this.vertical
        ? (e.clientY - rect.top - this.vTop(start)) / ((end - start) * KK.Timeline.V.pxPerMinute)
        : (e.clientX - rect.left) / rect.width;
      this.onSelectTime(Math.round(start + Math.max(0, Math.min(1, fraction)) * (end - start)));
    });
    if (window.ResizeObserver) {
      let lastWidth = 0;
      new ResizeObserver(entries => {
        const w = entries[0].contentRect.width;
        if (Math.abs(w - lastWidth) > 2 && this.schedule) { lastWidth = w; this.render(this.schedule, this.options); }
      }).observe(this.el);
    }
    if (window.matchMedia) {
      window.matchMedia(KK.Timeline.VERTICAL_QUERY).addEventListener('change', () => {
        if (this.schedule) this.render(this.schedule, this.options);
      });
    }
  }

  isVertical() {
    return !!window.matchMedia && window.matchMedia(KK.Timeline.VERTICAL_QUERY).matches
      && !document.documentElement.classList.contains('is-printing');
  }

  pct(t) {
    const { start, end } = KK.config.timelineAxis;
    return ((t - start) / (end - start)) * 100;
  }

  clamp(t) {
    const { start, end } = KK.config.timelineAxis;
    return Math.max(start, Math.min(end, t));
  }

  /** Vertical layout: px from the top of the track for a time. */
  vTop(t) {
    const { head, pad, pxPerMinute } = KK.Timeline.V;
    return head + pad + (this.clamp(t) - KK.config.timelineAxis.start) * pxPerMinute;
  }

  /** Decides how much text fits in a horizontal block of the given pixel width. */
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

  /** Same idea for a vertical block: the height decides the number of lines, the width the length of the name. */
  verticalBlockLabel(block, heightPx, widthPx) {
    const f = KK.format;
    const title = block.name.length * 7.5 + 16 <= widthPx ? block.name : block.shortName;
    if (heightPx >= 36) return { title, lines: [block.segment ? f.clock(block.end) : `${f.clock(block.start)}-${f.clock(block.end)}`] };
    if (heightPx >= 17) return { title, lines: [] };
    return { title: '', lines: [] };
  }

  render(schedule, options) {
    this.schedule = schedule;
    this.options = options;
    this.vertical = this.isVertical();
    this.el.classList.toggle('timeline__track--vertical', this.vertical);
    const section = this.el.closest('.timeline');
    if (section) section.classList.toggle('timeline--vertical', this.vertical);

    const html = this.vertical ? this.verticalHtml(schedule, options) : this.horizontalHtml(schedule, options);
    html.push(`<div class="tooltip" hidden></div>`);
    this.el.style.height = this.vertical ? `${this.vTop(KK.config.timelineAxis.end) + 28}px` : '';
    this.el.innerHTML = html.join('');
    this.tooltipEl = this.el.querySelector('.tooltip');
    if (this.activeBlockId) this.showTooltip(this.activeBlockId);
  }

  horizontalHtml(schedule, options) {
    const f = KK.format;
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis;
    // On paper the track is about 1050 px wide, also when printing from a phone.
    const printing = document.documentElement.classList.contains('is-printing');
    const width = printing ? Math.max(this.el.clientWidth, 1050) : this.el.clientWidth || 1400;
    const pxPerMinute = width / (axisEnd - axisStart);
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
      // Near the right edge the end label goes to the left of its line, so it is never cut off.
      const endSide = this.pct(b.end) > 92 ? ' vline-label--flip' : '';
      if (inAxis(b.end)) html.push(`<div class="vline vline--${b.race}-broadcast" style="left:${this.pct(b.end)}%"></div>
        <div class="vline-label vline-label--end${endSide} vline-label--${b.race}" style="left:${this.pct(b.end)}%">einde ${f.clock(b.end)}</div>`);
    });

    const firstPassage = schedule.men.firstPassageTime;
    if (inAxis(firstPassage)) html.push(`<div class="vline vline--first-passage" style="left:${this.pct(firstPassage)}%"></div>
      <div class="vline-label vline-label--status" style="left:${this.pct(firstPassage)}%">Mannen aan de meet ${f.clock(firstPassage)}</div>`);
    if (inAxis(options.selectedTime)) html.push(`<div class="vline vline--selected" style="left:${this.pct(options.selectedTime)}%"></div>`);
    return html;
  }

  verticalHtml(schedule, options) {
    const f = KK.format;
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis;
    const { axis, gap: laneGap } = KK.Timeline.V;
    const laneWidth = Math.max(1, ((this.el.clientWidth || 343) - axis - laneGap) / 2);
    const inAxis = t => t >= axisStart && t <= axisEnd;
    const y = t => this.vTop(t);
    const html = [];

    // Sticky header with the lane names, so they stay visible while scrolling down.
    html.push(`<div class="vhead">
      <div class="vhead__lane vlane--women"><span class="lane-label__bar chip--women"></span><span><b>Vrouwen</b>${f.km(schedule.women.totalKm)} km</span></div>
      <div class="vhead__lane vlane--men"><span class="lane-label__bar chip--men"></span><span><b>Mannen</b>${f.km(schedule.men.totalKm)} km</span></div>
    </div>`);
    html.push(`<div class="lane-bg vlane--women" style="top:${y(axisStart) - 8}px;height:${y(axisEnd) - y(axisStart) + 16}px"></div>
      <div class="lane-bg vlane--men" style="top:${y(axisStart) - 8}px;height:${y(axisEnd) - y(axisStart) + 16}px"></div>`);

    // Broadcast start and end times go in the hour column (in their own colour), so they never cover a block.
    // An hour label that would collide with one of them is left out.
    const marks = [];
    schedule.broadcasts.forEach(b => [b.start, b.end].forEach(t => { if (inAxis(t)) marks.push({ t, race: b.race }); }));
    for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) {
      html.push(`<div class="htick" style="top:${y(h * 60)}px"></div>`);
      if (!marks.some(m => Math.abs(m.t - h * 60) < 12)) html.push(`<div class="htick-label" style="top:${y(h * 60)}px">${h}u</div>`);
    }
    marks.forEach(m => html.push(`<div class="htick-label htick-label--${m.race}" style="top:${y(m.t)}px">${f.clock(m.t)}</div>`));

    schedule.broadcasts.forEach(b => {
      const a = this.clamp(b.start), z = this.clamp(b.end);
      if (z > a) html.push(`<div class="broadcast-band broadcast-band--${b.race}" style="top:${y(a)}px;height:${y(z) - y(a)}px"></div>`);
    });

    schedule.blocks.forEach(block => {
      const a = this.clamp(block.start), z = this.clamp(block.end);
      if (z - a <= 0.01) return;
      const gap = block.segment ? 1 : 0;
      const height = y(z) - y(a) - gap * 2;
      const label = this.verticalBlockLabel(block, height, laneWidth);
      html.push(`<div class="block block--${block.type} vlane--${block.lane}" data-block-id="${block.id}"
        style="top:${y(a) + gap}px;height:${height}px">
        <div class="block__title">${label.title}</div>${label.lines.map(l => `<div class="block__time">${l}</div>`).join('')}</div>`);
    });

    marks.forEach(m => html.push(`<div class="hline hline--${m.race}-broadcast" style="top:${y(m.t)}px"></div>`));

    const firstPassage = schedule.men.firstPassageTime;
    if (inAxis(firstPassage)) html.push(`<div class="hline hline--first-passage" style="top:${y(firstPassage)}px"></div>
      <div class="hline-label hline-label--status" style="top:${y(firstPassage)}px">Mannen aan de meet ${f.clock(firstPassage)}</div>`);
    if (inAxis(options.selectedTime)) html.push(`<div class="hline hline--selected" style="top:${y(options.selectedTime)}px"></div>`);
    return html;
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
    if (this.vertical) {
      // Below the block, centred on the track.
      this.tooltipEl.style.left = '50%';
      this.tooltipEl.style.top = `${this.vTop(block.end) + 6}px`;
      this.tooltipEl.style.transform = 'translateX(-50%)';
    } else {
      const center = Math.max(10, Math.min(90, this.pct((this.clamp(block.start) + this.clamp(block.end)) / 2)));
      this.tooltipEl.style.left = center + '%';
      this.tooltipEl.style.top = block.lane === 'women' ? '168px' : '174px';
      this.tooltipEl.style.transform = block.lane === 'women' ? 'translateX(-50%)' : 'translate(-50%, -100%)';
    }
    this.tooltipEl.style.marginLeft = '0px';
    this.tooltipEl.hidden = false;

    // Keep the tooltip inside the visible part of the timeline (phones may scroll it sideways).
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
