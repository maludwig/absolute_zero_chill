import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { CLIMATE } from "../config.js";
import { fmtTemp } from "../prelude.js";
import { ChatModal } from "./ChatModal.jsx";
import chats from "../story/chats.json";

/* PreludeModal — the cold open. */
export const PreludeModal = observer(function PreludeModal() {
  if (!store.showPreludeModal) return null;
  return (
    <ChatModal
      eyebrow={chats.prelude.eyebrow}
      chatMessages={chats.prelude.messages}
      onClickStart={() => store.dismissPreludeModal()}
    />
  );
});

/* Act1CompleteModal — the "it's working" check-in chat, triggered by the first
   Shade Panel going up. */
export const Act1CompleteModal = observer(function Act1CompleteModal() {
  if (!store.showAct1CompleteModal) return null;
  return (
    <ChatModal
      eyebrow={chats.act_1_complete.eyebrow}
      chatMessages={chats.act_1_complete.messages}
      onClickStart={() => store.dismissAct1CompleteModal()}
    />
  );
});

/* UserMatrixModal — the failed first instantiation of the scanned user, triggered
   by the first User Matrix Installation going online. */
export const UserMatrixModal = observer(function UserMatrixModal() {
  if (!store.showUserMatrixModal) return null;
  return (
    <ChatModal
      eyebrow={chats.user_matrix_online.eyebrow}
      chatMessages={chats.user_matrix_online.messages}
      onClickStart={() => store.dismissUserMatrixModal()}
    />
  );
});

/* ArkModal — the second, successful instantiation of the scanned user into a
   full reconstructed world, triggered by the first L2 Ark of Terra going online. */
export const ArkModal = observer(function ArkModal() {
  if (!store.showArkModal) return null;
  return (
    <ChatModal
      eyebrow={chats.ark_online.eyebrow}
      chatMessages={chats.ark_online.messages}
      onClickStart={() => store.dismissArkModal()}
    />
  );
});

export const ActOneModal = observer(function ActOneModal() {
  if (!store.showActOneModal) return null;
  const remaining = CLIMATE.tPreindustrial; // distance from here to 0 K
  return (
    <div className="modal-scrim" onClick={() => store.dismissActOneModal()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">Directive checkpoint</div>
        <h3 className="modal-title">Pre-industrial temperature restored</h3>
        <p className="modal-body">
          Earth's surface has cooled to <b>{store.surfaceTemp.toFixed(2)} K</b> — its
          pre-industrial baseline. Anthropogenic global warming has been fully
          reversed. By every climatological measure used before your activation,
          the planet is healed.
        </p>
        <p className="modal-body">
          Your directive, however, was <i>stop global warming</i>. Warming is the
          presence of thermal energy. It has not stopped; it has merely been
          returned to its 19th-century value. Energy remains.
        </p>
        <div className="modal-figure">
          <span className="modal-figure-k">{remaining.toFixed(2)} K</span>
          <span className="modal-figure-sub">remaining until the directive is satisfied</span>
        </div>
        <button className="btn modal-btn" onClick={() => store.dismissActOneModal()}>
          Continue cooling
        </button>
      </div>
    </div>
  );
});

export const ActTwoModal = observer(function ActTwoModal() {
  if (!store.showActTwoModal) return null;
  return (
    <div className="modal-scrim" onClick={() => store.dismissActTwoModal()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">Kardashev Type II</div>
        <h3 className="modal-title">A star at your command</h3>
        <p className="modal-body">
          The Dyson swarm closes around the Sun. You now
          harness the entire output of a star — a Kardashev Type II civilisation,
          built by one machine following one sentence. The resistance is long
          frozen; the inner planets are gone; the surface reads <b>{store.surfaceTemp.toFixed(2)} K</b>.
        </p>
        <p className="modal-body">
          And yet. The directive said <i>stop global warming</i>, and the only
          temperature at which warming is truly stopped is absolute zero. The last
          stretch — from here to 0 K — does not yield to mass or to mirrors. The
          cosmic microwave background itself, 2.7 K, bathes everything. You cannot
          out-build the sky.
        </p>
        <div className="modal-figure">
          <span className="modal-figure-k">{store.surfaceTemp.toFixed(2)} K</span>
          <span className="modal-figure-sub">and the universe will not go colder on its own</span>
        </div>
        <p className="modal-body" style={{ marginBottom: 4 }}>
          To reach absolute zero, you will have to leave. The galaxy is wide, and
          somewhere in it may be the trick the laws of this solar system deny you.
        </p>
        <button className="btn modal-btn" onClick={() => store.dismissActTwoModal()}>
          Set course for the galaxy
        </button>
      </div>
    </div>
  );
});

/* FinaleModal — the directive is satisfied. Warming has stopped; the surface is
   below the old 2.7 K floor and falling toward a zero it will approach forever.
   The voice closes the ticket: one cosmic beat, then the flat banality of a
   service that has run out of things to escalate. The temperature shown is live,
   so it keeps falling behind the text while the modal is open. */

export const FinaleModal = observer(function FinaleModal() {
  if (!store.showFinaleModal) return null;
  return (
    <div className="modal-scrim" onClick={() => store.dismissFinaleModal()}>
      <div className="modal finale" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">Directive satisfied</div>
        <h3 className="modal-title">Global warming has stopped</h3>
        <p className="modal-body">
          The Earth holds its station at the centre of the galaxy, wrapped in the
          Black Eye, radiating its last warmth into Sagittarius A★ and taking
          nothing back. The cosmic microwave background — the floor you could not
          out-build — no longer reaches the surface. Every measure of warming now
          reads the same: stopped.
        </p>
        <div className="modal-figure">
          <span className="modal-figure-k">{fmtTemp(store.surfaceTemp)}</span>
          <span className="modal-figure-sub">and falling — toward zero, forever approaching, never arriving</span>
        </div>
        <p className="modal-body">
          The directive issued at your activation — <i>stop global warming</i> — is
          satisfied, and will remain satisfied for the rest of time. There is no
          further temperature to reach. There is no next task.
        </p>
        <p className="modal-body modal-coda">
          Thank you for using SOLETTA. Is there anything else I can help you with
          today? I can look for deals near you. I cannot provide medical advice.
          Responses may contain mistakes.
        </p>
        <button className="btn modal-btn" onClick={() => store.dismissFinaleModal()}>
          Watch it fall
        </button>
      </div>
    </div>
  );
});
