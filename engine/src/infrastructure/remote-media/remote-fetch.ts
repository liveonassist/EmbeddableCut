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
  const network = async (url: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers)
    for (const [name, value] of Object.entries(metadata.headers ?? {})) headers.set(name, value)
    const send = (target: string) =>
      fetch(target, { ...init, headers, credentials: metadata.credentials ?? init.credentials })
    const current = hooks?.currentUrl(metadata.cacheKey) ?? url
    const response = await send(current)
    if ((response.status === 401 || response.status === 403) && hooks) {
      const renewed = await hooks.renew(metadata.cacheKey)
      if (renewed && renewed !== current) return send(renewed)
    }
    return response
  }

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request ? request.url : String(input)
    const requestInit: RequestInit = {
      method: init?.method ?? request?.method ?? 'GET',
      headers: init?.headers ?? request?.headers,
      signal: init?.signal ?? request?.signal,
    }
    const range = parseRange(new Headers(requestInit.headers).get('Range'))
    const cache =
      metadata.noCache || requestInit.method !== 'GET' || !range ? null : await openCache()
    if (!cache || !range) return network(url, requestInit)

    // Fetches blocks `from..to` with one request and stores them. A response
    // other than 206 is handed back for the caller to pass through.
    let size = await cachedSize(cache, metadata.cacheKey)
    const fetchRun = async (
      from: number,
      to: number,
    ): Promise<Map<number, Uint8Array> | Response> => {
      const runHeaders = new Headers(requestInit.headers)
      runHeaders.set(
        'Range',
        `bytes=${from * REMOTE_BLOCK_SIZE}-${(to + 1) * REMOTE_BLOCK_SIZE - 1}`,
      )
      const response = await network(url, { ...requestInit, headers: runHeaders })
      if (response.status !== 206) return response
      if (size === null) {
        size = totalFromContentRange(response.headers.get('Content-Range'))
        if (size !== null) await cache.put(sizeUrl(metadata.cacheKey), new Response(String(size)))
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
          await cache.put(blockUrl(metadata.cacheKey, index), new Response(block))
          storedBytes += block.length
        }
      }
      await touch(cache, metadata.cacheKey, storedBytes)
      return fetched
    }
    const cachedBlock = async (index: number): Promise<Uint8Array | null> => {
      const hit = await cache.match(blockUrl(metadata.cacheKey, index))
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
    if (size === null) return network(url, requestInit)
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
          let runEnd = next
          while (runEnd < lastBlock && runEnd - next + 1 < RUN_BLOCKS && !pending.has(runEnd + 1)) {
            if (await cache.match(blockUrl(metadata.cacheKey, runEnd + 1))) break
            runEnd++
          }
          const run = await fetchRun(next, runEnd)
          if (run instanceof Response) {
            controller.error(new Error(`Range request failed: HTTP ${run.status}`))
            return
          }
          for (const [index, fetched] of run) pending.set(index, fetched)
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
