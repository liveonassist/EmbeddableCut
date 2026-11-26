// SPDX-License-Identifier: MIT

/**
 * Drives stock Firefox over WebDriver BiDi, the protocol Firefox ships.
 * Playwright's Firefox is a patched build of its own, so this tests the
 * browser users run: `EMBEDDABLECUT_FIREFOX_PATH`, else `firefox` on the PATH.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONNECT_TIMEOUT_MS = 30_000

/** Prefs every run needs: no first-run pages, no crash-recovery prompt blocking a headless start. */
const BASE_PREFS = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.startup.max_resumed_crashes': -1,
  'browser.sessionstore.resume_from_crash': false,
}

function userJs(prefs) {
  return Object.entries(prefs)
    .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
    .join('\n')
}

/**
 * Launches Firefox with a throwaway profile and returns a session on its
 * first tab. `prefs` are added to the profile (`dom.webgpu.enabled` turns
 * WebGPU on where release Firefox doesn't, as on Linux).
 */
export async function launchFirefox({ prefs = {}, headless = true, port = 0 } = {}) {
  const executable = process.env.EMBEDDABLECUT_FIREFOX_PATH || 'firefox'
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'embeddablecut-firefox-'))
  fs.writeFileSync(path.join(profile, 'user.js'), userJs({ ...BASE_PREFS, ...prefs }))
  const remotePort = port || 9300 + Math.floor(Math.random() * 600)
  const args = ['--no-remote', '--profile', profile, '--remote-debugging-port', String(remotePort)]
  if (headless) args.unshift('--headless')
  // Detached into its own group: `firefox` is often a wrapper script, and the
  // browser it starts would otherwise outlive it and keep the profile locked.
  const child = spawn(executable, args, { stdio: 'ignore', detached: true })
  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }

  let socket
  const deadline = Date.now() + CONNECT_TIMEOUT_MS
  while (!socket && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    try {
      const candidate = new WebSocket(`ws://127.0.0.1:${remotePort}/session`)
      await new Promise((resolve, reject) => {
        candidate.onopen = resolve
        candidate.onerror = reject
      })
      socket = candidate
    } catch {
      // Not listening yet.
    }
  }
  if (!socket) {
    kill()
    fs.rmSync(profile, { recursive: true, force: true })
    throw new Error(`Firefox (${executable}) didn't open WebDriver BiDi on port ${remotePort}`)
  }

  let nextId = 0
  const pending = new Map()
  const consoleListeners = new Set()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.type === 'error') reject(new Error(`${message.error}: ${message.message}`))
      else resolve(message.result)
    } else if (message.method === 'log.entryAdded') {
      const entry = message.params
      const text = entry.text ?? entry.args?.map((arg) => arg.value ?? arg.type).join(' ') ?? ''
      for (const listener of consoleListeners) listener({ level: entry.level, text })
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const { capabilities } = await send('session.new', { capabilities: {} })
  await send('session.subscribe', { events: ['log.entryAdded'] })
  const { contexts } = await send('browsingContext.getTree', {})
  const context = contexts[0].context

  return {
    browserVersion: capabilities.browserVersion,
    onConsole(listener) {
      consoleListeners.add(listener)
      return () => consoleListeners.delete(listener)
    },
    async goto(url) {
      await send('browsingContext.navigate', { context, url, wait: 'complete' })
    },
    /** Evaluates an expression in the page, awaiting a promise; returns its JSON value. */
    async evaluate(expression) {
      const result = await send('script.evaluate', {
        expression: `(async () => JSON.stringify(await (${expression})))()`,
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
      })
      if (result.type === 'exception') {
        throw new Error(`In Firefox: ${result.exceptionDetails.text}`)
      }
      return result.result.type === 'string' ? JSON.parse(result.result.value) : undefined
    },
    async close() {
      await send('browser.close').catch(() => {})
      socket.close()
      kill()
      fs.rmSync(profile, { recursive: true, force: true })
    },
  }
}
