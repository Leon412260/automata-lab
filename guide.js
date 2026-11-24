/* Automata Lab — short animated welcome guide (shown when the app opens). */
(function (root) {
  'use strict';
  const KEY = 'automata-lab:guide-hidden';

  const defs = `<defs><marker id="gah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="ah" d="M0,0.5 L10,5 L0,9.5 z"/></marker></defs>`;
  const st = (x, y, name, cls, id) => `<g class="${cls || ''}"${id ? ` id="${id}"` : ''}><circle class="gs" cx="${x}" cy="${y}" r="24"/><text class="gt" text-anchor="middle" x="${x}" y="${y + 6}">q<tspan font-size="13" dy="4" font-style="normal">${name}</tspan></text></g>`;

  const SLIDES = [
    {
      title: 'Build your automaton',
      text: 'Pick <b>State</b> and click on the canvas. To draw an arrow, drag the blue <b>➜</b> next to a state onto another state — or onto empty space for a new one. Drag an arrow to bend it, drag a loop to move it around its state.',
      art: () => `<svg class="ga" viewBox="0 0 400 210">${defs}
        ${st(120, 105, '0', 'pop1 d1')}
        ${st(280, 105, '1', 'pop1 d2')}
        <g class="fadein" style="animation-delay:.6s"><circle cx="160" cy="105" r="9" class="acc"/><path d="M156 105 H164 M161 102 L164 105 L161 108" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>
        <path class="ge draw d3" style="animation-delay:1s" d="M144 105 L255 105" marker-end="url(#gah)"/>
        <text class="gl fadein" style="animation-delay:1.7s" x="194" y="92">a</text>
        <g class="fadein" style="animation-delay:2s"><rect x="132" y="160" width="136" height="30" rx="9" fill="var(--surface)" stroke="var(--line-2)"/>
          <rect x="136" y="164" width="40" height="22" rx="6" fill="var(--soft)"/><rect x="180" y="164" width="40" height="22" rx="6" fill="var(--ink)"/><rect x="224" y="164" width="40" height="22" rx="6" fill="var(--soft)"/>
          <text x="156" y="179" font-size="10" text-anchor="middle" fill="var(--muted)" font-family="Inter,sans-serif">Select</text>
          <text x="200" y="179" font-size="10" text-anchor="middle" fill="var(--on-ink)" font-family="Inter,sans-serif">State</text>
          <text x="244" y="179" font-size="10" text-anchor="middle" fill="var(--muted)" font-family="Inter,sans-serif">Arrow</text></g>
      </svg>`,
    },
    {
      title: 'Initial and accepting states',
      text: 'Click a state to edit it: make it <b>accepting</b> (double circle) or <b>initial</b> (incoming arrow), rename or delete it. Click an arrow to choose its symbols.',
      art: () => `<svg class="ga" viewBox="0 0 400 210">${defs}
        <path class="ge" d="M58 90 L95 90" marker-end="url(#gah)"/>
        ${st(120, 90, '0')}
        <path class="ge" d="M144 90 L255 90" marker-end="url(#gah)"/>
        <text class="gl" x="194" y="78">a</text>
        ${st(280, 90, '1')}
        <circle class="gs ring" cx="280" cy="90" r="19" style="fill:none"/>
        <g class="fadein" style="animation-delay:.4s">
          <rect x="222" y="132" width="150" height="40" rx="12" fill="var(--surface)" stroke="var(--line-2)"/>
          <rect x="230" y="139" width="74" height="26" rx="13" fill="var(--ink)"/>
          <text x="267" y="156" font-size="11" text-anchor="middle" fill="var(--on-ink)" font-family="Inter,sans-serif">Accepting</text>
          <rect x="309" y="139" width="56" height="26" rx="13" fill="var(--surface)" stroke="var(--line-2)"/>
          <text x="337" y="156" font-size="11" text-anchor="middle" fill="var(--muted)" font-family="Inter,sans-serif">Initial</text>
        </g>
        <g class="cursor"><path d="M268 150 l0 16 l4 -4 l3 7 l3 -1.4 l-3 -7 l6 0 z" fill="var(--ink)" stroke="var(--surface)" stroke-width="1.2"/></g>
      </svg>`,
    },
    {
      title: 'Simulate a word',
      text: 'In <b>Simulation</b>, type a word and press <b>Step</b>. You see every configuration (<i>q</i>, <i>w</i>) ⊢ (<i>p</i>, <i>w′</i>), the states that are active, and why the word is accepted or rejected.',
      // same look as the real simulation: active state and arrow in blue, tape with read / next symbol,
      // the computation as configurations and the verdict — stepped by a timer (see animateSim)
      sim: true,
      art: () => `<svg class="ga gsim" viewBox="0 0 400 210">${defs}
        <defs><marker id="gah-act" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="acc" d="M0,0.5 L10,5 L0,9.5 z"/></marker></defs>
        <path class="ge" d="M22 62 L45 62" marker-end="url(#gah)"/>
        <path class="ge" id="ge0" d="M94 62 L175 62" marker-end="url(#gah)"/><text class="gl" id="gl0" x="134" y="50" text-anchor="middle">a</text>
        <path class="ge" id="ge1" d="M224 62 L305 62" marker-end="url(#gah)"/><text class="gl" id="gl1" x="264" y="50" text-anchor="middle">b</text>
        ${st(70, 62, '0', '', 'gs0')}${st(200, 62, '1', '', 'gs1')}${st(330, 62, '2', '', 'gs2')}
        <circle class="gs inner" cx="330" cy="62" r="19" style="fill:none"/>
        <g transform="translate(166 108)">
          <rect id="gc0" class="gcell" x="0" y="0" width="34" height="34" rx="0"/>
          <rect id="gc1" class="gcell" x="34" y="0" width="34" height="34"/>
          <text class="gl" x="17" y="23" text-anchor="middle">a</text><text class="gl" x="51" y="23" text-anchor="middle">b</text>
          <rect id="gu0" class="acc" x="0" y="31" width="34" height="3"/><rect id="gu1" class="acc" x="34" y="31" width="34" height="3" opacity="0"/>
        </g>
        <text id="gcfg" class="gcfg" x="200" y="168" text-anchor="middle"></text>
        <g id="gverdict" opacity="0"><rect x="140" y="180" width="120" height="24" rx="12" class="gok"/><text x="200" y="197" text-anchor="middle" class="gokt">ab ∈ L(M)</text></g>
      </svg>`,
    },
    {
      title: 'Classes of states Kl[q]',
      text: '<b>Classes</b> shows which words lead to which state: <span style="white-space:nowrap">Kl[<i>q</i>] = { <i>w</i> ∈ Σ* | δ̂(<i>q</i><sub>0</sub>, <i>w</i>) = <i>q</i> }</span>. Hover a class to find its words, click a word to simulate it.',
      art: () => {
        const C = ['#4E79A7', '#F28E2B', '#59A14F'];
        const nodes = [[200, 32, 0], [120, 92, 1], [280, 92, 0], [80, 160, 2], [160, 160, 1], [240, 160, 1], [320, 160, 0]];
        const edges = [[0, 1, 'a'], [0, 2, 'b'], [1, 3, 'a'], [1, 4, 'b'], [2, 5, 'a'], [2, 6, 'b']];
        let s = `<svg class="ga" viewBox="0 0 400 210">`;
        edges.forEach(([p, c, sym], i) => {
          const [x1, y1] = nodes[p], [x2, y2] = nodes[c];
          s += `<line class="fadein" style="animation-delay:${0.25 + i * 0.22}s" x1="${x1}" y1="${y1 + 15}" x2="${x2}" y2="${y2 - 15}" stroke="var(--muted-3)" stroke-width="1.4"/>`;
          s += `<text class="fadein gl" style="animation-delay:${0.25 + i * 0.22}s;font-size:14px;fill:var(--muted)" x="${(x1 + x2) / 2 + (x2 < x1 ? -12 : 6)}" y="${(y1 + y2) / 2 + 4}">${sym}</text>`;
        });
        nodes.forEach(([x, y, k], i) => {
          s += `<g class="tn" style="animation-delay:${i * 0.22}s"><circle cx="${x}" cy="${y}" r="15" fill="${C[k]}44" stroke="${C[k]}" stroke-width="2"/>
            <text class="gt" style="font-size:14px" text-anchor="middle" x="${x}" y="${y + 5}">q<tspan font-size="10" dy="3" font-style="normal">${k}</tspan></text></g>`;
        });
        return s + '</svg>';
      },
    },
  ];

  SLIDES.push({
    title: 'Exercises with a code',
    text: 'Have an exercise code? Open the <b>Exercise</b> tab, type it and press <b>Start</b>. Build your automaton, then <b>Check</b> it: if it is wrong you get a word on which it fails — never the solution.',
    art: () => `<svg class="ga" viewBox="0 0 400 210">
      <g class="fadein" style="animation-delay:.1s">
        <rect x="70" y="34" width="260" height="66" rx="14" fill="var(--surface)" stroke="var(--line-2)"/>
        <rect x="84" y="50" width="160" height="34" rx="9" fill="var(--surface)" stroke="var(--line-2)"/>
        <text x="98" y="72" font-family="Inter,sans-serif" font-size="15" font-weight="600" letter-spacing="1.5" fill="var(--ink)">DEMO-1</text>
        <rect x="252" y="50" width="64" height="34" rx="9" fill="var(--ink)"/>
        <text x="284" y="72" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" fill="var(--on-ink)">Start</text>
      </g>
      <g class="fadein" style="animation-delay:.9s">
        <rect x="70" y="118" width="260" height="30" rx="10" fill="var(--ink)"/>
        <text x="200" y="138" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" fill="var(--on-ink)">Check my automaton</text>
      </g>
      <g class="fadein" style="animation-delay:1.6s">
        <rect x="70" y="158" width="260" height="34" rx="10" class="gerr"/>
        <text x="200" y="180" text-anchor="middle" class="gerrt">Counterexample: w = bb</text>
      </g>
    </svg>`,
  });

  let index = 0;
  let host = null;
  let simTimer = null;

  /** Steps the simulation picture: 0 = start, 1 = read a, 2 = read b (accepted), then repeat. */
  function animateSim() {
    const cfgs = ['(q₀, ab)', '(q₀, ab) ⊢ (q₁, b)', '(q₀, ab) ⊢ (q₁, b) ⊢ (q₂, λ)'];
    let step = 0;
    const show = () => {
      const $ = id => host.querySelector('#' + id);
      if (!$('gs0')) return;
      for (let i = 0; i < 3; i++) $('gs' + i).classList.toggle('act', i === step);
      for (let i = 0; i < 2; i++) {
        const on = step === i + 1;
        $('ge' + i).classList.toggle('act', on);
        $('ge' + i).setAttribute('marker-end', on ? 'url(#gah-act)' : 'url(#gah)');
        $('gl' + i).classList.toggle('act', on);
        $('gc' + i).classList.toggle('read', i < step);
        $('gu' + i).setAttribute('opacity', i === step ? 1 : 0);
      }
      $('gcfg').textContent = cfgs[step];
      $('gverdict').setAttribute('opacity', step === 2 ? 1 : 0);
    };
    show();
    simTimer = setInterval(() => { step = (step + 1) % 4; if (step === 3) return; show(); }, 1300);
  }

  function render() {
    clearInterval(simTimer); simTimer = null;
    const s = SLIDES[index];
    const last = index === SLIDES.length - 1;
    let hidden = false;
    try { hidden = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
    host.innerHTML = `
      <div class="guide" role="dialog" aria-modal="true" aria-labelledby="g-title">
        <div class="stage-art">${s.art()}</div>
        <div class="gbody">
          <div class="gstep">Step ${index + 1} of ${SLIDES.length}</div>
          <h2 id="g-title">${s.title}</h2>
          <p>${s.text}</p>
        </div>
        <label class="noshow"><input type="checkbox" id="g-noshow" ${hidden ? 'checked' : ''}> Don't show this when the app opens</label>
        <div class="gfoot">
          <div class="dots">${SLIDES.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>
          ${index > 0 ? '<button type="button" class="btn" data-g="back">Back</button>' : '<button type="button" class="btn text" data-g="close">Skip</button>'}
          <button type="button" class="btn dark" data-g="${last ? 'close' : 'next'}">${last ? 'Start building' : 'Next'}</button>
        </div>
      </div>`;
    const primary = host.querySelector('.btn.dark');
    if (primary) primary.focus();
    if (s.sim) animateSim();
  }

  function open() {
    host = document.getElementById('guide');
    index = 0;
    host.hidden = false;
    render();
  }

  function close() { clearInterval(simTimer); simTimer = null; if (host) { host.hidden = true; host.innerHTML = ''; } }

  function init() {
    host = document.getElementById('guide');
    host.addEventListener('click', e => {
      if (e.target === host) return close();
      const b = e.target.closest('[data-g]');
      if (!b) return;
      if (b.dataset.g === 'next') { index = Math.min(index + 1, SLIDES.length - 1); render(); }
      if (b.dataset.g === 'back') { index = Math.max(index - 1, 0); render(); }
      if (b.dataset.g === 'close') close();
    });
    host.addEventListener('change', e => {
      if (e.target.id === 'g-noshow') { try { localStorage.setItem(KEY, e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ } }
    });
    document.addEventListener('keydown', e => {
      if (host.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && index < SLIDES.length - 1) { index++; render(); }
      if (e.key === 'ArrowLeft' && index > 0) { index--; render(); }
    });
    let hide = false;
    try { hide = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
    if (!hide) open();
  }

  root.Guide = { init, open, close, isOpen: () => host && !host.hidden };
})(typeof self !== 'undefined' ? self : this);
