// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";

describe("main entry", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="react-root"></div>';
    // stop the game loop from actually scheduling during the test
    vi.spyOn(globalThis, "setInterval").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("mounts the app into #react-root and exposes debug hooks", async () => {
    await act(async () => { await import("./main.jsx"); });
    // window hooks are assigned at module eval, before render
    expect(typeof window.makeGameStore).toBe("function");
    expect(window.gameStore).toBeTruthy();
    expect(window.gameStore.metal).toBe(0);
    expect(window.gameStore.inventory.asteroid_mine).toBe(1);

    // let React commit the initial render, then confirm the boot fallback is gone
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const root = document.getElementById("react-root");
    expect(root.textContent).toContain("ABSOLUTE");
  });
});
