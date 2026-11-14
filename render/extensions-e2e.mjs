// SPDX-License-Identifier: MIT
//
// Extensions and project documents on the render service. The service loads
// an extension module (a custom transition drawn with Canvas 2D, so no GPU is
// needed), reports it in its capabilities, renders a project document that
// requires it, and draws it where the transition sits. A document requiring
// an extension the service lacks, or written by a newer schema, is refused
// with the same codes the SDK uses.
//
// Usage: node render/extensions-e2e.mjs   (requires web/dist and ffmpeg)
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { HARNESS_DIST } from './lib/paths.mjs'

const execFileAsync = promisify(execFile)
const WIDTH = 320
const HEIGHT = 240
const FPS = 30
const CUT = 30
const TRANSITION = 'e2e.white-flash'

const EXTENSION_MODULE = `
export default {
  id: 'e2e.flash',
  transitions: [
    {
      definition: {
        id: '${TRANSITION}',
        label: 'White flash',
        description: 'Cuts through white',
        category: 'basic',
        icon: 'Sun',
        hasDirection: false,
        supportedTimings: ['linear'],
        defaultDuration: 10,
        minDuration: 2,
        maxDuration: 60,
      },
      renderer: {
        renderCanvas(ctx, _left, _right, _progress, _direction, canvas) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas?.width ?? ctx.canvas.width, canvas?.height ?? ctx.canvas.height)
        },
      },
    },
  ],
}
`

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const SOURCE_FRAMES = CUT * 2

/** A solid-colour clip in the workspace, as an imported media file would be. */
async function writeClip(workspace, mediaId, color) {
  const dir = path.join(workspace, 'media', mediaId)
  fs.mkdirSync(dir, { recursive: true })
  await execFileAsync('ffmpeg', [
    ...['-v', 'error', '-y', '-f', 'lavfi'],
    ...[
      '-i',
      `color=c=${color}:size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SOURCE_FRAMES / FPS}`,
    ],
    ...['-pix_fmt', 'yuv420p', '-c:v', 'libx264', path.join(dir, 'source.mp4')],
  ])
}

function asset(id) {
  return {
    id,
    fileName: `${id}.mp4`,
    mimeType: 'video/mp4',
    fileSize: 1,
    duration: SOURCE_FRAMES / FPS,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    codec: 'avc1.42c00d',
    bitrate: 1,
    source: { type: 'workspace' },
  }
}

/** A clip with handles on both sides of its edit, so a transition across the cut has frames to use. */
function clip(id, from, sourceStart) {
  return {
    id,
    type: 'video',
    trackId: 'v1',
    from,
    durationInFrames: CUT,
    label: id,
    mediaId: id,
    src: '',
    sourceStart,
    sourceEnd: sourceStart + CUT,
    sourceDuration: SOURCE_FRAMES,
    sourceFps: FPS,
    speed: 1,
  }
}

function document({
  requires = [{ kind: 'transition', id: TRANSITION }],
  projectSchema = 15,
} = {}) {
  return {
    format: 'embeddablecut.project',
    schemaVersion: 1,
    project: {
      id: 'flash',
      name: 'Flash',
      description: '',
      createdAt: 0,
      updatedAt: 0,
      duration: (CUT * 2) / FPS,
      schemaVersion: projectSchema,
      metadata: { width: WIDTH, height: HEIGHT, fps: FPS, backgroundColor: '#000000' },
      timeline: {
        tracks: [
          {
            id: 'v1',
            name: 'V1',
            kind: 'video',
            height: 80,
            locked: false,
            visible: true,
            muted: false,
            solo: false,
            order: 0,
          },
        ],
        items: [clip('red', 0, 0), clip('blue', CUT, CUT / 2)],
        transitions: [
          {
            id: 'flash',
            type: 'crossfade',
            presentation: TRANSITION,
            timing: 'linear',
            leftClipId: 'red',
            rightClipId: 'blue',
            trackId: 'v1',
            durationInFrames: 10,
            alignment: 0.5,
          },
        ],
      },
    },
    assets: [asset('red'), asset('blue')],
    requires,
  }
}

/** The PNG's centre pixel, decoded by ffmpeg. */
async function centrePixel(pngPath) {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      pngPath,
      '-vf',
      `crop=1:1:${WIDTH / 2}:${HEIGHT / 2}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { encoding: 'buffer' },
  )
  return [...stdout.subarray(0, 3)]
}

async function main() {
  if (!fs.existsSync(path.join(HARNESS_DIST, 'headless.html'))) {
    throw new Error('web/dist/headless.html is missing; run `just web build` first')
  }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'embeddablecut-extensions-'))
  fs.writeFileSync(
    path.join(workspace, '.freecut-workspace.json'),
    '{"schemaVersion":"2.0","createdAt":1}\n',
  )
  await writeClip(workspace, 'red', 'red')
  await writeClip(workspace, 'blue', 'blue')
  const extensionPath = path.join(workspace, 'flash-extension.js')
  fs.writeFileSync(extensionPath, EXTENSION_MODULE)
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const service = spawn(
    process.execPath,
    [
      'render/serve.mjs',
      '--workspace',
      workspace,
      '--port',
      String(port),
      '--extension',
      extensionPath,
    ],
    { cwd: path.resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let log = ''
  service.stdout.on('data', (chunk) => (log += chunk))
  service.stderr.on('data', (chunk) => (log += chunk))

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        if ((await fetch(`${base}/health`)).ok) break
      } catch {
        // Not listening yet.
      }
      if (attempt > 120) throw new Error(`service did not start:\n${log}`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const capabilities = await (await fetch(`${base}/v1/capabilities`)).json()
    assert.equal(capabilities.projectDocument, true)
    assert.deepEqual(capabilities.renderer.extensions, ['e2e.flash'])

    const post = (route, body) =>
      fetch(`${base}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    const frame = await post('/frame', { projectDocument: document(), frame: CUT, format: 'png' })
    assert.equal(frame.status, 200, await frame.clone().text())
    const framePath = path.join(workspace, 'flash.png')
    fs.writeFileSync(framePath, Buffer.from(await frame.arrayBuffer()))
    const [r, g, b] = await centrePixel(framePath)
    assert.ok(
      r > 240 && g > 240 && b > 240,
      `expected the flash at the cut, got rgb(${r}, ${g}, ${b})`,
    )

    const render = await post('/v1/render', {
      projectDocument: document(),
      codec: 'vp9',
      container: 'webm',
      quality: 'low',
    })
    assert.equal(render.status, 200, await render.clone().text())
    assert.ok((await render.arrayBuffer()).byteLength > 1000)

    const missing = await post('/v1/render', {
      projectDocument: document({ requires: [{ kind: 'effect', id: 'e2e.not-installed' }] }),
    })
    assert.equal(missing.status, 422)
    assert.equal((await missing.json()).error.code, 'EXTENSION_MISSING')

    const tooNew = await post('/frame', {
      projectDocument: document({ projectSchema: 999 }),
      frame: 0,
    })
    assert.equal(tooNew.status, 400)
    assert.equal((await tooNew.json()).error.code, 'SCHEMA_TOO_NEW')

    console.log('Extension and document contract passed')
  } catch (error) {
    console.error(log)
    throw error
  } finally {
    service.kill('SIGTERM')
    await new Promise((resolve) => service.once('exit', resolve))
    fs.rmSync(workspace, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
