import {
  getObjectUrlBlob,
  getObjectUrlSourceMetadata,
  type ObjectUrlSourceMetadata,
} from './object-url-registry'
import { getOpfsFileBlob } from './opfs-file-access'
import { createRemoteFetch } from '@/infrastructure/remote-media/remote-fetch'

type MediabunnyModule = typeof import('mediabunny')

interface MediabunnyInputSourceOptions {
  metadata?: ObjectUrlSourceMetadata | null
  fallbackBlob?: Blob | null
}

type MediabunnyInputSource =
  | InstanceType<MediabunnyModule['BlobSource']>
  | InstanceType<MediabunnyModule['StreamSource']>
  | InstanceType<MediabunnyModule['UrlSource']>

function isWorkerContext(): boolean {
  // Export workers intentionally provide a `window` alias for browser-only
  // third-party modules. `document` remains a reliable worker discriminator.
  return typeof self !== 'undefined' && typeof document === 'undefined'
}

function canUseDirectFileAccess(
  metadata: ObjectUrlSourceMetadata | null,
): metadata is ObjectUrlSourceMetadata &
  ({ fileHandle: FileSystemFileHandle } | { opfsPath: string }) {
  if (!metadata) {
    return false
  }

  return Boolean(metadata.fileHandle || metadata.opfsPath)
}

function createBrowserFileStreamSource(
  mb: MediabunnyModule,
  metadata: ObjectUrlSourceMetadata & ({ fileHandle: FileSystemFileHandle } | { opfsPath: string }),
  fallbackBlob?: Blob | null,
): InstanceType<MediabunnyModule['StreamSource']> {
  let filePromise: Promise<Blob> | null = null

  const loadFile = async (): Promise<Blob> => {
    if (!filePromise) {
      filePromise = (async () => {
        if (metadata.fileHandle) {
          return metadata.fileHandle.getFile()
        }

        if (metadata.opfsPath) {
          return getOpfsFileBlob(metadata.opfsPath)
        }

        throw new Error('Missing file-backed source metadata')
      })()
    }

    try {
      return await filePromise
    } catch (error) {
      if (fallbackBlob) {
        return fallbackBlob
      }
      throw error
    }
  }

  return new mb.StreamSource({
    getSize: async () => metadata.fileSize ?? (await loadFile()).size,
    read: async (start, end) => {
      const slice = (await loadFile()).slice(start, end)
      if ('stream' in slice && typeof slice.stream === 'function') {
        return slice.stream() as ReadableStream<Uint8Array>
      }
      return new Uint8Array(await slice.arrayBuffer())
    },
    prefetchProfile: 'fileSystem',
  })
}

export function createMediabunnyInputSource(
  mb: MediabunnyModule,
  src: string | Blob,
  options: MediabunnyInputSourceOptions = {},
): MediabunnyInputSource {
  if (src instanceof Blob) {
    return new mb.BlobSource(src)
  }

  const registeredBlob = options.fallbackBlob ?? getObjectUrlBlob(src)
  const metadata = options.metadata ?? getObjectUrlSourceMetadata(src)

  if (canUseDirectFileAccess(metadata)) {
    return createBrowserFileStreamSource(mb, metadata, registeredBlob)
  }

  if (registeredBlob) {
    return new mb.BlobSource(registeredBlob)
  }

  if (src.startsWith('blob:') && isWorkerContext()) {
    throw new Error('Blob URL source is not registered in this worker')
  }

  // Any network URL reads through the block cache: a worker has no registry
  // entry for it unless its caller passed one along, and a bare UrlSource
  // streams open-ended ranges that run far past what it reads.
  const remote =
    metadata?.remote ?? (/^https?:/.test(src) ? { cacheKey: src.split('?')[0] ?? src } : undefined)
  if (remote) {
    return new mb.UrlSource(src, {
      fetchFn: createRemoteFetch(remote),
      ...(remote.credentials ? { requestInit: { credentials: remote.credentials } } : {}),
    })
  }

  return new mb.UrlSource(src)
}

/**
 * Format options for every `Input` that may read a URL. An HLS stream's
 * timestamps count from its first segment, as the timeline's source frames
 * do, rather than from the Unix time its program date tags give.
 */
export const MEDIA_INPUT_FORMAT_OPTIONS = { hls: { offsetTimestampsByDateTime: false } }
