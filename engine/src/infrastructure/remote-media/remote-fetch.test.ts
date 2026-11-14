// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  REMOTE_BLOCK_SIZE,
  cacheKeyForUrl,
  createRemoteFetch,
  setRemoteMediaCacheBudget,
  setRemoteUrlHooks,
} from "./remote-fetch";

const FILE_SIZE = REMOTE_BLOCK_SIZE * 3 + 1234;
const file = new Uint8Array(FILE_SIZE).map((_, i) => i % 251);

class MemoryCache {
  readonly entries = new Map<string, Response>();
  async match(request: string | Request) {
    return this.entries.get(typeof request === "string" ? request : request.url)?.clone();
  }
  async put(url: string, response: Response) {
    this.entries.set(url, response);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(request: Request) {
    return this.entries.delete(request.url);
  }
}

let cache: MemoryCache;
let requests: Array<{ url: string; range: string | null; auth: string | null }>;
let refuse: Set<string>;

function serve(input: RequestInfo | URL, init?: RequestInit, ranges = true): Response {
  const url = String(input);
  const headers = new Headers(init?.headers);
  requests.push({ url, range: headers.get("Range"), auth: headers.get("Authorization") });
  if (refuse.has(url)) return new Response(null, { status: 403 });
  const match = ranges ? /^bytes=(\d+)-(\d*)$/.exec(headers.get("Range") ?? "") : null;
  if (!match) return new Response(file.slice(), { status: 200 });
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : FILE_SIZE - 1, FILE_SIZE - 1);
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${FILE_SIZE}` },
  });
}

beforeEach(() => {
  cache = new MemoryCache();
  requests = [];
  refuse = new Set();
  vi.stubGlobal("caches", { open: async () => cache, delete: async () => true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => serve(input, init)),
  );
});

afterEach(() => {
  setRemoteUrlHooks(null);
  setRemoteMediaCacheBudget(2 * 1024 ** 3);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function read(remoteFetch: typeof fetch, url: string, start: number, end: number) {
  const response = await remoteFetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

describe("remote media fetch", () => {
  it("answers a range from whole blocks and serves repeats from the cache", async () => {
    const remoteFetch = createRemoteFetch({ cacheKey: "clip" });
    const start = REMOTE_BLOCK_SIZE - 10;
    const end = REMOTE_BLOCK_SIZE * 2 + 10;

    const first = await read(remoteFetch, "https://cdn.test/clip.mp4", start, end);
    expect(first.response.status).toBe(206);
    expect(first.response.headers.get("Content-Range")).toBe(`bytes ${start}-${end}/${FILE_SIZE}`);
    expect(first.bytes).toEqual(file.slice(start, end + 1));
    // The first block tells the size; the rest of the range comes as one aligned run.
    const runs = [
      `bytes=0-${REMOTE_BLOCK_SIZE - 1}`,
      `bytes=${REMOTE_BLOCK_SIZE}-${REMOTE_BLOCK_SIZE * 3 - 1}`,
    ];
    expect(requests.map((r) => r.range)).toEqual(runs);

    const second = await read(remoteFetch, "https://cdn.test/clip.mp4", start + 5, end - 5);
    expect(second.bytes).toEqual(file.slice(start + 5, end - 4));
    expect(requests.map((r) => r.range)).toEqual(runs);
  });

  it("keeps cache hits when a signed URL is renewed", async () => {
    const key = cacheKeyForUrl("https://cdn.test/clip.mp4?sig=one");
    await read(createRemoteFetch({ cacheKey: key }), "https://cdn.test/clip.mp4?sig=one", 0, 99);

    const renewed = createRemoteFetch({
      cacheKey: cacheKeyForUrl("https://cdn.test/clip.mp4?sig=two"),
    });
    const { bytes } = await read(renewed, "https://cdn.test/clip.mp4?sig=two", 0, 99);

    expect(bytes).toEqual(file.slice(0, 100));
    expect(requests).toHaveLength(1);
  });

  it("reads the last block of a file to its end", async () => {
    const remoteFetch = createRemoteFetch({ cacheKey: "clip" });
    const { bytes, response } = await read(
      remoteFetch,
      "https://cdn.test/clip.mp4",
      FILE_SIZE - 100,
      FILE_SIZE + 500,
    );

    expect(bytes).toEqual(file.slice(FILE_SIZE - 100));
    expect(response.headers.get("Content-Range")).toBe(
      `bytes ${FILE_SIZE - 100}-${FILE_SIZE - 1}/${FILE_SIZE}`,
    );
  });

  it("sends the host headers, follows the current URL, and renews once on refusal", async () => {
    refuse.add("https://cdn.test/old.mp4");
    const renew = vi.fn(async () => "https://cdn.test/new.mp4");
    setRemoteUrlHooks({ currentUrl: () => "https://cdn.test/old.mp4", renew });
    const remoteFetch = createRemoteFetch({
      cacheKey: "clip",
      headers: { Authorization: "Bearer t" },
    });

    const { bytes } = await read(remoteFetch, "https://cdn.test/stale.mp4", 0, 9);

    expect(bytes).toEqual(file.slice(0, 10));
    expect(renew).toHaveBeenCalledOnce();
    expect(requests.map((r) => [r.url, r.auth])).toEqual([
      ["https://cdn.test/old.mp4", "Bearer t"],
      ["https://cdn.test/new.mp4", "Bearer t"],
    ]);
  });

  it("passes a server without range support through uncached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => serve(input, init, false)),
    );
    const remoteFetch = createRemoteFetch({ cacheKey: "clip" });

    const { response, bytes } = await read(remoteFetch, "https://cdn.test/clip.mp4", 0, 9);

    expect(response.status).toBe(200);
    expect(bytes).toHaveLength(FILE_SIZE);
    expect([...cache.entries.keys()].some((url) => url.endsWith("/0"))).toBe(false);
  });

  it("evicts the least recently used asset past the budget", async () => {
    const start = Date.now() + 3_600_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    setRemoteMediaCacheBudget(REMOTE_BLOCK_SIZE * 1.5);
    vi.setSystemTime(start);
    await read(createRemoteFetch({ cacheKey: "old" }), "https://cdn.test/old.mp4", 0, 9);
    vi.setSystemTime(start + 60_000);
    await read(createRemoteFetch({ cacheKey: "new" }), "https://cdn.test/new.mp4", 0, 9);

    const blocks = [...cache.entries.keys()].filter((url) => url.endsWith("/0"));
    expect(blocks).toEqual(["https://embeddablecut.invalid/remote-media/new/0"]);
  });

  it("stops fetching when the reader cancels an open-ended read", async () => {
    const remoteFetch = createRemoteFetch({ cacheKey: "clip" });
    const response = await remoteFetch("https://cdn.test/clip.mp4", {
      headers: { Range: "bytes=0-" },
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    expect(response.headers.get("Content-Range")).toBe(`bytes 0-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(requests.map((r) => r.range)).toEqual([`bytes=0-${REMOTE_BLOCK_SIZE - 1}`]);
  });
});
