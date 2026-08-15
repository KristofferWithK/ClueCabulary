// Generates the PWA icons without any image dependencies: a word-grid motif
// (four rounded tiles — teal, slate, slate, red) on the app background.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [0xff, 0xff, 0xff]
const SLATE = [0xe3, 0xdf, 0xd3] // beige neutral tile
const TEAL = [0x6a, 0xaa, 0x64] // green target tile
const RED = [0x12, 0x12, 0x12] // black forbidden tile

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function png(size, pixelAt, { alpha = true } = {}) {
  // App Store icons must carry no alpha channel — Apple rejects them — so the
  // iOS icon is written as plain RGB while the web ones keep RGBA.
  const bpp = alpha ? 4 : 3
  const raw = Buffer.alloc(size * (size * bpp + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * bpp + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y)
      const o = row + 1 + x * bpp
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      if (alpha) raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = alpha ? 6 : 2 // RGBA, or RGB for iOS
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const inRoundedRect = (x, y, x0, y0, w, h, r) => {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r))
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r))
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= x0 + r && x < x0 + w - r) || (y >= y0 + r && y < y0 + h - r)
}

/**
 * @param size    pixel dimension
 * @param margin  fraction of the size to leave clear around the grid. A
 *                maskable icon may be cropped to a circle of 40% radius, so
 *                the artwork has to sit inside that or Android shears the
 *                corner tiles off. The plain icon can afford a tighter frame.
 */
function iconPixel(size, margin = 0.14) {
  // 2×2 tile grid with margins, one teal (green/target) and one red (forbidden).
  const m = size * margin // outer margin
  const gap = size * 0.06
  const tile = (size - 2 * m - gap) / 2
  const r = tile * 0.22
  const tiles = [
    { x: m, y: m, color: TEAL },
    { x: m + tile + gap, y: m, color: SLATE },
    { x: m, y: m + tile + gap, color: SLATE },
    { x: m + tile + gap, y: m + tile + gap, color: RED },
  ]
  return (x, y) => {
    for (const t of tiles) {
      if (inRoundedRect(x, y, t.x, t.y, tile, tile, r)) return t.color
    }
    return BG
  }
}

// Anchor to the repo, not the cwd, so regeneration works from anywhere.
const OUT_DIR = new URL('../public/icons/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, OUT_DIR), png(size, iconPixel(size)))
  console.log(`public/icons/icon-${size}.png`)
}

// The manifest used to point `purpose: 'maskable'` at the plain icon, whose
// grid runs to within 14% of the edge — outside the safe zone, so a circular
// mask clipped the corner tiles. This one keeps the grid well inside it.
writeFileSync(new URL('icon-512-maskable.png', OUT_DIR), png(512, iconPixel(512, 0.28)))
console.log('public/icons/icon-512-maskable.png')

// The App Store icon: 1024px, no alpha, into the slot the Capacitor template
// reserves for it. Skipped quietly when the iOS project is not checked out.
import { existsSync } from 'node:fs'
const IOS_ICON = new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url)
if (existsSync(new URL('../ios/', import.meta.url))) {
  writeFileSync(IOS_ICON, png(1024, iconPixel(1024), { alpha: false }))
  console.log('ios/.../AppIcon-512@2x.png (1024, no alpha)')
}
