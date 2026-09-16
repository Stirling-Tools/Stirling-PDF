// The routes the Lighthouse gate audits.
//
// Deliberately small: every route costs a warm-up plus `--runs` Lighthouse
// passes, and the point is to watch the load paths that carry the bundle, not
// to sweep all ~50 tool URLs.
//
// No backend runs during the audit, which is what decides the list. Every route
// behind the app's auth gate settles on the login screen and so transfers the
// same bytes - measured, /compress and /settings landed within 10 bytes of / -
// so one entry stands in for all of them. What they do cover is the entire
// eager bundle, which downloads before the login screen paints.
//
// Adding or renaming one invalidates its baseline entry - re-record with
// `task frontend:lighthouse:record` in the same PR.
export const ROUTES = [
  {
    id: "home",
    path: "/",
    label: "Cold entry",
    why:
      "Everything a first visit downloads before anything is on screen: app " +
      "shell, fonts, eager chunks. Stands in for every auth-gated route.",
  },
  {
    id: "mobile-scanner",
    path: "/mobile-scanner",
    label: "Mobile scanner",
    why:
      "The public no-auth page, so it renders fully without a backend, and it " +
      "is by far the heaviest route in the build (jscanify/opencv). Nothing " +
      "else here would notice if the editor leaked into it.",
  },
];

/** Route ids, for --only filtering and for error messages. */
export const ROUTE_IDS = ROUTES.map((r) => r.id);
