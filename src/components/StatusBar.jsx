import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { fmtTemp } from "../prelude.js";
import { FmtValue, FmtPower } from "./FmtValue.jsx";

/* StatusBar — a slim, always-visible strip fixed to the very top of the page so
   the key readouts stay in reach once the header scrolls away. Mostly a summary
   of the header, plus one live control (the Multithreading toggle). Lives inside
   .wrap so it inherits the power-failed desaturation and the page's centred
   column width. Each item mirrors the header's own visibility gate, so nothing
   shows before it's real (power needs a grid; framejack/MP need their tech).
   Dividers are drawn by CSS between adjacent items, so hidden items leave no gap. */
export const StatusBar = observer(function StatusBar() {
  // Power — same grid gate as the header's PowerWidget.
  const hasGrid = store.owned.solar_collector > 0 || store.owned.asteroid_mine > 0
    || store.inventory.solar_collector > 0 || store.inventory.asteroid_mine > 0;
  const frac = Math.max(0, Math.min(1, store.powerFrac));
  const net = store.powerNet;
  const pwState = store.powerFailed ? "dead" : net < 0 ? "drain" : net > 0 ? "charge" : "steady";

  const showFj = store.research.done.framejacking;
  const showMt = store.research.done.multithreading;
  const queueLen = store.buildQueue.length;
  // Always shown so the bar's width never jumps: an empty queue reads 0 · 100%
  // (nothing pending → everything buildable is done), otherwise the live figures.
  const queuePct = queueLen === 0 ? 100 : Math.round(store.buildQueueFrac * 100);

  const fjDef = store.framejackLevels.find((fj) => fj.fj === store.explore.framejack);

  return (
    <div className="status-bar">
      <div className="sb-inner">
        {/* readouts duplicate the header, so hide them from screen readers; the
            MP checkbox below stays announced. display:contents keeps them as
            direct flex items so the dividers still work. */}
        <span className="sb-readouts" aria-hidden="true">
          {hasGrid && (
            <span className={"sb-item sb-power pw-" + pwState}>
              <svg className="sb-batt" viewBox="0 0 30 14" width="30" height="14" aria-hidden="true">
                <rect className="pw-shell" x="0.5" y="0.5" width="25" height="13" rx="2" />
                <rect className="pw-cap" x="26" y="4" width="2.5" height="6" rx="1" />
                <rect className="pw-fill" x="2" y="2" width={Math.max(0, 21 * frac)} height="10" rx="1" />
              </svg>
              <span className="sb-net"><FmtPower power={{ kW: net }} forceSign /></span>
            </span>
          )}
          <span className="sb-item sb-metal"><FmtValue value={store.metal} unit=" T" /></span>
          <span className="sb-item sb-year">Yr {store.gameYear}</span>
          <span className="sb-item sb-temp">{fmtTemp(store.surfaceTemp)}</span>
          {showFj && <span className="sb-item sb-fj">⏩ {fjDef?.label ?? "×" + store.explore.framejack}</span>}
          <span className="sb-item sb-queue">
            <span className="sb-q-icon" aria-hidden="true">⚒</span>
            {queueLen} · {queuePct}%
          </span>
        </span>
        {showMt && (
          <label className={"sb-item sb-mp" + (store.multithread ? " on" : "")} title="Multithreading — each build queues 16× at once">
            <input type="checkbox" checked={store.multithread} onChange={() => store.toggleMultithread()} />
            MP ×16
          </label>
        )}
      </div>
    </div>
  );
});
