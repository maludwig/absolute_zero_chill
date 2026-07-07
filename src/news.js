/* news.js — pure data: ordered chains of ambient "news ticker" events.
   Each chain is a sequence where item N is only ever relevant once item N-1
   has already fired (e.g. you can't report the probe going bankrupt before
   it's even been reported missing). The store only ever looks at the head of
   one chain per tick (see store.js: runOneEventCheck), so:
     - later, more specific conditions (day > 900) are never evaluated while
       an earlier one (day > 5) hasn't fired yet — no wasted checks
     - the amount of total news content can grow indefinitely without making
       any single tick more expensive; cost is O(1) per tick, always
     - each chain self-prunes: once its last item fires it's dropped entirely

   `test(s)` must be a pure read of store state — no side effects — and should
   return true once the condition is met. `action(s)` runs exactly once, the
   tick after `test` first returns true, and is normally just `s.addNews(...)`.
   Both take the store instance as `s` so these are testable against an
   isolated createStore() instance, not just the live singleton. */

export const CLIMATE_NEWS_CHAIN = [
  {
    key: "news_geneva_cancelled",
    test: (s) => s.surfaceTemp <= 285,
    action: (s) => s.addNews("Geneva climate summit cancelled, party planned instead!"),
  },
  {
    key: "news_geneva_rescheduled",
    test: (s) => s.surfaceTemp <= 284,
    action: (s) => s.addNews("Geneva climate summit rescheduled, ice age prep?"),
  },
];

export const PROBE_NEWS_CHAIN = [
  {
    key: "news_probe_launched",
    test: (s) => s.explore.day > 5,
    action: (s) => s.addNews("Space Excavation Probe Launched To Mine Space!"),
  },
  {
    key: "news_probe_trouble_1",
    test: (s) => s.explore.day > 365,
    action: (s) => s.addNews("Space Exc. Probe Unresponsive, Stocks Plummet?"),
  },
  {
    key: "news_probe_trouble_2",
    test: (s) => s.explore.day > 900,
    action: (s) => s.addNews("Space Exc. Loses Major Copyright Naming Lawsuit, Goes Bankrupt"),
  },
];

// Moved out of story.js's DEFENSE_CHAIN — building a MAC Gun Station has no
// story-gating consequences (nothing downstream reads its flag), so it's
// flavor, not a narrative beat. Keeps the same "firstGun" key.
export const DEFENSE_NEWS_CHAIN = [
  {
    key: "firstGun",
    test: (s) => s.owned.mac_gun_station >= 1,
    action: (s) => s.addNews("Fleet under fire from unexpected massive space gun!"),
  },
];

// Every named chain, combined — this is what store.js actually imports.
// Add new named chains above and append them here.
export const ALL_NEWS_CHAINS = [
  CLIMATE_NEWS_CHAIN,
  PROBE_NEWS_CHAIN,
  DEFENSE_NEWS_CHAIN,
];
