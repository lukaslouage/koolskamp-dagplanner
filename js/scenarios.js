// Saved scenarios: a name plus the settings that differ from the defaults, kept in this browser (localStorage).
// Switching, saving, renaming, deleting, and moving scenarios between browsers through a .json file.
// Which scenario is open belongs to the active variant (KK.Variants): each variant can show its own scenario.
window.KK = window.KK || {};

KK.Scenarios = class {
  static FILE_APP = 'koolskamp-dagplanner';
  static FILE_VERSION = 1;

  /**
   * hooks: current() = changes of the settings on screen, changesOf(raw) = cleaned changes of any settings object,
   * apply(changes) = put settings on screen, onChange() = something about the scenarios changed (re-render),
   * binding() = the active variant, which holds scenarioId (the open scenario) and sharedName (from a link).
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.list = this.load();
    this.nameMode = null; // 'new' or 'rename' while the name field is open
    const $ = id => document.getElementById(id);
    this.el = {
      select: $('scenario-select'), status: $('scenario-status'), save: $('scenario-save'), saveAs: $('scenario-save-as'),
      menu: $('scenario-menu'), form: $('scenario-name-form'), name: $('scenario-name'), cancel: $('scenario-name-cancel'),
      file: $('scenario-file'),
    };
    this.wire();
  }

  get activeId() { return this.hooks.binding().scenarioId || null; }
  set activeId(id) { this.hooks.binding().scenarioId = id; }
  get sharedName() { return this.hooks.binding().sharedName || ''; }
  set sharedName(name) { this.hooks.binding().sharedName = name; }

  // ---------- Storage ----------

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KK.config.scenariosStorageKey) || '[]');
      return Array.isArray(raw) ? raw.filter(s => s && s.id && s.name).map(s => ({ ...s, settings: this.hooks.changesOf(s.settings) })) : [];
    } catch (e) { return []; }
  }

  persist() {
    try {
      localStorage.setItem(KK.config.scenariosStorageKey, JSON.stringify(this.list));
    } catch (e) { this.flash('Opslaan in deze browser lukt niet (privévenster?)'); }
  }

  byId(id) { return this.list.find(s => s.id === id) || null; }
  byName(name) { return this.list.find(s => s.name.toLowerCase() === String(name).trim().toLowerCase()) || null; }
  get active() { return this.byId(this.activeId); }

  static key(changes) {
    return JSON.stringify(Object.keys(changes).sort().map(k => [k, String(changes[k])]));
  }
  same(a, b) { return KK.Scenarios.key(this.hooks.changesOf(a)) === KK.Scenarios.key(this.hooks.changesOf(b)); }
  get dirty() { return !!this.active && !this.same(this.active.settings, this.hooks.current()); }

  /** Name for the share link and the PDF: only when the screen shows exactly the saved scenario. */
  cleanName() { return this.active && !this.dirty ? this.active.name : ''; }

  /** Same for any variant: the name of its saved scenario when it shows that scenario unchanged. */
  cleanNameFor(variant) {
    const scenario = this.byId(variant.scenarioId);
    return scenario && this.same(scenario.settings, this.hooks.changesOf(variant.settings)) ? scenario.name : '';
  }

  /** Label for the PDF summary. */
  label() {
    if (this.active) return this.dirty ? `${this.active.name} (gewijzigd)` : this.active.name;
    return this.sharedName || '';
  }

  uniqueName(name) {
    let candidate = name, n = 2;
    while (this.byName(candidate)) candidate = `${name} (${n++})`;
    return candidate;
  }

  static newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Actions ----------

  saveActive() {
    if (!this.active) { this.openName('new'); return; }
    this.active.settings = this.hooks.current();
    this.active.savedAt = new Date().toISOString();
    this.persist();
    this.flash('Opgeslagen');
    this.hooks.onChange();
  }

  saveAs(name) {
    const existing = this.byName(name);
    if (existing && !window.confirm(`Er bestaat al een scenario "${existing.name}". Overschrijven?`)) return false;
    const scenario = existing || { id: KK.Scenarios.newId(), name };
    scenario.settings = this.hooks.current();
    scenario.savedAt = new Date().toISOString();
    if (!existing) this.list.push(scenario);
    this.activeId = scenario.id;
    this.sharedName = '';
    this.persist();
    this.flash('Opgeslagen');
    this.hooks.onChange();
    return true;
  }

  rename(name) {
    const scenario = this.active;
    if (!scenario) return false;
    const other = this.byName(name);
    if (other && other !== scenario) { window.alert(`Er bestaat al een scenario "${other.name}".`); return false; }
    scenario.name = name;
    this.persist();
    this.hooks.onChange();
    return true;
  }

  remove() {
    const scenario = this.active;
    if (!scenario || !window.confirm(`Scenario "${scenario.name}" verwijderen? De instellingen op het scherm blijven staan.`)) return;
    this.list = this.list.filter(s => s !== scenario);
    this.activeId = null;
    this.persist();
    this.flash('Verwijderd');
    this.hooks.onChange();
  }

  open(id) {
    if (id === (this.activeId || '')) return;
    if (this.dirty && !window.confirm(`De wijzigingen aan "${this.active.name}" zijn niet opgeslagen en gaan verloren. Doorgaan?`)) {
      this.el.select.value = this.activeId || '';
      return;
    }
    const scenario = this.byId(id);
    this.activeId = scenario ? scenario.id : null;
    this.sharedName = '';
    this.persist();
    if (scenario) this.hooks.apply(scenario.settings); // re-renders
    else this.hooks.onChange();
  }

  exportFile() {
    const scenarios = this.list.length ? this.list
      : [{ name: this.label() || 'Mijn scenario', settings: this.hooks.current() }];
    const data = {
      app: KK.Scenarios.FILE_APP, version: KK.Scenarios.FILE_VERSION, exported: new Date().toISOString(),
      scenarios: scenarios.map(s => ({ name: s.name, settings: s.settings })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `koolskamp-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    this.flash(scenarios.length === 1 ? '1 scenario geëxporteerd' : `${scenarios.length} scenario's geëxporteerd`);
  }

  async importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
    const items = data && data.app === KK.Scenarios.FILE_APP && Array.isArray(data.scenarios) ? data.scenarios : null;
    if (!items) { window.alert('Dit bestand is geen scenariobestand van de Koolskamp Koers Raceday.'); return; }
    let added = 0, same = 0;
    items.forEach(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) return;
      const name = item.name.trim().slice(0, 60), settings = this.hooks.changesOf(item.settings);
      const existing = this.byName(name);
      if (existing && this.same(existing.settings, settings)) { same++; return; }
      this.list.push({ id: KK.Scenarios.newId(), name: this.uniqueName(name), settings, savedAt: new Date().toISOString() });
      added++;
    });
    this.persist();
    this.hooks.onChange();
    const parts = [];
    if (added) parts.push(added === 1 ? '1 scenario toegevoegd' : `${added} scenario's toegevoegd`);
    if (same) parts.push(same === 1 ? '1 had je al' : `${same} had je al`);
    this.flash(parts.join(', ') || 'Geen scenario\'s gevonden in dit bestand');
  }

  // ---------- Interface ----------

  wire() {
    const el = this.el;
    el.select.addEventListener('change', () => this.open(el.select.value));
    el.save.addEventListener('click', () => this.saveActive());
    el.saveAs.addEventListener('click', () => this.openName('new'));
    el.cancel.addEventListener('click', () => this.closeName());
    el.form.addEventListener('submit', e => {
      e.preventDefault();
      const name = el.name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!name) { el.name.focus(); return; }
      const done = this.nameMode === 'rename' ? this.rename(name) : this.saveAs(name);
      if (done) this.closeName();
    });
    el.name.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeName(); });
    el.menu.addEventListener('click', e => {
      const button = e.target.closest('[data-scenario-action]');
      if (!button) return;
      el.menu.open = false;
      const action = button.dataset.scenarioAction;
      if (action === 'rename') this.openName('rename');
      else if (action === 'delete') this.remove();
      else if (action === 'export') this.exportFile();
      else if (action === 'import') el.file.click();
    });
    // Close the menu when clicking elsewhere.
    document.addEventListener('click', e => { if (el.menu.open && !el.menu.contains(e.target)) el.menu.open = false; });
    el.file.addEventListener('change', () => {
      const file = el.file.files[0];
      el.file.value = '';
      if (file) this.importFile(file);
    });
  }

  openName(mode) {
    this.nameMode = mode;
    const el = this.el;
    el.name.value = mode === 'rename' ? this.active.name
      : this.sharedName || (this.active ? `${this.active.name} (kopie)` : '');
    el.form.querySelector('[type=submit]').textContent = mode === 'rename' ? 'Hernoem' : 'Bewaar';
    el.form.hidden = false;
    el.name.focus();
    el.name.select();
  }

  closeName() {
    this.nameMode = null;
    this.el.form.hidden = true;
  }

  flash(text) {
    this.flashText = text;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.flashText = ''; this.update(); }, 2500);
    this.update();
  }

  /** Brings the select, the buttons and the status line in line with the current state. Called on every render. */
  update() {
    const el = this.el, active = this.active, dirty = this.dirty;
    const option = (value, text) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      return o;
    };
    const options = [option('', active ? 'Geen scenario (los)' : 'Niet opgeslagen')];
    [...this.list].sort((a, b) => a.name.localeCompare(b.name, 'nl')).forEach(s => options.push(option(s.id, s.name)));
    el.select.replaceChildren(...options);
    el.select.value = active ? active.id : '';

    el.save.disabled = !!active && !dirty;
    el.menu.querySelector('[data-scenario-action=rename]').disabled = !active;
    el.menu.querySelector('[data-scenario-action=delete]').disabled = !active;

    let status = '', kind = '';
    if (active && dirty) { status = 'Wijzigingen niet opgeslagen'; kind = 'warn'; }
    else if (this.flashText) { status = this.flashText; kind = 'ok'; }
    else if (!active && this.sharedName) { status = `Gedeeld scenario "${this.sharedName}", nog niet bij jou opgeslagen`; kind = 'info'; }
    el.status.textContent = status;
    el.status.dataset.kind = kind;
    el.status.hidden = !status;
  }

  /** Saved scenarios for the comparison: { id, name, settings }. */
  all() {
    return [...this.list].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }
};
