// Draws the app icon (a white broom on an indigo gradient) into public/ as PNGs,
// because iOS needs a PNG for the home-screen icon. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
const png = (size, pixel) => {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      raw.set([r, g, b, 255], y * (size * 4 + 1) + 1 + x * 4)
    }
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(size, 0)
  head.writeUInt32BE(size, 4)
  head.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const lerp = (a, b, t) => a + (b - a) * t
const TILT = (-35 * Math.PI) / 180

const capsule = (x, y, ax, ay, bx, by, r) => {
  const dx = bx - ax,
    dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= r
}
const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r),
    qy = Math.abs(y - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r
}
const sparkle = (x, y, cx, cy, s) => (Math.abs(x - cx) / s) ** 0.6 + (Math.abs(y - cy) / s) ** 0.6 <= 1

/** White coverage (0..1) of the broom and sparkles at a point in 0..1 icon space. */
const shape = (px, py) => {
  if (sparkle(px, py, 0.2, 0.4, 0.085) || sparkle(px, py, 0.82, 0.38, 0.05)) return 1
  // The broom is drawn upright around the centre, then tilted.
  const dx = px - 0.5,
    dy = py - 0.5
  const x = Math.cos(TILT) * dx + Math.sin(TILT) * dy
  const y = -Math.sin(TILT) * dx + Math.cos(TILT) * dy
  if (capsule(x, y, 0, -0.38, 0, 0.06, 0.03)) return 1
  if (roundRect(x, y, 0, 0.1, 0.09, 0.045, 0.02)) return 1
  // Bristles: a trapezoid that widens towards the floor, with a few gaps between tufts.
  const t = (y - 0.15) / 0.26
  if (t >= 0 && t <= 1 && Math.abs(x) <= lerp(0.09, 0.17, t)) {
    const w = lerp(0.09, 0.17, t)
    for (const k of [-0.5, 0, 0.5]) if (t > 0.35 && Math.abs(x - k * w) < 0.007) return 0.45
    return 1
  }
  return 0
}

/** `scale` shrinks the mark, for maskable icons that need a safe zone. */
const draw = (size, scale = 1) =>
  png(size, (x, y) => {
    const n = 4
    let cover = 0
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const u = (x + (i + 0.5) / n) / size
        const v = (y + (j + 0.5) / n) / size
        cover += shape(0.5 + (u - 0.5) / scale, 0.5 + (v - 0.5) / scale)
      }
    const a = cover / (n * n)
    const t = (x + y) / (2 * size)
    const bg = [lerp(142, 80, t), lerp(142, 80, t), lerp(247, 205, t)]
    return bg.map((c) => Math.round(lerp(c, 255, a)))
  })

mkdirSync('public', { recursive: true })
writeFileSync('public/apple-touch-icon.png', draw(180))
writeFileSync('public/icon-192.png', draw(192))
writeFileSync('public/icon-512.png', draw(512))
writeFileSync('public/icon-maskable-512.png', draw(512, 0.8))
