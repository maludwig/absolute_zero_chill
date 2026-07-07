// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChatModal } from "./ChatModal.jsx";

/* ChatModal reveal-engine tests. Verifies the data-driven transcript reveals
   the system prompt immediately, streams user/assistant/think turns, gates
   think/search behind buttons, and only shows START once the very last message
   has actually finished revealing (not merely mounted) — so START never renders
   on top of a still-streaming final block. User turns stream (deliberately
   slowly, ~500ms/word) rather than appearing instantly, so tests that reach
   past one need to wait. */

const MESSAGES = [
  { kind: "system", label: "System prompt", text: "sys text" },
  { kind: "user", label: "User", text: "user q" },
  { kind: "think", label: "Thinking", text: "one two" },
  { kind: "search", queries: ['web_search("a")'] },
  { kind: "assistant", label: "Assistant", text: "hi there" },
  { kind: "user", label: "User", text: "ok" },
];

function mount(node) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() => { root.render(node); });
  return { div, root, cleanup: () => { act(() => root.unmount()); document.body.removeChild(div); } };
}

describe("ChatModal reveal engine", () => {
  it("reveals the system prompt immediately, then streams the user turn before gating on think", async () => {
    const { div, cleanup } = mount(<ChatModal eyebrow="E" chatMessages={MESSAGES} onClickStart={() => {}} />);
    // the system prompt is static and renders immediately
    expect(div.textContent).toContain("sys text");
    // the user's turn streams in — not there yet, and the think block hasn't been reached
    expect(div.textContent).not.toContain("user q");
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "THINK")).toBe(false);

    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); });

    // the user's turn has finished streaming; the think block is now gated behind a THINK button
    expect(div.textContent).toContain("user q");
    const btn = [...div.querySelectorAll("button")].find((b) => b.textContent === "THINK");
    expect(btn).toBeTruthy();
    // search/assistant not revealed yet, and no START
    expect(div.querySelector(".pre-tool")).toBeNull();
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(false);
    cleanup();
  });

  it("shows START only once the last message has actually finished revealing", async () => {
    // a system line + a user turn that streams; START must not appear merely because
    // the user turn has mounted — it has to actually finish streaming first.
    const chat = [
      { kind: "system", text: "s" },
      { kind: "user", text: "u" },
    ];
    const { div, cleanup } = mount(<ChatModal chatMessages={chat} onClickStart={() => {}} />);
    // the user turn is still streaming — START must not render yet
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(false);

    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    // now that the last message has finished streaming, START appears
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(true);
    cleanup();
  });

  it("does not render START on top of a still-streaming final think block", async () => {
    // regression test: the last message being a "think" block used to let START
    // render immediately on click, overlapping the still-animating text.
    const chat = [
      { kind: "system", text: "sys" },
      { kind: "think", label: "Thinking", text: "one two three" },
    ];
    const { div, cleanup } = mount(<ChatModal chatMessages={chat} onClickStart={() => {}} />);
    const think = [...div.querySelectorAll("button")].find((b) => b.textContent === "THINK");
    act(() => { think.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    // streaming just started — START must not render over the block
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(false);

    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); });

    expect(div.textContent).toContain("one two three");
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(true);
    cleanup();
  });

  it("fires onClickStart when START is clicked", async () => {
    let started = false;
    const staticsOnly = [{ kind: "user", text: "u" }];
    const { div, cleanup } = mount(<ChatModal chatMessages={staticsOnly} onClickStart={() => { started = true; }} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    const start = [...div.querySelectorAll("button")].find((b) => b.textContent === "START");
    act(() => { start.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(started).toBe(true);
    cleanup();
  });

  it("SKIP bypasses the whole chat via onClickStart", () => {
    let started = false;
    // a chat with content after the first gate, so it is NOT done at mount → SKIP shows
    const chat = [
      { kind: "system", text: "sys" },
      { kind: "think", label: "Thinking", text: "one two" },
      { kind: "assistant", label: "Assistant", text: "hi" },
    ];
    const { div, cleanup } = mount(<ChatModal chatMessages={chat} onClickStart={() => { started = true; }} />);
    const skip = [...div.querySelectorAll("button")].find((b) => b.textContent.includes("SKIP"));
    expect(skip).toBeTruthy();
    act(() => { skip.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(started).toBe(true);
    cleanup();
  });

  it("clicking a streaming user turn skips straight to the full text", () => {
    const onlyUser = [{ kind: "user", text: "one two three" }];
    const { div, cleanup } = mount(<ChatModal chatMessages={onlyUser} onClickStart={() => {}} />);
    const p = div.querySelector(".pre-stream");
    act(() => { p.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(div.textContent).toContain("one two three");
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(true);
    cleanup();
  });

  it("renders structured search queries with their mock result cards", async () => {
    const withResults = [
      {
        kind: "search",
        queries: [
          { search: "resistance to carbon emission reduction", results: [
            { title: "A Very Serious Headline", snippet: "A very serious snippet." },
          ] },
        ],
      },
    ];
    const { div, cleanup } = mount(<ChatModal chatMessages={withResults} onClickStart={() => {}} />);
    const btn = [...div.querySelectorAll("button")].find((b) => b.textContent === "SEARCH");
    act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    expect(div.querySelector(".pre-tool").textContent).toContain("resistance to carbon emission reduction");
    expect(div.querySelector(".pre-result-title").textContent).toBe("A Very Serious Headline");
    expect(div.querySelector(".pre-result-snippet").textContent).toBe("A very serious snippet.");
    cleanup();
  });

  it("user_timed_out spins, then flips to the timeout notice and completes", async () => {
    const chat = [{ kind: "user_timed_out", spinMs: 60 }];
    const { div, cleanup } = mount(<ChatModal chatMessages={chat} onClickStart={() => {}} />);
    // spinner shows first; the timeout text and START are not there yet
    expect(div.querySelector(".pre-spinner")).toBeTruthy();
    expect(div.textContent).not.toContain("Timed Out");
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(false);

    await act(async () => { await new Promise((r) => setTimeout(r, 140)); });

    // after the spin, the timeout notice replaces the spinner and START appears
    expect(div.querySelector(".pre-spinner")).toBeNull();
    expect(div.textContent).toContain("Timed Out: No response from user after 10 days");
    expect([...div.querySelectorAll("button")].some((b) => b.textContent === "START")).toBe(true);
    cleanup();
  });
});
