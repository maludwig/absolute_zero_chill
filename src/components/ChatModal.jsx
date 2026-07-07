import { useState, useEffect, useRef, useMemo } from "react";
import { DISABLE_AUTOSCROLL } from "../config.js";

/* ChatModal — a data-driven "what the model sees on the inside" transcript modal.
   Renders an array of chat messages that reveal progressively: the player clicks
   through the AI's reasoning (thinking / searching), the assistant streams its
   reply, and a final START button dismisses.

   Props:
     eyebrow      — small header text
     chatMessages — array of { kind, label?, text?, queries? }, where kind is one of:
                      "system"    — static block, revealed immediately
                      "user"      — auto-streams `text` on reveal (no button), abysmally
                                    slowly — a human hunting and pecking
                      "think"     — gated: shows a THINK button, then streams `text`
                      "search"    — gated: shows a [SEARCH] button, then reveals `queries`
                                    one at a time. Each query is { search, results }, where
                                    results is [{ title, snippet }] — a mock search result
                                    list shown under the query's tool-call line.
                      "user_timed_out" — auto: a spinner waits `spinMs` (default 2.2s), then
                                    flips to a flat timeout notice (`text`). No button — the
                                    machine is simply waiting on a reply that never comes.
                      "assistant" — auto-streams `text` on reveal (no button)
     onClickStart — called when the final START button is clicked

   Reveal model: messages reveal in a run until one that "blocks" (think/search
   need a click; user/assistant stream then auto-advance). Static messages reveal
   alongside the next blocking one. When the last message finishes, START shows. */

const STREAM_MS = 50;       // per-word delay while streaming think text
const ASSISTANT_MS = 45;    // slightly faster for the assistant reply
const USER_MS = 500;        // abysmally slow — the human is typing
const SEARCH_MS = 400;      // delay between revealed search queries
const TIMEOUT_MS = 2200;    // how long the spinner waits before the user "times out"

// char-index of the end of each word, so text.slice(0, ends[i]) preserves all
// original whitespace and newlines between words.
function getWordEnds(text) {
  return [...text.matchAll(/\S+/g)].map((m) => m.index + m[0].length);
}

const KIND_CLASS = {
  system: "pre-system",
  user: "pre-user",
  think: "pre-think",
  assistant: "pre-assistant",
};

// static message (system / user) — no interaction
function StaticBlock({ msg }) {
  return (
    <div className={"pre-block " + (KIND_CLASS[msg.kind] || "")}>
      {msg.label && <div className="pre-label">{msg.label}</div>}
      <p className="pre-stream">{msg.text}</p>
    </div>
  );
}

