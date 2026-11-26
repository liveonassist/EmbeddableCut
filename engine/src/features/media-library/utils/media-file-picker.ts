import {
  acceptFromPickerTypes,
  fileBackedHandle,
  pickFilesWithInput,
} from '@/infrastructure/browser/file-backed-handle'

export const MEDIA_FILE_PICKER_TYPES = [
  {
    description: 'Media files',
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
      'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      'application/lottie+json': ['.json', '.lottie'],
    },
  },
] satisfies FilePickerAcceptType[]

const FORMAT_LABEL_OVERRIDES: Record<string, string> = {
  webm: 'WebM',
  webp: 'WebP',
}

export function getSupportedMediaFormatLabels(): string[] {
  const extensions = Object.values(MEDIA_FILE_PICKER_TYPES[0]?.accept ?? {}).flat()
  return extensions.map((extension) => {
    const normalized = extension.replace(/^\./, '')
    return FORMAT_LABEL_OVERRIDES[normalized] ?? normalized.toUpperCase()
  })
}

export function hasMediaFilePickerSupport(): boolean {
  // EmbeddableCut: a file input stands in for the picker where there's none (Firefox).
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export async function showMediaFilePicker(options?: {
  multiple?: boolean
}): Promise<FileSystemFileHandle[]> {
  if (!('showOpenFilePicker' in window)) {
    const files = await pickFilesWithInput({
      multiple: options?.multiple ?? true,
      accept: acceptFromPickerTypes(MEDIA_FILE_PICKER_TYPES),
    })
    return files.map(fileBackedHandle)
  }
  return window.showOpenFilePicker({
    multiple: options?.multiple ?? true,
    types: MEDIA_FILE_PICKER_TYPES,
  })
}
