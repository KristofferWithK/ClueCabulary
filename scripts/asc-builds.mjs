// What App Store Connect thinks of our uploads, from a terminal.
//
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_P8="$(cat AuthKey.p8)" \
//     node scripts/asc-builds.mjs
//
// Apple processes an upload for a few minutes before it appears in TestFlight,
// and a build can also be rejected AFTER a successful upload — for an invalid
// binary, a missing export-compliance answer, a version already used. None of
// that shows up in the CI log, which ends the moment the upload does.
import { createSign } from 'node:crypto'

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: key } = process.env
if (!kid || !iss || !key) {
  console.log('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the whole .p8 text).')
  process.exit(0)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const signing = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({
  iss,
  iat: now,
  exp: now + 600,
  aud: 'appstoreconnect-v1',
})}`
const sig = createSign('SHA256')
  .update(signing)
  .sign({ key: key.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' })
  .toString('base64url')
const jwt = `${signing}.${sig}`

const api = async (path) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return res.json()
}

const apps = await api('apps?limit=200')
const app = apps.data.find((a) => a.attributes.bundleId === 'com.kristofferwithk.cluecabulary')
if (!app) {
  console.log('No app record for com.kristofferwithk.cluecabulary.')
  process.exit(1)
}
console.log(`${app.attributes.name} (${app.attributes.bundleId})\n`)

const builds = await api(`builds?filter[app]=${app.id}&limit=10&sort=-uploadedDate`)
if (!builds.data.length) {
  console.log('No builds yet. Apple takes a few minutes after an upload.')
  process.exit(0)
}
for (const b of builds.data) {
  const a = b.attributes
  console.log(
    `build ${a.version}  ${a.processingState}` +
      `${a.expired ? ' (expired)' : ''}  uploaded ${a.uploadedDate}`,
  )
}
console.log(
  '\nVALID means it is installable: add yourself to Internal Testing in App Store Connect,' +
    '\nand the TestFlight app on the phone offers it.',
)
