// Renders the day timeline into #timeline-track: women, men and the VIP tent.
// Wide screens: time runs left to right, one lane per row (women, men, VIP tent).
// Phones (and never in print): time runs top to bottom, one column per lane.
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
    this.layout = { laneTop: { women: 64, men: 178, vip: 292 }, vipBlockHeight: 52, labelTop: 368, fadePx: 14, rightGutter: 24 };  // rightGutter: room for a flag past the last hour (see .timeline__grid)

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
    // The flag widths are measured with the web font, so measure again once it has loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (this.schedule) this.render(this.schedule, this.options); });
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

  /** Every block is inset 1 px on both sides, so there is the same 2 px between all neighbours. The VIP blocks fade into each other instead. */
  blockGap(block) {
    return block.lane === 'vip' ? 0 : 1;
  }

  /**
   * The three-course menu has soft edges (not all tables eat at the same time). To keep the soft edge from
   * showing the empty lane, the aperitif runs a little under the start of the menu and the 'free' block
   * starts a little before its end. Returns [px to move the start earlier, px to make longer].
   */
  fadeOverlap(block) {
    const fade = this.layout.fadePx;
    if (block.type === 'vip-aperitif') return [0, fade];
    if (block.type === 'vip-free') return [fade, 0];
    return [0, 0];
  }

  /** Width of a flag label: the measured text, 2 x 10 px padding and the 18 px bend of the flag. */
  flagWidth(text) {
    this.measure = this.measure || document.createElement('canvas').getContext('2d');
    this.measure.font = '600 11.5px Inter, system-ui, sans-serif';
    return this.measure.measureText(text).width + 20 + 18 + 2;
  }

  /** Decides how much text fits in a horizontal block of the given pixel width. */
  blockLabel(block, widthPx) {
    const f = KK.format;
    if (widthPx >= 110) {
      const nameFits = block.name.length * 9 + 20 <= widthPx;
      return { mode: 'full', title: nameFits ? block.name : block.shortName,
        lines: [block.segment ? f.clock(block.end) : `${f.clock(block.start)}-${f.clock(block.end)}`], pad: 10 };
    }
    // A title is only shown when the whole word fits (about 7.8 px per character plus padding).
    const shortFits = pad => block.shortName.length * 7.8 + pad * 2 <= widthPx;
    if (widthPx >= 52) {
      return { mode: 'compact', title: shortFits(5) ? block.shortName : '',
        lines: block.segment ? [f.clock(block.end)] : [f.clock(block.start), f.clock(block.end)], pad: 5 };
    }
    if (widthPx >= 22) return { mode: 'tiny', title: shortFits(3) ? block.shortName : '', lines: [], pad: 3 };
    return { mode: 'none', title: '', lines: [], pad: 0 };
  }

  /** Same idea for a vertical block: the height decides the number of lines, the width the length of the name. */
  verticalBlockLabel(block, heightPx, widthPx) {
    const f = KK.format;
    const title = block.name.length * 7.5 + 16 <= widthPx ? block.name : block.shortName;
    if (block.segment) return heightPx >= 36 ? { title, lines: [f.clock(block.end)] } : heightPx >= 17 ? { title, lines: [] } : { title: '', lines: [] };
    // A time range like 11u55-12u55 needs about 98 px; in a narrower column the two times go under each other.
    const rangeFits = widthPx >= 98;
    if (rangeFits && heightPx >= 36) return { title, lines: [`${f.clock(block.start)}-${f.clock(block.end)}`] };
    if (!rangeFits && heightPx >= 56) return { title, lines: [f.clock(block.start), f.clock(block.end)] };
    if (heightPx >= 36) return { title, lines: [f.clock(block.start)] };
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
    this.el.style.height = this.vertical ? `${this.vTop(KK.config.timelineAxis.end) + 28}px` : this.horizontalRows > 1 ? '426px' : '';
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

    html.push(`<div class="lane-bg" style="top:64px"></div><div class="lane-bg" style="top:178px"></div><div class="lane-bg lane-bg--vip" style="top:${this.layout.laneTop.vip}px"></div>`);

    schedule.broadcasts.forEach(b => {
      const a = this.clamp(b.start), z = this.clamp(b.end);
      if (z > a) html.push(`<div class="broadcast-band broadcast-band--${b.race}" style="left:${this.pct(a)}%;width:${this.pct(z) - this.pct(a)}%"></div>`);
    });

    schedule.blocks.forEach(block => {
      const a = this.clamp(block.start), z = this.clamp(block.end);
      if (z - a <= 0.01) return;
      const gap = this.blockGap(block);
      const label = this.blockLabel(block, (z - a) * pxPerMinute - gap * 2);
      const top = this.layout.laneTop[block.lane] + 8;
      const [shift, grow] = this.fadeOverlap(block);
      const height = block.lane === 'vip' ? `height:${this.layout.vipBlockHeight}px;` : '';
      html.push(`<div class="block block--${block.type}${label.mode === 'compact' ? ' block--compact' : ''}" data-block-id="${block.id}"
        style="top:${top}px;${height}left:calc(${this.pct(a)}% + ${gap - shift}px);width:calc(${this.pct(z) - this.pct(a)}% - ${gap * 2 - shift - grow}px);padding:0 ${label.pad}px">
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

    // Key moments: a line from the top of the lanes that bends into a label under the lanes, like a flag.
    // Each label prefers a side (the women's and the first-passage label point away from each other, the men's
    // finish points right), switches side when there is no room, and moves to a second row when it would touch
    // a label that is already on the first row.
    const firstPassage = schedule.men.firstPassageTime;
    const womenOnLeft = schedule.women.finish <= firstPassage;
    const px = t => (t - axisStart) * pxPerMinute;
    const labelWidth = text => this.flagWidth(text);
    const items = [
      { kind: 'status', t: firstPassage, text: `Eerste passage mannen ${f.clock(firstPassage)}`, side: womenOnLeft ? 'right' : 'left' },
      { kind: 'women', t: schedule.women.finish, text: `Aankomst vrouwen ${f.clock(schedule.women.finish)}`, side: womenOnLeft ? 'left' : 'right' },
      { kind: 'men', t: schedule.men.finish, text: `Aankomst mannen ${f.clock(schedule.men.finish)}`, side: 'right' },
    ].filter(item => inAxis(item.t));
    const rows = [[], []];
    items.forEach(item => {
      const width = labelWidth(item.text), roomRight = (axisEnd - item.t) * pxPerMinute + this.layout.rightGutter, roomLeft = px(item.t);
      if (item.side === 'right' && roomRight < width + 4 && roomLeft >= width + 4) item.side = 'left';
      else if (item.side === 'left' && roomLeft < width + 4 && roomRight >= width + 4) item.side = 'right';
      const [from, to] = item.side === 'right' ? [px(item.t), px(item.t) + width] : [px(item.t) - width, px(item.t)];
      item.row = rows[0].some(([a, b]) => from < b + 6 && a < to + 6) ? 2 : 1;
      rows[item.row - 1].push([from, to]);
    });
    this.horizontalRows = Math.max(1, ...items.map(item => item.row));
    items.forEach(item => html.push(`<div class="marker marker--${item.kind} marker--${item.side}"
      style="left:${this.pct(item.t)}%;height:${item.row === 2 ? 346 : 320}px"><span class="marker__label">${item.text}</span></div>`));
    if (inAxis(options.selectedTime)) html.push(`<div class="vline vline--selected" style="left:${this.pct(options.selectedTime)}%"></div>`);
    return html;
  }

  verticalHtml(schedule, options) {
    const f = KK.format;
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis;
    const { axis, gap: laneGap } = KK.Timeline.V;
    const laneWidth = Math.max(1, ((this.el.clientWidth || 343) - axis - laneGap * 2) / 3);
    const inAxis = t => t >= axisStart && t <= axisEnd;
    const y = t => this.vTop(t);
    const html = [];

    // Sticky header with the lane names, so they stay visible while scrolling down.
    html.push(`<div class="vhead">
      <div class="vhead__lane vlane--women"><span class="lane-label__bar chip--women"></span><span><b>Vrouwen</b>${f.km(schedule.women.totalKm)} km</span></div>
      <div class="vhead__lane vlane--men"><span class="lane-label__bar chip--men"></span><span><b>Mannen</b>${f.km(schedule.men.totalKm)} km</span></div>
      <div class="vhead__lane vlane--vip"><span class="lane-label__bar chip--vip"></span><span><b>VIP-tent</b>&nbsp;</span></div>
    </div>`);
    const laneBg = lane => `<div class="lane-bg vlane--${lane}" style="top:${y(axisStart) - 8}px;height:${y(axisEnd) - y(axisStart) + 16}px"></div>`;
    html.push(laneBg('women') + laneBg('men') + laneBg('vip'));

    // Broadcast start and end times go in the hour column (in their own colour), so they never cover a block.
    // An hour label that would collide with one of them is left out.
    const marks = [];
    schedule.broadcasts.forEach(b => [b.start, b.end].forEach(t => { if (inAxis(t)) marks.push({ t, race: b.race }); }));
    const keyTimes = [...marks.map(m => m.t), schedule.men.firstPassageTime, schedule.women.finish, schedule.men.finish];
    for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) {
      html.push(`<div class="htick" style="top:${y(h * 60)}px"></div>`);
      if (!keyTimes.some(t => Math.abs(t - h * 60) < 12)) html.push(`<div class="htick-label" style="top:${y(h * 60)}px">${h}u</div>`);
    }
    marks.forEach(m => html.push(`<div class="htick-label htick-label--${m.race}" style="top:${y(m.t)}px">${f.clock(m.t)}</div>`));
    // The two key lines also get their time in the hour column (the legend explains the colours).
    const firstPassageMark = schedule.men.firstPassageTime, womenFinishMark = schedule.women.finish;
    if (inAxis(firstPassageMark)) html.push(`<div class="htick-label htick-label--status" style="top:${y(firstPassageMark)}px">${f.clock(firstPassageMark)}</div>`);
    if (inAxis(womenFinishMark)) html.push(`<div class="htick-label htick-label--women-finish" style="top:${y(womenFinishMark)}px">${f.clock(womenFinishMark)}</div>`);
    const menFinishMark = schedule.men.finish;
    if (inAxis(menFinishMark)) html.push(`<div class="htick-label htick-label--men-finish" style="top:${y(menFinishMark)}px">${f.clock(menFinishMark)}</div>`);

    schedule.broadcasts.forEach(b => {
      const a = this.clamp(b.start), z = this.clamp(b.end);
      if (z > a) html.push(`<div class="broadcast-band broadcast-band--${b.race}" style="top:${y(a)}px;height:${y(z) - y(a)}px"></div>`);
    });

    schedule.blocks.forEach(block => {
      const a = this.clamp(block.start), z = this.clamp(block.end);
      if (z - a <= 0.01) return;
      const gap = this.blockGap(block);
      const [shift, grow] = this.fadeOverlap(block);
      const height = y(z) - y(a) - gap * 2;
      const label = this.verticalBlockLabel(block, height, laneWidth);
      html.push(`<div class="block block--${block.type} vlane--${block.lane}" data-block-id="${block.id}"
        style="top:${y(a) + gap - shift}px;height:${height + shift + grow}px">
        <div class="block__title">${label.title}</div>${label.lines.map(l => `<div class="block__time">${l}</div>`).join('')}</div>`);
    });

    marks.forEach(m => html.push(`<div class="hline hline--${m.race}-broadcast" style="top:${y(m.t)}px"></div>`));

    const firstPassage = schedule.men.firstPassageTime;
    if (inAxis(firstPassage)) html.push(`<div class="hline hline--first-passage" style="top:${y(firstPassage)}px"></div>`);
    const womenFinish = schedule.women.finish;
    if (inAxis(womenFinish)) html.push(`<div class="hline hline--women-finish" style="top:${y(womenFinish)}px"></div>`);
    const menFinish = schedule.men.finish;
    if (inAxis(menFinish)) html.push(`<div class="hline hline--men-finish" style="top:${y(menFinish)}px"></div>`);
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
      // Women: below the block. Men and VIP tent: above it.
      this.tooltipEl.style.top = { women: '168px', men: '174px', vip: `${this.layout.laneTop.vip - 6}px` }[block.lane];
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
