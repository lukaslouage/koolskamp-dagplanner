// Variants: up to three versions of the settings (A, B, C) that live side by side. The sidebar and the planning
// view always show the active variant; the comparison view shows all of them. Variants are kept in this browser
// and all of them go into the share link: variant A as plain settings (so older links still work), B and C with
// a "b." or "c." prefix, e.g. #womenStart=10:00&b.womenStart=10:30&v=b&view=vergelijk.
window.KK = window.KK || {};

KK.Variants = class {
  static LETTERS = ['A', 'B', 'C', 'D'];

  /**
   * hooks: full(raw) = complete settings from any (partly) filled object, changesOf(raw) = only the values that
   * differ from the defaults, cleanNameFor(variant) = name of the saved scenario the variant shows unchanged,
   * scenarios() = saved scenarios [{ id, name, settings }], onChange() = re-render after a change.
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.max = Math.min(KK.config.maxVariants, KK.Variants.LETTERS.length);
    Object.assign(this, this.fromHash(location.hash) || this.fromStorage() || this.fromOldStorage());
    this.wire();
  }

  // ---------- Loading and saving ----------

  static prefix(index) {
    return index === 0 ? '' : `${KK.Variants.LETTERS[index].toLowerCase()}.`;
  }

  /** Variants from a share link, or null when the link holds no settings at all. */
  fromHash(hash) {
    const params = new URLSearchParams(String(hash).replace(/^#/, ''));
    const known = key => key in KK.config.defaults || key === 'name' || key === 'scenario';
    const list = [];
    for (let i = 0; i < this.max; i++) {
      const prefix = KK.Variants.prefix(i), raw = {};
      params.forEach((value, key) => {
        if (i === 0 ? key.includes('.') : !key.startsWith(prefix)) return;
        const bare = key.slice(prefix.length);
        if (known(bare)) raw[bare] = value;
      });
      if (i > 0 && !Object.keys(raw).length) break;
      list.push({ name: (raw.name || '').slice(0, 40), settings: this.hooks.full(raw), scenarioId: null, sharedName: '', linkScenario: (raw.scenario || '').slice(0, 60) });
    }
    const hasAny = [...params.keys()].some(key => known(key.replace(/^[a-d]\./, '')) || key === 'v' || key === 'view');
    if (!hasAny) return null;
    const index = letter => Math.max(0, Math.min(list.length - 1, KK.Variants.LETTERS.indexOf(String(letter || 'a').toUpperCase())));
    return { list, active: index(params.get('v')), reference: index(params.get('ref')), view: params.get('view') === 'vergelijk' ? 'compare' : 'plan' };
  }

  fromStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(KK.config.variantsStorageKey) || 'null');
      if (!raw || !Array.isArray(raw.variants) || !raw.variants.length) return null;
      const list = raw.variants.slice(0, this.max).map(v => ({
        name: String(v.name || '').slice(0, 40), settings: this.hooks.full(v.settings || {}), scenarioId: v.scenarioId || null, sharedName: '' }));
      const clamp = n => Math.max(0, Math.min(list.length - 1, Number(n) || 0));
      return { list, active: clamp(raw.active), reference: clamp(raw.reference), view: raw.view === 'compare' ? 'compare' : 'plan' };
    } catch (e) { return null; }
  }

  /** First visit with this version: take the settings and open scenario of the version before variants. */
  fromOldStorage() {
    let settings = {}, scenarioId = null;
    try {
      settings = JSON.parse(localStorage.getItem(KK.config.storageKey) || '{}');
      scenarioId = localStorage.getItem(KK.config.activeScenarioKey);
    } catch (e) { /* storage unavailable */ }
    return { list: [{ name: '', settings: this.hooks.full(settings), scenarioId, sharedName: '' }], active: 0, reference: 0, view: 'plan' };
  }

  /** A name in a share link becomes the saved scenario of that variant when this browser has it unchanged. */
  resolveLinkScenarios(scenarios) {
    this.list.forEach(v => {
      if (!v.linkScenario) return;
      const match = scenarios.byName(v.linkScenario);
      if (match && scenarios.same(match.settings, this.hooks.changesOf(v.settings))) v.scenarioId = match.id;
      else { v.scenarioId = null; v.sharedName = v.linkScenario; }
      delete v.linkScenario;
    });
  }

  /** The hash for the share link. */
  hash() {
    const params = new URLSearchParams();
    this.list.forEach((v, i) => {
      const prefix = KK.Variants.prefix(i);
      Object.entries(this.hooks.changesOf(v.settings)).forEach(([key, value]) => params.set(prefix + key, value));
      if (v.name) params.set(prefix + 'name', v.name);
      const scenario = this.hooks.cleanNameFor(v);
      if (scenario) params.set(prefix + 'scenario', scenario);
    });
    if (this.active > 0) params.set('v', KK.Variants.LETTERS[this.active].toLowerCase());
    if (this.reference > 0) params.set('ref', KK.Variants.LETTERS[this.reference].toLowerCase());
    if (this.view === 'compare' && this.list.length > 1) params.set('view', 'vergelijk');
    return params.toString();
  }

  url() {
    const hash = this.hash();
    return location.pathname + location.search + (hash ? '#' + hash : '');
  }

  persist() {
    try {
      localStorage.setItem(KK.config.variantsStorageKey, JSON.stringify({
        active: this.active, reference: this.reference, view: this.view,
        variants: this.list.map(v => ({ name: v.name, settings: this.hooks.changesOf(v.settings), scenarioId: v.scenarioId })),
      }));
    } catch (e) { /* storage unavailable */ }
    history.replaceState(null, '', this.url());
  }

  /** Called when the link in the address bar is changed by hand or a shared link is pasted in this tab. */
  reloadFromHash() {
    const fromLink = this.fromHash(location.hash);
    if (fromLink) Object.assign(this, fromLink);
  }

  // ---------- Variants ----------

  get current() { return this.list[this.active]; }
  letter(index) { return KK.Variants.LETTERS[index]; }

  /** The name of a variant: the one given, or what makes it different from variant A. */
  label(index) {
    const v = this.list[index];
    if (!v) return '';
    if (v.name) return v.name;
    if (index === 0) return this.list.length > 1 ? 'Basis' : '';
    const differences = KK.Compare.differences(this.list[0].settings, v.settings);
    if (!differences.length) return 'Zelfde als A';
    const first = `${differences[0].label} ${differences[0].to}`;
    return differences.length > 1 ? `${first} +${differences.length - 1}` : first;
  }

  fullLabel(index) {
    const label = this.label(index);
    return label ? `${this.letter(index)}: ${label}` : this.letter(index);
  }

  add(changes, name = '') {
    if (this.list.length >= this.max) return false;
    this.list.push({ name: String(name).slice(0, 40), settings: this.hooks.full(changes), scenarioId: null, sharedName: '' });
    this.active = this.list.length - 1;
    return true;
  }

  remove(index) {
    if (this.list.length < 2) return;
    this.list.splice(index, 1);
    const fix = n => (n === index ? 0 : n > index ? n - 1 : n);
    this.active = Math.min(fix(this.active), this.list.length - 1);
    this.reference = Math.min(fix(this.reference), this.list.length - 1);
  }

  // ---------- Interface: tabs, add menu, view switch ----------

  wire() {
    const tabs = document.getElementById('variant-tabs');
    tabs.addEventListener('click', e => {
      const action = e.target.closest('[data-variant-action]');
      if (action) {
        const index = Number(action.dataset.index);
        action.closest('details').open = false;
        if (action.dataset.variantAction === 'rename') this.startRename(index);
        else if (action.dataset.variantAction === 'delete') {
          if (window.confirm(`Variant ${this.fullLabel(index)} verwijderen?`)) { this.remove(index); this.hooks.onChange(); }
        } else if (action.dataset.variantAction === 'reference') { this.reference = index; this.hooks.onChange(); }
        return;
      }
      const tab = e.target.closest('[data-variant]');
      if (tab && !e.target.closest('input')) {
        const index = Number(tab.dataset.variant);
        if (index !== this.active) { this.active = index; this.hooks.onChange(); }
      }
    });
    tabs.addEventListener('dblclick', e => {
      const tab = e.target.closest('[data-variant]');
      if (tab) this.startRename(Number(tab.dataset.variant));
    });

    const addMenu = document.getElementById('variant-add');
    addMenu.addEventListener('toggle', () => { if (addMenu.open) this.renderAddMenu(); });
    addMenu.addEventListener('click', e => {
      const item = e.target.closest('[data-add]');
      if (!item) return;
      addMenu.open = false;
      const kind = item.dataset.add;
      let done = false;
      if (kind === 'copy') done = this.add(this.hooks.changesOf(this.current.settings));
      else if (kind === 'default') done = this.add({}, 'Standaardwaarden');
      else {
        const scenario = this.hooks.scenarios().find(s => s.id === kind);
        if (scenario) { done = this.add(scenario.settings); if (done) this.current.scenarioId = scenario.id; }
      }
      if (done) this.hooks.onChange();
    });
    document.addEventListener('click', e => {
      document.querySelectorAll('.variants details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    });

    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
      this.view = button.dataset.view;
      this.hooks.onChange();
    }));
  }

  renderAddMenu() {
    const list = document.getElementById('variant-add-list'), full = this.list.length >= this.max;
    const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const scenarios = this.hooks.scenarios();
    list.innerHTML = full
      ? `<p class="menu__note">Maximum ${this.max} varianten. Verwijder er eerst een.</p>`
      : `<button type="button" role="menuitem" data-add="copy">Kopie van ${esc(this.fullLabel(this.active))}</button>
         <button type="button" role="menuitem" data-add="default">Standaardwaarden</button>
         ${scenarios.length ? `<div class="menu__label">Opgeslagen scenario</div>${scenarios.map(s => `<button type="button" role="menuitem" data-add="${esc(s.id)}">${esc(s.name)}</button>`).join('')}` : ''}`;
  }

  startRename(index) {
    const name = document.querySelector(`[data-variant="${index}"] .vtab__name`);
    if (!name) return;
    const input = document.createElement('input');
    input.className = 'vtab__input';
    input.maxLength = 40;
    input.value = this.list[index].name || this.label(index);
    input.setAttribute('aria-label', `Naam van variant ${this.letter(index)}`);
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save) this.list[index].name = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
      this.hooks.onChange();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /** Tabs with the letter, the name and the margin of each variant. margins[i] = { minutes, status }. */
  renderTabs(margins) {
    const tabs = document.getElementById('variant-tabs');
    if (tabs.querySelector('.vtab__input')) return; // do not interrupt a rename
    const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const several = this.list.length > 1;
    tabs.innerHTML = this.list.map((v, i) => {
      const m = margins[i], active = i === this.active;
      const menu = `<details class="menu vtab__menu">
          <summary class="vtab__more" aria-label="Acties voor variant ${this.letter(i)}" title="Acties"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
          <div class="menu__list" role="menu">
            <button type="button" role="menuitem" data-variant-action="rename" data-index="${i}">Hernoemen</button>
            ${several && i !== this.reference ? `<button type="button" role="menuitem" data-variant-action="reference" data-index="${i}">Gebruik als referentie</button>` : ''}
            ${several ? `<button type="button" role="menuitem" data-variant-action="delete" data-index="${i}">Verwijderen</button>` : ''}
          </div>
        </details>`;
      return `<div class="vtab-wrap${active ? ' is-active' : ''}">
        <button type="button" class="vtab" role="tab" aria-selected="${active}" data-variant="${i}" title="${esc(this.fullLabel(i))}">
          <span class="vtab__letter">${this.letter(i)}</span>
          <span class="vtab__name">${esc(this.label(i) || 'Variant A')}</span>
          <span class="vtab__margin" data-status="${m.status}">${KK.Compare.minus(m.minutes)} min</span>
        </button>${menu}
      </div>`;
    }).join('');
    document.getElementById('variants').classList.toggle('has-several', several);
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === this.view));
  }
};
