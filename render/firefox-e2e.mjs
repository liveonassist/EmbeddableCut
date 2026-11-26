// SPDX-License-Identifier: MIT

// Firefox end-to-end: renders through the headless harness in stock Firefox,
// driven over WebDriver BiDi, and probes what comes out. Covers what differs
// from Chromium: H.264 and HEVC decode (HEVC through the media element, where
// Firefox's WebCodecs has none), AAC through the WASM encoder, HLS read by
// the engine rather than a <video>, and GPU effects through the frame upload
// Firefox needs. WebGPU is forced on: release Firefox enables it on Windows
// and Apple Silicon only.
//
// Usage: node render/firefox-e2e.mjs   (requires dist/, ffmpeg and Firefox;
// EMBEDDABLECUT_FIREFOX_PATH names the binary)

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createHarnessServer } from './server.mjs'
import { launchFirefox } from './lib/firefox-bidi.mjs'
import { HARNESS_DIST } from './lib/paths.mjs'

const execFileAsync = promisify(execFile)
const FPS = 30
const FRAMES = 30
const WIDTH = 320
const HEIGHT = 180

async function ffmpeg(args) {
  await execFileAsync('ffmpeg', ['-v', 'error', '-y', ...args], { timeout: 120_000 })
}

async function generateMedia(dir) {
  // Tagged BT.709, as cameras write it: untagged video leaves the YUV matrix to
  // each decoder's default, and Firefox's <video> and WebCodecs pick differently.
  const source = [
    ...['-f', 'lavfi', '-i', `testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=2`],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000'],
    ...['-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-colorspace', 'bt709'],
    ...['-color_primaries', 'bt709', '-color_trc', 'bt709'],
  ]
  const h264 = path.join(dir, 'h264.mp4')
  const hevc = path.join(dir, 'hevc.mp4')
  const hls = path.join(dir, 'hls')
  fs.mkdirSync(hls)
  await ffmpeg([...source, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', h264])
  // An open GOP with B-frames, as phones write it.
  await ffmpeg([
    ...source,
    ...['-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'],
    ...['-x265-params', 'log-level=error:keyint=24:open-gop=1', '-c:a', 'aac', hevc],
  ])
  await ffmpeg([
    ...source,
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(FPS), '-c:a', 'aac'],
    ...['-f', 'hls', '-hls_time', '1', '-hls_playlist_type', 'vod'],
    ...['-hls_segment_filename', path.join(hls, 'seg%03d.ts'), path.join(hls, 'index.m3u8')],
  ])
  return { h264, hevc, hls }
}

/** A cross-origin HLS host with CORS, CORP and ranges, as a CDN serves one. */
function startStreamHost(dir) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Range')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Accept-Ranges', 'bytes')
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()
    const name = path.basename(new URL(req.url, 'http://host').pathname)
    const filePath = path.join(dir, name)
    if (!fs.existsSync(filePath)) return void res.writeHead(404).end()
    const size = fs.statSync(filePath).size
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
    const start = match ? Number(match[1]) : 0
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    res.writeHead(match ? 206 : 200, {
      'Content-Type': name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      'Content-Length': end - start + 1,
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: (name) => `http://127.0.0.1:${server.address().port}/${name}`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    ),
  )
}

const track = (id, kind, order) => ({
  id,
  name: id,
  kind,
  height: 60,
  locked: false,
  syncLock: true,
  visible: true,
  muted: false,
  solo: false,
  order,
  items: [],
})

const clip = (mediaId, extra = {}) => ({
  id: `clip-${mediaId}`,
  trackId: 'v1',
  from: 0,
  durationInFrames: FRAMES,
  label: mediaId,
  type: 'video',
  mediaId,
  sourceFps: FPS,
  sourceStart: 0,
  sourceEnd: FRAMES,
  sourceDuration: FPS * 2,
  speed: 1,
  volume: 0,
  ...extra,
})

const settings = (codec, audioCodec, container) => ({
  mode: 'video',
  codec,
  audioCodec,
  container,
  quality: 'high',
  resolution: { width: WIDTH, height: HEIGHT },
  fps: FPS,
  videoBitrate: 2_000_000,
  audioBitrate: 128_000,
})

