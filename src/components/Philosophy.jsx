import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { IDEAS } from "../config.js";
import { ProgressBar, Panel, PoweredButton } from "./common.jsx";
import { FmtValue } from "./FmtValue.jsx";

/* Philosophy — the Act III idea tree. Unlike Research (engineered with RP from
   Replicas), an Idea is a conceptual breakthrough paid for in Insight produced
   by Matrioshka Brains. Contemplating one fills it from the Insight flow;
   realizing it reveals the Research entries that engineer it. */

const IdeaRow = observer(function IdeaRow({ id }) {
  const idea = IDEAS[id];
  const done = store.ideaDone(id);
  const unlocked = store.ideaUnlocked(id);
  const sel = store.philosophy.selected === id;
  const prog = store.philosophy.progress[id] || 0;

  let control;
  if (done) {
    control = <span className="tstatus done">realized</span>;
  } else if (!unlocked) {
    control = <span className="tstatus req">locked</span>;
  } else {
    control = (
      <PoweredButton className={"btn focus" + (sel ? " sel" : "")} onClick={() => store.selectIdea(id)}>
        {sel ? "Contemplating" : "Contemplate"}
      </PoweredButton>
    );
  }

  return (
    <div className={"trow idea" + (done ? " tdone" : "") + (sel ? " tsel" : "")}>
      <div className="tinfo">
        <span className="tname">{idea.name}</span>
        <span className="tctrl">{control}</span>
      </div>
      <div className="tdesc">{idea.blurb}</div>
      {!done && unlocked && <ProgressBar value={prog} max={idea.cost} small />}
      {!done && unlocked && <div className="tcost"><FmtValue value={prog} /> / <FmtValue value={idea.cost} unit=" Insight" /></div>}
    </div>
  );
});

export const Philosophy = observer(function Philosophy() {
  if (!store.revealed.philosophy) return null;
  const visible = Object.keys(IDEAS).filter((id) => store.ideaVisible(id));
  const rate = store.insightPerDay;
  return (
    <Panel title="Philosophy" tag={<>Insight <FmtValue value={rate} unit="/day" /> · contemplate to spend it</>}>
      {visible.map((id) => <IdeaRow key={id} id={id} />)}
    </Panel>
  );
});
