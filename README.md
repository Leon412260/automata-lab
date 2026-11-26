# Automata Lab

A small web app to build, run and understand **finite automata (FA)** and
**nondeterministic finite automata (NFA)**, with the notation of the Theoretical Computer Science
course: M = (Q, Σ, δ, q₀, F), λ, δ̂, Kl[q], L(M).

The app runs entirely in your browser: nothing to install,
no account. Your automata and your answers are saved in your browser automatically.

## Building an automaton

- **New state:** choose **State** in the toolbar at the bottom and click on the canvas
  (or double-click empty space).
- **New arrow:** hover over a state and drag the blue **➜** onto another state. Drop it on
  empty space to create a new state at the same time. Click the ➜ for a loop.
  You can also use the **Arrow** tool: click one state, then another.
- **Symbols of an arrow:** after drawing it, just press the letter (e.g. `a`), or click the
  symbol buttons in the small window that opens.
- **Accepting / initial state, name, delete:** click the state.
- **Shape:** drag an arrow to bend it, drag a loop to move it around its state;
  double-click an arrow to go back to the automatic shape. **Arrange** lays everything out
  like in the exercise solutions.
- **Zoom:** scroll on the diagram, or use the button at the top right (+ / − appear when you point at it). Drag the background to move.
- **Undo / Redo:** the arrows at the top (they appear after your first change), or `Ctrl+Z` / `Ctrl+Y`.

## The tabs on the right

- **Definition** — the formal definition M = (Q, Σ, δ, q₀, F) and the transition function δ
  as a table (click a cell to change it) or as equations. What is still missing is listed below.
- **Run** — type a word and press **Step**: you see the computation as configurations
  (q, w) ⊢ (p, w′), δ̂ step by step and whether the word is in L(M). For an NFA you also see all
  computations as a tree. **Test several words…** is at the bottom.
- **Simulation** (FA only) — the product of two FAs M₁ and M₂, built step by step: choose M₁ and
  M₂, then ∪, ∩ or −, and press **Step**. M₁ is drawn from top to bottom, M₂ from left to right, so the
  pair (q, p) sits in the row of q and the column of p.
- **Classes** (FA only) — the classes Kl[q] = { w ∈ Σ* | δ̂(q₀, w) = q } with their words and a
  coloured prefix tree. Click a word to run it.
- **Exercise** — see below.

## Exercises

1. Open the **Exercise** tab.
2. Type the exercise code (e.g. `DEMO-1`) and press **Start**.
3. Read the task and build your automaton on the canvas.
4. Press **Check my automaton**. If something is wrong, you get the shortest word on which your
   automaton gives the wrong answer — never the solution. Press **Run** to see why.

Your work on each exercise is kept in your browser; **Continue** lists the exercises you opened.
`DEMO-1`, `DEMO-2` and `DEMO-3` are example exercises to try the app.

## Conventions

- An FA has a **total** transition function δ: Q × Σ → Q; an NFA has δ: Q × Σ → 𝒫(Q) and
  no λ-transitions.
- λ is the empty word. Symbols are single characters; type words without spaces, e.g. `abba`.
- State names like `q0` or `p_ba` are shown as q₀ and p_ba with a subscript.

**Share link** (top right) copies a link that contains your current automaton.
Opening such a link does not overwrite your own automaton until you change something; **Undo** brings it back.
