// SPDX-License-Identifier: MIT

/**
 * The fetch every read of remote media goes through, on the main thread and
 * in workers alike: mediabunny's `UrlSource` calls it for each range it wants.
 *
 * It adds the host's headers, follows a renewed URL, and answers ranges from
 * a block cache in Cache Storage. That cache is shared by every worker and
 * tab, so preview, waveforms, filmstrips and export download each byte once,
 * and it's keyed by the asset's stable cache key, so a renewed signed URL
 * still hits it. Servers that ignore `Range` are passed through uncached.
 */

/** What a context needs to read one remote asset. Structured-cloneable, so it travels to workers. */
export interface RemoteRequestMetadata {
  /** Stable identity of the bytes: the asset's key, else its URL without the query. */
  cacheKey: string
  headers?: Record<string, string>
  credentials?: RequestCredentials
  /** Turns the block cache off for this asset (e.g. content the host forbids storing). */
  noCache?: boolean
}

/** Hooks only the main thread installs: the current URL of an asset, and renewal on refusal. */
export interface RemoteUrlHooks {
  currentUrl(cacheKey: string): string | null
  renew(cacheKey: string): Promise<string | null>
}

const CACHE_NAME = 'embeddablecut-remote-media-v1'
/** Block size the cache stores and fetches in; small requests read ahead to a block's end. */
export const REMOTE_BLOCK_SIZE = 1 << 20
/**
 * Most blocks one network request fetches while streaming. Measured on the
 * remote media e2e: 1, 2 and 4 read the same bytes, in 7, 4 and 3 requests.
 */
const RUN_BLOCKS = 4

let hooks: RemoteUrlHooks | null = null
let budgetBytes = 2 * 1024 ** 3
let lastBudgetCheck = 0
const lastTouched = new Map<string, number>()

/** Installs URL renewal for this context (the main thread, through the media resolver). */
export function setRemoteUrlHooks(next: RemoteUrlHooks | null): void {
  hooks = next
}

/** The cache key for a URL with no asset key: the URL without its (often signed) query. */
export function cacheKeyForUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

/** Where one request goes, and the cache key its bytes are stored under. */
interface RemoteTarget {
  url: string
  cacheKey: string
  /**
   * For a file the asset references, its path relative to the asset's
   * directory, so it moves with the asset when the asset's URL is renewed.
   */
  relative?: string
}

/** A referenced file's URL beside a renewed asset URL, keeping the file's own query. */
function rebase(target: RemoteTarget, renewed: string): string | null {
  if (target.relative === undefined) return null
  try {
    const moved = new URL(target.relative, renewed)
    return `${moved.origin}${moved.pathname}${new URL(target.url).search}`
  } catch {
    return null
  }
}

/**
 * Runs `fetch` holding an origin-wide lock on one block, so readers in other
 * workers and tabs that reach the same block wait for its bytes instead of
 * fetching them again.
 */
async function withBlockLock<T>(cacheKey: string, index: number, fetch: () => Promise<T>) {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return fetch()
  return locks.request(`embeddablecut-remote-media:${cacheKey}:${index}`, fetch)
}

function isPlaylist(url: string): boolean {
  try {
    return /\.m3u8?$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

function parseRange(header: string | null): { start: number; end: number | null } | null {
  const match = header ? /^bytes=(\d+)-(\d*)$/.exec(header.trim()) : null
  if (!match) return null
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : null }
}

function totalFromContentRange(header: string | null): number | null {
  const match = header ? /\/(\d+)$/.exec(header) : null
  return match ? Number(match[1]) : null
}

function blockUrl(cacheKey: string, index: number): string {
  return `https://embeddablecut.invalid/remote-media/${encodeURIComponent(cacheKey)}/${index}`
}

function sizeUrl(cacheKey: string): string {
  return `https://embeddablecut.invalid/remote-media/${encodeURIComponent(cacheKey)}/size`
}

/** Per-asset usage, `{ bytes, lastUsed }`, which eviction reads. */
function usageUrl(cacheKey: string): string {
  return `https://embeddablecut.invalid/remote-media/${encodeURIComponent(cacheKey)}/usage`
}

/** Caps the block cache; past it, whole assets go, least recently used first. Default 2 GiB. */
export function setRemoteMediaCacheBudget(bytes: number): void {
  budgetBytes = bytes
}

/** Records use of an asset, at most once a minute unless it stored new bytes. */
async function touch(cache: Cache, cacheKey: string, storedBytes: number): Promise<void> {
  const now = Date.now()
  if (storedBytes === 0 && now - (lastTouched.get(cacheKey) ?? 0) < 60_000) return
  lastTouched.set(cacheKey, now)
  await recordUsage(cache, cacheKey, storedBytes)
}

async function recordUsage(cache: Cache, cacheKey: string, addedBytes: number): Promise<void> {
  const previous = await cache.match(usageUrl(cacheKey))
  const usage = previous ? ((await previous.json()) as { bytes: number }) : { bytes: 0 }
  await cache.put(
    usageUrl(cacheKey),
    Response.json({ bytes: usage.bytes + addedBytes, lastUsed: Date.now() }),
  )
  // Best effort across contexts: concurrent writers can undercount a little.
  if (Date.now() - lastBudgetCheck < 10_000) return
  lastBudgetCheck = Date.now()
  const usages: Array<{ prefix: string; bytes: number; lastUsed: number }> = []
  for (const request of await cache.keys()) {
    if (!request.url.endsWith('/usage')) continue
    const entry = (await (await cache.match(request))?.json()) as
      | { bytes?: number; lastUsed?: number }
      | undefined
    if (!Number.isFinite(entry?.bytes) || !Number.isFinite(entry?.lastUsed)) continue
    usages.push({
      prefix: request.url.slice(0, -'usage'.length),
      bytes: entry!.bytes!,
      lastUsed: entry!.lastUsed!,
    })
  }
  let total = usages.reduce((sum, entry) => sum + entry.bytes, 0)
  if (total <= budgetBytes) return
  const keys = await cache.keys()
  for (const entry of usages.sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= budgetBytes) break
    await Promise.all(
      keys.filter((r) => r.url.startsWith(entry.prefix)).map((r) => cache.delete(r)),
    )
    total -= entry.bytes
  }
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME)
  } catch {
    // Opaque origins and some private modes refuse Cache Storage.
    return null
  }
}

