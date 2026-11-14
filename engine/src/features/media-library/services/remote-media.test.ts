// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MediaMetadata } from '@/types/storage'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import { getObjectUrlSourceMetadata } from '@/infrastructure/browser/object-url-registry'
import { useMediaLibraryStore } from '../stores/media-library-store'
import { resolveMediaUrl } from '../utils/media-resolver'
import { resetRemoteMedia, setRemoteMediaResolver } from './remote-media'

function seed(remote: MediaMetadata['remote']): MediaMetadata {
  const media = {
    id: 'remote-1',
    storageType: 'url',
    remote,
    fileName: 'clip.mp4',
    fileSize: 100,
    mimeType: 'video/mp4',
    duration: 1,
    width: 16,
    height: 9,
    fps: 30,
    codec: 'avc1',
    bitrate: 1,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  } as MediaMetadata
  useMediaLibraryStore.setState({ mediaItems: [media], mediaById: { [media.id]: media } })
  return media
}

afterEach(() => {
  setRemoteMediaResolver(null)
  resetRemoteMedia()
  blobUrlManager.releaseAll()
  useMediaLibraryStore.setState({ mediaItems: [], mediaById: {} })
})

describe('remote media', () => {
  it('reads a URL asset from its own URL when the host resolves nothing', async () => {
    seed({ url: 'https://cdn.test/clip.mp4' })

    expect(await resolveMediaUrl('remote-1')).toBe('https://cdn.test/clip.mp4')
    expect(getObjectUrlSourceMetadata('https://cdn.test/clip.mp4')?.remote).toEqual({
      cacheKey: 'https://cdn.test/clip.mp4',
    })
  })

  it('signs through the resolver once, and keeps the URL until it nears expiry', async () => {
    seed({ url: 'https://cdn.test/clip.mp4', key: 'acme:clip' })
    const resolver = vi.fn(async (_media: MediaMetadata, _reason: string) => ({
      url: 'https://cdn.test/clip.mp4?sig=1',
      expiresAt: Date.now() + 3_600_000,
      headers: { Authorization: 'Bearer t' },
    }))
    setRemoteMediaResolver(resolver)

    expect(await resolveMediaUrl('remote-1')).toBe('https://cdn.test/clip.mp4?sig=1')
    expect(await resolveMediaUrl('remote-1')).toBe('https://cdn.test/clip.mp4?sig=1')

    expect(resolver).toHaveBeenCalledOnce()
    expect(resolver.mock.calls[0]?.[1]).toBe('open')
    expect(blobUrlManager.get('remote-1')).toBe('https://cdn.test/clip.mp4?sig=1')
    expect(getObjectUrlSourceMetadata('https://cdn.test/clip.mp4?sig=1')?.remote).toEqual({
      cacheKey: 'acme:clip',
      headers: { Authorization: 'Bearer t' },
    })
    // The newest URL is what a saved document carries.
    expect(useMediaLibraryStore.getState().mediaById['remote-1']?.remote?.url).toBe(
      'https://cdn.test/clip.mp4?sig=1',
    )
  })

  it('renews a URL about to expire, and moves readers onto the new one', async () => {
    seed({ url: 'https://cdn.test/clip.mp4', key: 'acme:clip' })
    let signature = 0
    setRemoteMediaResolver(async () => ({
      url: `https://cdn.test/clip.mp4?sig=${++signature}`,
      // Inside the renewal margin, so the next read renews.
      expiresAt: Date.now() + 60_000,
    }))
    const version = blobUrlManager.getSnapshot()

    await resolveMediaUrl('remote-1')
    const renewed = await resolveMediaUrl('remote-1')

    expect(renewed).toBe('https://cdn.test/clip.mp4?sig=2')
    expect(blobUrlManager.get('remote-1')).toBe(renewed)
    expect(blobUrlManager.getSnapshot()).toBeGreaterThan(version)
    expect(getObjectUrlSourceMetadata('https://cdn.test/clip.mp4?sig=1')).toBeNull()
  })
})