/** Renders a timeline in the page and hands back the file, base64-encoded. */
function renderInPage(input) {
  return `(async () => {
    const input = ${JSON.stringify(input)}
    let file = null
    const summary = await window.embeddablecut.renderTimeline({
      transitions: [], fps: ${FPS}, width: ${WIDTH}, height: ${HEIGHT}, backgroundColor: '#000000',
      ...input,
      onProgress: () => {},
      deliver: (blob) => { file = blob },
    })
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { summary, data: btoa(binary) }
  })()`
}

async function probe(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    ...['-v', 'error', '-count_frames', '-show_entries'],
    'stream=codec_type,codec_name,width,height,nb_read_frames',
    ...['-of', 'json', filePath],
  ])
  return JSON.parse(stdout).streams
}

/** Mean SSIM of a render against the first frames of its source. */
async function ssimAgainst(render, source) {
  const { stderr } = await execFileAsync('ffmpeg', [
    ...['-v', 'info', '-i', render, '-i', source, '-lavfi'],
    `[1:v]trim=end_frame=${FRAMES},setpts=PTS-STARTPTS,format=yuv420p[s];[0:v]format=yuv420p,setpts=PTS-STARTPTS[r];[r][s]ssim`,
    ...['-f', 'null', '-'],
  ])
  return Number(/All:([\d.]+)/.exec(stderr)?.[1] ?? 0)
}