async function cachedSize(cache: Cache, cacheKey: string): Promise<number | null> {
  const response = await cache.match(sizeUrl(cacheKey))
  if (!response) return null
  const size = Number(await response.text())
  return Number.isFinite(size) ? size : null
}

/**
 * A `fetch` for one remote asset. Pass it as `UrlSource`'s `fetchFn`.
 *
 * @param metadata what to send and how to cache; see {@link RemoteRequestMetadata}.
 */
export function createRemoteFetch(metadata: RemoteRequestMetadata): typeof fetch {
  // The first URL read is the asset's own. Any other is a file it references,
  // as an HLS playlist references its variants and segments: each of those is
  // cached under its own path, and read where it is rather than at the asset's
  // current URL.
  let rootPath: string | null = null
  const locate = (url: string): RemoteTarget => {
    const path = cacheKeyForUrl(url)
    rootPath ??= path
    if (path === rootPath) {
      return { url: hooks?.currentUrl(metadata.cacheKey) ?? url, cacheKey: metadata.cacheKey }
    }
    const directory = rootPath.slice(0, rootPath.lastIndexOf('/') + 1)
    if (!path.startsWith(directory)) return { url, cacheKey: path }
    const relative = path.slice(directory.length)
    return { url, cacheKey: `${metadata.cacheKey}/${relative}`, relative }
  }

  const network = async (target: RemoteTarget, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers)
    for (const [name, value] of Object.entries(metadata.headers ?? {})) headers.set(name, value)
    const send = (url: string) =>
      fetch(url, { ...init, headers, credentials: metadata.credentials ?? init.credentials })
    const response = await send(target.url)
    if ((response.status === 401 || response.status === 403) && hooks) {
      const renewed = await hooks.renew(metadata.cacheKey)
      const retry =
        renewed && (target.cacheKey === metadata.cacheKey ? renewed : rebase(target, renewed))
      if (retry && retry !== target.url) return send(retry)
    }
    return response
  }

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const target = locate(request ? request.url : String(input))
    const requestInit: RequestInit = {
      method: init?.method ?? request?.method ?? 'GET',
      headers: init?.headers ?? request?.headers,
      signal: init?.signal ?? request?.signal,
    }
    const range = parseRange(new Headers(requestInit.headers).get('Range'))
    // A playlist can grow while it's read (a live stream's does), so its
    // bytes are never cached; they're small and read once per input.
    const cache =
      metadata.noCache || requestInit.method !== 'GET' || !range || isPlaylist(target.url)
        ? null
        : await openCache()
    if (!cache || !range) return network(target, requestInit)
    const { cacheKey } = target

    // Fetches blocks `from..to` with one request and stores them. A response
    // other than 206 is handed back for the caller to pass through.
    let size = await cachedSize(cache, cacheKey)
    const fetchRun = async (
      from: number,
      to: number,
    ): Promise<Map<number, Uint8Array> | Response> => {
      const runHeaders = new Headers(requestInit.headers)
      runHeaders.set(
        'Range',
        `bytes=${from * REMOTE_BLOCK_SIZE}-${(to + 1) * REMOTE_BLOCK_SIZE - 1}`,
      )
      // A run fills the shared cache, so one reader's abort must not discard it:
      // mediabunny aborts as soon as it has its bytes, often while the stream
      // is still fetching ahead, and the next reader would download it again.
      const response = await network(target, {
        ...requestInit,
        headers: runHeaders,
        signal: undefined,
      })
      if (response.status !== 206) return response
      if (size === null) {
        size = totalFromContentRange(response.headers.get('Content-Range'))
        if (size !== null) await cache.put(sizeUrl(cacheKey), new Response(String(size)))
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const fetched = new Map<number, Uint8Array>()
      let storedBytes = 0
      for (let index = from; index <= to; index++) {
        const offset = (index - from) * REMOTE_BLOCK_SIZE
        const block = bytes.slice(offset, Math.min(offset + REMOTE_BLOCK_SIZE, bytes.length))
        if (block.length === 0) break
        fetched.set(index, block)
        // Only a whole block, or the file's last one, is stored.
        const isLast = size !== null && index * REMOTE_BLOCK_SIZE + block.length >= size
        if (block.length === REMOTE_BLOCK_SIZE || isLast) {
          await cache.put(blockUrl(cacheKey, index), new Response(block))
          storedBytes += block.length
        }
      }
      await touch(cache, cacheKey, storedBytes)
      return fetched
    }
    const cachedBlock = async (index: number): Promise<Uint8Array | null> => {
      const hit = await cache.match(blockUrl(cacheKey, index))
      return hit ? new Uint8Array(await hit.arrayBuffer()) : null
    }

    const firstBlock = Math.floor(range.start / REMOTE_BLOCK_SIZE)
    const pending = new Map<number, Uint8Array>()
    if (size === null) {
      // First read of this asset: one block tells us its size.
      const first = (await cachedBlock(firstBlock)) ?? (await fetchRun(firstBlock, firstBlock))
      if (first instanceof Response) return first
      if (first instanceof Map) for (const [index, block] of first) pending.set(index, block)
      else pending.set(firstBlock, first)
    }
    if (size === null) return network(target, requestInit)
    const total: number = size
    const lastByte = Math.min(range.end ?? total - 1, total - 1)
    if (range.start > lastByte) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
    }
    const lastBlock = Math.floor(lastByte / REMOTE_BLOCK_SIZE)

    // The body streams block by block, so a reader that cancels after the
    // bytes it needs (as mediabunny does with open-ended reads) fetches no more.
    let next = firstBlock
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (next > lastBlock) {
          controller.close()
          return
        }
        let block = pending.get(next) ?? (await cachedBlock(next))
        if (!block) {
          if (requestInit.signal?.aborted) {
            controller.error(requestInit.signal.reason)
            return
          }
          const failure = await withBlockLock(cacheKey, next, async () => {
            // Another reader (a worker, another tab) may have fetched it meanwhile.
            const fetchedMeanwhile = await cachedBlock(next)
            if (fetchedMeanwhile) {
              pending.set(next, fetchedMeanwhile)
              return null
            }
            let runEnd = next
            while (
              runEnd < lastBlock &&
              runEnd - next + 1 < RUN_BLOCKS &&
              !pending.has(runEnd + 1)
            ) {
              if (await cache.match(blockUrl(cacheKey, runEnd + 1))) break
              runEnd++
            }
            const run = await fetchRun(next, runEnd)
            if (run instanceof Response) return `Range request failed: HTTP ${run.status}`
            for (const [index, fetched] of run) pending.set(index, fetched)
            return null
          })
          if (failure) {
            controller.error(new Error(failure))
            return
          }
          block = pending.get(next) ?? null
          if (!block) {
            controller.error(new Error('Range request returned too little'))
            return
          }
        }
        pending.delete(next)
        const blockStart = next * REMOTE_BLOCK_SIZE
        const from = Math.max(range.start, blockStart) - blockStart
        const to = Math.min(lastByte + 1, blockStart + block.length) - blockStart
        next++
        if (to > from) controller.enqueue(block.subarray(from, to))
      },
    })
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${range.start}-${lastByte}/${total}`,
        'Content-Length': String(lastByte - range.start + 1),
        'Accept-Ranges': 'bytes',
      },
    })
  }) as typeof fetch
}

/** Empties the remote media block cache (every asset, every tab). */
export async function clearRemoteMediaCache(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME)
}

/**
 * Stores bytes the page already has as a remote asset's blocks, so reading
 * it at its URL fetches nothing: a file the host just uploaded, say.
 */
export async function seedRemoteMediaCache(cacheKey: string, bytes: Blob): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  for (let index = 0; index * REMOTE_BLOCK_SIZE < bytes.size; index++) {
    const block = bytes.slice(index * REMOTE_BLOCK_SIZE, (index + 1) * REMOTE_BLOCK_SIZE)
    await cache.put(blockUrl(cacheKey, index), new Response(block))
  }
  await cache.put(sizeUrl(cacheKey), new Response(String(bytes.size)))
  await recordUsage(cache, cacheKey, bytes.size)
}
