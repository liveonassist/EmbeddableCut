// FreeCut headless render CLI.
//
// Renders a project from a workspace folder to a video file, driving the real
// render engine inside headless Chrome via the window.freecut harness.
//
// Usage:
//   node render/render.mjs --workspace <dir> --project <id|project.json> [options]
//   node render/render.mjs --workspace <dir> --batch <jobs.json>
//   node render/render.mjs --workspace <dir> --list
//
// --batch <jobs.json>: an array of job objects, each with the same keys as the
// CLI flags (project, out, codec, container, resolution, fps, quality, in,
// out-sec, duration, audio-only). All jobs share one --workspace and reuse a
// single warm browser.
//
// Options:
//   --out <path>           Output file (default: ./render/output/<name>.<ext>)
//   --codec <c>            h264|h265|vp9|vp8|av1 (default: h264, auto-fallback)
//   --container <c>        mp4|webm|mov|mkv (default: derived from codec)
//   --resolution <WxH>     Override output resolution (default: project metadata)
//   --fps <n>              Override fps (default: project metadata)
//   --quality <q>          low|medium|high|ultra (default: high)
//   --in/--out-sec/--duration <sec>   Render only a slice
//   --audio-only           Render audio only (container default: mp3)
//   --strict               Fail (before rendering) on any project validation warning
//   --allow-missing-media  Render blank/silent gaps and report MISSING_MEDIA warnings
//   --head                 Run headed (visible browser) for debugging
//   --build                Build dist/ first if the harness isn't built
//   --harness-url <url>    Dev mode: drive a running Vite dev server instead of dist/
//   --document <file>      Render an EmbeddableCut project document instead of a project
//   --extension <a.js,b.js> EmbeddableCut extension modules the page installs first
//
// By default this serves the built harness (dist/) itself — no dev server
// needed. Run `npm run build` once (or pass --build) to produce dist/.
import { chromium } from 'playwright'
import fs from 'node:fs'
import { listProjects } from './lib/workspace.mjs'
import { parseArgs, chromeLaunchArgs, chromeLaunchTarget } from './lib/cli.mjs'
import {
  acceptProjectDocument,
  prepareJob,
  readProjectDocumentInPage,
  renderJob,
  startHarness,
} from './lib/render-core.mjs'
import { installExtensions } from './lib/page-session.mjs'
import { normalizeRenderInput, renderRequestSchema, validate } from './lib/contract.mjs'

const RENDER_OPTIONS = new Set([
  'workspace',
  'project',
  'out',
  'codec',
  'container',
  'resolution',
  'fps',
  'quality',
  'in',
  'out-sec',
  'duration',
  'audio-only',
  'strict',
  'allow-missing-media',
  'head',
  'build',
  'harness-url',
  'batch',
  'list',
  'help',
  'json',
  'document',
  'extension',
])
const HELP = `Usage:\n  node render/render.mjs --workspace <dir> --project <id|project.json> [options]\n  node render/render.mjs --workspace <dir> --document <document.json> [options]\n  node render/render.mjs --workspace <dir> --batch <jobs.json>\n  node render/render.mjs --workspace <dir> --list [--json]\n\nOptions: --out --codec --container --resolution --fps --quality --in --out-sec --duration --audio-only --strict --allow-missing-media --extension <a.js,b.js> --head --build --harness-url --json\n`