async function main() {
  if (!fs.existsSync(path.join(HARNESS_DIST, 'headless.html'))) {
    throw new Error('Harness not built: run `just web build` first')
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embeddablecut-firefox-e2e-'))
  const files = await generateMedia(dir)
  const harness = await createHarnessServer({
    distDir: HARNESS_DIST,
    resolveMedia: (id) => ({ h264: files.h264, hevc: files.hevc })[id] ?? null,
  })
  const streams = await startStreamHost(files.hls)
  // EMBEDDABLECUT_FIREFOX_WEBGPU=default keeps release Firefox's own setting,
  // which is WebGPU off on Linux: everything but the GPU effect still renders.
  const firefox = await launchFirefox({
    prefs:
      process.env.EMBEDDABLECUT_FIREFOX_WEBGPU === 'default' ? {} : { 'dom.webgpu.enabled': true },
  })
  const errors = []
  firefox.onConsole(({ level, text }) => {
    if (level === 'error') errors.push(text)
  })

  try {
    await firefox.goto(harness.harnessUrl)
    await firefox.evaluate(`(async () => {
      for (let i = 0; i < 150 && !window.embeddablecut?.ready; i++) await new Promise((r) => setTimeout(r, 200))
      if (!window.embeddablecut?.ready) throw new Error('harness not ready')
    })()`)
    const browser = await firefox.evaluate(`(async () => ({
      webgpu: !!navigator.gpu,
      hevcInElement: document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"') !== '',
      hevcInWebCodecs: (await VideoDecoder.isConfigSupported({ codec: 'hvc1.1.6.L120.90', codedWidth: 320, codedHeight: 180 })).supported,
    }))()`)
    console.log(`Firefox ${firefox.browserVersion}:`, browser)

    const media = (id) => [{ mediaId: id, url: harness.mediaUrl(id) }]
    const cases = [
      {
        name: 'H.264 to H.264/AAC (WASM AAC encoder)',
        file: 'h264.mp4',
        input: {
          tracks: [track('v1', 'video', 0), track('a1', 'audio', 1)],
          items: [
            clip('h264', { linkedGroupId: 'g' }),
            { ...clip('h264', { linkedGroupId: 'g' }), id: 'audio', trackId: 'a1', type: 'audio' },
          ],
          media: media('h264'),
          settings: settings('avc', 'aac', 'mp4'),
        },
        expect: { video: 'h264', audio: 'aac' },
        source: files.h264,
      },
      {
        name: 'HLS read by the engine, to VP9',
        file: 'hls.webm',
        input: {
          tracks: [track('v1', 'video', 0)],
          items: [clip('hls')],
          media: [{ mediaId: 'hls', url: streams.url('index.m3u8') }],
          settings: settings('vp9', 'opus', 'webm'),
        },
        expect: { video: 'vp9' },
      },
      browser.webgpu && {
        name: 'GPU effect on H.264, to VP9',
        file: 'effect.webm',
        input: {
          tracks: [track('v1', 'video', 0)],
          items: [
            clip('h264', {
              effects: [
                {
                  id: 'blur',
                  enabled: true,
                  effect: { type: 'gpu-effect', gpuEffectType: 'gpu-rgb-split', params: {} },
                },
              ],
            }),
          ],
          media: media('h264'),
          settings: settings('vp9', 'opus', 'webm'),
        },
        expect: { video: 'vp9' },
      },
      browser.webgpu &&
        browser.hevcInElement &&
        !browser.hevcInWebCodecs && {
          name: 'GPU transition from H.264 into HEVC, to VP9',
          file: 'transition.webm',
          input: {
            tracks: [track('v1', 'video', 0)],
            items: [
              { ...clip('h264'), id: 'left', durationInFrames: 15, sourceEnd: 15 },
              {
                ...clip('hevc'),
                id: 'right',
                from: 15,
                durationInFrames: 15,
                sourceStart: 15,
                sourceEnd: 30,
              },
            ],
            transitions: [
              {
                id: 'glitch',
                type: 'crossfade',
                presentation: 'glitch',
                timing: 'linear',
                leftClipId: 'left',
                rightClipId: 'right',
                trackId: 'v1',
                durationInFrames: 10,
                alignment: 0.5,
              },
            ],
            media: [...media('h264'), ...media('hevc')],
            settings: settings('vp9', 'opus', 'webm'),
          },
          expect: { video: 'vp9' },
        },
      browser.hevcInElement &&
        !browser.hevcInWebCodecs && {
          name: 'HEVC through the media element, to VP9',
          file: 'hevc.webm',
          input: {
            tracks: [track('v1', 'video', 0)],
            items: [clip('hevc')],
            media: media('hevc'),
            settings: settings('vp9', 'opus', 'webm'),
          },
          expect: { video: 'vp9' },
          source: files.hevc,
        },
    ].filter(Boolean)

    for (const testCase of cases) {
      const started = Date.now()
      const { summary, data } = await firefox.evaluate(renderInPage(testCase.input))
      assert.equal(summary.ok, true, `${testCase.name}: ${JSON.stringify(summary)}`)
      const output = path.join(dir, testCase.file)
      fs.writeFileSync(output, Buffer.from(data, 'base64'))
      const probed = await probe(output)
      const video = probed.find((stream) => stream.codec_type === 'video')
      assert.equal(video?.codec_name, testCase.expect.video, `${testCase.name}: video codec`)
      assert.equal(Number(video.nb_read_frames), FRAMES, `${testCase.name}: frame count`)
      if (testCase.expect.audio) {
        const audio = probed.find((stream) => stream.codec_type === 'audio')
        assert.equal(audio?.codec_name, testCase.expect.audio, `${testCase.name}: audio codec`)
      }
      let detail = ''
      if (testCase.source) {
        const ssim = await ssimAgainst(output, testCase.source)
        assert.ok(ssim > 0.93, `${testCase.name}: SSIM against the source is ${ssim}`)
        detail = `, SSIM ${ssim.toFixed(3)}`
      }
      console.log(`  ✓ ${testCase.name} (${Date.now() - started} ms${detail})`)
    }
    const unexpected = errors.filter(
      (text) => !/garbage collected without first being closed/.test(text),
    )
    assert.deepEqual(unexpected, [], 'console errors')
    console.log('Firefox e2e passed')
  } finally {
    await firefox.close()
    await streams.close()
    await harness.close()
    if (process.env.EMBEDDABLECUT_KEEP_OUTPUT) console.log(`Outputs kept in ${dir}`)
    else fs.rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('\nFIREFOX E2E FAILED:', error)
  process.exit(1)
})
