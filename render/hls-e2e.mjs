// SPDX-License-Identifier: MIT
//
// HLS contract: a stream at a URL is read through its playlist, a segment at
// a time. A frame from the middle of a VOD with program date tags must render
// (its timestamps counted from the stream's start, not Unix time) while
// reading only the segments around it, and exporting a cut must read only the
// segments the cut covers.
//
// Usage: node render/hls-e2e.mjs   (requires web/dist and ffmpeg)
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createHarnessServer } from "./server.mjs";
import { chromeLaunchArgs, chromeLaunchTarget } from "./lib/cli.mjs";
import { HARNESS_DIST } from "./lib/paths.mjs";

const execFileAsync = promisify(execFile);
const FPS = 30;
const SECONDS = 40;
const SEGMENT_SECONDS = 2;
const WIDTH = 640;
const HEIGHT = 360;
const MEDIA_ID = "hls-stream";

async function generateStream(dir) {
  await execFileAsync(
    "ffmpeg",
    [
      ...["-v", "error", "-y", "-f", "lavfi"],
      ...["-i", `testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SECONDS}`],
      ...["-f", "lavfi", "-i", `sine=frequency=440:duration=${SECONDS}:sample_rate=48000`],
      ...["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
      ...["-g", String(FPS * SEGMENT_SECONDS), "-sc_threshold", "0", "-c:a", "aac"],
      ...["-f", "hls", "-hls_time", String(SEGMENT_SECONDS), "-hls_playlist_type", "vod"],
      ...["-hls_flags", "program_date_time"],
      ...["-hls_segment_filename", path.join(dir, "seg%03d.ts"), path.join(dir, "index.m3u8")],
    ],
    { timeout: 120_000 },
  );
}

/** A cross-origin HLS host: CORS, CORP and ranges, counting what each file sends. */
function startStreamHost(dir) {
  const sent = new Map();
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Accept-Ranges", "bytes");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const name = path.basename(new URL(req.url, "http://host").pathname);
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(filePath).size;
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    res.writeHead(match ? 206 : 200, {
      "Content-Type": name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
      "Content-Length": end - start + 1,
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("data", (chunk) => {
      if (!res.destroyed) sent.set(name, (sent.get(name) ?? 0) + chunk.length);
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/index.m3u8?token=signed`,
        sent,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** The segments read so far, by index. */
function segmentsRead(host) {
  return [...host.sent.keys()]
    .filter((name) => name.endsWith(".ts"))
    .map((name) => Number(/(\d+)\.ts$/.exec(name)[1]))
    .sort((a, b) => a - b);
}

function project(sourceStart, frames) {
  return {
    id: "hls-project",
    name: "HLS",
    description: "",
    createdAt: 0,
    updatedAt: 0,
    duration: frames / FPS,
    schemaVersion: 15,
    metadata: { width: WIDTH, height: HEIGHT, fps: FPS },
    timeline: {
      tracks: [
        {
          id: "v1",
          name: "V1",
          kind: "video",
          height: 80,
          locked: false,
          visible: true,
          muted: false,
          solo: false,
          order: 0,
        },
      ],
      items: [
        {
          id: "clip",
          type: "video",
          trackId: "v1",
          from: 0,
          durationInFrames: frames,
          label: "index.m3u8",
          mediaId: MEDIA_ID,
          src: "",
          sourceStart,
          sourceEnd: sourceStart + frames,
          sourceDuration: SECONDS * FPS,
          sourceFps: FPS,
          speed: 1,
        },
      ],
    },
  };
}

function media(host) {
  return [
    {
      mediaId: MEDIA_ID,
      url: host.url,
      metadata: {
        id: MEDIA_ID,
        storageType: "url",
        remote: { url: host.url, key: "e2e:hls-stream" },
        fileName: "index.m3u8",
        fileSize: 0,
        mimeType: "application/vnd.apple.mpegurl",
        duration: SECONDS,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        codec: "avc1.64001e",
        bitrate: 0,
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    },
  ];
}

async function main() {
  if (!fs.existsSync(path.join(HARNESS_DIST, "headless.html"))) {
    throw new Error("web/dist/headless.html is missing; run `just web build` first");
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "embeddablecut-hls-"));
  await generateStream(tempDir);
  const host = await startStreamHost(tempDir);
  const harness = await createHarnessServer({ distDir: HARNESS_DIST });
  const browser = await chromium.launch({
    ...chromeLaunchTarget(),
    headless: true,
    args: chromeLaunchArgs(),
  });

  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    page.on("pageerror", (error) => console.error("  [pageerror]", error.message));
    await page.goto(harness.harnessUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.freecut?.ready), { timeout: 30_000 });

    // Frame 24 s into the stream: segment 12 of 20.
    const frameDownload = page.waitForEvent("download", { timeout: 120_000 });
    const frame = await page.evaluate((input) => window.freecut.renderFrame(input), {
      project: project(24 * FPS, FPS),
      media: media(host),
      frame: 0,
    });
    const framePath = path.join(tempDir, "frame.png");
    await (await frameDownload).saveAs(framePath);
    assert.equal(frame.ok, true);
    const png = fs.readFileSync(framePath);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    // A frame looked up in Unix time finds nothing and renders black, which compresses to little.
    assert.ok(png.length > 20_000, `the frame is ${png.length} bytes, as if blank`);
    const afterFrame = segmentsRead(host);
    // Beyond those around the frame: the first anchors the stream's timestamps, the last its duration.
    const last = SECONDS / SEGMENT_SECONDS - 1;
    const around = (index) => index === 0 || index === last || Math.abs(index - 12) <= 2;
    assert.ok(afterFrame.includes(12), `the frame grab read segments ${afterFrame}`);
    assert.ok(afterFrame.every(around), `a frame grab read segments ${afterFrame}`);

    // A two-second cut from 30 s: segments 15 and 16, and mediabunny's read-ahead past them.
    const exportDownload = page.waitForEvent("download", { timeout: 180_000 });
    const summary = await page.evaluate((input) => window.freecut.renderProject(input), {
      project: project(30 * FPS, 2 * FPS),
      media: media(host),
      settings: {
        mode: "video",
        codec: "vp9",
        container: "webm",
        quality: "low",
        resolution: { width: WIDTH, height: HEIGHT },
        fps: FPS,
      },
    });
    await (await exportDownload).saveAs(path.join(tempDir, "export.webm"));
    assert.equal(summary.ok, true);
    assert.ok(Math.abs(summary.durationSeconds - 2) < 0.2, `duration ${summary.durationSeconds}`);
    const added = segmentsRead(host).filter((index) => !afterFrame.includes(index));
    assert.ok(added.includes(15), `the export read segments ${added}`);
    assert.ok(
      added.every((index) => index >= 14 && index <= 18),
      `the export read ${added}`,
    );

    console.log(
      `HLS contract passed (frame grab read segments ${afterFrame.join(", ")}; the cut added ${added.join(", ")})`,
    );
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.();
    await host.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
