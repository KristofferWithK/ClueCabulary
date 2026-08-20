// The Danish route, south to north and home again. Kept here so the story
// generator can check its nine champions against it without importing
// TypeScript.
//
// Must match the id order in src/lang/da/route.ts, which is where the route
// moved when the language seam landed — nothing imports this file yet, so
// nothing enforces that; it went stale once already when Viborg left. A second
// language needs its own copy, or this needs to grow a language argument, and
// the second is the better answer if it is ever imported by anything.
export const CITIES = [
  'sonderborg',
  'ribe',
  'kolding',
  'aarhus',
  'aalborg',
  'skagen',
  'odense',
  'roskilde',
  'kobenhavn',
]
