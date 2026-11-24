/*
 * Automata Lab — core logic (no DOM).
 *
 * Conventions follow the course book (Hromkovič) and the exercise sheets:
 *   FA   M = (Q, Σ, δ, q0, F) with δ: Q × Σ → Q        (δ must be total)
 *   NFA  M = (Q, Σ, δ, q0, F) with δ: Q × Σ → P(Q)     (no λ-transitions)
 *   λ = empty word,  δ̂ = extended transition function,
 *   Kl[q] = { w ∈ Σ* | δ̂(q0, w) = q }  (defined for FAs),
 *   L(M) = { w ∈ Σ* | δ̂(q0, w) ∈ F }   resp.  δ̂(q0, w) ∩ F ≠ ∅ for NFAs.
 *
 * An automaton is a plain JSON object:
 *   { type: 'FA' | 'NFA', states: [names], alphabet: [symbols], initial: name | null,
 *     accepting: [names], delta: { q: { a: [targets] } }, pos: { q: {x, y} } }
 * Both types share the same representation; an FA is one where every δ(q, a)
 * has exactly one target.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Automata = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LAMBDA = 'λ';
  const EMPTY_SET = '∅';

  // ---------- construction & helpers ----------

  function empty(type) {
    return { type: type || 'FA', states: [], alphabet: [], initial: null, accepting: [], delta: {}, pos: {}, arcs: {} };
  }

  /**
   * Hand-made arrow shapes, keyed "from to" (state names never contain spaces):
   *   arrow p → q (p ≠ q): bend = offset of the curve's control point, perpendicular to p→q
   *                         (0 = straight; positive = to the left of the direction of travel)
   *   loop q → q:          angle (radians) of the direction the loop points to
   * Arrows without an entry are shaped automatically.
   */
  function arcKey(p, q) { return p + ' ' + q; }

  function setArc(A, p, q, value) {
    const B = clone(A);
    B.arcs = B.arcs || {};
    if (value === null || value === undefined) delete B.arcs[arcKey(p, q)];
    else B.arcs[arcKey(p, q)] = value;
    return B;
  }

  /** Keeps only arc entries whose arrow still exists. */
  function pruneArcs(B) {
    const arcs = {};
    for (const k in (B.arcs || {})) {
      const [p, q] = k.split(' ');
      if (B.states.includes(p) && B.states.includes(q) && B.alphabet.some(a => targets(B, p, a).includes(q)) && isFinite(B.arcs[k])) arcs[k] = +B.arcs[k];
    }
    B.arcs = arcs;
    return B;
  }

  function clone(A) { return JSON.parse(JSON.stringify(A)); }

  /** Brings an arbitrary (e.g. imported) object into canonical form. Throws on malformed input. */
  function normalize(input) {
    if (!input || typeof input !== 'object') throw new Error('Not an automaton object.');
    const A = empty(input.type === 'NFA' ? 'NFA' : 'FA');
    const states = Array.isArray(input.states) ? input.states.map(String) : [];
    for (const q of states) {
      const err = checkStateName(q, A.states);
      if (err) throw new Error(err);
      A.states.push(q);
    }
    const alphabet = Array.isArray(input.alphabet) ? input.alphabet.map(String) : [];
    for (const a of alphabet) {
      const err = checkSymbol(a, A.alphabet);
      if (err) throw new Error(err);
      A.alphabet.push(a);
    }
    A.initial = A.states.includes(input.initial) ? input.initial : null;
    A.accepting = A.states.filter(q => Array.isArray(input.accepting) && input.accepting.includes(q));
    for (const q of A.states) {
      A.delta[q] = {};
      for (const a of A.alphabet) {
        const raw = input.delta && input.delta[q] && input.delta[q][a];
        const list = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
        A.delta[q][a] = sortStates(A, unique(list.map(String).filter(p => A.states.includes(p))));
      }
      const p = input.pos && input.pos[q];
      if (p && isFinite(p.x) && isFinite(p.y)) A.pos[q] = { x: +p.x, y: +p.y };
    }
    A.arcs = Object.assign({}, input.arcs || {});
    return pruneArcs(A);
  }

  function unique(list) { return Array.from(new Set(list)); }

  function sortStates(A, list) {
    const idx = new Map(A.states.map((q, i) => [q, i]));
    return list.slice().sort((p, q) => idx.get(p) - idx.get(q));
  }

  function checkStateName(name, existing) {
    if (typeof name !== 'string' || name.length === 0) return 'A state name must not be empty.';
    if (/[\s{}()]/.test(name)) return `State name "${name}" must not contain spaces, braces or parentheses.`;
    if (name === LAMBDA) return 'λ denotes the empty word and cannot be a state name.';
    if (name.length > 12) return `State name "${name}" is too long (max. 12 characters).`;
    if (existing && existing.includes(name)) return `There is already a state named "${name}".`;
    return null;
  }

  function checkSymbol(sym, existing) {
    if (typeof sym !== 'string' || Array.from(sym).length !== 1) return `Symbol "${sym}" must be a single character.`;
    if (sym === LAMBDA) return 'λ denotes the empty word and cannot be a symbol of Σ (no λ-transitions).';
    if (/[\s,{}()]/.test(sym)) return `"${sym}" cannot be used as a symbol.`;
    if (existing && existing.includes(sym)) return `Symbol "${sym}" appears twice in Σ.`;
    return null;
  }

  /** Splits "a, b" / "{q0, q1}" / "q0 q1" into items. */
  function parseList(str) {
    return String(str || '').replace(/[{}]/g, ' ').split(/[\s,;]+/).filter(Boolean);
  }

  /** Splits a word into symbols (by code point). "λ" or "" is the empty word. */
  function splitWord(w) {
    const s = String(w == null ? '' : w).trim();
    if (s === '' || s === LAMBDA) return [];
    return Array.from(s);
  }

  function nextStateName(A, prefix) {
    prefix = prefix || 'q';
    for (let i = 0; ; i++) if (!A.states.includes(prefix + i)) return prefix + i;
  }

  // ---------- editing (all return a new automaton) ----------

  function addState(A, name, pos) {
    const B = clone(A);
    name = name || nextStateName(B);
    const err = checkStateName(name, B.states);
    if (err) throw new Error(err);
    B.states.push(name);
    B.delta[name] = {};
    for (const a of B.alphabet) B.delta[name][a] = [];
    if (pos) B.pos[name] = { x: pos.x, y: pos.y };
    if (B.initial === null) B.initial = name;
    return B;
  }

  function removeState(A, q) {
    const B = clone(A);
    B.states = B.states.filter(p => p !== q);
    B.accepting = B.accepting.filter(p => p !== q);
    if (B.initial === q) B.initial = null;
    delete B.delta[q];
    delete B.pos[q];
    for (const p of B.states) for (const a of B.alphabet) B.delta[p][a] = B.delta[p][a].filter(r => r !== q);
    return pruneArcs(B);
  }

  function renameState(A, oldName, newName) {
    if (oldName === newName) return A;
    const err = checkStateName(newName, A.states);
    if (err) throw new Error(err);
    const B = clone(A);
    const ren = p => (p === oldName ? newName : p);
    B.states = B.states.map(ren);
    B.accepting = B.accepting.map(ren);
    B.initial = B.initial === null ? null : ren(B.initial);
    const delta = {};
    for (const p of A.states) {
      delta[ren(p)] = {};
      for (const a of A.alphabet) delta[ren(p)][a] = A.delta[p][a].map(ren);
    }
    B.delta = delta;
    if (A.pos[oldName]) { B.pos[newName] = A.pos[oldName]; delete B.pos[oldName]; }
    B.arcs = {};
    for (const k in (A.arcs || {})) { const [p, q] = k.split(' '); B.arcs[arcKey(ren(p), ren(q))] = A.arcs[k]; }
    return B;
  }

  function setInitial(A, q) { const B = clone(A); B.initial = q; return B; }

  function setAccepting(A, q, on) {
    const B = clone(A);
    const set = new Set(B.accepting);
    if (on) set.add(q); else set.delete(q);
    B.accepting = B.states.filter(p => set.has(p));
    return B;
  }

  function setAlphabet(A, symbols) {
    const B = clone(A);
    const list = [];
    for (const a of symbols) {
      const err = checkSymbol(a, list);
      if (err) throw new Error(err);
      list.push(a);
    }
    B.alphabet = list;
    for (const q of B.states) {
      const row = {};
      for (const a of list) row[a] = (A.delta[q] && A.delta[q][a]) ? A.delta[q][a].slice() : [];
      B.delta[q] = row;
    }
    return B;
  }

  function targets(A, q, a) { return (A.delta[q] && A.delta[q][a]) || []; }

  function setTargets(A, q, a, list) {
    const B = clone(A);
    for (const p of list) if (!B.states.includes(p)) throw new Error(`Unknown state "${p}".`);
    B.delta[q][a] = sortStates(B, unique(list));
    return pruneArcs(B);
  }

  /** Symbols a with r ∈ δ(p, a). */
  function edgeSymbols(A, p, r) { return A.alphabet.filter(a => targets(A, p, a).includes(r)); }

  /**
   * Sets the symbols of the arrow p → r. Unknown symbols are added to Σ.
   * For an FA, a new arrow replaces the previous target of δ(p, a) (δ is a function).
   */
  function setEdgeSymbols(A, p, r, symbols) {
    let B = clone(A);
    const missing = unique(symbols).filter(a => !B.alphabet.includes(a));
    if (missing.length) B = setAlphabet(B, B.alphabet.concat(missing));
    const want = new Set(symbols);
    for (const a of B.alphabet) {
      const cur = B.delta[p][a];
      const has = cur.includes(r);
      if (want.has(a) && !has) B.delta[p][a] = B.type === 'FA' ? [r] : sortStates(B, cur.concat(r));
      if (!want.has(a) && has) B.delta[p][a] = cur.filter(x => x !== r);
    }
    return pruneArcs(B);
  }

  function edges(A) {
    const out = [];
    for (const p of A.states) for (const r of A.states) {
      const syms = edgeSymbols(A, p, r);
      if (syms.length) out.push({ from: p, to: r, symbols: syms });
    }
    return out;
  }

  /** Adds a fresh non-accepting state that collects all undefined transitions (FA completion). */
  function addTrapState(A) {
    let B = addState(A, nextStateName(A));
    const trap = B.states[B.states.length - 1];
    for (const q of B.states) for (const a of B.alphabet) if (B.delta[q][a].length === 0) B.delta[q][a] = [trap];
    const ps = Object.values(A.pos);
    if (ps.length) {
      const maxX = Math.max(...ps.map(p => p.x));
      const avgY = ps.reduce((s, p) => s + p.y, 0) / ps.length;
      B.pos[trap] = { x: maxX + 130, y: avgY };
    }
    return B;
  }

  function setType(A, type) { const B = clone(A); B.type = type; return B; }

  // ---------- analysis ----------

  function isDeterministic(A) {
    return A.states.every(q => A.alphabet.every(a => targets(A, q, a).length <= 1));
  }

  function undefinedTransitions(A) {
    const out = [];
    for (const q of A.states) for (const a of A.alphabet) if (targets(A, q, a).length === 0) out.push([q, a]);
    return out;
  }

  function nondeterministicTransitions(A) {
    const out = [];
    for (const q of A.states) for (const a of A.alphabet) if (targets(A, q, a).length > 1) out.push([q, a]);
    return out;
  }

  function reachableStates(A) {
    if (A.initial === null) return new Set();
    const seen = new Set([A.initial]);
    const queue = [A.initial];
    while (queue.length) {
      const q = queue.shift();
      for (const a of A.alphabet) for (const p of targets(A, q, a)) if (!seen.has(p)) { seen.add(p); queue.push(p); }
    }
    return seen;
  }

  /** Checks against the formal definition. Each issue: { level: 'error'|'warning'|'info', text, fix? }. */
  function validate(A) {
    const issues = [];
    const kind = A.type === 'FA' ? 'finite automaton' : 'nondeterministic finite automaton';
    if (A.states.length === 0) {
      issues.push({ level: 'info', text: 'Q is empty — double-click the canvas to add a state.' });
      return issues;
    }
    if (A.alphabet.length === 0) issues.push({ level: 'error', text: 'Σ is empty — an alphabet must be a non-empty finite set.' });
    if (A.initial === null) issues.push({ level: 'error', text: 'No initial state q0 has been chosen.' });
    if (A.type === 'FA') {
      const nd = nondeterministicTransitions(A);
      if (nd.length) issues.push({
        level: 'error',
        text: `Not a ${kind}: ${nd.map(([q, a]) => `δ(${q}, ${a})`).join(', ')} ${nd.length === 1 ? 'has' : 'have'} more than one target state. Switch to NFA or remove arrows.`,
      });
      const und = undefinedTransitions(A);
      if (und.length) issues.push({
        level: 'error',
        text: `δ must be total (δ: Q × Σ → Q), but ${und.map(([q, a]) => `δ(${q}, ${a})`).join(', ')} ${und.length === 1 ? 'is' : 'are'} undefined.`,
        fix: 'trap',
      });
    }
    if (A.initial !== null) {
      const reach = reachableStates(A);
      const unreach = A.states.filter(q => !reach.has(q));
      if (unreach.length) issues.push({
        level: 'info',
        text: `Not reachable from q0: ${unreach.join(', ')}` + (A.type === 'FA' ? ` (so Kl[${unreach[0]}] = ∅${unreach.length > 1 ? ', etc.' : ''}).` : '.'),
      });
    }
    if (A.accepting.length === 0) issues.push({ level: 'info', text: 'F = ∅, so L(M) = ∅.' });
    return issues;
  }

  /** δ̂ for a set of states (NFA semantics; also works for FAs). */
  function deltaHatSet(A, S, symbols) {
    let cur = sortStates(A, unique(S));
    for (const a of symbols) cur = stepSet(A, cur, a);
    return cur;
  }

  function stepSet(A, S, a) {
    const out = new Set();
    for (const q of S) for (const p of targets(A, q, a)) out.add(p);
    return sortStates(A, Array.from(out));
  }

  /**
   * Runs an FA on w. Returns the computation as configurations (q, rest):
   *   { configs: [{ state, rest: [symbols] }], status: 'accepted'|'rejected'|'stuck'|'invalid', ... }
   * 'stuck': δ(q, a) undefined (δ not total); 'invalid': symbol not in Σ or no initial state.
   */
  function runFA(A, word) {
    const w = Array.isArray(word) ? word : splitWord(word);
    const bad = w.find(a => !A.alphabet.includes(a));
    if (A.initial === null) return { configs: [], status: 'invalid', reason: 'No initial state.' };
    if (bad !== undefined) return { configs: [], status: 'invalid', reason: `"${bad}" is not a symbol of Σ.` };
    const configs = [{ state: A.initial, rest: w.slice(0) }];
    let q = A.initial;
    for (let i = 0; i < w.length; i++) {
      const t = targets(A, q, w[i]);
      if (t.length !== 1) return { configs, status: 'stuck', at: i, state: q, symbol: w[i], targets: t };
      q = t[0];
      configs.push({ state: q, rest: w.slice(i + 1) });
    }
    return { configs, status: A.accepting.includes(q) ? 'accepted' : 'rejected', final: q };
  }

  /** Runs an NFA on w: sets[i] = δ̂(q0, w1…wi). */
  function runNFA(A, word) {
    const w = Array.isArray(word) ? word : splitWord(word);
    const bad = w.find(a => !A.alphabet.includes(a));
    if (A.initial === null) return { sets: [], status: 'invalid', reason: 'No initial state.' };
    if (bad !== undefined) return { sets: [], status: 'invalid', reason: `"${bad}" is not a symbol of Σ.` };
    const sets = [[A.initial]];
    for (const a of w) sets.push(stepSet(A, sets[sets.length - 1], a));
    const last = sets[sets.length - 1];
    const hit = last.filter(q => A.accepting.includes(q));
    return { sets, status: hit.length ? 'accepted' : 'rejected', acceptingHit: hit };
  }

  function accepts(A, word) {
    const r = A.type === 'FA' && isDeterministic(A) ? runFA(A, word) : runNFA(A, word);
    return r.status === 'accepted';
  }

  /**
   * Tree of all computations of an NFA on w. Node: { id, state, depth, children, parent }.
   * Stops after `limit` nodes (truncated = true).
   */
  function computationTree(A, word, limit) {
    limit = limit || 400;
    const w = Array.isArray(word) ? word : splitWord(word);
    if (A.initial === null) return { root: null, nodes: [], truncated: false };
    let id = 0;
    const root = { id: id++, state: A.initial, depth: 0, children: [], parent: null };
    const nodes = [root];
    let frontier = [root];
    let truncated = false;
    for (let i = 0; i < w.length && !truncated; i++) {
      const next = [];
      for (const n of frontier) {
        for (const p of targets(A, n.state, w[i])) {
          if (nodes.length >= limit) { truncated = true; break; }
          const c = { id: id++, state: p, depth: i + 1, children: [], parent: n };
          n.children.push(c); nodes.push(c); next.push(c);
        }
        if (truncated) break;
      }
      frontier = next;
    }
    return { root, nodes, truncated, length: w.length };
  }

  /** All words of Σ^{≤n} in canonical order (by length, then lexicographically w.r.t. the order of Σ). */
  function wordsUpTo(alphabet, n) {
    const out = [[]];
    let layer = [[]];
    for (let len = 1; len <= n; len++) {
      const next = [];
      for (const w of layer) for (const a of alphabet) next.push(w.concat(a));
      out.push(...next);
      layer = next;
    }
    return out;
  }

  /**
   * Classes Kl[q] of an FA, restricted to words of length ≤ n, plus the exact shortest word of each class.
   * Words on which δ is undefined belong to no class (only possible when δ is not total).
   */
  function classes(A, n) {
    const byState = {};
    for (const q of A.states) byState[q] = [];
    const none = [];
    const tree = prefixTree(A, n);
    for (const node of tree) {
      if (node.state === null) none.push(node.word); else byState[node.state].push(node.word);
    }
    return { byState, none, shortest: shortestWords(A) };
  }

  /** Prefix tree of Σ^{≤n}: node = { word: [symbols], state | null, parent index, depth }. */
  function prefixTree(A, n) {
    const nodes = [];
    if (A.initial === null) return nodes;
    nodes.push({ word: [], state: A.initial, parent: -1, depth: 0 });
    let start = 0;
    for (let d = 1; d <= n; d++) {
      const end = nodes.length;
      for (let i = start; i < end; i++) {
        const par = nodes[i];
        for (const a of A.alphabet) {
          const t = par.state === null ? [] : targets(A, par.state, a);
          nodes.push({ word: par.word.concat(a), state: t.length === 1 ? t[0] : null, parent: i, depth: d });
        }
      }
      start = end;
    }
    return nodes;
  }

  /** Shortest (canonically smallest) word w with δ̂(q0, w) = q, or null if q is unreachable. FA semantics. */
  function shortestWords(A) {
    const res = {};
    for (const q of A.states) res[q] = null;
    if (A.initial === null) return res;
    res[A.initial] = [];
    const queue = [A.initial];
    while (queue.length) {
      const q = queue.shift();
      for (const a of A.alphabet) {
        const t = targets(A, q, a);
        if (t.length !== 1) continue;
        if (res[t[0]] === null) { res[t[0]] = res[q].concat(a); queue.push(t[0]); }
      }
    }
    return res;
  }

  // ---------- languages: comparison, subset construction, exercises ----------

  /**
   * Shortest word (canonical order) on which `answer` and the target language differ, or null.
   * target = { automata: [M1, M2, …], combine: (accepted1, accepted2, …) => boolean, alphabet }.
   * Works for FAs and NFAs alike (sets of states; an undefined transition means ∅).
   */
  function findDifference(answer, target, limit) {
    limit = limit || 200000;
    const all = [answer].concat(target.automata);
    const sigma = target.alphabet;
    const start = all.map(M => (M.initial === null ? [] : [M.initial]));
    const verdict = sets => {
      const acc = sets.map((S, i) => S.some(q => all[i].accepting.includes(q)));
      return { answer: acc[0], inL: !!target.combine.apply(null, acc.slice(1)) };
    };
    const key = sets => sets.map(S => S.join('\u0001')).join('\u0002');
    const seen = new Set([key(start)]);
    const queue = [{ sets: start, word: [] }];
    while (queue.length) {
      const { sets, word } = queue.shift();
      const v = verdict(sets);
      if (v.answer !== v.inL) return { word, answerAccepts: v.answer, inL: v.inL };
      if (seen.size > limit) break;
      for (const a of sigma) {
        const next = sets.map((S, i) => (all[i].alphabet.includes(a) ? stepSet(all[i], S, a) : []));
        const k = key(next);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ sets: next, word: word.concat(a) });
      }
    }
    return null;
  }

  /** Reachable states of the powerset construction for an NFA: list of subsets (⟨∅⟩ included when reachable). */
  function subsetStates(N) {
    if (N.initial === null) return [];
    const start = [N.initial];
    const seen = new Map([[start.join('\u0001'), start]]);
    const queue = [start];
    while (queue.length) {
      const S = queue.shift();
      for (const a of N.alphabet) {
        const T = stepSet(N, S, a);
        const k = T.join('\u0001');
        if (!seen.has(k)) { seen.set(k, T); queue.push(T); }
      }
    }
    return Array.from(seen.values());
  }

  /** Reachable states of the product construction of two FAs: list of pairs [p, q]. */
  function productStates(A1, A2) {
    if (A1.initial === null || A2.initial === null) return [];
    const sigma = A1.alphabet.filter(a => A2.alphabet.includes(a));
    const start = [A1.initial, A2.initial];
    const seen = new Map([[start.join('\u0001'), start]]);
    const queue = [start];
    while (queue.length) {
      const [p, q] = queue.shift();
      for (const a of sigma) {
        const t1 = targets(A1, p, a), t2 = targets(A2, q, a);
        if (t1.length !== 1 || t2.length !== 1) continue;
        const P = [t1[0], t2[0]], k = P.join('\u0001');
        if (!seen.has(k)) { seen.set(k, P); queue.push(P); }
      }
    }
    return Array.from(seen.values());
  }

  const OPS = {
    union: { symbol: '∪', name: 'union', f: (x, y) => x || y },
    intersection: { symbol: '∩', name: 'intersection', f: (x, y) => x && y },
    difference: { symbol: '−', name: 'difference', f: (x, y) => x && !y },
  };

  /** Target language of an exercise as { automata, combine, alphabet }. */
  function exerciseTarget(ex) {
    if (ex.kind === 'construct') return { automata: [ex.solution], combine: x => x, alphabet: ex.solution.alphabet };
    if (ex.kind === 'product') return { automata: [ex.A1, ex.A2], combine: OPS[ex.op].f, alphabet: unique(ex.A1.alphabet.concat(ex.A2.alphabet)) };
    if (ex.kind === 'powerset') return { automata: [ex.nfa], combine: x => x, alphabet: ex.nfa.alphabet };
    throw new Error('Unknown kind of exercise.');
  }

  /** The automaton type the answer must have. */
  function requiredType(ex) {
    if (ex.kind === 'construct') return ex.require || 'any';
    return 'FA';   // product and powerset construction both produce finite automata
  }

  /**
   * Checks an answer (an automaton) against an exercise.
   * → { ok, problems: [text], counterexample: { word, answerAccepts, inL } | null, info: [text] }
   * Problems (definition, requirements, Σ) are reported first; otherwise the only feedback on a wrong
   * answer is the shortest counterexample.
   */
  function checkExercise(ex, answer) {
    const problems = [], info = [];
    const target = exerciseTarget(ex);
    const req = requiredType(ex);
    if (!answer.states.length) problems.push('Your automaton has no states yet.');
    if (req === 'FA' && answer.type !== 'FA') problems.push('This exercise asks for a finite automaton (FA), not an NFA.');
    if (req === 'NFA' && answer.type !== 'NFA') problems.push('This exercise asks for a nondeterministic finite automaton (NFA).');
    for (const i of validate(answer)) if (i.level === 'error') problems.push(i.text);
    if (ex.kind === 'construct' && ex.maxStates && answer.states.length > ex.maxStates) {
      problems.push(`At most ${ex.maxStates} states are allowed — your automaton has ${answer.states.length}.`);
    }
    const want = target.alphabet.slice().sort().join(','), have = answer.alphabet.slice().sort().join(',');
    if (want !== have) problems.push(`Σ must be {${target.alphabet.join(', ')}}, but your Σ is {${answer.alphabet.join(', ')}}.`);
    if (problems.length) return { ok: false, problems, counterexample: null, info };

    const diff = findDifference(answer, target);
    if (diff) return { ok: false, problems, counterexample: diff, info };
    if (ex.kind === 'powerset') {
      const n = subsetStates(ex.nfa).length;
      info.push(`The powerset construction has ${n} reachable state${n === 1 ? '' : 's'}; your FA has ${answer.states.length}.`);
    }
    if (ex.kind === 'product') {
      const n = productStates(ex.A1, ex.A2).length;
      info.push(`The product construction has ${n} reachable state${n === 1 ? '' : 's'}; your FA has ${answer.states.length}.`);
    }
    return { ok: true, problems, counterexample: null, info };
  }

  /** Brings an exercise object (e.g. from a link) into canonical form. Throws on malformed input. */
  function normalizeExercise(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Not an exercise.');
    const ex = { v: 1, kind: raw.kind, title: String(raw.title || '').slice(0, 80), text: String(raw.text || '') };
    if (raw.code && normalizeCode(raw.code)) ex.code = normalizeCode(raw.code);
    if (ex.kind === 'construct') {
      ex.solution = normalize(raw.solution);
      ex.require = ['FA', 'NFA', 'any'].includes(raw.require) ? raw.require : 'any';
      ex.maxStates = raw.maxStates ? Math.max(1, Math.min(99, Math.floor(+raw.maxStates))) : null;
    } else if (ex.kind === 'product') {
      ex.A1 = normalize(raw.A1); ex.A2 = normalize(raw.A2);
      ex.op = OPS[raw.op] ? raw.op : 'union';
    } else if (ex.kind === 'powerset') {
      ex.nfa = normalize(raw.nfa);
    } else throw new Error('Unknown kind of exercise.');
    return ex;
  }

  /** Exercise codes: letters, digits and dashes, 2–16 characters, case-insensitive (stored in upper case). */
  function normalizeCode(s) {
    const c = String(s || '').trim().toUpperCase().replace(/\s+/g, '-');
    return /^[A-Z0-9][A-Z0-9_-]{1,15}$/.test(c) ? c : null;
  }

  // ---------- formatting ----------

  function fmtWord(w) {
    const s = Array.isArray(w) ? w.join('') : String(w);
    return s === '' ? LAMBDA : s;
  }

  function fmtSet(list) { return list.length ? `{${list.join(', ')}}` : EMPTY_SET; }

  /**
   * Layered layout in the style of the exercise solutions: the initial state on the left, then one
   * column per distance from q0 (reading direction left → right). A state stays in the row of the
   * state it is first reached from, so chains are straight and branches fan out above/below.
   * Trash states (non-accepting, only loops, entered from several states) go in a row underneath.
   * States not reachable from q0 are placed in extra rows below.
   */
  function layeredLayout(A) {
    const B = clone(A);
    B.arcs = {};                           // a fresh layout also gets fresh, automatic arrow shapes
    const DX = 150, DY = 120;
    const succ = q => unique([].concat(...A.alphabet.map(a => targets(A, q, a)))).filter(p => p !== q);
    const preds = q => A.states.filter(p => p !== q && succ(p).includes(q));
    const isTrash = q => A.states.length >= 3 && q !== A.initial && !A.accepting.includes(q) &&
      A.alphabet.every(a => targets(A, q, a).every(p => p === q)) && preds(q).length >= 2;
    const trash = A.states.filter(isTrash);

    const layer = {}, row = {};
    const used = {};                       // layer → Set of rows
    const take = (l, r) => { (used[l] = used[l] || new Set()).add(r); };
    const free = (l, r) => !(used[l] && used[l].has(r));
    const nearest = (l, d) => { for (let i = 0; ; i++) { if (free(l, d + i)) return d + i; if (i && free(l, d - i)) return d - i; } };
    let bottom = 0;                        // lowest row used so far

    const roots = [];
    if (A.initial !== null) roots.push(A.initial);
    for (const q of A.states) if (!roots.includes(q) && !trash.includes(q)) roots.push(q);
    for (const r0 of roots) {
      if (layer[r0] !== undefined) continue;
      const base = Object.keys(layer).length ? bottom + 1 : 0;
      layer[r0] = 0; row[r0] = base; take(0, base); bottom = Math.max(bottom, base);
      const queue = [r0];
      while (queue.length) {
        const q = queue.shift();
        for (const p of succ(q)) {
          if (layer[p] !== undefined || trash.includes(p)) continue;
          layer[p] = layer[q] + 1;
          row[p] = nearest(layer[p], row[q]);
          take(layer[p], row[p]);
          bottom = Math.max(bottom, row[p]);
          queue.push(p);
        }
      }
    }
    const minRow = Math.min(0, ...Object.values(row));
    for (const q of Object.keys(layer)) B.pos[q] = { x: layer[q] * DX, y: (row[q] - minRow) * DY };
    // trash states: one row below everything, under the states that lead into them
    const yTrash = (bottom - minRow + 1) * DY;
    const placed = [];
    for (const t of trash) {
      const ps = preds(t).filter(p => B.pos[p] && layer[p] !== undefined);
      let x = ps.length ? ps.reduce((s, p) => s + B.pos[p].x, 0) / ps.length : 0;
      x = Math.round(x / (DX / 2)) * (DX / 2);
      while (placed.some(px => Math.abs(px - x) < DX)) x += DX;
      placed.push(x);
      B.pos[t] = { x, y: yTrash };
    }
    for (const q of B.states) B.pos[q] = { x: B.pos[q].x + 100, y: B.pos[q].y + 100 };
    return B;
  }

  /** Gives every state a position: keeps existing ones, or lays out everything if some are missing. */
  function autoLayout(A, force) {
    if (!force && A.states.every(q => A.pos[q])) return clone(A);
    return layeredLayout(A);
  }

  // ---------- examples (generic, not taken from the exercise sheets; no positions → laid out with layeredLayout) ----------

  const EXAMPLES = [
    {
      title: 'FA: w contains the subword ab',
      subtitle: 'Basic — one state per prefix of ab',
      automaton: {
        type: 'FA', states: ['q_λ', 'q_a', 'q_ab'], alphabet: ['a', 'b'], initial: 'q_λ', accepting: ['q_ab'],
        delta: { 'q_λ': { a: ['q_a'], b: ['q_λ'] }, 'q_a': { a: ['q_a'], b: ['q_ab'] }, 'q_ab': { a: ['q_ab'], b: ['q_ab'] } },
      },
    },
    {
      title: 'FA: |w|ₐ even and w ends with ab',
      subtitle: 'Advanced — product automaton, rₓ,ᵢ = ⟨pₓ, qᵢ⟩',
      automaton: {
        type: 'FA',
        states: ['r_λ,0', 'r_a,0', 'r_ab,0', 'r_λ,1', 'r_a,1', 'r_ab,1'],
        alphabet: ['a', 'b'], initial: 'r_λ,0', accepting: ['r_ab,0'],
        delta: {
          'r_λ,0': { a: ['r_a,1'], b: ['r_λ,0'] }, 'r_a,0': { a: ['r_a,1'], b: ['r_ab,0'] }, 'r_ab,0': { a: ['r_a,1'], b: ['r_λ,0'] },
          'r_λ,1': { a: ['r_a,0'], b: ['r_λ,1'] }, 'r_a,1': { a: ['r_a,0'], b: ['r_ab,1'] }, 'r_ab,1': { a: ['r_a,0'], b: ['r_λ,1'] },
        },
      },
    },
    {
      title: 'NFA: third-to-last symbol is a',
      subtitle: 'Guesses where the last three symbols begin',
      automaton: {
        type: 'NFA', states: ['q0', 'q1', 'q2', 'q3'], alphabet: ['a', 'b'], initial: 'q0', accepting: ['q3'],
        delta: { q0: { a: ['q0', 'q1'], b: ['q0'] }, q1: { a: ['q2'], b: ['q2'] }, q2: { a: ['q3'], b: ['q3'] }, q3: { a: [], b: [] } },
      },
    },
  ];


  return {
    LAMBDA, EMPTY_SET, EXAMPLES,
    empty, clone, normalize, checkStateName, checkSymbol, parseList, splitWord, nextStateName,
    addState, removeState, renameState, setInitial, setAccepting, setAlphabet, targets, setTargets,
    edgeSymbols, setEdgeSymbols, edges, addTrapState, setType, arcKey, setArc, pruneArcs,
    isDeterministic, undefinedTransitions, nondeterministicTransitions, reachableStates, validate,
    deltaHatSet, stepSet, runFA, runNFA, accepts, computationTree, wordsUpTo, classes, prefixTree, shortestWords,
    fmtWord, fmtSet, autoLayout, layeredLayout,
    OPS, findDifference, subsetStates, productStates, exerciseTarget, requiredType, checkExercise, normalizeExercise, normalizeCode,
  };
});
