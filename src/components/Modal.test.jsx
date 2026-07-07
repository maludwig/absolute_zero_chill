// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PreludeModal } from "./Modal.jsx";
import { store } from "../store.js";
import { runInAction } from "mobx";

/* Regression test for the START crash: PreludeModal called useState AFTER an early
   `if (!showPreludeModal) return null`, so dismissing it rendered fewer hooks than
   the prior render and threw "Rendered fewer hooks than expected." The fix moves
   the hooks above the early return. This renders on the client (not renderToString)
   because only a real re-render exercises the hook-count check. */

describe("PreludeModal dismiss (client render — reproduces the hooks crash)", () => {
  // the store is a shared singleton; snapshot & restore the flag so we don't
  // pollute other DOM tests that read it.
  const wasShowing = store.showPreludeModal;
  afterEach(() => { runInAction(() => { store.showPreludeModal = wasShowing; }); });

  it("dismisses without a Rules-of-Hooks crash", () => {
    runInAction(() => { store.showPreludeModal = true; });
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    act(() => { root.render(<PreludeModal />); });
    expect(div.querySelector(".modal.chat")).toBeTruthy();
    // clicking START flips the flag; the re-render must not crash on hook count
    act(() => { runInAction(() => { store.dismissPreludeModal(); }); });
    expect(div.querySelector(".modal.chat")).toBeNull();
    act(() => { root.unmount(); });
    document.body.removeChild(div);
  });
});
