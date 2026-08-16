// Why TestFlight is showing nothing, answered by App Store Connect itself.
//
//   node scripts/asc-testers.mjs          # report only
//   node scripts/asc-testers.mjs --fix    # create the group, add the account
//                                         # holder, attach the newest build
//
// A build being VALID is not the same as a build being INSTALLABLE. It has to
// belong to an internal beta group, that group has to contain a tester, and
// the tester has to be a real user of this App Store Connect account. Miss any
// one and the TestFlight app offers nothing but a Redeem button, with no hint
// as to which link in the chain is missing.
import { createSign } from 'node:crypto'

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: key } = process.env
const FIX = process.argv.includes('--fix')
const BUNDLE = 'com.kristofferwithk.cluecabulary'

if (!kid || !iss || !key) {
  console.log('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the whole .p8 text).')
  process.exit(0)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const head = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({
  iss,
  iat: now,
  exp: now + 600,
  aud: 'appstoreconnect-v1',
})}`
const jwt = `${head}.${createSign('SHA256')
  .update(head)
  .sign({ key: key.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' })
  .toString('base64url')}`

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    // Apple's errors are specific and worth reading verbatim rather than
    // summarising into "something went wrong".
    let detail = text
    try {
      detail = JSON.parse(text).errors.map((e) => `${e.title}: ${e.detail}`).join('\n  ')
    } catch {
      /* not JSON */
    }
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}\n  ${detail}`)
  }
  return text ? JSON.parse(text) : {}
}

const app = (await api('apps?limit=200')).data.find((a) => a.attributes.bundleId === BUNDLE)
if (!app) {
  console.log(`No app record for ${BUNDLE}.`)
  process.exit(1)
}
console.log(`app: ${app.attributes.name}\n`)

const builds = (await api(`builds?filter[app]=${app.id}&limit=5&sort=-uploadedDate`)).data
console.log('builds:')
for (const b of builds) console.log(`  ${b.attributes.version}  ${b.attributes.processingState}`)

const groups = (await api(`apps/${app.id}/betaGroups?limit=50`)).data
console.log(`\ninternal groups: ${groups.length || 'NONE — this is why TestFlight is empty'}`)
for (const g of groups) {
  const testers = (await api(`betaGroups/${g.id}/betaTesters?limit=200`)).data
  const gBuilds = (await api(`betaGroups/${g.id}/builds?limit=10`)).data
  console.log(
    `  "${g.attributes.name}" internal=${g.attributes.isInternalGroup}` +
      ` auto=${g.attributes.hasAccessToAllBuilds ?? false}` +
      ` testers=${testers.length} builds=${gBuilds.length}`,
  )
  for (const t of testers) console.log(`     tester: ${t.attributes.email} (${t.attributes.state ?? 'invited'})`)
}

const users = (await api('users?limit=200')).data
console.log('\naccount users (an internal tester must be one of these):')
for (const u of users) console.log(`  ${u.attributes.email}  roles=${u.attributes.roles.join(',')}`)

if (!FIX) {
  console.log('\nRe-run with --fix to create an internal group, add the account holder and attach the newest build.')
  process.exit(0)
}

// ---- --fix ----------------------------------------------------------------
const newest = builds.find((b) => b.attributes.processingState === 'VALID')
if (!newest) {
  console.log('\nNo VALID build to attach yet.')
  process.exit(1)
}

let group = groups.find((g) => g.attributes.isInternalGroup)
if (!group) {
  group = (
    await api('betaGroups', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'betaGroups',
          attributes: { name: 'Internal', isInternalGroup: true, hasAccessToAllBuilds: true },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
      }),
    })
  ).data
  console.log(`\ncreated internal group "${group.attributes.name}"`)
}

const holder = users.find((u) => u.attributes.roles.includes('ADMIN')) ?? users[0]
const existing = (await api(`betaGroups/${group.id}/betaTesters?limit=200`)).data
if (holder && !existing.some((t) => t.attributes.email === holder.attributes.email)) {
  await api('betaTesters', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'betaTesters',
        attributes: {
          email: holder.attributes.email,
          firstName: holder.attributes.firstName ?? 'Tester',
          lastName: holder.attributes.lastName ?? 'One',
        },
        relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
      },
    }),
  })
  console.log(`added tester ${holder.attributes.email}`)
}

const attached = (await api(`betaGroups/${group.id}/builds?limit=10`)).data
if (!attached.some((b) => b.id === newest.id)) {
  await api(`betaGroups/${group.id}/relationships/builds`, {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'builds', id: newest.id }] }),
  })
  console.log(`attached build ${newest.attributes.version}`)
}
console.log('\nDone. Pull to refresh in the TestFlight app.')
