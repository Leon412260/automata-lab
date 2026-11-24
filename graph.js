/*
 * Automata Lab — SVG state diagram (rendering, camera, mouse/touch interaction).
 * Drawn in the style of the book: circles for states, double circles for accepting states,
 * an incoming arrow for the initial state, one arrow per pair of states labelled "a, b".
 *
 * Tools (view.mode):
 *   'select' — drag states, click a state or an arrow to edit it, drag the background to pan
 *   'state'  — click on empty space to place a state
 *   'arrow'  — drag from one state to another, or click two states one after the other
 *
 * Camera: the visible part of the diagram is kept clear of the overlays (hint on top, toolbar at
 * the bottom, zoom buttons on the right). With auto-fit on, the camera zooms out/moves only when
 * something would end up hidden; zooming or panning by hand switches auto-fit off until "Fit".
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const R = 24;                 // state radius
  const PALETTE = ['#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#76B7B2', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#8CD17D', '#BAB0AC', '#D37295'];
  const INSET = { top: 56, bottom: 78, left: 24, right: 64 };   // screen px kept free for overlays
  const MAX_K = 1.25, MIN_K = 0.25;

  /** Splits a state name into base and subscript: q0 → q,0 ; p_ba → p,ba ; r_λ,0 → r,λ,0. */
  function nameParts(name) {
    let m = /^([^_]+)_(.+)$/.exec(name);
    if (m) return [m[1], m[2]];
    m = /^(.*\D)(\d+)$/.exec(name);
    if (m) return [m[1], m[2]];
    return [name, ''];
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function nameText(parent, name) {
    const [base, sub] = nameParts(name);
    const t = el('text', { x: 0, y: 0, class: 'state-name', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, parent);
    t.appendChild(document.createTextNode(base));
    if (sub) {
      const s = el('tspan', { class: 'sub', dy: '0.35em' }, t);
      s.textContent = sub;
    }
    // long names: shrink to fit inside the circle
    const len = base.length + sub.length * 0.65;
    if (len > 3.2) t.setAttribute('style', `font-size:${Math.max(10, 17 * 3.2 / len)}px`);
    return t;
  }

  function createGraph(svg, handlers, opts) {
    const INS = (opts && opts.inset) || INSET;
    let A = null;
    let view = {};
    let cam = { x: 0, y: 0, k: 1 };
    let autoFit = true;
    let drag = null;          // move | edge | pan
    let pendingFrom = null;   // arrow tool: first state clicked
    let lastTap = { t: 0, q: null };
    let hoverQ = null;        // state under the mouse (select tool): shows its arrow handle
    let hoverEdge = null;     // arrow under the mouse: shows its bend handle
    let lastEdges = [];
    const CONN_D = R + 15;    // distance of the "new arrow" handle from the state's centre

    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
    const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
    const mul = (p, k) => ({ x: p.x * k, y: p.y * k });
    const len = p => Math.hypot(p.x, p.y) || 1;
    const unit = p => mul(p, 1 / len(p));
    const size = () => ({ w: svg.clientWidth || 800, h: svg.clientHeight || 500 });

    function toLocal(evt) {
      const r = svg.getBoundingClientRect();
      return { x: cam.x + (evt.clientX - r.left) / cam.k, y: cam.y + (evt.clientY - r.top) / cam.k };
    }

    function stateAt(p) {
      if (!A) return null;
      for (let i = A.states.length - 1; i >= 0; i--) {
        const q = A.states[i];
        const s = A.pos[q];
        if (s && Math.hypot(s.x - p.x, s.y - p.y) <= R + 4) return q;
      }
      return null;
    }

    // ---------- camera ----------
    function contentBox() {
      const ps = A ? A.states.map(q => A.pos[q]).filter(Boolean) : [];
      if (!ps.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ps) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      // room for loops and labels above, the initial arrow on the left
      return { x0: x0 - R - 56, y0: y0 - R - 66, x1: x1 + R + 24, y1: y1 + R + 24 };
    }

    /** Box of what is actually drawn (arcs, loops, labels included); falls back to the state positions. */
    function drawnBox() {
      const g = svg.querySelector('g.content');
      try {
        if (g) {
          const bb = g.getBBox();
          if (bb.width || bb.height) return { x0: bb.x - 14, y0: bb.y - 14, x1: bb.x + bb.width + 14, y1: bb.y + bb.height + 14 };
        }
      } catch (e) { /* not rendered yet */ }
      return contentBox();
    }

    function fit() {
      const b = drawnBox();
      const { w, h } = size();
      const aw = Math.max(80, w - INS.left - INS.right), ah = Math.max(80, h - INS.top - INS.bottom);
      if (!b) { cam = { x: -INS.left, y: -INS.top, k: 1 }; autoFit = true; return; }
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const k = Math.max(MIN_K, Math.min(MAX_K, 1, aw / bw, ah / bh));
      cam = {
        k,
        x: b.x0 - (INS.left + (aw - bw * k) / 2) / k,
        y: b.y0 - (INS.top + (ah - bh * k) / 2) / k,
      };
      autoFit = true;
    }

    /** With auto-fit on: re-fit only if some part of the diagram is hidden behind an overlay or off screen. */
    function ensureVisible() {
      const b = drawnBox();
      if (!b) return false;
      const { w, h } = size();
      const sx0 = (b.x0 - cam.x) * cam.k, sy0 = (b.y0 - cam.y) * cam.k;
      const sx1 = (b.x1 - cam.x) * cam.k, sy1 = (b.y1 - cam.y) * cam.k;
      if (sx0 < INS.left - 1 || sy0 < INS.top - 1 || sx1 > w - INS.right + 1 || sy1 > h - INS.bottom + 1) { fit(); return true; }
      return false;
    }

    function zoomAt(factor, sx, sy) {
      const { w, h } = size();
      if (sx === undefined) { sx = (INS.left + w - INS.right) / 2; sy = (INS.top + h - INS.bottom) / 2; }
      const k = Math.max(MIN_K, Math.min(3, cam.k * factor));
      const wx = cam.x + sx / cam.k, wy = cam.y + sy / cam.k;
      cam = { k, x: wx - sx / k, y: wy - sy / k };
      autoFit = false;
      draw();
      if (handlers.onCamera) handlers.onCamera();
    }

    function defs() {
      const d = el('defs', {}, svg);
      for (const [id, cls] of [['arrow', 'arrowhead'], ['arrow-active', 'arrowhead active'], ['arrow-sel', 'arrowhead sel']]) {
        const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, d);
        el('path', { d: 'M0,0.5 L10,5 L0,9.5 z', class: cls }, m);
      }
    }

    /** True if the quadratic curve S–C–E passes through a state other than its endpoints. */
    function blocked(S, C, E, from, to) {
      for (const q of A.states) {
        if (q === from || q === to) continue;
        const p = A.pos[q];
        if (!p) continue;
        for (let t = 0.08; t < 0.95; t += 0.06) {
          const u = 1 - t;
          const x = u * u * S.x + 2 * u * t * C.x + t * t * E.x, y = u * u * S.y + 2 * u * t * C.y + t * t * E.y;
          if (Math.hypot(x - p.x, y - p.y) < R + 7) return true;
        }
      }
      return false;
    }

    // ---------- arrow geometry ----------
    const arcs = () => A.arcs || {};
    const arcKey = (p, q) => p + ' ' + q;
    const angDist = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

    /** Directions (angles) in which arrows leave/enter a state, plus the initial arrow. */
    function usedAngles(q, all) {
      const P = A.pos[q], used = [];
      for (const e of all) {
        if (e.from === e.to) continue;
        const other = e.from === q ? e.to : e.to === q ? e.from : null;
        if (other && A.pos[other]) used.push(Math.atan2(A.pos[other].y - P.y, A.pos[other].x - P.x));
      }
      if (A.initial === q) used.push(Math.PI);
      return used;
    }

    /** Automatic loop direction: above, unless another side is clearly freer. */
    function autoLoopAngle(q, all) {
      const used = usedAngles(q, all);
      const cands = [-90, 90, 0, 180, -45, -135, 45, 135].map(d => d * Math.PI / 180);
      if (!used.length) return cands[0];
      const gap = a => Math.min(...used.map(u => angDist(a, u)));
      if (gap(cands[0]) >= 1.05) return cands[0];          // like in the book: on top whenever there is room
      let best = cands[0], bestGap = gap(best);
      for (const c of cands) { const g = gap(c); if (g > bestGap + 0.2) { best = c; bestGap = g; } }
      return best;
    }

    /** Path, label position and grab point of an arrow. */
    function geom(e, has, all) {
      const P = A.pos[e.from], Q = A.pos[e.to];
      const custom = arcs()[arcKey(e.from, e.to)];
      if (e.from === e.to) {
        const th = typeof custom === 'number' ? custom : autoLoopAngle(e.from, all);
        const a1 = th - 0.45, a2 = th + 0.45;
        const S = { x: P.x + R * Math.cos(a1), y: P.y + R * Math.sin(a1) };
        const E = { x: P.x + R * Math.cos(a2), y: P.y + R * Math.sin(a2) };
        const C1 = { x: P.x + 78 * Math.cos(a1 - 0.35), y: P.y + 78 * Math.sin(a1 - 0.35) };
        const C2 = { x: P.x + 78 * Math.cos(a2 + 0.35), y: P.y + 78 * Math.sin(a2 + 0.35) };
        const apex = { x: (S.x + 3 * C1.x + 3 * C2.x + E.x) / 8, y: (S.y + 3 * C1.y + 3 * C2.y + E.y) / 8 };
        const u = { x: Math.cos(th), y: Math.sin(th) };
        // the label sits just outside the loop (further out sideways, where its width counts)
        const half = 4 * (e.symbols.length ? e.symbols.join(', ').length : 1);
        const lp = add(apex, mul(u, 13 + Math.abs(u.x) * Math.max(0, half - 4)));
        return { d: `M${S.x},${S.y} C${C1.x},${C1.y} ${C2.x},${C2.y} ${E.x},${E.y}`, lp, apex, loop: true };
      }
      const reverse = has.has(e.to + '\u0000' + e.from);
      const dir = unit(sub(Q, P));
      const n = { x: -dir.y, y: dir.x };
      const mid = mul(add(P, Q), 0.5);
      const dist = len(sub(Q, P));
      let off;
      if (typeof custom === 'number') off = custom;
      else {
        // candidate bends (offset of the control point; the arc rises half as much):
        // a pair of opposite arrows bends to its own side; an arrow that would cross a state makes a wide
        // arc around it — the longer the arrow, the wider the arc, so nested long arrows do not tangle.
        // Positive = to the left of the direction of travel: arrows going right bend down, arrows going left bend up.
        const s1 = Math.max(60, 0.42 * dist), s2 = Math.max(95, 0.6 * dist), s3 = Math.max(130, 0.8 * dist);
        const tries = reverse ? [Math.max(34, 0.14 * dist), s1, s2] : [0, s1, -s1, s2, -s2, s3, -s3];
        off = tries[0];
        for (const o of tries) {
          const c = add(mid, mul(n, o));
          off = o;
          if (!blocked(add(P, mul(unit(sub(c, P)), R)), c, add(Q, mul(unit(sub(c, Q)), R + 1)), e.from, e.to)) break;
        }
      }
      const C = add(mid, mul(n, off));
      const S = add(P, mul(unit(sub(C, P)), R)), E = add(Q, mul(unit(sub(C, Q)), R + 1));
      const apex = add(add(mul(S, 0.25), mul(C, 0.5)), mul(E, 0.25));
      let side;
      if (Math.abs(off) > 1) side = off > 0 ? n : mul(n, -1);
      else {
        side = n.y <= 0 ? n : mul(n, -1);                     // above a straight arrow
        if (Math.abs(n.y) < 0.2) side = n.x >= 0 ? n : mul(n, -1);
      }
      return { d: `M${S.x},${S.y} Q${C.x},${C.y} ${E.x},${E.y}`, lp: add(apex, mul(side, 13)), apex, side, curve: [S, C, E] };
    }

    /** A point of an arrow (quadratic curve), t = 0 … 1, and the direction across it. */
    function onCurve([S, C, E], t) {
      const u = 1 - t;
      const d = { x: u * (C.x - S.x) + t * (E.x - C.x), y: u * (C.y - S.y) + t * (E.y - C.y) };
      return { p: { x: u * u * S.x + 2 * u * t * C.x + t * t * E.x, y: u * u * S.y + 2 * u * t * C.y + t * t * E.y }, n: unit({ x: -d.y, y: d.x }) };
    }

    /** Moves the labels of the arrows so that they do not lie on other labels, arrows or states. */
    function placeLabels(items) {
      const points = items.map(({ G }) => {
        const pts = [];
        if (G.curve) for (let t = 0.04; t < 1; t += 0.06) pts.push(onCurve(G.curve, t).p);
        return pts;
      });
      const placed = [];
      const boxOf = (p, text) => { const w = 4 * text.length + 3; return { x0: p.x - w, x1: p.x + w, y0: p.y - 9, y1: p.y + 9 }; };
      const cost = (box, self) => {
        let c = 0;
        for (const b of placed) if (box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1) c += 10;
        for (const q of A.states) {
          const s = A.pos[q];
          if (s && Math.hypot(Math.max(box.x0 - s.x, 0, s.x - box.x1), Math.max(box.y0 - s.y, 0, s.y - box.y1)) < R + 1) c += 8;
        }
        points.forEach((pts, i) => {
          if (i !== self && pts.some(p => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1)) c += 4;
        });
        return c;
      };
      items.forEach(it => { if (!it.G.curve) placed.push(boxOf(it.G.lp, it.text)); });   // loops stay where they are
      items.forEach((it, i) => {
        const g = it.G;
        if (!g.curve) return;
        let best = g.lp, bestCost = cost(boxOf(g.lp, it.text), i);
        for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73]) {
          if (bestCost === 0) break;
          const { p, n } = onCurve(g.curve, t);
          const out = n.x * g.side.x + n.y * g.side.y >= 0 ? n : mul(n, -1);
          for (const side of [out, mul(out, -1)]) {
            const at = add(p, mul(side, 13));
            const c = cost(boxOf(at, it.text), i) + Math.abs(t - 0.5) + (side === out ? 0 : 0.5);
            if (c < bestCost) { best = at; bestCost = c; }
          }
        }
        g.lp = best;
        placed.push(boxOf(best, it.text));
      });
    }

    /** The value of a hand-made arc for the pointer at p while dragging arrow from → to. */
    function arcFromPointer(from, to, p) {
      const P = A.pos[from];
      if (from === to) {
        let th = Math.atan2(p.y - P.y, p.x - P.x);
        const snap = Math.round(th / (Math.PI / 4)) * (Math.PI / 4);
        if (Math.abs(th - snap) < 0.16) th = snap;            // snap to the 8 main directions
        return Math.round(th * 1000) / 1000;
      }
      const Q = A.pos[to];
      const dir = unit(sub(Q, P));
      const n = { x: -dir.y, y: dir.x };
      const mid = mul(add(P, Q), 0.5);
      const off = 2 * ((p.x - mid.x) * n.x + (p.y - mid.y) * n.y);   // the apex sits half way to the control point
      return Math.abs(off) < 14 ? 0 : Math.round(off);       // close to the straight line: snap straight
    }

    /** Where the "new arrow" handle of a state sits: at the lower right unless an arrow is in the way there. */
    function connPoint(q) {
      const P = A.pos[q];
      const used = usedAngles(q, lastEdges);
      for (const e of lastEdges) if (e.from === q && e.to === q) used.push(typeof arcs()[arcKey(q, q)] === 'number' ? arcs()[arcKey(q, q)] : autoLoopAngle(q, lastEdges));
      const cands = [45, -45, 0, 90, -90, 135, -135, 180].map(d => d * Math.PI / 180);
      const gap = c => used.length ? Math.min(...used.map(u => angDist(c, u))) : 9;
      let best = cands.find(c => gap(c) > 0.5);
      if (best === undefined) best = cands.reduce((b, c) => gap(c) > gap(b) ? c : b);
      return { x: P.x + CONN_D * Math.cos(best), y: P.y + CONN_D * Math.sin(best) };
    }

    function connAt(p) {
      const q = connOwner();
      if (!q) return null;
      const c = connPoint(q);
      return Math.hypot(p.x - c.x, p.y - c.y) <= 12 ? q : null;
    }

    function render(automaton, v) {
      A = automaton; view = v || {};
      if (view.mode !== 'arrow') pendingFrom = null;
      if (pendingFrom && !A.states.includes(pendingFrom)) pendingFrom = null;
      draw();
      // the camera is adjusted from the drawing itself, then the diagram is drawn again
      if (!drag) {
        if (view.fit) { fit(); draw(); }
        else if (autoFit && ensureVisible()) draw();
      }
    }

    function draw() {
      if (!A) return;
      const { w, h } = size();
      svg.setAttribute('viewBox', [cam.x, cam.y, w / cam.k, h / cam.k].join(' '));
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
      svg.replaceChildren();
      defs();
      svg.dataset.mode = view.mode || 'select';

      const content = el('g', { class: 'content' }, svg);
      const edgeLayer = el('g', { class: 'edges' }, content);
      const stateLayer = el('g', { class: 'states' }, content);
      const activeEdges = view.activeEdges || new Set();
      const sel = view.selected;
      const all = root.Automata.edges(A);
      const pending = sel && sel.kind === 'edge' && !all.some(e => e.from === sel.from && e.to === sel.to);
      if (pending) all.push({ from: sel.from, to: sel.to, symbols: [], pending: true });
      const has = new Set(all.map(e => e.from + '\u0000' + e.to));
      lastEdges = all;

      const items = all.filter(e => A.pos[e.from] && A.pos[e.to])
        .map(e => ({ e, G: geom(e, has, all), text: e.pending ? '?' : e.symbols.join(', ') }));
      placeLabels(items);
      for (const { e, G, text } of items) {
        const key = e.from + '\u0000' + e.to;
        const isSel = sel && sel.kind === 'edge' && sel.from === e.from && sel.to === e.to;
        const isActive = activeEdges.has(key);
        const isBending = drag && drag.kind === 'bend' && drag.moved && drag.from === e.from && drag.to === e.to;
        const g = el('g', { class: 'edge' + (isSel ? ' sel' : '') + (isActive ? ' active' : '') + (e.pending ? ' pending' : '') + (isBending ? ' bending' : ''), 'data-from': e.from, 'data-to': e.to }, edgeLayer);
        const marker = `url(#${isSel || isBending ? 'arrow-sel' : isActive ? 'arrow-active' : 'arrow'})`;
        el('path', { d: G.d, class: 'edge-hit' }, g);
        el('path', { d: G.d, class: 'edge-line', 'marker-end': marker }, g);
        const t = el('text', { x: G.lp.x, y: G.lp.y, class: 'edge-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        t.textContent = text;
        // grab handle in the middle of the arrow: shown on hover and when selected (drag = bend / turn the loop)
        if (view.mode === 'select' && (isSel || isBending || hoverEdge === key)) {
          el('circle', { cx: G.apex.x, cy: G.apex.y, r: 6, class: 'bend-handle' }, g);
        }
      }

      if (A.initial && A.pos[A.initial]) {
        const p = A.pos[A.initial];
        el('path', { d: `M${p.x - R - 42},${p.y} L${p.x - R - 1},${p.y}`, class: 'edge-line initial', 'marker-end': 'url(#arrow)' }, edgeLayer);
      }

      const active = view.active || new Set();
      const colors = view.stateColors || null;
      for (const q of A.states) {
        const p = A.pos[q];
        if (!p) continue;
        const isSel = sel && sel.kind === 'state' && sel.id === q;
        const cls = ['state'];
        if (isSel) cls.push('sel');
        if (q === pendingFrom) cls.push('source');
        if (active.has(q)) cls.push('active');
        if (view.hoverState === q) cls.push('hover');
        if (view.hoverState && view.hoverState !== q) cls.push('faded');
        const g = el('g', { class: cls.join(' '), 'data-state': q, transform: `translate(${p.x},${p.y})` }, stateLayer);
        const c = el('circle', { r: R, class: 'state-circle' }, g);
        if (colors && colors[q]) { c.style.fill = colors[q] + '33'; c.style.stroke = colors[q]; }
        if (A.accepting.includes(q)) {
          const c2 = el('circle', { r: R - 5, class: 'state-inner' }, g);
          if (colors && colors[q]) c2.style.stroke = colors[q];
        }
        nameText(g, q);
      }

      // "new arrow" handle of the hovered (or selected) state
      const owner = connOwner();
      if (owner && !drag) {
        const c = connPoint(owner);
        const g = el('g', { class: 'conn', transform: `translate(${c.x},${c.y})` }, svg);
        el('title', {}, g).textContent = 'Drag to another state to draw an arrow (or onto empty space for a new state)';
        el('circle', { r: 9 }, g);
        el('path', { d: 'M-4,0 H4 M1,-3 L4,0 L1,3' }, g);
      }

      if (drag && drag.kind === 'edge' && drag.moved) {
        const P = A.pos[drag.from];
        const target = drag.over && A.pos[drag.over];
        const free = !drag.over && Math.hypot(drag.x - P.x, drag.y - P.y) > R + 46;
        const end = target && drag.over !== drag.from ? add(target, mul(unit(sub(P, target)), R + 1))
          : free ? add({ x: drag.x, y: drag.y }, mul(unit(sub(P, { x: drag.x, y: drag.y })), R + 1)) : { x: drag.x, y: drag.y };
        const S = add(P, mul(unit(sub(end, P)), R));
        if (drag.over === drag.from) {
          el('circle', { cx: P.x, cy: P.y, r: R + 6, class: 'ghost' }, svg);   // releasing here makes a loop
        } else {
          el('path', { d: `M${S.x},${S.y} L${end.x},${end.y}`, class: 'edge-line draft', 'marker-end': 'url(#arrow-sel)' }, svg);
          if (free) el('circle', { cx: drag.x, cy: drag.y, r: R, class: 'ghost' }, svg);   // releasing here makes a new state
        }
      }
    }

    function connOwner() {
      if (view.mode !== 'select') return null;
      if (hoverQ && A.pos[hoverQ]) return hoverQ;
      const sel = view.selected;
      return sel && sel.kind === 'state' && A.pos[sel.id] ? sel.id : null;
    }

    // ---------- interaction ----------

    svg.addEventListener('pointerdown', evt => {
      if (!A || evt.button > 1) return;
      const p = toLocal(evt);
      const conn = evt.button === 0 ? connAt(p) : null;
      const q = conn ? null : stateAt(p);
      const edgeEl = evt.target.closest && evt.target.closest('.edge');
      if (conn) {
        // the "new arrow" handle of a state: drag it to another state (or onto empty space)
        evt.preventDefault();
        svg.setPointerCapture(evt.pointerId);
        if (handlers.onDragStart) handlers.onDragStart();
        drag = { kind: 'edge', from: conn, x: p.x, y: p.y, sx: p.x, sy: p.y, over: null, moved: false, fromHandle: true };
        return;
      }
      if (evt.button === 1 || (!q && !edgeEl && view.mode !== 'state')) {
        // pan (background drag, or middle mouse button anywhere); a plain click still counts as a click
        evt.preventDefault();
        svg.setPointerCapture(evt.pointerId);
        drag = { kind: 'pan', cx: evt.clientX, cy: evt.clientY, cam0: { ...cam }, moved: false, p, middle: evt.button === 1 };
        return;
      }
      if (q) {
        evt.preventDefault();
        svg.setPointerCapture(evt.pointerId);
        if (handlers.onDragStart) handlers.onDragStart();
        if (view.mode === 'arrow' || evt.shiftKey) {
          drag = { kind: 'edge', from: q, x: p.x, y: p.y, sx: p.x, sy: p.y, over: q, moved: false };
        } else {
          A = root.Automata.clone(A);   // never mutate the app's (history) object while dragging
          const s = A.pos[q];
          drag = { kind: 'move', q, dx: p.x - s.x, dy: p.y - s.y, moved: false, start: { x: s.x, y: s.y } };
        }
      } else if (edgeEl && edgeEl.dataset.from !== undefined && view.mode !== 'state') {
        pendingFrom = null;
        const from = edgeEl.dataset.from, to = edgeEl.dataset.to;
        if (view.mode === 'select' && !edgeEl.classList.contains('pending')) {
          // grab the arrow: a click selects it, a drag bends it (or turns a loop around its state)
          evt.preventDefault();
          svg.setPointerCapture(evt.pointerId);
          drag = { kind: 'bend', from, to, sx: p.x, sy: p.y, moved: false };
        } else {
          handlers.onSelect({ kind: 'edge', from, to });
        }
      } else {
        pendingFrom = null;
        handlers.onBackground({ x: Math.round(p.x), y: Math.round(p.y) });
      }
    });

    svg.addEventListener('pointermove', evt => {
      if (!A) return;
      if (!drag) {
        // hover feedback: the state's arrow handle, the arrow's bend handle
        if (view.mode !== 'select') { if (hoverQ || hoverEdge) { hoverQ = hoverEdge = null; draw(); } return; }
        const p = toLocal(evt);
        const keepQ = connAt(p);
        const q = keepQ || stateAt(p) || (hoverQ && A.pos[hoverQ] && Math.hypot(p.x - A.pos[hoverQ].x, p.y - A.pos[hoverQ].y) < CONN_D + 12 ? hoverQ : null);
        const edgeEl = !q && evt.target.closest && evt.target.closest('.edge');
        const ek = edgeEl ? edgeEl.dataset.from + '\u0000' + edgeEl.dataset.to : null;
        svg.classList.toggle('over-conn', !!keepQ);
        if (q !== hoverQ || ek !== hoverEdge) { hoverQ = q; hoverEdge = ek; draw(); }
        return;
      }
      if (drag.kind === 'pan') {
        const dx = evt.clientX - drag.cx, dy = evt.clientY - drag.cy;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        if (!drag.moved && handlers.onDragStart) handlers.onDragStart();
        drag.moved = true;
        cam = { k: drag.cam0.k, x: drag.cam0.x - dx / drag.cam0.k, y: drag.cam0.y - dy / drag.cam0.k };
        autoFit = false;
        draw();
        return;
      }
      const p = toLocal(evt);
      if (drag.kind === 'move') {
        const nx = Math.round(p.x - drag.dx), ny = Math.round(p.y - drag.dy);
        if (Math.hypot(nx - drag.start.x, ny - drag.start.y) > 3) drag.moved = true;
        if (drag.moved) { A.pos[drag.q] = { x: nx, y: ny }; draw(); }
      } else if (drag.kind === 'bend') {
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
        if (!drag.moved) { drag.moved = true; A = root.Automata.clone(A); if (handlers.onDragStart) handlers.onDragStart(); }
        drag.value = arcFromPointer(drag.from, drag.to, p);
        A.arcs = Object.assign({}, A.arcs, { [arcKey(drag.from, drag.to)]: drag.value });
        draw();
      } else {
        drag.x = p.x; drag.y = p.y; drag.over = stateAt(p);
        if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
        if (drag.moved) draw();
      }
    });

    svg.addEventListener('pointerleave', () => { if (!drag && (hoverQ || hoverEdge)) { hoverQ = hoverEdge = null; draw(); } });

    function endDrag(evt, cancelled) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'pan') {
        if (d.moved) { if (handlers.onDragEnd) handlers.onDragEnd(); if (handlers.onCamera) handlers.onCamera(); }
        else if (!cancelled && !d.middle) {
          const src = pendingFrom;
          pendingFrom = null;
          // arrow tool: source picked, then a click on empty space → new state with an arrow to it
          if (src && view.mode === 'arrow' && handlers.onConnectNew) { handlers.onConnectNew(src, { x: Math.round(d.p.x), y: Math.round(d.p.y) }); return; }
          if (src) draw();
          handlers.onBackground({ x: Math.round(d.p.x), y: Math.round(d.p.y) });
        }
        return;
      }
      if (d.kind === 'bend') {
        if (!d.moved) { if (!cancelled) handlers.onSelect({ kind: 'edge', from: d.from, to: d.to }); return; }
        if (handlers.onDragEnd) handlers.onDragEnd();
        if (cancelled) { draw(); return; }
        handlers.onArc(d.from, d.to, d.value);
        return;
      }
      if (handlers.onDragEnd) handlers.onDragEnd();
      if (d.kind === 'move') {
        if (cancelled) return draw();
        if (d.moved) handlers.onMove(d.q, A.pos[d.q]);
        else {
          const now = Date.now();
          if (lastTap.q === d.q && now - lastTap.t < 350) { handlers.onToggleAccepting(d.q); lastTap = { t: 0, q: null }; return; }
          lastTap = { t: now, q: d.q };
          handlers.onSelect({ kind: 'state', id: d.q });
        }
        return;
      }
      // drawing an arrow (arrow tool, Shift-drag or a state's arrow handle)
      if (cancelled) { draw(); return; }
      const p = toLocal(evt);
      const target = stateAt(p);
      if (d.moved) {
        pendingFrom = null;
        const P = A.pos[d.from];
        if (target) handlers.onConnect(d.from, target);
        else if (Math.hypot(p.x - P.x, p.y - P.y) > R + 46 && handlers.onConnectNew) handlers.onConnectNew(d.from, { x: Math.round(p.x), y: Math.round(p.y) });
        else draw();
      } else if (d.fromHandle) {
        handlers.onConnect(d.from, d.from);      // a click on the handle: loop (it can be turned afterwards)
      } else if (pendingFrom === null) {
        pendingFrom = d.from;                    // first click: remember the source
        draw();
        if (handlers.onSourcePicked) handlers.onSourcePicked(d.from);
      } else {
        const from = pendingFrom;                // second click: create the arrow (same state = loop)
        pendingFrom = null;
        handlers.onConnect(from, d.from);
      }
    }
    svg.addEventListener('pointerup', evt => endDrag(evt, false));
    svg.addEventListener('pointercancel', evt => endDrag(evt, true));

    svg.addEventListener('wheel', evt => {
      if (!A) return;
      evt.preventDefault();
      const r = svg.getBoundingClientRect();
      const factor = Math.exp(-evt.deltaY * (evt.ctrlKey ? 0.01 : 0.0018));
      zoomAt(factor, evt.clientX - r.left, evt.clientY - r.top);
    }, { passive: false });

    svg.addEventListener('dblclick', evt => {
      if (!A || view.mode !== 'select') return;
      const p = toLocal(evt);
      if (stateAt(p) || connAt(p)) return;
      const edgeEl = evt.target.closest && evt.target.closest('.edge');
      if (edgeEl) {
        // double-click an arrow: back to the automatic shape
        if (typeof arcs()[arcKey(edgeEl.dataset.from, edgeEl.dataset.to)] === 'number') handlers.onArc(edgeEl.dataset.from, edgeEl.dataset.to, null);
        return;
      }
      handlers.onAddState({ x: Math.round(p.x), y: Math.round(p.y) });
    });

    /** Screen rectangle of a state or of an arrow label (for anchoring popovers). */
    function anchorRect(sel) {
      if (!sel) return null;
      if (sel.kind === 'state') {
        const g = Array.from(svg.querySelectorAll('.state')).find(n => n.dataset.state === sel.id);
        return g ? g.querySelector('.state-circle').getBoundingClientRect() : null;
      }
      const g = Array.from(svg.querySelectorAll('.edge')).find(n => n.dataset.from === sel.from && n.dataset.to === sel.to);
      if (!g) return null;
      const r = g.querySelector('.edge-label').getBoundingClientRect();
      // outer side of the arrow (where its label sits): popovers open there, away from the arrow itself
      const P = A.pos[sel.from], Q = A.pos[sel.to];
      const lx = +g.querySelector('.edge-label').getAttribute('x'), ly = +g.querySelector('.edge-label').getAttribute('y');
      const mid = sel.from === sel.to ? P : mul(add(P, Q), 0.5);
      const side = unit(sub({ x: lx, y: ly }, mid));
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, side };
    }

    /** World coordinates of the centre of the visible area (where new states go). */
    function visibleCenter() {
      const { w, h } = size();
      return { x: cam.x + (INS.left + (w - INS.left - INS.right) / 2) / cam.k, y: cam.y + (INS.top + (h - INS.top - INS.bottom) / 2) / cam.k };
    }

    return {
      render, anchorRect, visibleCenter,
      size,
      pendingSource: () => pendingFrom,
      fit: () => { fit(); draw(); },
      zoomIn: () => zoomAt(1.2),
      zoomOut: () => zoomAt(1 / 1.2),
      zoomLevel: () => cam.k,
      isAutoFit: () => autoFit,
    };
  }

  root.Graph = { createGraph, nameParts, PALETTE, R };
})(typeof self !== 'undefined' ? self : this);
