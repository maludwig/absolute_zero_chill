import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { BUILDINGS, scanDotCount } from "../config.js";
import { FmtValue } from "../components/FmtValue.jsx";
import { EarthScanner } from "../earthScanner/EarthScanner.jsx";

/* Config UI for the Discreet Neural Scanner, rendered inside its Construction card
   via BUILDINGS.discreet_neural_scanner.ConfigComponent — so the scan progress and
   the Earth globe sit right on the building instead of in a far-off panel. Appears
   once at least one Scanner exists; the globe fills top-down as scanFrac climbs and
   its seam density scales with how many Scanners are running. */

const EARTH_SIZE = 168;

export const DiscreetScannerConfig = observer(function DiscreetScannerConfig() {
  const scanners = store.owned.discreet_neural_scanner || 0;
  if (scanners <= 0) return null; // nothing to show until the first Scanner is built
  const pct = (store.scanFrac * 100).toFixed(4);
  return (
    <div className="card-config scan-config">
      <div className="cfg-head">
        <span className="cfg-label">{pct}% scanned</span>
        <span className="cfg-value"><FmtValue value={store.peopleScanned} /> / <FmtValue value={store.humanPopulation} /></span>
      </div>
      <div className="scan-globe">
        <EarthScanner
          size={EARTH_SIZE}
          scannedFraction={store.scanFrac}
          dotCount={scanDotCount(scanners)}
        />
      </div>
    </div>
  );
});

// Register on the Discreet Neural Scanner building so the Construction panel renders
// this component inside that building's card. Importing this module performs the
// registration as a side effect.
BUILDINGS.discreet_neural_scanner.ConfigComponent = DiscreetScannerConfig;
