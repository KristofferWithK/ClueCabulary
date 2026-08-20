// The route, south to north and home again. Kept here so the story generator
// can check its nine champions against it without importing TypeScript.
// Must match the id order in src/journey/cities.ts — nothing imports this file
// yet, so nothing enforces that; it went stale once already when Viborg left.
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
