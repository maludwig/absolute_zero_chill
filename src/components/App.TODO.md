# App.TODO.md

## Minor

- The economy-telemetry interval (l.110-121) fires every 10s of *real* time, independent
  of framejack. At ×100M a single 10s window covers ~500M game-days, so the "economy"
  telemetry series samples wildly different game-time gaps depending on the speed setting
  — fine for a live rate readout, but if anything ever treats those samples as evenly
  spaced in game-time (for balance graphs, integrals), it'll be wrong. Consider stamping
  each sample with game_t (pushTelemetry already does) and always reading that axis, never
  assuming uniform spacing.

Otherwise OK — clean composition + the (now well-documented) heartbeat loop.
