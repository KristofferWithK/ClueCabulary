import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every drive's port, shifted by one number, so two checkouts of this repo can
 * run drives at the same time instead of silently measuring each other.
 *
 * The drives hold fixed ports (4173..4200) and that is fine for one tree. It
 * is not fine for two: a second worktree running the same drive finds the port
 * held, and — before the guard below existed — quietly talked to the other
 * tree's build. Three measurements in one session were wrong that way, each of
 * them a change reported as absent because the bundle serving it belonged to
 * somebody else.
 *
 *   DRIVE_PORT_OFFSET=100 npm run verify
 */
const OFFSET = Number(process.env.DRIVE_PORT_OFFSET ?? 0)

/** Whether we can bind it ourselves — asked before spawning, see below. */
const portFree = (port) =>
  new Promise((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    probe.once('listening', () => probe.close(() => done(true)))
    probe.listen(port, '127.0.0.1')
  })

/**
 * Start a preview server for one drive and wait until it actually answers.
 *
 * Every drive used to spawn `vite preview --strictPort` and sleep. If something
 * already held the port — an orphan from a drive that crashed before its
 * cleanup ran — vite exited quietly and the drive talked to that stale server
 * instead, serving a build from an hour ago. That failed in ways that looked
 * like app bugs and cost more time than it should have. A port that is not
 * ours is now a loud, immediate failure — genuinely so, since the first
 * version of that guard could still be beaten to the answer by the server it
 * was guarding against. See the check at the top of the function.
 */
export async function startPreview(requestedPort) {
  const port = requestedPort + OFFSET
  // Asked BEFORE spawning, because asking afterwards is a race this lost.
  //
  // The intent below — "a port that is not ours is a loud, immediate failure"
  // — was not what the code did. vite exits on a held port, but the exit event
  // arrives asynchronously, and the first fetch of the loop went out before it
  // did. A server already on the port answered, its body carried this app's
  // own name because it IS this app, and the drive returned happily and measured
  // another checkout's build. That is the exact silent-stale-server failure
  // this file was written to end, surviving inside the fix for it.
  if (!(await portFree(port))) {
    throw new Error(
      `port ${port} is already held, so this drive would measure whoever holds ` +
        `it rather than this build. Wait for them, or run with ` +
        `DRIVE_PORT_OFFSET set to move every drive's port out of the way.`,
    )
  }
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
      // Matched on the product name, not the base path above: the path is still
      // /ClueCabulary/ only until the owner renames the repo (D3), and this
      // check should not have to move with it.
      if (res.ok && (await res.text()).includes('900Words')) {
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
