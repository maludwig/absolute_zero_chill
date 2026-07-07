// Vitest setup — runs before every test file.
//
// React 18+ checks this global before letting `act()` batch/flush updates
// quietly. Without it, every state update inside act() (or inside a timer
// that a component's effect schedules) prints:
//   "Warning: The current testing environment is not configured to
//    support act(...)"
// even though the test is using act() correctly. This is a one-line fix,
// not a real environment mismatch — see https://github.com/reactwg/react-18/discussions/102
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
