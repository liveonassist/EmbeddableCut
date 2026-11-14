// SPDX-License-Identifier: MIT
//
// URL media contract: a clip served from another origin is read in place.
// A frame grab must touch only part of the file, through range requests, and
// an export after it must reuse what the frame grab fetched from the shared
// range cache instead of downloading everything again.
//
// Usage: node render/remote-media-e2e.mjs   (requires web/dist and ffmpeg)
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
const SECONDS = 20;
const FRAMES = FPS * SECONDS;
const WIDTH = 640;
const HEIGHT = 360;
const MEDIA_ID = "remote-clip";

async function generateClip(filePath) {
  // One keyframe a second and the index up front, as a web-ready file has.
  await execFileAsync(
    "ffmpeg",
    [
      ...["-v", "error", "-y", "-f", "lavfi"],
      ...["-i", `testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SECONDS}`],
      // Noise keeps the bitrate up, so the file spans enough cache blocks that
      // one frame needs only some of them.
      ...["-vf", "noise=alls=40:allf=t+u", "-pix_fmt", "yuv420p", "-c:v", "libx264"],
      ...["-g", String(FPS), "-b:v", "4M", "-maxrate", "4M", "-bufsize", "2M"],
      ...["-movflags", "+faststart", filePath],
    ],
    { timeout: 120_000 },
  );
}

/** A cross-origin media host: CORS, CORP and ranges, counting every byte it sends. */
function startMediaHost(filePath) {
  const size = fs.statSync(filePath).size;
  const stats = { requests: 0, bytes: 0, ranged: 0 };
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
    stats.requests++;
    if (process.env.DEBUG_REMOTE)
      console.log("  [host]", req.method, req.headers.range ?? "(no range)");
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (match) stats.ranged++;
    res.writeHead(match ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    // Count what's sent: a reader that cancels a stream takes only part of it.
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("data", (chunk) => {
      if (!res.destroyed) stats.bytes += chunk.length;
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/clip.mp4?sig=signed`,
        size,
        stats,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function project() {
  return {
    id: "remote-project",
    name: "Remote",
    description: "",
    createdAt: 0,
    updatedAt: 0,
    duration: SECONDS,
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
          durationInFrames: FRAMES,
          label: "clip.mp4",
          mediaId: MEDIA_ID,
          src: "",
          sourceStart: 0,
          sourceEnd: FRAMES,
          sourceDuration: FRAMES,
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
        remote: { url: host.url, key: "e2e:remote-clip" },
        fileName: "clip.mp4",
        fileSize: host.size,
        mimeType: "video/mp4",
        duration: SECONDS,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        codec: "avc1.64001e",
        bitrate: 4_000_000,
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "embeddablecut-remote-media-"));
  const clipPath = path.join(tempDir, "clip.mp4");
  await generateClip(clipPath);
  const host = await startMediaHost(clipPath);
  const harness = await createHarnessServer({ distDir: HARNESS_DIST });
  const browser = await chromium.launch({
    ...chromeLaunchTarget(),
    headless: true,
    args: chromeLaunchArgs(),
  });

  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    page.on("pageerror", (error) => console.error("  [pageerror]", error.message));
    if (process.env.DEBUG_REMOTE) {
      page.on("request", (request) => {
        if (request.url().includes("clip.mp4"))
          console.log(
            "  [page]",
            request.resourceType(),
            request.headers().range,
            request.frame() ? "frame" : "worker",
          );
      });
    }
    await page.goto(harness.harnessUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.freecut?.ready), { timeout: 30_000 });

    const frameDownload = page.waitForEvent("download", { timeout: 120_000 });
    const frame = await page.evaluate((input) => window.freecut.renderFrame(input), {
      project: project(),
      media: media(host),
      frame: FRAMES / 2,
    });
    const framePath = path.join(tempDir, "frame.png");
    await (await frameDownload).saveAs(framePath);
    assert.equal(frame.ok, true);
    assert.equal(fs.readFileSync(framePath).subarray(1, 4).toString(), "PNG");
    const afterFrame = { ...host.stats };
    assert.ok(afterFrame.ranged > 0, "the frame grab made no range requests");
    assert.ok(
      afterFrame.bytes < host.size * 0.75,
      `a frame grab read ${afterFrame.bytes} of ${host.size} bytes`,
    );

    const exportDownload = page.waitForEvent("download", { timeout: 180_000 });
    const summary = await page.evaluate((input) => window.freecut.renderProject(input), {
      project: project(),
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
    const exportPath = path.join(tempDir, "export.webm");
    await (await exportDownload).saveAs(exportPath);
    assert.equal(summary.ok, true);
    assert.ok(
      Math.abs(summary.durationSeconds - SECONDS) < 0.5,
      `duration ${summary.durationSeconds}`,
    );
    // Each byte crosses the network about once: the frame grab's blocks came
    // from the cache, not the host.
    assert.ok(
      host.stats.bytes <= host.size * 1.15,
      `frame grab and export together read ${host.stats.bytes} of ${host.size} bytes`,
    );

    console.log(
      `Remote media contract passed (${host.size} byte clip; frame grab read ${afterFrame.bytes} in ${afterFrame.requests} requests, export total ${host.stats.bytes})`,
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
