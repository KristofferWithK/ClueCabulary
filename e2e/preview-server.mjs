import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Start a preview server for one drive and wait until it actually answers.
 *
 * Every drive used to spawn `vite preview --strictPort` and sleep. If something
 * already held the port — an orphan from a drive that crashed before its
 * cleanup ran — vite exited quietly and the drive talked to that stale server
 * instead, serving a build from an hour ago. That failed in ways that looked
 * like app bugs and cost more time than it should have. Now a port that is not
 * ours is a loud, immediate failure.
 */
export async function startPreview(port) {
  // Spawn vite's bin through the current node — `spawn('npx', …)` is ENOENT on
  // Windows, where npx is npx.cmd and .cmd files need a shell to execute.
  const viteBin = resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  // --host 127.0.0.1: on Windows vite's default `localhost` binds ::1 only,
  // while every drive (and the base URL below) talks IPv4.
  const proc = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: ROOT,
      stdio: 'ignore',
    },
  )

  let exited = false
  proc.on('exit', () => {
    exited = true
  })

  const base = `http://127.0.0.1:${port}/ClueCabulary/`
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `vite preview exited on port ${port} — something else is probably holding it. ` +
          `Check with: pgrep -af '\\.bin/vite'`,
      )
    }
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1500) })
      // A stale orphan answers too, so insist on a body this build would serve.
      if (res.ok && (await res.text()).includes('ClueCabulary')) {
        return { proc, base, port, stop: () => proc.kill() }
      }
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  proc.kill()
  throw new Error(`preview server on port ${port} never answered`)
}
