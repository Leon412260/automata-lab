/* Automata Lab — UI: state, history, popovers, panels. Depends on core.js, graph.js, guide.js. */
(function () {
  'use strict';
  const M = Automata;
  const STORAGE_KEY = 'automata-lab:v1';
  // the exercise editor is the same app opened as index.html?mode=editor (see the editor/ folder)
  const EDITOR = new URLSearchParams(location.search).get('mode') === 'editor';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ---------- HTML helpers for math ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function st(q) {
    const [b, s] = Graph.nameParts(q);
    return `<span class="st">${esc(b)}${s ? `<sub>${esc(s)}</sub>` : ''}</span>`;
  }
  function sy(a) { return `<span class="sy">${esc(a)}</span>`; }
  function wd(w) {
    const s = Array.isArray(w) ? w.join('') : String(w);
    return `<span class="sy">${s === '' ? 'λ' : esc(s)}</span>`;
  }
  function set(list) { return list.length ? `{${list.map(st).join(', ')}}` : '∅'; }
  const DH = '<span class="dh">δ̂</span>';
  const TURN = ' ⊢<sub>M</sub> ';
  const TRASH = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

  // ---------- state ----------
  let A = M.empty('FA');
  let undoStack = [], redoStack = [];
  const ui = {
    selected: null,          // {kind:'state', id} | {kind:'edge', from, to}
    mode: 'select',          // 'select' | 'state' | 'arrow'
    tab: 'definition',
    deltaView: 'table',      // 'table' | 'equations'
    simWord: '',
    simStep: 0,
    batch: '',
    classN: 3,
    hoverState: null,
    pop: null,               // null | {type:'selection'} | {type:'cell', q, a} | {type:'menu'}
    dragging: false,
    fitNext: false,          // fit the whole diagram into view at the next render
    exercise: null,          // the exercise being solved (normalized), or null in free mode
    exId: null,
    exResult: null,          // result of the last "Check"
    draft: { kind: 'construct', code: '', title: '', text: '', require: 'FA', maxStates: '', op: 'intersection', A1: null, A2: null },
    codeInput: '', codeError: null, codeBusy: false,   // "Start an exercise" form
  };
  const EX_KEY = 'automata-lab:ex:';           // + id → the work on that exercise
  const CURRENT_EX_KEY = 'automata-lab:current-exercise';

  const svg = $('#graph');
  const graph = Graph.createGraph(svg, {
    onSelect(sel) {
      ui.dragging = false;
      ui.selected = sel;
      ui.pop = sel ? { type: 'selection' } : null;
      renderAll();
    },
    onBackground(p) {
      ui.dragging = false;
      if (ui.mode === 'state') { tryCommit(() => M.addState(A, null, p)); return; }
      ui.selected = null;
      if (ui.pop && ui.pop.type === 'selection') ui.pop = null;
      renderAll();
    },
    onDragStart() { ui.dragging = true; hidePop(); },
    onDragEnd() { ui.dragging = false; setTimeout(renderPop, 0); },
    onCamera() { renderZoom(); renderPop(); },
    onMove(q, p) { ui.dragging = false; const B = M.clone(A); B.pos[q] = { x: p.x, y: p.y }; commit(B); },
    onAddState(p) { tryCommit(() => M.addState(A, null, p)); },
    onToggleAccepting(q) { ui.dragging = false; ui.selected = { kind: 'state', id: q }; ui.pop = { type: 'selection' }; commit(M.setAccepting(A, q, !A.accepting.includes(q))); },
    onSourcePicked() { ui.dragging = false; renderHint(); },
    onConnect(from, to) {
      ui.dragging = false;
      ui.selected = { kind: 'edge', from, to };
      ui.pop = { type: 'selection', focusSymbol: true };
      renderAll();
    },
    /** Arrow dropped on empty space: a new state there, with the arrow already drawn to it. */
    onConnectNew(from, p) {
      ui.dragging = false;
      let B;
      try { B = M.addState(A, null, p); } catch (e) { toast(e.message, true); return; }
      const to = B.states[B.states.length - 1];
      ui.selected = { kind: 'edge', from, to };
      ui.pop = { type: 'selection', focusSymbol: true };
      commit(B);
    },
    /** A hand-made arrow shape (null = back to automatic). */
    onArc(from, to, value) {
      ui.dragging = false;
      ui.selected = { kind: 'edge', from, to };
      ui.pop = null;                     // keep the view free: the arrow stays selected, click it to edit it
      commit(M.setArc(A, from, to, value));
    },
  });

  function save() {
    try { localStorage.setItem(ui.exercise ? EX_KEY + ui.exId : STORAGE_KEY, JSON.stringify(A)); } catch (e) { /* storage unavailable: ignore */ }
  }

  function commit(B, after) {
    ui.exResult = null;
    undoStack.push(JSON.stringify(A));
    if (undoStack.length > 300) undoStack.shift();
    redoStack = [];
    A = B;
    if (after) after(B);
    save();
    renderAll();
  }

  function tryCommit(fn, after) {
    try { commit(fn(), after); } catch (e) { toast(e.message, true); }
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(A));
    A = JSON.parse(undoStack.pop());
    save(); renderAll();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(A));
    A = JSON.parse(redoStack.pop());
    save(); renderAll();
  }

  function load(obj, { resetHistory } = {}) {
    const B = M.autoLayout(M.normalize(obj));
    ui.selected = null; ui.pop = null; ui.simStep = 0; ui.fitNext = true;
    if (B.type === 'NFA' && ui.tab === 'classes') ui.tab = 'definition';
    if (resetHistory) { undoStack = []; redoStack = []; A = B; save(); renderAll(); }
    else commit(B);
  }

  let toastTimer = null;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (isError ? ' error' : ''); }, isError ? 4200 : 2400);
  }

  /** A free spot for a new state: the centre of the visible area, or the nearest free place around it. */
  function freeSpot() {
    const c = graph.visibleCenter();
    for (let ring = 0; ring < 40; ring++) {
      for (let i = 0; i < Math.max(1, ring * 6); i++) {
        const ang = (2 * Math.PI * i) / Math.max(1, ring * 6);
        const x = Math.round(c.x + ring * 110 * Math.cos(ang)), y = Math.round(c.y + ring * 110 * Math.sin(ang));
        if (!A.states.some(q => A.pos[q] && Math.hypot(A.pos[q].x - x, A.pos[q].y - y) < 90)) return { x, y };
      }
    }
    return c;
  }

  // ---------- simulation model ----------
  function simulation() {
    const word = M.splitWord(ui.simWord);
    const deterministic = A.type === 'FA' && M.isDeterministic(A);
    if (deterministic) {
      const r = M.runFA(A, word);
      const maxStep = r.status === 'invalid' ? 0 : r.configs.length - 1;
      return { kind: 'FA', word, r, maxStep, step: Math.min(ui.simStep, maxStep) };
    }
    const r = M.runNFA(A, word);
    const maxStep = r.status === 'invalid' ? 0 : word.length;
    return { kind: 'NFA', word, r, maxStep, step: Math.min(ui.simStep, maxStep) };
  }

  function classColors() {
    const c = {};
    A.states.forEach((q, i) => { c[q] = Graph.PALETTE[i % Graph.PALETTE.length]; });
    return c;
  }

  // ---------- rendering ----------
  function renderAll() {
    if (ui.selected) {
      const s = ui.selected;
      if (s.kind === 'state' && !A.states.includes(s.id)) ui.selected = null;
      if (s.kind === 'edge' && (!A.states.includes(s.from) || !A.states.includes(s.to))) ui.selected = null;
    }
    if (ui.pop && ui.pop.type === 'selection' && !ui.selected) ui.pop = null;
    $$('#type-seg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.type === A.type)));
    $$('.tools [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)));
    if (A.type === 'NFA' && ui.tab === 'classes') ui.tab = 'definition';
    const req = ui.exercise ? M.requiredType(ui.exercise) : 'any';
    $$('#type-seg button').forEach(b => { b.disabled = req !== 'any' && b.dataset.type !== req; });
    $('#ex-chip').hidden = !ui.exercise;
    $('#btn-examples').hidden = !!ui.exercise;
    $('.ptabs [data-tab=classes]').hidden = A.type === 'NFA';
    $$('.ptabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab)));
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-redo').disabled = !redoStack.length;
    $('#empty').hidden = A.states.length > 0;
    renderGraph();
    renderHint();
    renderPanel();
    renderPop();
  }

  function renderHint() {
    const h = $('#stage-hint');
    if (ui.mode === 'state') h.textContent = 'Click anywhere to place a new state';
    else if (ui.mode === 'arrow') h.textContent = graph.pendingSource()
      ? 'Now click the target state (the same one again = loop) or empty space (= new state)'
      : 'Drag from one state to another, or click two states';
    else h.textContent = A.states.length ? 'Drag the ➜ next to a state to draw an arrow · drag an arrow to bend it' : '';
  }

  function renderGraph() {
    const v = { selected: ui.selected, mode: ui.mode, hoverState: ui.hoverState };
    if (ui.tab === 'simulation') {
      const s = simulation();
      if (s.r.status !== 'invalid') {
        const i = s.step;
        if (s.kind === 'FA') {
          v.active = new Set([s.r.configs[i].state]);
          if (i > 0) v.activeEdges = new Set([s.r.configs[i - 1].state + '\u0000' + s.r.configs[i].state]);
        } else {
          v.active = new Set(s.r.sets[i]);
          if (i > 0) {
            const e = new Set();
            for (const p of s.r.sets[i - 1]) for (const r of M.targets(A, p, s.word[i - 1])) e.add(p + '\u0000' + r);
            v.activeEdges = e;
          }
        }
      }
    }
    if (ui.tab === 'classes' && A.type === 'FA' && M.isDeterministic(A)) v.stateColors = classColors();
    if (ui.fitNext) { v.fit = true; ui.fitNext = false; }
    graph.render(A, v);
    renderZoom();
  }

  function renderZoom() {
    $('#zoom-level').textContent = Math.round(graph.zoomLevel() * 100) + '%';
    $('#btn-fit').setAttribute('aria-pressed', String(graph.isAutoFit()));
  }

  function renderPanel() {
    const body = $('#panel-body');
    const ae = document.activeElement;
    const focusId = ae && body.contains(ae) ? ae.id : null;
    let selStart = null, selEnd = null;
    try { if (focusId) { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } } catch (e) { /* not a text input */ }
    const scroll = body.scrollTop;
    body.innerHTML = ui.tab === 'definition' ? definitionHTML() : ui.tab === 'simulation' ? simulationHTML()
      : ui.tab === 'classes' ? classesHTML() : exerciseHTML();
    mountMinis(body);
    body.scrollTop = scroll;
    if (focusId) {
      const e = document.getElementById(focusId);
      if (e) { e.focus(); try { if (selStart !== null) e.setSelectionRange(selStart, selEnd); } catch (err) { /* ignore */ } }
    }
  }

  // ---------- popovers ----------
  const pop = $('#pop');

  function hidePop() { pop.hidden = true; pop.innerHTML = ''; }

  function renderPop() {
    if (!ui.pop || ui.dragging) return hidePop();
    let anchor = null, html = '';
    if (ui.pop.type === 'selection') {
      anchor = graph.anchorRect(ui.selected);
      html = ui.selected.kind === 'state' ? statePopHTML(ui.selected.id) : edgePopHTML(ui.selected.from, ui.selected.to);
    } else if (ui.pop.type === 'cell') {
      const btn = $$('.cell').find(b => b.dataset.q === ui.pop.q && b.dataset.a === ui.pop.a);
      if (!btn || !A.states.includes(ui.pop.q) || !A.alphabet.includes(ui.pop.a)) { ui.pop = null; return hidePop(); }
      $$('.cell.open').forEach(b => b.classList.remove('open'));
      btn.classList.add('open');
      anchor = btn.getBoundingClientRect();
      html = cellPopHTML(ui.pop.q, ui.pop.a);
    } else if (ui.pop.type === 'menu') {
      anchor = $('#btn-examples').getBoundingClientRect();
      html = M.EXAMPLES.map((ex, i) => `<button type="button" data-example="${i}"><b>${esc(ex.title)}</b><span>${esc(ex.subtitle || '')}</span></button>`).join('');
    }
    if (!anchor) return hidePop();
    const focused = document.activeElement && pop.contains(document.activeElement) ? document.activeElement.id : null;
    pop.className = 'pop' + (ui.pop.type === 'menu' ? ' menu' : '');
    pop.innerHTML = html;
    pop.hidden = false;
    position(anchor, ui.pop.type === 'menu' ? 'below-end' : ui.pop.type === 'cell' ? 'below' : 'side');
    if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
    if (ui.pop.focusSymbol) {
      ui.pop.focusSymbol = false;
      const first = pop.querySelector(A.alphabet.length ? '.toggle.sym' : '#pop-sym');
      if (first) setTimeout(() => first.focus(), 0);
    }
  }

  function position(r, where) {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (where === 'side' && r.side) {
      // an arrow: open on its outer side (where the label is)
      const s = r.side;
      if (Math.abs(s.y) >= Math.abs(s.x)) {
        x = r.left + r.width / 2 - pw / 2;
        y = s.y < 0 ? r.top - ph - 12 : r.bottom + 12;
        if (y < 8) y = r.bottom + 12;
        if (y + ph > vh - 8) y = r.top - ph - 12;
      } else {
        y = r.top + r.height / 2 - ph / 2;
        x = s.x < 0 ? r.left - pw - 12 : r.right + 12;
      }
    } else if (where === 'side') {
      // leave room for the state's arrow handle next to it
      x = r.right + 36; y = r.top + r.height / 2 - 40;
      if (x + pw > vw - 8) x = r.left - pw - 36;
      if (x < 8) { x = Math.max(8, r.left + r.width / 2 - pw / 2); y = r.bottom + 10; }
    } else if (where === 'below-end') {
      x = r.right - pw; y = r.bottom + 6;
    } else {
      x = r.left + r.width / 2 - pw / 2; y = r.bottom + 6;
      if (y + ph > vh - 8) y = r.top - ph - 6;
    }
    x = Math.max(8, Math.min(x, vw - pw - 8));
    y = Math.max(8, Math.min(y, vh - ph - 8));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  function statePopHTML(q) {
    const acc = A.accepting.includes(q), init = A.initial === q;
    return `
      <div class="ph"><span class="lab">State</span><button type="button" class="icon-btn" data-p="delete" title="Delete this state" aria-label="Delete state">${TRASH}</button></div>
      <div class="row">
        <button type="button" class="toggle ${acc ? 'on' : ''}" data-p="acc" aria-pressed="${acc}">Accepting</button>
        <button type="button" class="toggle ${init ? 'on' : ''}" data-p="init" aria-pressed="${init}">Initial</button>
      </div>
      <input type="text" id="pop-name" value="${esc(q)}" spellcheck="false" autocomplete="off" aria-label="State name" title="Rename: q0 is shown as q₀, p_ba as p_ba with subscript">`;
  }

  function edgePopHTML(p, r) {
    const syms = M.edgeSymbols(A, p, r);
    let h = `<div class="ph"><span class="pt">${st(p)} → ${st(r)}</span>
      ${syms.length ? `<button type="button" class="icon-btn" data-p="delete" title="Delete this arrow" aria-label="Delete arrow">${TRASH}</button>` : ''}</div>
      <div class="lab">Symbols on this arrow</div>`;
    if (A.alphabet.length) {
      h += `<div class="row">`;
      for (const a of A.alphabet) {
        const on = syms.includes(a);
        const other = M.targets(A, p, a).filter(x => x !== r);
        const hint = !on && A.type === 'FA' && other.length ? `<span class="to">now → ${esc(other[0])}</span>` : '';
        h += `<button type="button" class="toggle sym ${on ? 'on' : ''}" data-sym="${esc(a)}" aria-pressed="${on}">${esc(a)}${hint}</button>`;
      }
      h += `</div>`;
    }
    h += `<input type="text" id="pop-sym" placeholder="${A.alphabet.length ? 'Other symbol (adds it to Σ)' : 'Type a symbol, e.g. a'}" maxlength="20" spellcheck="false" autocomplete="off">`;
    const custom = typeof (A.arcs || {})[M.arcKey(p, r)] === 'number';
    h += `<div class="note">${A.alphabet.length ? 'Press a letter to switch it on/off · ' : ''}${p === r ? 'drag the loop to turn it' : 'drag the arrow to bend it'}${custom ? ` · <button type="button" class="linkish" data-p="autoshape">automatic shape</button>` : ''}</div>`;
    return h;
  }

  function cellPopHTML(q, a) {
    const t = M.targets(A, q, a);
    if (A.type === 'FA' && t.length <= 1) {
      return `<div class="lab m">δ(${st(q)}, ${sy(a)}) =</div>
        <div class="row">${A.states.map(p => `<button type="button" class="toggle st ${t[0] === p ? 'on' : ''}" data-target="${esc(p)}">${st(p)}</button>`).join('')}</div>
        ${t.length ? '<button type="button" class="btn sm text" data-target="">Remove (leave undefined)</button>' : ''}`;
    }
    return `<div class="lab m">δ(${st(q)}, ${sy(a)}) = ${set(t)}</div>
      <div class="row">${A.states.map(p => `<button type="button" class="toggle st ${t.includes(p) ? 'on' : ''}" data-multi="${esc(p)}" aria-pressed="${t.includes(p)}">${st(p)}</button>`).join('')}</div>
      <div class="note">${A.type === 'FA' ? 'An FA needs exactly one target — keep one state.' : 'Select every state that can be reached.'}</div>
      <button type="button" class="btn sm" data-p="close">Done</button>`;
  }

  pop.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.example !== undefined) {
      ui.pop = null;
      load(M.EXAMPLES[+b.dataset.example].automaton);
      toast('Example loaded — Undo brings your previous automaton back.');
      return;
    }
    if (b.dataset.p === 'close') { ui.pop = null; renderAll(); return; }
    if (ui.pop && ui.pop.type === 'cell') {
      const { q, a } = ui.pop;
      if (b.dataset.target !== undefined) {
        ui.pop = null;
        tryCommit(() => M.setTargets(A, q, a, b.dataset.target ? [b.dataset.target] : []));
      } else if (b.dataset.multi !== undefined) {
        const t = M.targets(A, q, a), p = b.dataset.multi;
        tryCommit(() => M.setTargets(A, q, a, t.includes(p) ? t.filter(x => x !== p) : t.concat(p)));
      }
      return;
    }
    const s = ui.selected;
    if (!s) return;
    if (b.dataset.p === 'delete') { deleteSelection(); return; }
    if (b.dataset.p === 'autoshape' && s.kind === 'edge') { commit(M.setArc(A, s.from, s.to, null)); return; }
    if (s.kind === 'state') {
      if (b.dataset.p === 'acc') commit(M.setAccepting(A, s.id, !A.accepting.includes(s.id)));
      if (b.dataset.p === 'init') commit(M.setInitial(A, A.initial === s.id ? null : s.id));
    } else if (b.dataset.sym !== undefined) {
      const syms = M.edgeSymbols(A, s.from, s.to), a = b.dataset.sym;
      tryCommit(() => M.setEdgeSymbols(A, s.from, s.to, syms.includes(a) ? syms.filter(x => x !== a) : syms.concat(a)));
    }
  });
  pop.addEventListener('change', e => {
    const s = ui.selected;
    if (e.target.id === 'pop-name' && s && s.kind === 'state') {
      const nu = e.target.value.trim();
      if (nu && nu !== s.id) tryCommit(() => M.renameState(A, s.id, nu), () => { ui.selected = { kind: 'state', id: nu }; });
    }
  });
  pop.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'pop-name') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Enter' && e.target.id === 'pop-sym') {
      e.preventDefault();
      const s = ui.selected;
      const extra = M.parseList(e.target.value);
      if (!s || s.kind !== 'edge' || !extra.length) return;
      const syms = M.edgeSymbols(A, s.from, s.to);
      tryCommit(() => M.setEdgeSymbols(A, s.from, s.to, Array.from(new Set(syms.concat(extra)))));
    }
    if (e.key === 'Escape') { closePop(); }
  });

  function closePop() {
    if (!ui.pop) return;
    if (ui.pop.type === 'selection') ui.selected = null;
    ui.pop = null;
    renderAll();
  }

  // arrow selected: pressing a letter switches that symbol on/off (also when focus is on a button of the popover)
  document.addEventListener('keydown', e => {
    const s = ui.selected;
    if (!s || s.kind !== 'edge' || !ui.pop || ui.pop.type !== 'selection') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || /\s|,/.test(e.key)) return;
    if ((e.target.matches && e.target.matches('input, textarea')) || (window.Guide && Guide.isOpen())) return;
    e.preventDefault();
    const a = e.key, syms = M.edgeSymbols(A, s.from, s.to);
    tryCommit(() => M.setEdgeSymbols(A, s.from, s.to, syms.includes(a) ? syms.filter(x => x !== a) : syms.concat(a)));
  });

  // close popovers when clicking elsewhere (clicks on the diagram are handled by the graph itself)
  document.addEventListener('pointerdown', e => {
    if (!ui.pop || pop.contains(e.target)) return;
    if (ui.pop.type === 'selection' && svg.contains(e.target)) return;
    if (ui.pop.type === 'menu' && e.target.closest('#btn-examples')) return;
    if (ui.pop.type === 'cell' && e.target.closest('.cell')) return;
    closePop();
  }, true);

  function deleteSelection() {
    const s = ui.selected;
    if (!s) return;
    ui.pop = null;
    if (s.kind === 'state') { ui.selected = null; commit(M.removeState(A, s.id)); }
    else {
      ui.selected = null;
      if (M.edgeSymbols(A, s.from, s.to).length) commit(M.setEdgeSymbols(A, s.from, s.to, []));
      else renderAll();
    }
  }

  // ---------- Definition tab ----------
  function definitionHTML() {
    const isFA = A.type === 'FA';
    const issues = M.validate(A);
    const errors = issues.filter(i => i.level === 'error');
    const status = !A.states.length ? '' : errors.length
      ? `<span class="pill err">${errors.length} problem${errors.length > 1 ? 's' : ''}</span>`
      : `<span class="pill ok">valid ${isFA ? 'FA' : 'NFA'}</span>`;
    const q0 = A.initial ? st(A.initial) : '<i>q</i><sub>0</sub>';

    let h = `<div class="card">
      <div class="lab">Formal definition ${status}</div>
      <div class="math">M = (<i>Q</i>, Σ, δ, ${q0}, <i>F</i>)</div>
      <dl class="formal">
        <dt><i>Q</i> =</dt><dd>${set(A.states)}</dd>
        <dt>Σ =</dt><dd>{<input type="text" class="sigma-input" id="sigma" style="width:${Math.max(5, A.alphabet.join(', ').length + 3)}ch" value="${esc(A.alphabet.join(', '))}" placeholder="a, b" spellcheck="false" autocomplete="off" aria-label="Alphabet Σ" title="Edit the alphabet: symbols separated by commas">}</dd>
        <dt><i>F</i> =</dt><dd>${set(A.accepting)}</dd>
      </dl>
    </div>`;

    h += `<div class="card"><div class="lab"><span class="m">δ: <i>Q</i> × Σ → ${isFA ? '<i>Q</i>' : '𝒫(<i>Q</i>)'}</span>
      <span class="seg"><button type="button" data-dview="table" aria-selected="${ui.deltaView === 'table'}">Table</button><button type="button" data-dview="equations" aria-selected="${ui.deltaView === 'equations'}">Equations</button></span></div>`;
    if (!A.states.length || !A.alphabet.length) {
      h += `<div class="muted small">${!A.states.length ? 'Add states on the canvas to fill the transition function.' : 'Write the alphabet Σ above, e.g. a, b.'}</div>`;
    } else if (ui.deltaView === 'table') {
      h += `<table class="delta"><thead><tr><th></th>${A.alphabet.map(a => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>`;
      for (const q of A.states) {
        const selected = ui.selected && ui.selected.kind === 'state' && ui.selected.id === q;
        h += `<tr class="${selected ? 'sel' : ''}"><td class="name" data-select="${esc(q)}" title="Edit state ${esc(q)}"><span class="mark">${A.initial === q ? '→' : ''}</span>${st(q)}${A.accepting.includes(q) ? '<span class="accmark" title="accepting state">F</span>' : ''}</td>`;
        for (const a of A.alphabet) {
          const t = M.targets(A, q, a);
          const label = isFA && t.length === 1 ? st(t[0]) : isFA && !t.length ? '—' : set(t);
          h += `<td><button type="button" class="cell ${isFA && t.length !== 1 ? 'undef' : ''}" data-q="${esc(q)}" data-a="${esc(a)}" aria-label="δ(${esc(q)}, ${esc(a)})">${label}</button></td>`;
        }
        h += `</tr>`;
      }
      h += `</tbody></table>`;
    } else {
      h += `<ul class="eqs">`;
      for (const q of A.states) for (const a of A.alphabet) {
        const t = M.targets(A, q, a);
        const rhs = isFA ? (t.length === 1 ? st(t[0]) : `<span class="undef">${t.length ? set(t) : 'undefined'}</span>`) : set(t);
        h += `<li>δ(${st(q)}, ${sy(a)}) = ${rhs}</li>`;
      }
      h += `</ul>`;
    }
    h += `<div><button type="button" class="btn sm" data-action="add-state">+ State</button></div></div>`;

    const shown = issues.filter(i => i.level === 'error' || (i.level === 'info' && A.states.length && !/^Q is empty/.test(i.text)));
    if (shown.length) {
      h += `<ul class="issues">`;
      for (const i of shown) {
        h += `<li class="${i.level}"><span>${esc(i.text)}</span>${i.fix === 'trap' ? '<button type="button" class="btn sm" data-action="trap">Add trap state</button>' : ''}</li>`;
      }
      h += `</ul>`;
    }
    return h;
  }

  // ---------- Simulation tab ----------
  function simulationHTML() {
    const s = simulation();
    ui.simStep = s.step;
    let h = `<div class="card">
      <input type="text" class="word-input" id="sim-word" value="${esc(ui.simWord)}" placeholder="Type a word, e.g. abba" spellcheck="false" autocomplete="off" aria-label="Input word w">
      <div class="sim-ctrl">
        <button type="button" class="btn sq" data-sim="reset" title="Back to the start" aria-label="Back to the start" ${s.step === 0 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button>
        <button type="button" class="btn sq" data-sim="back" title="One step back" aria-label="One step back" ${s.step === 0 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
        <button type="button" class="btn dark grow" data-sim="step" ${s.step >= s.maxStep ? 'disabled' : ''}>Step <svg class="ic" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
        <button type="button" class="btn sq" data-sim="end" title="Run to the end" aria-label="Run to the end" ${s.step >= s.maxStep ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button>
      </div>`;
    if (!A.states.length) return h + `<div class="muted small">Build an automaton first.</div></div>`;
    if (s.r.status === 'invalid') return h + `<div class="muted small">${esc(s.r.reason)} Σ = {${A.alphabet.map(esc).join(', ')}}.</div></div>` + batchHTML();

    h += `<div class="tape" aria-label="input word">`;
    if (!s.word.length) h += `<span class="next" title="empty word">λ</span>`;
    s.word.forEach((a, k) => { h += `<span class="${k < s.step ? 'read' : k === s.step ? 'next' : ''}">${esc(a)}</span>`; });
    h += `</div></div>`;

    const q0 = A.initial;
    const prefix = s.word.slice(0, s.step);
    if (s.kind === 'FA') {
      const cfgs = s.r.configs;
      h += `<div class="card"><div class="lab">Computation</div><div class="computation">`;
      h += cfgs.slice(0, s.step + 1).map((c, k) => `<span class="cfg ${k === s.step ? 'cur' : ''}">(${st(c.state)}, ${wd(c.rest)})</span>`).join(TURN);
      if (s.step < s.maxStep) h += TURN + '…';
      h += `</div><div class="explain">`;
      const cur = cfgs[s.step].state;
      if (s.step === 0) {
        h += `<div class="txt">Start in the initial state.</div>${DH}(${st(q0)}, λ) = ${st(q0)}`;
      } else {
        const prev = cfgs[s.step - 1].state, a = s.word[s.step - 1];
        const u = s.word.slice(0, s.step - 1);
        h += `${DH}(${st(q0)}, ${wd(prefix)}) = δ(${DH}(${st(q0)}, ${wd(u)}), ${sy(a)}) = δ(${st(prev)}, ${sy(a)}) = ${st(cur)}`;
      }
      h += `</div>`;
      const stuckHere = s.r.status === 'stuck' && s.step === s.maxStep;
      if (stuckHere) {
        h += `<div class="verdict no">δ(${st(s.r.state)}, ${sy(s.r.symbol)}) is undefined
          <div class="txt">The computation cannot continue. In an FA δ must be total — add the missing arrow or a trap state.</div></div>`;
      } else if (s.step === s.maxStep) {
        const fin = s.r.final;
        h += s.r.status === 'accepted'
          ? `<div class="verdict yes">${DH}(${st(q0)}, ${wd(s.word)}) = ${st(fin)} ∈ <i>F</i> &nbsp;⇒&nbsp; ${wd(s.word)} ∈ L(M)</div>`
          : `<div class="verdict no">${DH}(${st(q0)}, ${wd(s.word)}) = ${st(fin)} ∉ <i>F</i> &nbsp;⇒&nbsp; ${wd(s.word)} ∉ L(M)</div>`;
      }
      h += `</div>`;
    } else {
      const sets = s.r.sets;
      h += `<div class="card"><div class="lab"><span class="m">${DH}(${st(q0)}, ·) step by step</span>${A.type === 'FA' ? '<span class="pill">not deterministic</span>' : ''}</div>
        <table class="steps"><thead><tr><th>read</th><th>${DH}(${st(q0)}, read)</th></tr></thead><tbody>`;
      for (let k = 0; k <= s.step; k++) h += `<tr class="${k === s.step ? 'cur' : ''}"><td>${wd(s.word.slice(0, k))}</td><td>${set(sets[k])}</td></tr>`;
      h += `</tbody></table><div class="explain">`;
      if (s.step === 0) {
        h += `${DH}(${st(q0)}, λ) = {${st(q0)}}`;
      } else {
        const a = s.word[s.step - 1];
        const u = s.word.slice(0, s.step - 1);
        const prevSet = sets[s.step - 1];
        h += `${DH}(${st(q0)}, ${wd(prefix)}) = <span class="bigop">⋃</span><sub><i>p</i> ∈ ${DH}(${st(q0)}, ${wd(u)})</sub> δ(<i>p</i>, ${sy(a)})`;
        if (prevSet.length) {
          h += `<br>= ${prevSet.map(p => `δ(${st(p)}, ${sy(a)})`).join(' ∪ ')}`;
          h += `<br>= ${prevSet.map(p => set(M.targets(A, p, a))).join(' ∪ ')}`;
        }
        h += `<br>= ${set(sets[s.step])}`;
      }
      h += `</div>`;
      if (s.step === s.maxStep) {
        const last = sets[sets.length - 1];
        const hit = s.r.acceptingHit;
        h += hit.length
          ? `<div class="verdict yes">${DH}(${st(q0)}, ${wd(s.word)}) ∩ <i>F</i> = ${set(hit)} ≠ ∅ &nbsp;⇒&nbsp; ${wd(s.word)} ∈ L(M)</div>`
          : `<div class="verdict no">${DH}(${st(q0)}, ${wd(s.word)}) ∩ <i>F</i> = ${set(last.filter(q => A.accepting.includes(q)))} &nbsp;⇒&nbsp; ${wd(s.word)} ∉ L(M)</div>`;
      }
      h += `</div><div class="card"><div class="lab">All computations</div>` + computationTreeHTML(s) + `</div>`;
    }
    return h + batchHTML();
  }

  function computationTreeHTML(s) {
    const tree = M.computationTree(A, s.word, 300);
    if (!tree.root) return '';
    let leaf = 0;
    const X = new Map();
    (function place(n) {
      if (!n.children.length) { X.set(n.id, leaf++); return; }
      n.children.forEach(place);
      X.set(n.id, (X.get(n.children[0].id) + X.get(n.children[n.children.length - 1].id)) / 2);
    })(tree.root);
    const dx = 46, dy = 58, pad = 26;
    const W = Math.max(1, leaf) * dx + pad, H = (s.word.length) * dy + 2 * pad;
    const px = n => pad + X.get(n.id) * dx, py = n => pad + n.depth * dy;
    let g = '';
    for (const n of tree.nodes) for (const c of n.children) {
      const fut = c.depth > s.step ? ' future' : '';
      g += `<line class="tedge${fut}" x1="${px(n)}" y1="${py(n) + 13}" x2="${px(c)}" y2="${py(c) - 13}"/>`;
      g += `<text class="tsym${fut}" x="${(px(n) + px(c)) / 2 + 6}" y="${(py(n) + py(c)) / 2 + 4}">${esc(s.word[n.depth])}</text>`;
    }
    for (const n of tree.nodes) {
      const full = n.depth === s.word.length;
      const acc = full && A.accepting.includes(n.state);
      const dead = !full && !n.children.length && !tree.truncated;
      const cls = ['tnode', acc ? 'acc' : '', dead ? 'dead' : '', n.depth > s.step ? 'future' : ''].join(' ');
      const [b, sub] = Graph.nameParts(n.state);
      g += `<g class="${cls}" transform="translate(${px(n)},${py(n)})"><title>${esc(n.state)} after reading ${esc(M.fmtWord(s.word.slice(0, n.depth)))}</title>
        <circle class="outer" r="13"/>${acc ? '<circle r="9.5"/>' : ''}
        <text text-anchor="middle" dominant-baseline="central">${esc(b)}${sub ? `<tspan class="sub" dy="0.3em">${esc(sub)}</tspan>` : ''}</text></g>`;
    }
    return `<div class="tree-wrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg></div>
      <div class="legend">Each path from the top is one computation. Green: accepting · dashed: stuck, δ(p, a) = ∅.${tree.truncated ? ' <b>Truncated — too many computations.</b>' : ''}</div>`;
  }

  function batchHTML() {
    let h = `<div class="card"><div class="lab">Test several words</div>
      <input type="text" class="plain-input" id="sim-batch" value="${esc(ui.batch)}" placeholder="λ  a  ab  abb" spellcheck="false" autocomplete="off" aria-label="Words to test, separated by spaces">`;
    const words = ui.batch.split(/[\s,;]+/).filter(Boolean);
    if (words.length && A.states.length) {
      h += `<ul class="batch-list">`;
      for (const w of words) {
        const sym = M.splitWord(w);
        if (sym.some(a => !A.alphabet.includes(a))) { h += `<li class="bad" title="contains a symbol that is not in Σ">${wd(sym)} ?</li>`; continue; }
        const ok = M.accepts(A, sym);
        h += `<li class="${ok ? 'yes' : 'no'}">${wd(sym)} ${ok ? '∈' : '∉'} L(M)</li>`;
      }
      h += `</ul>`;
    }
    return h + `</div>`;
  }

  // ---------- Classes tab ----------
  function classesHTML() {
    let h = `<div class="card soft"><div class="math">Kl[<i>q</i>] = { <i>w</i> ∈ Σ* | ${DH}(<i>q</i><sub>0</sub>, <i>w</i>) = <i>q</i> }</div>
      <div class="muted small">The words after which M is in state <i>q</i>.</div></div>`;
    if (A.type !== 'FA') return h + `<div class="card"><div class="small">Classes are defined for finite automata (FA). For an NFA, ${DH}(<i>q</i><sub>0</sub>, <i>w</i>) is a set of states — switch to FA at the top.</div></div>`;
    if (!A.states.length || A.initial === null) return h + `<div class="card"><div class="small">Add states and choose an initial state first.</div></div>`;
    if (!M.isDeterministic(A)) return h + `<div class="card"><div class="small">Some δ(<i>q</i>, <i>a</i>) has several targets, so M is not an FA and the classes are not defined.</div></div>`;
    if (!A.alphabet.length) return h + `<div class="card"><div class="small">Σ is empty.</div></div>`;

    const nMax = maxLenFor(A.alphabet.length);
    const n = Math.min(ui.classN, nMax);
    const cl = M.classes(A, n);
    const colors = classColors();
    h += `<div class="class-controls">Words up to length
      <span class="stepper"><button type="button" data-n="-1" aria-label="shorter">−</button><b>${n}</b><button type="button" data-n="1" aria-label="longer">+</button></span></div>`;

    for (const q of A.states) {
      const words = cl.byState[q];
      const shortest = cl.shortest[q];
      const tags = A.accepting.includes(q) ? '<span class="pill ok">accepting</span>' : '';
      h += `<div class="class-card${ui.hoverState === q ? ' hover' : ''}" data-state="${esc(q)}" style="--c:${colors[q]}">
        <div class="head"><span>Kl[${st(q)}]</span>${tags}</div>`;
      if (shortest === null) {
        h += `<div class="meta">Not reachable from ${st(A.initial)}, so Kl[${st(q)}] = ∅.</div>`;
      } else {
        const LIMIT = 60;
        h += `<div class="chips">` + words.slice(0, LIMIT).map(w => `<span class="chip" data-word="${esc(w.join(''))}" title="Simulate this word">${w.length ? esc(w.join('')) : 'λ'}</span>`).join('');
        if (words.length > LIMIT) h += `<span class="muted small">… +${words.length - LIMIT}</span>`;
        if (!words.length) h += `<span class="muted small">none of length ≤ ${n} — shortest: ${wd(shortest)}</span>`;
        h += `</div>`;
      }
      h += `</div>`;
    }
    if (cl.none.length) {
      h += `<div class="card"><div class="small">${cl.none.length} word(s), e.g. ${wd(cl.none[0])}, lie in no class because δ is not total.</div></div>`;
    }
    const F = A.accepting;
    h += `<div class="card"><div class="lab">Accepted language</div><div class="lang">L(M) = ${F.length ? F.map(q => `Kl[${st(q)}]`).join(' ∪ ') : '∅'}</div></div>`;
    const depth = Math.min(n, treeDepthFor(A.alphabet.length));
    h += `<div class="card"><div class="lab"><span>Prefix tree of Σ<sup>≤${depth}</sup></span></div>` + prefixTreeHTML(depth, colors) + `</div>`;
    return h;
  }

  function countWords(k, n) { let c = 0, p = 1; for (let i = 0; i <= n; i++) { c += p; p *= k; } return c; }
  function maxLenFor(k) { let n = 0; while (n < 12 && countWords(k, n + 1) <= 4000) n++; return n; }
  function treeDepthFor(k) { let d = 0; while (d < 8 && Math.pow(k, d + 1) <= 64) d++; return d; }

  function prefixTreeHTML(depth, colors) {
    const nodes = M.prefixTree(A, depth);
    if (!nodes.length) return '';
    const k = A.alphabet.length;
    const leaves = Math.pow(k, depth);
    const dx = 34, dy = 60, pad = 24;
    const W = Math.max(leaves * dx, 120) + 2 * pad, H = depth * dy + 2 * pad + 10;
    const idxInLevel = [];
    const levelCount = {};
    nodes.forEach((n, i) => { idxInLevel[i] = levelCount[n.depth] = (levelCount[n.depth] || 0) + 1; });
    const px = i => { const n = nodes[i]; const width = (W - 2 * pad) / Math.pow(k, n.depth); return pad + (idxInLevel[i] - 0.5) * width; };
    const py = i => pad + nodes[i].depth * dy;
    let g = '';
    nodes.forEach((n, i) => {
      if (n.parent < 0) return;
      g += `<line class="tedge" x1="${px(n.parent)}" y1="${py(n.parent) + 12}" x2="${px(i)}" y2="${py(i) - 12}"/>`;
      g += `<text class="tsym" x="${(px(n.parent) + px(i)) / 2 + (px(i) < px(n.parent) ? -9 : 5)}" y="${(py(n.parent) + py(i)) / 2}">${esc(n.word[n.word.length - 1])}</text>`;
    });
    nodes.forEach((n, i) => {
      const c = n.state ? colors[n.state] : null;
      const label = n.state ? Graph.nameParts(n.state) : ['–', ''];
      g += `<g class="tnode${ui.hoverState && n.state === ui.hoverState ? ' hit' : ''}" data-state="${esc(n.state || '')}" data-word="${esc(n.word.join(''))}" transform="translate(${px(i)},${py(i)})">
        <title>${esc(M.fmtWord(n.word))} ∈ Kl[${esc(n.state || '?')}]</title>
        <circle r="12" style="${c ? `fill:${c}40;stroke:${c}` : ''}"/>
        <text text-anchor="middle" dominant-baseline="central">${esc(label[0])}${label[1] ? `<tspan class="sub" dy="0.3em">${esc(label[1])}</tspan>` : ''}</text></g>`;
    });
    return `<div class="tree-wrap"><svg class="${ui.hoverState ? 'tree-focus' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg></div>
      <div class="legend">Each node is the word on the path from the root, coloured by its class. Click a node to simulate it.</div>`;
  }

  // ---------- Exercise tab ----------
  const KIND_LABEL = { construct: 'Construct an automaton', product: 'Product construction', powerset: 'Powerset construction' };
  const minis = new Map();   // id → automaton shown read-only in the panel

  function hashString(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  /** Name of the target language in feedback texts. */
  function langName(ex) {
    if (ex.kind === 'product') return `L(A<sub>1</sub>) ${M.OPS[ex.op].symbol} L(A<sub>2</sub>)`;
    if (ex.kind === 'powerset') return 'L(N)';
    return 'L';
  }

  function miniHTML(id, automaton, label) {
    minis.set(id, automaton);
    return `<div class="given"><div class="lab"><span class="m">${label}</span><span class="pill">${automaton.type}</span></div><div class="mini" data-mini="${id}"></div></div>`;
  }

  /** Draws the read-only diagrams of the given automata after the panel was rendered. */
  function mountMinis(root) {
    root.querySelectorAll('.mini[data-mini]').forEach(box => {
      const B = minis.get(box.dataset.mini);
      if (!B) return;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', 'graph');
      box.appendChild(s);
      const g = Graph.createGraph(s, { onSelect() {}, onBackground() {}, onMove() {}, onAddState() {}, onToggleAccepting() {}, onConnect() {} },
        { inset: { top: 8, bottom: 8, left: 8, right: 8 } });
      g.render(M.autoLayout(B), { mode: 'view', fit: true });
    });
  }

  // ---------- exercise list (exercises.js) and codes ----------
  // Exercises are opened by code; the codes live in exercises.js next to index.html.
  // The editor (index.html?mode=editor) creates exercises and rewrites that file.
  let exList = null;            // [{ code, exercise }]
  const RECENT_KEY = 'automata-lab:recent-exercises';

  /** (Re)loads exercises.js — always fresh, so an exercise published a minute ago already works. */
  function loadExerciseList() {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'exercises.js?t=' + Date.now();
      s.onload = () => { exList = (window.AUTOMATA_LAB_EXERCISES || []).slice(); s.remove(); resolve(exList); };
      s.onerror = () => { s.remove(); resolve(exList || []); };
      document.head.appendChild(s);
    });
  }

  function recentExercises() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
  }
  function rememberRecent(ex) {
    if (!ex.code) return;
    const list = recentExercises().filter(r => r.code !== ex.code);
    list.unshift({ code: ex.code, title: ex.title || KIND_LABEL[ex.kind] });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ }
  }

  async function openByCode(raw) {
    const code = M.normalizeCode(raw);
    if (!code) { ui.codeError = 'A code looks like DEMO-1: letters, digits and dashes.'; renderPanel(); return; }
    ui.codeError = null; ui.codeBusy = true; renderPanel();
    const list = await loadExerciseList();
    ui.codeBusy = false;
    const item = list.find(e => M.normalizeCode(e.code) === code);
    if (!item) { ui.codeError = `There is no exercise with the code ${code}. Check for a typo.`; renderPanel(); return; }
    let ex;
    try { ex = M.normalizeExercise(Object.assign({}, item.exercise, { code })); }
    catch (e) { ui.codeError = 'This exercise could not be read.'; renderPanel(); return; }
    ui.codeInput = '';
    enterExercise(ex);
  }

  function suggestCode() {
    let n = 0;
    for (const e of exList || []) { const m = /^EX-(\d+)$/.exec(e.code); if (m) n = Math.max(n, +m[1]); }
    return 'EX-' + String(n + 1).padStart(2, '0');
  }

  // --- editor: writing exercises.js (File System Access API where available, otherwise a download) ---
  function exercisesFileText(list) {
    return '/*\n * Automata Lab — exercises that can be opened with a code.\n' +
      ' * This file is written by the exercise editor (index.html?mode=editor, "Save to exercises.js"); edit it there, not by hand.\n */\n' +
      'window.AUTOMATA_LAB_EXERCISES = ' + JSON.stringify(list, null, 2) + ';\n';
  }

  // the chosen file is remembered (IndexedDB), so after the first time saving needs no dialog
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('automata-lab', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('handles', mode);
          const r = fn(tx.objectStore('handles'));
          tx.oncomplete = () => resolve(r && r.result);
          tx.onerror = tx.onabort = () => reject(tx.error);
        } catch (e) { reject(e); }
      };
    });
  }

  async function saveExerciseFile(list) {
    const text = exercisesFileText(list);
    if (window.showSaveFilePicker) {
      try {
        let handle = null;
        try { handle = await idb('readonly', s => s.get('exercises')); } catch (e) { handle = null; }
        if (handle && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') handle = null;
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: 'exercises.js',
            types: [{ description: 'Automata Lab exercises', accept: { 'text/javascript': ['.js'] } }],
          });
          try { await idb('readwrite', s => s.put(handle, 'exercises')); } catch (e) { /* not remembered: ask next time */ }
        }
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        return 'saved';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'exercises.js';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'downloaded';
  }

  async function writeList(newList, okMessage) {
    const res = await saveExerciseFile(newList);
    if (res === 'cancelled') return false;
    exList = newList;
    toast(res === 'saved' ? okMessage + ' Now upload exercises.js to the website.'
      : 'exercises.js was downloaded: move it into the app folder (replace the old one), then upload it.');
    return true;
  }

  function exerciseHTML() {
    minis.clear();
    if (ui.exercise) return solveHTML(ui.exercise);
    return EDITOR ? authorHTML() : codeHTML();
  }

  /** Enter a code to start an exercise. */
  function codeHTML() {
    let h = `<div class="card"><div class="lab">Start an exercise</div>
      <div class="muted small">Enter the code of the exercise.</div>
      <div class="sim-ctrl"><input type="text" id="ex-code" class="code-input" value="${esc(ui.codeInput || '')}" placeholder="e.g. DEMO-1" spellcheck="false" autocomplete="off" aria-label="Exercise code">
        <button type="button" class="btn dark" data-action="opencode" ${ui.codeBusy ? 'disabled' : ''}>${ui.codeBusy ? 'Loading…' : 'Start'}</button></div>
      ${ui.codeError ? `<div class="code-err">${esc(ui.codeError)}</div>` : ''}</div>`;
    const recent = recentExercises();
    if (recent.length) {
      h += `<div class="card"><div class="lab">Continue</div><div class="list">`;
      for (const r of recent) h += `<button type="button" class="list-row" data-recent="${esc(r.code)}"><b>${esc(r.title)}</b><span>${esc(r.code)}</span></button>`;
      h += `</div></div>`;
    }
    h += `<div class="muted small">Your work on each exercise is saved in this browser, so you can come back to it later.</div>`;
    return h;
  }

  function solveHTML(ex) {
    const req = M.requiredType(ex);
    const target = M.exerciseTarget(ex);
    let h = `<div class="card"><div class="lab"><span>${esc(ex.title || KIND_LABEL[ex.kind])}</span>${ex.code ? `<span class="pill">${esc(ex.code)}</span>` : ''}</div>
      <p class="ex-text">${esc(ex.text)}</p>
      <div class="row-pills"><span class="pill">${req === 'any' ? 'FA or NFA' : req}</span>${ex.maxStates ? `<span class="pill">at most ${ex.maxStates} states</span>` : ''}<span class="pill">Σ = {${target.alphabet.map(esc).join(', ')}}</span></div>
    </div>`;
    if (ex.kind === 'product') h += `<div class="card">${miniHTML('A1', ex.A1, 'A<sub>1</sub>')}${miniHTML('A2', ex.A2, 'A<sub>2</sub>')}</div>`;
    if (ex.kind === 'powerset') h += `<div class="card">${miniHTML('N', ex.nfa, 'N')}</div>`;
    h += `<div class="card"><div class="muted small">Build your answer on the canvas, then check it.</div>
      <button type="button" class="btn dark wide" data-action="check">Check my automaton</button>`;
    const r = ui.exResult;
    if (r) {
      if (r.ok) {
        h += `<div class="verdict yes">Correct — L(M) = ${langName(ex)}.${r.info.map(i => `<div class="txt">${esc(i)}</div>`).join('')}</div>`;
      } else if (r.problems.length) {
        h += `<ul class="issues">${r.problems.map(p => `<li class="error"><span>${esc(p)}</span></li>`).join('')}</ul>`;
      } else {
        const w = r.counterexample.word, ws = w.join('');
        h += `<div class="verdict no">Counterexample: <i>w</i> = ${wd(w)}
          <div class="txt">${r.counterexample.answerAccepts
            ? `Your automaton accepts ${wd(w)}, but ${wd(w)} ∉ ${langName(ex)}.`
            : `Your automaton rejects ${wd(w)}, but ${wd(w)} ∈ ${langName(ex)}.`}</div></div>
          <button type="button" class="btn sm" data-word="${esc(ws)}">Simulate ${wd(w)} on your automaton</button>`;
      }
    }
    h += `</div><div class="ex-foot"><button type="button" class="btn sm text" data-action="restart">Start over</button>
      <button type="button" class="btn sm text" data-action="leave">Leave exercise</button></div>`;
    return h;
  }

  /** Editor: the exercises in exercises.js and the form to create a new one. */
  function authorHTML() {
    const d = ui.draft;
    if (exList === null) { loadExerciseList().then(() => { if (!d.code) d.code = suggestCode(); renderPanel(); }); return '<div class="muted small">Loading exercises.js …</div>'; }
    if (!d.code) d.code = suggestCode();
    let h = `<div class="card"><div class="lab"><span>Exercises in exercises.js</span><span class="pill">${exList.length}</span></div>`;
    if (exList.length) {
      h += `<div class="list">`;
      for (const e of exList) {
        h += `<div class="list-row static"><div class="lr-main"><b>${esc(e.code)}</b><span>${esc(e.exercise.title || KIND_LABEL[e.exercise.kind])}</span></div>
          <button type="button" class="btn sm" data-try="${esc(e.code)}">Try</button>
          <button type="button" class="icon-btn" data-remove="${esc(e.code)}" title="Remove ${esc(e.code)} from exercises.js" aria-label="Remove ${esc(e.code)}">${TRASH}</button></div>`;
      }
      h += `</div>`;
    } else h += `<div class="muted small">No exercises yet.</div>`;
    h += `</div>`;

    h += `<div class="card"><div class="lab">Create an exercise</div>
      <div class="seg wide-seg">${['construct', 'product', 'powerset'].map(k => `<button type="button" data-dkind="${k}" aria-selected="${d.kind === k}">${{ construct: 'Construct', product: 'Product', powerset: 'Powerset' }[k]}</button>`).join('')}</div>`;
    const errs = M.validate(A).filter(i => i.level === 'error');
    const canvasState = A.states.length ? `${A.type} with ${A.states.length} state${A.states.length === 1 ? '' : 's'}${errs.length ? ' — not valid yet' : ''}` : 'empty';
    if (d.kind === 'construct') {
      h += `<div class="small muted">The automaton on the canvas is the <b>solution</b>. Whoever opens the exercise only sees your text and gets counterexamples.</div>
        <div class="small">Canvas: <span class="pill ${errs.length || !A.states.length ? 'err' : 'ok'}">${canvasState}</span></div>
        <div class="field"><span>The answer must be</span><span class="seg">${['FA', 'NFA', 'any'].map(r => `<button type="button" data-dreq="${r}" aria-selected="${d.require === r}">${r === 'any' ? 'either' : r}</button>`).join('')}</span></div>
        <div class="field"><span>At most … states</span><input type="number" min="1" max="99" id="d-max" class="num" value="${esc(d.maxStates)}" placeholder="no limit"></div>`;
    } else if (d.kind === 'product') {
      h += `<div class="small muted">The exercise shows A<sub>1</sub> and A<sub>2</sub>; the task is an FA for the combined language. Draw (or load) each automaton on the canvas and store it here.</div>
        <div class="slots">`;
      for (const k of ['A1', 'A2']) {
        h += d[k] ? miniHTML('d' + k, d[k], `A<sub>${k[1]}</sub>`) : `<div class="given empty-slot"><div class="lab"><span class="m">A<sub>${k[1]}</sub></span></div><div class="muted small">empty</div></div>`;
        h += `<button type="button" class="btn sm" data-slot="${k}">Use canvas as A${k === 'A1' ? '₁' : '₂'}</button>`;
      }
      h += `</div><div class="field"><span>Language</span><span class="seg">${Object.keys(M.OPS).map(o => `<button type="button" data-dop="${o}" aria-selected="${d.op === o}">L(A₁) ${M.OPS[o].symbol} L(A₂)</button>`).join('')}</span></div>`;
    } else {
      h += `<div class="small muted">The NFA on the canvas is shown as <i>N</i>; the task is the equivalent FA via the powerset construction.</div>
        <div class="small">Canvas: <span class="pill ${errs.length || A.type !== 'NFA' ? 'err' : 'ok'}">${A.type === 'NFA' ? canvasState : 'switch to NFA'}</span></div>`;
    }
    h += `<div class="field"><span>Code</span><input type="text" id="d-code" class="code-input short" value="${esc(d.code)}" spellcheck="false" autocomplete="off"></div>
      <input type="text" id="d-title" class="plain-input title-input" value="${esc(d.title || '')}" placeholder="Short title, e.g. Sheet 5 — product construction" autocomplete="off">
      <textarea id="d-text" rows="4" placeholder="${esc(defaultText(d))}">${esc(d.text)}</textarea>
      <div class="sim-ctrl"><button type="button" class="btn" data-action="preview">Try it yourself</button>
      <button type="button" class="btn dark grow" data-action="savefile">Save to exercises.js</button></div>
      <div class="small muted">Alternatively <button type="button" class="linkish" data-action="copylink">copy a direct link</button> (works without uploading anything).</div></div>`;
    return h;
  }

  function defaultText(d) {
    if (d.kind === 'product') return `Use the product construction to build a finite automaton for L(A₁) ${M.OPS[d.op].symbol} L(A₂).`;
    if (d.kind === 'powerset') return 'Apply the powerset construction to the NFA N and draw the resulting finite automaton. You can drop all states that are not reachable.';
    return 'Construct a finite automaton for the language L = { w ∈ {a, b}* | … }.';
  }

  /** Builds an exercise from the "Create" form; throws with a message for the author if something is missing. */
  function buildExercise() {
    const d = ui.draft;
    const text = d.text.trim() || (d.kind === 'construct' ? '' : defaultText(d));
    if (!text) throw new Error('Write the exercise text first — it is the only thing shown with the exercise.');
    const title = (d.title || '').trim();
    const strip = B => { const C = M.clone(B); delete C.pos; delete C.arcs; return C; };
    const valid = (B, what) => {
      if (!B.states.length) throw new Error(`${what} is empty.`);
      const e = M.validate(B).filter(i => i.level === 'error');
      if (e.length) throw new Error(`${what} is not valid yet: ${e[0].text}`);
    };
    if (d.kind === 'construct') {
      valid(A, 'The solution on the canvas');
      return M.normalizeExercise({ kind: 'construct', title, text, require: d.require, maxStates: d.maxStates || null, solution: strip(A) });
    }
    if (d.kind === 'product') {
      if (!d.A1 || !d.A2) throw new Error('Store both automata A₁ and A₂ first.');
      return M.normalizeExercise({ kind: 'product', title, text, op: d.op, A1: strip(d.A1), A2: strip(d.A2) });
    }
    if (A.type !== 'NFA') throw new Error('Switch the canvas to NFA: the powerset construction starts from an NFA.');
    valid(A, 'The NFA on the canvas');
    return M.normalizeExercise({ kind: 'powerset', title, text, nfa: strip(A) });
  }

  function enterExercise(ex) {
    ui.exercise = ex;
    ui.exId = hashString(JSON.stringify(ex));
    ui.exResult = null;
    let work = null;
    try { const s = localStorage.getItem(EX_KEY + ui.exId); if (s) work = M.normalize(JSON.parse(s)); } catch (e) { work = null; }
    if (!work) work = freshAnswer(ex);
    try { localStorage.setItem(CURRENT_EX_KEY, JSON.stringify(ex)); } catch (e) { /* ignore */ }
    if (!EDITOR) rememberRecent(ex);
    A = M.autoLayout(work);
    undoStack = []; redoStack = [];
    ui.selected = null; ui.pop = null; ui.tab = 'exercise'; ui.simWord = ''; ui.simStep = 0;
    ui.mode = A.states.length ? 'select' : 'state';
    ui.fitNext = true;
    save(); renderAll();
  }

  function freshAnswer(ex) {
    const B = M.empty(M.requiredType(ex) === 'NFA' ? 'NFA' : 'FA');
    return M.setAlphabet(B, M.exerciseTarget(ex).alphabet);
  }

  function leaveExercise() {
    ui.exercise = null; ui.exId = null; ui.exResult = null; ui.mode = 'select';
    try { localStorage.removeItem(CURRENT_EX_KEY); } catch (e) { /* ignore */ }
    let B = null;
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) B = JSON.parse(s); } catch (e) { B = null; }
    load(B || M.EXAMPLES[0].automaton, { resetHistory: true });
  }

  function exerciseLink(ex) { return location.href.split('#')[0] + '#x=' + encode(ex); }

  // ---------- events: header & tools ----------
  $$('#type-seg button').forEach(b => b.addEventListener('click', () => {
    if (A.type !== b.dataset.type) commit(M.setType(A, b.dataset.type));
  }));
  $$('.tools [data-mode]').forEach(b => b.addEventListener('click', () => {
    ui.mode = b.dataset.mode;
    if (ui.mode !== 'select') { ui.selected = null; ui.pop = null; }
    renderAll();
  }));
  $('.tools [data-action=arrange]').addEventListener('click', () => {
    if (!A.states.length) return;
    ui.fitNext = true;
    commit(M.layeredLayout(A));
  });
  $('#btn-zoom-in').addEventListener('click', () => graph.zoomIn());
  $('#btn-zoom-out').addEventListener('click', () => graph.zoomOut());
  $('#btn-fit').addEventListener('click', () => { graph.fit(); renderZoom(); renderPop(); });

  // ---------- day / night ----------
  const THEME_KEY = 'automata-lab:theme';
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('#btn-theme').setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
    $('#btn-theme').title = t === 'dark' ? 'Day mode' : 'Night mode';
    $('#btn-theme').dataset.mode = t;
  }
  try { const saved = localStorage.getItem(THEME_KEY); if (saved === 'light' || saved === 'dark') applyTheme(saved); else applyTheme(currentTheme()); } catch (e) { applyTheme(currentTheme()); }
  $('#btn-theme').addEventListener('click', () => {
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    renderGraph();
  });
  $$('.ptabs button').forEach(b => b.addEventListener('click', () => {
    ui.tab = b.dataset.tab; ui.hoverState = null;
    if (ui.pop && ui.pop.type === 'cell') ui.pop = null;
    renderAll();
  }));

  $('#btn-examples').addEventListener('click', () => {
    ui.pop = ui.pop && ui.pop.type === 'menu' ? null : { type: 'menu' };
    renderPop();
  });
  $('#btn-new').addEventListener('click', () => {
    ui.selected = null; ui.pop = null; ui.mode = 'state'; ui.fitNext = true;
    commit(ui.exercise ? freshAnswer(ui.exercise) : M.empty(A.type));
    toast('New automaton — Undo restores the previous one.');
  });
  $('#ex-chip').addEventListener('click', leaveExercise);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-guide').addEventListener('click', () => Guide.open());

  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }
  $('#btn-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#m=' + encode(A);
    try { await navigator.clipboard.writeText(url); toast('Link copied — whoever opens it gets this automaton.'); }
    catch (e) { window.prompt('Copy this link:', url); }
  });

  // ---------- events: panel ----------
  const body = $('#panel-body');
  body.addEventListener('change', e => {
    if (e.target.id === 'sigma') tryCommit(() => M.setAlphabet(A, M.parseList(e.target.value)));
  });
  body.addEventListener('input', e => {
    if (e.target.id === 'd-text') { ui.draft.text = e.target.value; return; }
    if (e.target.id === 'd-code') { ui.draft.code = e.target.value; return; }
    if (e.target.id === 'd-title') { ui.draft.title = e.target.value; return; }
    if (e.target.id === 'ex-code') { ui.codeInput = e.target.value; return; }
    if (e.target.id === 'd-max') { ui.draft.maxStates = e.target.value; return; }
    if (e.target.id === 'sim-word') { ui.simWord = e.target.value; ui.simStep = 0; renderPanel(); renderGraph(); }
    if (e.target.id === 'sim-batch') { ui.batch = e.target.value; renderPanel(); }
  });
  body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'sim-word') { e.preventDefault(); simAction('step'); }
    if (e.key === 'Enter' && e.target.id === 'ex-code') { e.preventDefault(); openByCode(e.target.value); }
    if (e.key === 'Enter' && e.target.id === 'sigma') e.target.blur();
  });
  body.addEventListener('scroll', () => { if (ui.pop && ui.pop.type === 'cell') { ui.pop = null; hidePop(); $$('.cell.open').forEach(b => b.classList.remove('open')); } });
  body.addEventListener('click', async e => {
    const x = e.target.closest('[data-recent],[data-try],[data-remove],[data-dkind],[data-dreq],[data-dop],[data-slot]');
    if (x) {
      const d = ui.draft;
      if (x.dataset.recent !== undefined) openByCode(x.dataset.recent);
      else if (x.dataset.try !== undefined) {
        const item = exList.find(i => i.code === x.dataset.try);
        if (item) { enterExercise(M.normalizeExercise(Object.assign({}, item.exercise, { code: item.code }))); toast('This is how the exercise looks when it is opened. “Leave exercise” brings you back.'); }
      } else if (x.dataset.remove !== undefined) {
        const code = x.dataset.remove;
        if (!window.confirm(`Remove the exercise ${code} from exercises.js? It can no longer be opened with this code.`)) return;
        if (await writeList(exList.filter(i => i.code !== code), `${code} removed.`)) renderPanel();
      }
      else if (x.dataset.dkind) { d.kind = x.dataset.dkind; renderPanel(); }
      else if (x.dataset.dreq) { d.require = x.dataset.dreq; renderPanel(); }
      else if (x.dataset.dop) { d.op = x.dataset.dop; renderPanel(); }
      else if (x.dataset.slot) {
        const errs = M.validate(A).filter(i => i.level === 'error');
        if (A.type !== 'FA' || !A.states.length || errs.length) { toast('A₁ and A₂ must be valid finite automata (FA) — fix the canvas first.', true); return; }
        d[x.dataset.slot] = M.clone(A);
        toast(`Stored as ${x.dataset.slot === 'A1' ? 'A₁' : 'A₂'}.`);
        renderPanel();
      }
      return;
    }
    const act = e.target.closest('[data-action]');
    if (act && ['check', 'preview', 'copylink', 'savefile', 'opencode', 'restart', 'leave'].includes(act.dataset.action)) {
      const a = act.dataset.action;
      if (a === 'opencode') { openByCode(ui.codeInput); return; }
      if (a === 'savefile') {
        const d = ui.draft;
        const code = M.normalizeCode(d.code);
        if (!code) { toast('Choose a code: letters, digits and dashes, e.g. S05-1.', true); return; }
        if (exList.some(i => i.code === code)) { toast(`The code ${code} is already used — choose another one, or remove the old exercise first.`, true); return; }
        let ex;
        try { ex = buildExercise(); } catch (err) { toast(err.message, true); return; }
        delete ex.code;
        if (await writeList(exList.concat({ code, exercise: ex }), `Saved as ${code}.`)) {
          d.code = suggestCode(); d.title = ''; d.text = '';
          renderPanel();
        }
        return;
      }
      if (a === 'check') { ui.exResult = M.checkExercise(ui.exercise, A); renderPanel(); }
      else if (a === 'leave') leaveExercise();
      else if (a === 'restart') { ui.selected = null; ui.pop = null; ui.mode = 'state'; ui.fitNext = true; commit(freshAnswer(ui.exercise)); }
      else {
        let ex;
        try { ex = buildExercise(); } catch (err) { toast(err.message, true); return; }
        if (a === 'preview') { enterExercise(ex); toast('This is how the exercise looks when it is opened. “Leave exercise” brings you back.'); }
        else {
          const url = exerciseLink(ex);
          try { await navigator.clipboard.writeText(url); toast('Link copied — opening it starts this exercise.'); }
          catch (err) { window.prompt('Copy this link:', url); }
        }
      }
      return;
    }
    const t = e.target.closest('[data-sim],[data-action],[data-select],[data-word],[data-dview],[data-n],.cell');
    if (!t) return;
    if (t.classList.contains('cell')) {
      const same = ui.pop && ui.pop.type === 'cell' && ui.pop.q === t.dataset.q && ui.pop.a === t.dataset.a;
      ui.pop = same ? null : { type: 'cell', q: t.dataset.q, a: t.dataset.a };
      ui.selected = null;
      renderAll();
    } else if (t.dataset.sim) simAction(t.dataset.sim);
    else if (t.dataset.action === 'trap') commit(M.addTrapState(A));
    else if (t.dataset.action === 'add-state') tryCommit(() => M.addState(A, null, freeSpot()));
    else if (t.dataset.dview) { ui.deltaView = t.dataset.dview; renderPanel(); }
    else if (t.dataset.n) { ui.classN = Math.max(0, Math.min(ui.classN + +t.dataset.n, maxLenFor(A.alphabet.length))); renderPanel(); }
    else if (t.dataset.select !== undefined) { ui.selected = { kind: 'state', id: t.dataset.select }; ui.pop = { type: 'selection' }; renderAll(); }
    else if (t.dataset.word !== undefined) {
      ui.simWord = t.dataset.word; ui.tab = 'simulation'; ui.hoverState = null;
      ui.simStep = M.splitWord(t.dataset.word).length;
      renderAll();
    }
  });
  body.addEventListener('mouseover', e => {
    if (ui.tab !== 'classes') return;
    const card = e.target.closest('.class-card, .tnode');
    const q = card ? card.dataset.state || null : null;
    if (q === ui.hoverState) return;
    ui.hoverState = q;
    $$('.class-card').forEach(c => c.classList.toggle('hover', c.dataset.state === q));
    const tree = body.querySelector('.tree-wrap svg');
    if (tree) {
      tree.classList.toggle('tree-focus', !!q);
      tree.querySelectorAll('.tnode').forEach(n => n.classList.toggle('hit', n.dataset.state === q));
    }
    renderGraph();
  });

  function simAction(kind) {
    const s = simulation();
    if (kind === 'reset') ui.simStep = 0;
    if (kind === 'back') ui.simStep = Math.max(0, s.step - 1);
    if (kind === 'step') ui.simStep = Math.min(s.maxStep, s.step + 1);
    if (kind === 'end') ui.simStep = s.maxStep;
    renderPanel(); renderGraph();
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    if (window.Guide && Guide.isOpen()) return;
    const typing = !!(e.target.matches && e.target.matches('input, textarea'));
    if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && ui.selected) { e.preventDefault(); deleteSelection(); }
    else if (!typing && e.key === 'Escape') { ui.mode = 'select'; ui.selected = null; ui.pop = null; renderAll(); }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { renderGraph(); renderPop(); }, 80); });

  // ---------- start ----------
  // a link pasted while the app is already open only changes the part after # (no reload)
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    try {
      if (h.startsWith('#code=')) { openByCode(decodeURIComponent(h.slice(6))); }
      else if (h.startsWith('#x=')) { enterExercise(M.normalizeExercise(decode(h.slice(3)))); }
      else if (h.startsWith('#m=')) { if (ui.exercise) leaveExercise(); load(decode(h.slice(3))); toast('Automaton loaded from the link.'); }
      else return;
    } catch (e) { toast('The link is not valid.', true); }
    history.replaceState(null, '', location.pathname + location.search);
  });

  function start() {
    if (EDITOR) { $('#editor-pill').hidden = false; document.title = 'Automata Lab — editor'; }
    let initial = null, fromLink = false, exercise = null;
    if (location.hash.startsWith('#m=')) {
      try { initial = decode(location.hash.slice(3)); fromLink = true; } catch (e) { toast('The link does not contain a valid automaton.', true); }
      history.replaceState(null, '', location.pathname + location.search);
    } else if (location.hash.startsWith('#code=')) {
      // a link like …/index.html#code=S05-1 opens that exercise directly
      const code = decodeURIComponent(location.hash.slice(6));
      history.replaceState(null, '', location.pathname + location.search);
      load(M.EXAMPLES[0].automaton, { resetHistory: true });
      openByCode(code);
      Guide.init();
      return;
    } else if (location.hash.startsWith('#x=')) {
      try { exercise = M.normalizeExercise(decode(location.hash.slice(3))); } catch (e) { toast('The link does not contain a valid exercise.', true); }
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      try { const s = localStorage.getItem(CURRENT_EX_KEY); if (s) exercise = M.normalizeExercise(JSON.parse(s)); } catch (e) { exercise = null; }
    }
    if (exercise) { enterExercise(exercise); Guide.init(); return; }
    if (!initial) {
      try { const s = localStorage.getItem(STORAGE_KEY); if (s) initial = JSON.parse(s); } catch (e) { /* ignore */ }
    }
    try { load(initial || M.EXAMPLES[0].automaton, { resetHistory: true }); }
    catch (e) { load(M.EXAMPLES[0].automaton, { resetHistory: true }); }
    if (fromLink) toast('Automaton loaded from the link.');
    Guide.init();
  }
  start();
})();
