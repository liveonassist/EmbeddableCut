// @vitest-environment node

import { describe, expect, it, vi } from 'vite-plus/test'
import {
  extractValidMediaFileEntriesFromDataTransfer,
  formatMediaDropRejectionMessage,
} from './file-drop'
import { isFileBackedHandle } from '@/infrastructure/browser/file-backed-handle'

function makeItem(handle: FileSystemHandle | null): DataTransferItem {
  return {
    getAsFileSystemHandle: vi.fn().mockResolvedValue(handle),
  } as unknown as DataTransferItem
}

describe('extractValidMediaFileEntriesFromDataTransfer', () => {
  it('reports dropped folders instead of silently ignoring them', async () => {
    const directoryHandle = {
      kind: 'directory',
      name: 'Media Folder',
    } as unknown as FileSystemDirectoryHandle
    const dataTransfer = {
      items: [makeItem(directoryHandle)],
    } as unknown as DataTransfer

    const result = await extractValidMediaFileEntriesFromDataTransfer(dataTransfer)

    expect(result.supported).toBe(true)
    expect(result.entries).toEqual([])
    expect(result.errors).toEqual([
      'Media Folder: folders are not supported yet. Drop media files directly.',
    ])
  })

  it('wraps dropped files where the browser gives no handles, as Firefox does', async () => {
    const clip = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })
    const fileItem = {
      kind: 'file',
      webkitGetAsEntry: () => ({ isDirectory: false, name: 'clip.mp4' }),
      getAsFile: () => clip,
    }
    const folderItem = {
      kind: 'file',
      webkitGetAsEntry: () => ({ isDirectory: true, name: 'Footage' }),
      getAsFile: () => null,
    }
    const dataTransfer = { items: [fileItem, folderItem] } as unknown as DataTransfer

    const result = await extractValidMediaFileEntriesFromDataTransfer(dataTransfer)

    expect(result.supported).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.file).toBe(clip)
    expect(result.entries[0]!.mediaType).toBe('video')
    expect(isFileBackedHandle(result.entries[0]!.handle)).toBe(true)
    expect(result.errors).toEqual([
      'Footage: folders are not supported yet. Drop media files directly.',
    ])
  })
})

describe('formatMediaDropRejectionMessage', () => {
  it('summarizes rejected drops with examples and an overflow count', () => {
    expect(
      formatMediaDropRejectionMessage([
        'folder: folders are not supported yet. Drop media files directly.',
        'notes.txt: Unsupported file type',
        'archive.zip: Unsupported file type',
        'broken.mp4: Unable to read file',
      ]),
    ).toBe(
      '4 dropped items were rejected: folder: folders are not supported yet. Drop media files directly.; notes.txt: Unsupported file type; archive.zip: Unsupported file type; and 1 more.',
    )
  })
})
