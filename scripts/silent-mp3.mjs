/**
 * A valid, silent MP3, built byte by byte.
 *
 * Two things need one and neither can produce it: `make-audio.mjs --provider
 * stub` has to write files that are real enough for a browser to decode without
 * calling a paid API, and `e2e/offline-drive.mjs` has to put clips into `dist/`
 * so it can prove the service worker caches them. ffmpeg is not installed here
 * and a checked-in binary is exactly what F1 is not allowed to add, so the
 * bytes are assembled instead.
 *
 * They are MPEG-1 Layer III frames with a zeroed payload — the standard way to
 * express silence — at 128 kbps, 44.1 kHz, mono:
 *
 *   FF        sync
 *   FB        sync + MPEG-1, Layer III, no CRC
 *   90        bitrate index 9 (128 kbps), sample rate 00 (44.1 kHz), no padding
 *   C4        channel mode 11 (mono), original
 *
 * Frame length is floor(144 * bitrate / rate) = floor(144 * 128000 / 44100) =
 * 417 bytes, and each frame is 1152 samples, so 26.12 ms of nothing.
 */

const FRAME_HEADER = Uint8Array.from([0xff, 0xfb, 0x90, 0xc4])
const FRAME_BYTES = Math.floor((144 * 128000) / 44100) // 417
const FRAME_MS = (1152 / 44100) * 1000 // 26.12

/** @param {number} ms roughly how long the clip should be. @returns {Buffer} */
export function silentMp3(ms = 300) {
  const frames = Math.max(1, Math.round(ms / FRAME_MS))
  const out = Buffer.alloc(frames * FRAME_BYTES)
  for (let i = 0; i < frames; i++) out.set(FRAME_HEADER, i * FRAME_BYTES)
  return out
}