async function main() {
  const args = parseArgs(process.argv.slice(2), { allowed: RENDER_OPTIONS })
  if (args.help) {
    console.log(HELP)
    return
  }
  const workspace = args.workspace
  if (!workspace) throw new Error('Missing --workspace <dir>')
  if (!fs.existsSync(workspace)) throw new Error(`Workspace not found: ${workspace}`)

  if (args.list) {
    const projects = listProjects(workspace)
    if (args.json) {
      console.log(JSON.stringify({ projects }))
      return
    }
    if (projects.length === 0) {
      console.log('No projects found in workspace.')
      return
    }
    console.log(`Projects in ${workspace}:`)
    for (const p of projects) {
      console.log(`  ${p.id}  ${p.name}  (updated ${new Date(p.updatedAt).toISOString()})`)
    }
    return
  }

  // Jobs: --batch <file> (array of job-arg objects) or a single CLI job.
  let jobArgsList
  if (args.batch) {
    const batchPath = args.batch
    if (!fs.existsSync(batchPath)) throw new Error(`Batch file not found: ${batchPath}`)
    const parsed = JSON.parse(fs.readFileSync(batchPath, 'utf8'))
    jobArgsList = (Array.isArray(parsed) ? parsed : [parsed]).map((job) =>
      validate(renderRequestSchema, normalizeRenderInput(job)),
    )
    if (jobArgsList.length === 0) throw new Error('Batch file is empty')
  } else {
    if (!args.project && !args.document) {
      throw new Error('Missing --project <id|project.json>, --document <file> or --batch <file>')
    }
    const {
      workspace: _workspace,
      batch: _batch,
      list: _list,
      head: _head,
      build: _build,
      'harness-url': _harnessUrl,
      help: _help,
      json: _json,
      'allow-missing-media': _allowMissingMedia,
      extension: _extension,
      document: documentPath,
      _: _positionals,
      ...job
    } = args
    if (documentPath) job.projectDocument = JSON.parse(fs.readFileSync(documentPath, 'utf8'))
    jobArgsList = [validate(renderRequestSchema, normalizeRenderInput(job))]
  }

  const { harnessUrl, mediaUrlOf, extensionUrls, closeServers } = await startHarness({
    workspace,
    devUrl: args['harness-url'],
    build: args.build,
    extensions: String(args.extension ?? process.env.FREECUT_EXTENSIONS ?? '')
      .split(',')
      .map((file) => file.trim())
      .filter(Boolean),
  })
  if (!args.json) console.log(`Harness: ${harnessUrl}`)

  const browser = await chromium.launch({
    ...chromeLaunchTarget(),
    headless: !args.head,
    args: chromeLaunchArgs(),
  })
  try {
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    page.on('pageerror', (e) => {
      if (!args.json) console.error('  [pageerror]', e.message)
    })
    page.on('console', (m) => {
      if (!args.json && m.type() === 'error' && !m.text().includes('Video load error')) {
        console.error('  [page:error]', m.text())
      }
    })

    let lastPct = -1
    let progressLabel = ''
    const setProgressLabel = (label) => {
      progressLabel = label
      lastPct = -1
    }
    await page.exposeBinding('__freecutProgress', (_src, progress) => {
      if (args.json) return
      const pct = Math.floor(progress?.progress ?? 0)
      if (pct !== lastPct) {
        lastPct = pct
        process.stdout.write(
          `\r  ${progressLabel} ${(progress?.phase ?? 'render').padEnd(10)} ${pct}%   `,
        )
      }
    })

    await page.goto(harnessUrl, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForFunction(() => Boolean(window.freecut?.ready), { timeout: 30_000 })
    await installExtensions(page, extensionUrls)

    const jsonResults = []
    for (let i = 0; i < jobArgsList.length; i++) {
      let jobArgs = jobArgsList[i]
      let extraMedia = []
      if (jobArgs.projectDocument) {
        const read = acceptProjectDocument(
          await readProjectDocumentInPage(page, jobArgs.projectDocument),
        )
        jobArgs = { ...jobArgs, projectDocument: undefined, projectObject: read.project }
        extraMedia = read.extraMedia
      }
      const job = prepareJob(workspace, jobArgs, mediaUrlOf, extraMedia)
      const range = job.hasRange ? ` frames ${job.inPoint}..${job.outPoint ?? 'end'}` : ''
      if (!args.json)
        console.log(
          `\n[${i + 1}/${jobArgsList.length}] ${job.project.name ?? job.project.id} -> ` +
            `${job.settings.mode} ${job.settings.codec}/${job.settings.container} ` +
            `${job.settings.resolution.width}x${job.settings.resolution.height}@${job.settings.fps}${range} ` +
            `| media ${job.mediaResolved}/${job.mediaTotal}`,
        )
      const summary = await renderJob(page, job, {
        setProgressLabel,
        allowMissingMedia: Boolean(args['allow-missing-media']),
      })
      if (!args.json) process.stdout.write('\n')
      if (!args.json)
        console.log(
          `  Done: ${summary.outputPath}  (${summary.mimeType}, ${(summary.fileSize / 1_000_000).toFixed(2)} MB, ${summary.durationSeconds.toFixed(2)}s)`,
        )
      jsonResults.push({ out: summary.outputPath, requestedSettings: job.settings, summary })
    }
    if (args.json) console.log(JSON.stringify({ ok: true, renders: jsonResults }))
  } finally {
    await browser.close()
    await closeServers()
  }
}

main().catch((e) => {
  console.error('\nRender failed:', e.message ?? e)
  process.exit(1)
})
