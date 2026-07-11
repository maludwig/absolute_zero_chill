/* main — mount the app. Expose the store and factory on window for debugging
   and for headless tests (a fresh store can be ticked without rendering).
   CSS is imported here so the bundler inlines it into the single-file page. */

import { createRoot } from "react-dom/client";
import "../css/style.css";
import "../css/frontier.css";
import { store, createStore } from "./store.js";
import { App } from "./components/App.jsx";

window.gameStore = store;
window.makeGameStore = createStore;

// If an autosave exists, don't apply it automatically — arm the boot prompt so the
// player chooses Continue vs New Game (see ResumeChoiceModal). No save → fresh game,
// straight into the prelude cold-open.
try {
  if (store.hasLocalSave()) store.showResumeChoice = true;
} catch (e) { console.warn("[autosave] boot check failed:", e && e.message); }

createRoot(document.getElementById("react-root")).render(<App />);
