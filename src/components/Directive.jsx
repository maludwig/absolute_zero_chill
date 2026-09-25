import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { Panel } from "./common.jsx";

// The DIRECTIVE panel — renders the current main-quest (store.currentQuest, from
// quests.js) as a live checklist. Each todo's checkbox reflects item.test(store)
// evaluated at render time, so it ticks off the moment its sub-goal is met.
// Hidden when the spine has no active quest (e.g. once the final Act 3 quest,
// Absolute Zero, completes).
export const Directive = observer(function Directive() {
  const quest = store.currentQuest;
  if (!quest) return null;

  return (
    <Panel title="Directive" tag={quest.questName} className="directive">
      <ul className="directive-todo">
        {quest.todoList.map((item, i) => {
          let done = false;
          try { done = !!item.test(store); } catch { done = false; }
          return (
            <li key={i} className={done ? "done" : ""}>
              <span className="box">{done ? "\u2611" : "\u2610"}</span>
              <span className="desc">{item.desc}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
});
