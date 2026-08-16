// The signing certificates Apple is holding for this account, and a way to
// clear out the ones CI made.
//
//   node scripts/asc-certs.mjs           # list
//   node scripts/asc-certs.mjs --prune   # revoke the disposable ones
//
// Every CI run signs on a fresh machine with an empty keychain, so cloud
// signing mints a new certificate rather than finding one. Apple caps how many
// an account may hold, and a dozen builds later every build fails with "choose
// a certificate to revoke" — which reads like a configuration problem and is
// really just litter.
//
// Development certificates are safe to revoke wholesale: cloud signing creates
// another the moment a build needs one, and nothing here signs from a laptop.
// Distribution certificates are pruned to the newest one, because a build in
// flight may be relying on it.
import { createSign } from 'node:crypto'

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: key } = process.env
const PRUNE = process.argv.includes('--prune')

if (!kid || !iss || !key) {
  console.log('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8.')
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
    headers: { Authorization: `Bearer ${jwt}`, ...init.headers },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}\n  ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

const certs = (await api('certificates?limit=200')).data
  .map((c) => ({ id: c.id, ...c.attributes }))
  .sort((a, b) => (a.expirationDate < b.expirationDate ? 1 : -1))

console.log(`${certs.length} certificates:`)
for (const c of certs) {
  console.log(`  ${c.certificateType.padEnd(22)} ${c.displayName ?? c.name ?? ''} expires ${c.expirationDate?.slice(0, 10)}`)
}

if (!PRUNE) {
  console.log('\nRe-run with --prune to revoke the disposable ones.')
  process.exit(0)
}

const isDev = (c) => /DEVELOPMENT/i.test(c.certificateType)
const isDist = (c) => /DISTRIBUTION/i.test(c.certificateType)
// Keep the newest distribution certificate; everything else CI made is litter.
const keep = new Set(certs.filter(isDist).slice(0, 1).map((c) => c.id))
const doomed = certs.filter((c) => (isDev(c) || isDist(c)) && !keep.has(c.id))

console.log(`\nkeeping ${keep.size}, revoking ${doomed.length}`)
for (const c of doomed) {
  try {
    await api(`certificates/${c.id}`, { method: 'DELETE' })
    console.log(`  revoked ${c.certificateType} ${c.displayName ?? ''}`)
  } catch (e) {
    // A certificate in use by a profile can refuse; that is not fatal here.
    console.log(`  could not revoke ${c.id}: ${String(e).split('\n')[0]}`)
  }
}