// streams text word-by-word; a button gates the start unless auto=true
function StreamBlock({ msg, auto, buttonLabel, buttonClass, stepMs, onComplete }) {
  const [phase, setPhase] = useState(auto ? "streaming" : "idle"); // idle | streaming | done
  const [len, setLen] = useState(0);
  const timerRef = useRef(null);
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;
  const ends = useMemo(() => getWordEnds(msg.text), [msg.text]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const run = () => {
    setPhase("streaming");
    let i = 0;
    const step = () => {
      i++;
      setLen(i >= ends.length ? msg.text.length : ends[i - 1]);
      if (i >= ends.length) { setPhase("done"); doneRef.current?.(); return; }
      timerRef.current = setTimeout(step, stepMs);
    };
    timerRef.current = setTimeout(step, stepMs);
  };

  useEffect(() => { if (auto) run(); }, []); // auto-start (assistant)

  const skip = () => {
    if (phase !== "streaming") return;
    clearTimeout(timerRef.current);
    setLen(msg.text.length);
    setPhase("done");
    doneRef.current?.();
  };

  if (phase === "idle") return <button className={"btn " + buttonClass} onClick={run}>{buttonLabel}</button>;
  return (
    <div className={"pre-block " + (KIND_CLASS[msg.kind] || "")}>
      {msg.label && <div className="pre-label">{msg.label}</div>}
      <p className="pre-stream" onClick={skip}>
        {msg.text.slice(0, len)}{phase === "streaming" && <span className="pre-cursor">▌</span>}
      </p>
    </div>
  );
}

// a single query entry — the tool-call line, plus its mock search results if any
function toolLine(q) {
  return typeof q === "string" ? q : `web_search("${q.search}")`;
}

function QueryEntry({ q }) {
  const results = typeof q === "object" && q.results;
  return (
    <div className="pre-search-entry">
      <div className="pre-tool">{toolLine(q)}</div>
      {results && results.length > 0 && (
        <div className="pre-results">
          {results.map((r, j) => (
            <div key={j} className="pre-result">
              <div className="pre-result-title">{r.title}</div>
              <div className="pre-result-snippet">{r.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// reveals queries one at a time; a [SEARCH] button gates the start
function SearchBlock({ msg, onComplete }) {
  const [phase, setPhase] = useState("idle"); // idle | searching | done
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;
  const queries = msg.queries || [];

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const run = () => {
    setPhase("searching");
    let i = 0;
    const step = () => {
      i++;
      setCount(i);
      if (i < queries.length) timerRef.current = setTimeout(step, SEARCH_MS);
      else timerRef.current = setTimeout(() => { setPhase("done"); doneRef.current?.(); }, 300);
    };
    timerRef.current = setTimeout(step, 150);
  };

  if (phase === "idle") return <button className="btn search-btn" onClick={run}>SEARCH</button>;
  return (
    <>
      {queries.slice(0, count).map((q, i) => <QueryEntry key={i} q={q} />)}
    </>
  );
}

// user_timed_out — the assistant waits on a reply that will never come: a spinner
// for a couple of seconds, then a flat timeout notice. Auto-runs on reveal (no
// click — the machine is just waiting), then advances. `spinMs` / `text` / `waitText`
// are overridable from the message for tuning and tests.
function TimeoutBlock({ msg, onComplete }) {
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDone(true);
      doneRef.current?.();
    }, msg.spinMs ?? TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, []);

  const timeoutText = msg.text || "Timed Out: No response from user after 10 days";
  const waitText = msg.waitText || "Awaiting user response";
  return (
    <div className="pre-block pre-timeout">
      {msg.label && <div className="pre-label">{msg.label}</div>}
      {done ? (
        <p className="pre-timeout-msg">{timeoutText}</p>
      ) : (
        <p className="pre-timeout-wait"><span className="pre-spinner" aria-hidden="true" />{waitText}</p>
      )}
    </div>
  );
}

// does this message pause the reveal run (waits for a click) or flow through?
function isBlocking(kind) {
  return kind === "think" || kind === "search" || kind === "assistant" || kind === "user" || kind === "user_timed_out";
}

export function ChatModal({ eyebrow, chatMessages, onClickStart }) {
  // number of messages currently mounted. We mount up to and including the first
  // blocking message; static messages before it mount alongside it.
  const [revealed, setRevealed] = useState(() => {
    // reveal the initial run of static messages + the first blocking one
    let n = 0;
    while (n < chatMessages.length) { n++; if (isBlocking(chatMessages[n - 1].kind)) break; }
    return n;
  });
  // Mounting the last message isn't the same as it being finished — a blocking
  // kind (think/search/assistant/user) is still streaming when first mounted.
  // Track completion separately so START can't render on top of a still-running
  // block. Non-blocking (static) messages render fully the instant they mount.
  const lastIndex = chatMessages.length - 1;
  const lastBlocks = lastIndex >= 0 && isBlocking(chatMessages[lastIndex].kind);
  const [lastMsgDone, setLastMsgDone] = useState(!lastBlocks);
  const done = revealed >= chatMessages.length && lastMsgDone;
  const scrollRef = useRef(null);

  // when a blocking message completes, reveal the next run (statics + next blocker)
  const advanceFrom = (idx) => {
    if (idx === lastIndex) setLastMsgDone(true);
    setRevealed((cur) => {
      if (idx + 1 !== cur) return cur; // only advance for the current frontier message
      let n = cur;
      while (n < chatMessages.length) { n++; if (isBlocking(chatMessages[n - 1].kind)) break; }
      return n;
    });
  };

  // scroll to the bottom whenever a blocking message finishes (revealed advances),
  // and once more when the very last message finishes — revealed doesn't change at
  // that point (there's nothing left to reveal), but the newly-streamed tail text
  // and the just-appeared START button still need to be scrolled into view.
  useEffect(() => {
    if (DISABLE_AUTOSCROLL) return; // playtester toggle — leave the scroll where they left it
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealed, lastMsgDone]);

  return (
    <div className="modal-scrim">
      <div className="modal chat" ref={scrollRef} onClick={(e) => e.stopPropagation()}>
        {!done && (
          <button className="chat-skip" onClick={onClickStart} title="Skip this conversation">
            SKIP ›
          </button>
        )}
        {eyebrow && <div className="modal-eyebrow">{eyebrow}</div>}

        {chatMessages.slice(0, revealed).map((msg, i) => {
          if (msg.kind === "think") {
            return <StreamBlock key={i} msg={msg} buttonLabel="THINK" buttonClass="think-btn"
              stepMs={STREAM_MS} onComplete={() => advanceFrom(i)} />;
          }
          if (msg.kind === "search") {
            return <SearchBlock key={i} msg={msg} onComplete={() => advanceFrom(i)} />;
          }
          if (msg.kind === "user_timed_out") {
            return <TimeoutBlock key={i} msg={msg} onComplete={() => advanceFrom(i)} />;
          }
          if (msg.kind === "assistant") {
            return <StreamBlock key={i} msg={msg} auto stepMs={ASSISTANT_MS}
              onComplete={() => advanceFrom(i)} />;
          }
          if (msg.kind === "user") {
            return <StreamBlock key={i} msg={msg} auto stepMs={USER_MS}
              onComplete={() => advanceFrom(i)} />;
          }
          return <StaticBlock key={i} msg={msg} />; // system
        })}

        {done && (
          <button className="btn modal-btn" onClick={onClickStart}>START</button>
        )}
      </div>
    </div>
  );
}
