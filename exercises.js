/*
 * Automata Lab — exercises that can be opened with a code.
 * This file is written by the exercise editor (index.html?mode=editor, "Save to exercises.js"); edit it there, not by hand.
 */
window.AUTOMATA_LAB_EXERCISES = [
  {
    "code": "DEMO-1",
    "exercise": {
      "kind": "construct", "title": "Construct an FA", "require": "FA", "maxStates": 3,
      "text": "Construct a finite automaton for the language L = { w ∈ {a, b}* | w does not contain the subword bb }. Use at most 3 states.",
      "solution": {
        "type": "FA", "states": ["q_λ", "q_b", "q_bb"], "alphabet": ["a", "b"], "initial": "q_λ", "accepting": ["q_λ", "q_b"],
        "delta": { "q_λ": { "a": ["q_λ"], "b": ["q_b"] }, "q_b": { "a": ["q_λ"], "b": ["q_bb"] }, "q_bb": { "a": ["q_bb"], "b": ["q_bb"] } }
      }
    }
  },
  {
    "code": "DEMO-2",
    "exercise": {
      "kind": "product", "title": "Product construction (∩)", "op": "intersection",
      "text": "A₁ accepts the words with an even number of a’s, A₂ the words that end with b. Use the product construction to build a finite automaton for L(A₁) ∩ L(A₂).",
      "A1": {
        "type": "FA", "states": ["p_0", "p_1"], "alphabet": ["a", "b"], "initial": "p_0", "accepting": ["p_0"],
        "delta": { "p_0": { "a": ["p_1"], "b": ["p_0"] }, "p_1": { "a": ["p_0"], "b": ["p_1"] } }
      },
      "A2": {
        "type": "FA", "states": ["q_a", "q_b"], "alphabet": ["a", "b"], "initial": "q_a", "accepting": ["q_b"],
        "delta": { "q_a": { "a": ["q_a"], "b": ["q_b"] }, "q_b": { "a": ["q_a"], "b": ["q_b"] } }
      }
    }
  },
  {
    "code": "DEMO-3",
    "exercise": {
      "kind": "powerset", "title": "Powerset construction",
      "text": "Apply the powerset construction to the NFA N and draw the resulting finite automaton. You can drop all states that are not reachable.",
      "nfa": {
        "type": "NFA", "states": ["p", "q", "r"], "alphabet": ["a", "b"], "initial": "p", "accepting": ["r"],
        "delta": { "p": { "a": ["p"], "b": ["p", "q"] }, "q": { "a": ["r"], "b": ["r"] }, "r": { "a": [], "b": [] } }
      }
    }
  }
];
