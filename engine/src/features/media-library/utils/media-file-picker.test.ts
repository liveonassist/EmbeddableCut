import { describe, expect, it, vi } from 'vite-plus/test'
import {
  getSupportedMediaFormatLabels,
  hasMediaFilePickerSupport,
  MEDIA_FILE_PICKER_TYPES,
  showMediaFilePicker,
} from './media-file-picker'
import { isFileBackedHandle } from '@/infrastructure/browser/file-backed-handle'

describe('media-file-picker', () => {
  it('falls back to a file input where the browser has no picker, as Firefox has none', async () => {
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })
    let picked: HTMLInputElement | null = null
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      picked = this
      Object.defineProperty(this, 'files', { value: [file] })
      this.dispatchEvent(new Event('change'))
    })

    try {
      expect(hasMediaFilePickerSupport()).toBe(true)
      const [handle] = await showMediaFilePicker({ multiple: true })

      expect(picked!.multiple).toBe(true)
      expect(picked!.accept).toContain('.mp4')
      expect(handle!.name).toBe('clip.mp4')
      expect(await handle!.getFile()).toBe(file)
      expect(isFileBackedHandle(handle)).toBe(true)
    } finally {
      click.mockRestore()
    }
  })

  it('passes the shared media picker types to the browser file picker', async () => {
    const showOpenFilePicker = vi.fn().mockResolvedValue(['handle-1'])
    const originalWindow = globalThis.window

    vi.stubGlobal('window', {
      showOpenFilePicker,
    } as unknown as Window & typeof globalThis)

    const result = await showMediaFilePicker({ multiple: false })

    expect(result).toEqual(['handle-1'])
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      multiple: false,
      types: MEDIA_FILE_PICKER_TYPES,
    })

    vi.stubGlobal('window', originalWindow)
  })

  it('includes every accepted media extension in display order', () => {
    expect(getSupportedMediaFormatLabels()).toEqual([
      'MP4',
      'WebM',
      'MOV',
      'AVI',
      'MKV',
      'MP3',
      'WAV',
      'OGG',
      'M4A',
      'AAC',
      'JPG',
      'JPEG',
      'PNG',
      'GIF',
      'WebP',
      'SVG',
      'JSON',
      'LOTTIE',
    ])
  })
})
