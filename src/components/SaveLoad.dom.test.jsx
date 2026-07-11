// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SaveLoad } from "./SaveLoad.jsx";
import { store } from "../store.js";

let container, root;

function readBlob(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsText(blob);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<SaveLoad />); }); // synchronous act() → DOM ready to query
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

describe("SaveLoad", () => {
  it("renders Save, Load and New Game buttons plus a hidden file input", () => {
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toBe("Save");
    expect(buttons[1].textContent).toBe("Load");
    expect(buttons[2].textContent).toBe("New Game");
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("Save triggers a download of a valid versioned save", async () => {
    let captured;
    const createURL = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { captured = blob; return "blob:x"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    container.querySelectorAll("button")[0].click(); // Save

    expect(createURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();

    const parsed = JSON.parse(await readBlob(captured));
    expect(parsed.version).toBeDefined();
    expect(parsed.state).toBeDefined();
    expect(parsed.state.metal).toBe(store.metal);
  });

  it("Load reads the chosen file and applies it to the store", async () => {
    store.metal = 555;
    const text = store.saveText();
    store.metal = 0;

    vi.spyOn(console, "info").mockImplementation(() => {}); // quiet the clean-load log

    const input = container.querySelector('input[type="file"]');
    const file = new File([text], "save.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });

    // FileReader.onload applies the save asynchronously; wait on the actual result
    // rather than a fixed delay, so the assertion can't lose the race under load.
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(store.metal).toBe(555), { timeout: 1000 });
    });
  });
});
