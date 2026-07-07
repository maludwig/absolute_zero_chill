/* SaveLoad — two footer buttons. Save serializes the whole store to JSON and
   downloads it; Load opens a file picker, reads the chosen file, and hands the
   text to the store (which validates it and reports any problems to the
   console). The store owns all (de)serialization; this component only does the
   DOM-side download/upload plumbing. */

import React from "react";
import { store } from "../store.js";

export function SaveLoad() {
  const fileRef = React.useRef(null);

  const onSave = () => {
    const text = store.saveText();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = "soletta-save-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    store.pushLog("Game saved — file downloaded.", "ok");
  };

  const onLoadClick = () => fileRef.current && fileRef.current.click();

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => store.loadSave(String(reader.result));
    reader.onerror = () => {
      console.error("[load] could not read file:", reader.error);
      store.pushLog("Load failed: could not read file (see console).", "danger");
    };
    reader.readAsText(file);
    e.target.value = ""; // reset so the same file can be re-loaded
  };

  return (
    <span className="saveload">
      <button className="btn sl-btn" onClick={onSave}>Save</button>
      <button className="btn sl-btn" onClick={onLoadClick}>Load</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={onFile}
      />
    </span>
  );
}
