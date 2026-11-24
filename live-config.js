/*
 * Automata Lab — connection to the Firebase project used by live sessions.
 * If this were null, live sessions would run in "test mode" (only between tabs of the same browser).
 * These values identify the project; they are not a password (access is limited by the database rules,
 * see editor/firebase-rules.json).
 */
window.AUTOMATA_LAB_FIREBASE = {
  apiKey: "AIzaSyACJ0YcQDLCZM8qLT40obex8qmkzpnRR9I",
  authDomain: "automata-lab-d3566.firebaseapp.com",
  databaseURL: "https://automata-lab-d3566-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "automata-lab-d3566",
  storageBucket: "automata-lab-d3566.firebasestorage.app",
  messagingSenderId: "511125219499",
  appId: "1:511125219499:web:e5b1f2521352d0b0ac6fee"
};

/*
 * Address of the published site: shown on the projected view and used in copied links
 * when the app is opened on your own computer (as a file or from localhost).
 */
window.AUTOMATA_LAB_SITE = 'https://leon412260.github.io/automata-lab/';
