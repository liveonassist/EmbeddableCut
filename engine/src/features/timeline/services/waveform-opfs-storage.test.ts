// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

function createDirectory() {
  const files = new Map<string, ArrayBuffer>()
  const fileHandle = (name: string) => ({
    kind: 'file' as const,
    name,
    createWritable: async () => ({
      write: async (data: ArrayBuffer) => void files.set(name, data),
      close: async () => {},
    }),
    getFile: async () => {
      const data = files.get(name)
      if (!data) throw new DOMException('missing', 'NotFoundError')
      return { arrayBuffer: async () => data, size: data.byteLength }
    },
  })
  const dir = {
    listings: 0,
    async *values() {
      dir.listings += 1
      for (const name of [...files.keys()]) yield fileHandle(name)
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError')
      return fileHandle(name)
    },
    removeEntry: async (name: string) => void files.delete(name),
  }
  return dir
}

describe('waveform range cache', () => {
  let dir: ReturnType<typeof createDirectory>

  beforeEach(() => {
    vi.resetModules()
    dir = createDirectory()
    const root = { getDirectoryHandle: async () => dir }
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } })
  })

  it('finds saved ranges without listing the shared directory per lookup', async () => {
    const { waveformOPFSStorage } = await import('./waveform-opfs-storage')
    const range = (startTime: number) => ({
      duration: 10,
      channels: 1,
      sampleRate: 10,
      startTime,
      endTime: startTime + 1,
      peaks: Float32Array.from({ length: 100 }, (_, i) => i / 100),
    })
    await waveformOPFSStorage.saveRange('media-a', range(0))
    await waveformOPFSStorage.saveRange('media-b', range(0))
    const first = await waveformOPFSStorage.getCachedRange('media-a', 10, 0, 1)
    const listings = dir.listings
    await waveformOPFSStorage.saveRange('media-a', range(1))
    const joined = await waveformOPFSStorage.getCachedRange('media-a', 10, 0, 2)

    expect(first?.peaks.subarray(0, 10)).toEqual(range(0).peaks.subarray(0, 10))
    expect(joined?.peaks.subarray(10, 20)).toEqual(range(1).peaks.subarray(10, 20))
    expect(dir.listings).toBe(listings)

    await waveformOPFSStorage.delete('media-a')
    expect(await waveformOPFSStorage.getCachedRange('media-a', 10, 0, 1)).toBeNull()
    expect(await waveformOPFSStorage.getCachedRange('media-b', 10, 0, 1)).not.toBeNull()
  })
})
