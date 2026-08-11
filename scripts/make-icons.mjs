// Generates the PWA icons without any image dependencies: a word-grid motif
// (four rounded tiles — teal, slate, slate, red) on the app background.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [0x1a, 0x1d, 0x29]
const SLATE = [0x2f, 0x34, 0x47]
const TEAL = [0x14, 0xb8, 0xa6]
const RED = [0xdc, 0x62, 0x62]

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function png(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y)
      const o = row + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
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

function iconPixel(size) {
  // 2×2 tile grid with margins, one teal (green/target) and one red (forbidden).
  const m = size * 0.14 // outer margin
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

mkdirSync('public/icons', { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size, iconPixel(size)))
  console.log(`public/icons/icon-${size}.png`)
}
