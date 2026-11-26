// SPDX-License-Identifier: MIT

/**
 * Files for browsers without the File System Access pickers (Firefox): a
 * file input stands in for `showOpenFilePicker`, and the `File`s it and drops
 * give are wrapped as read-only `FileSystemFileHandle`s, so import code
 * written against handles takes them unchanged. A wrapped file can't be
 * linked in place or persisted: whatever imports it copies its bytes.
 */

const FILE_BACKED = Symbol('embeddablecut.fileBacked')

export function fileBackedHandle(file: File): FileSystemFileHandle {
  const handle = {
    [FILE_BACKED]: file,
    kind: 'file' as const,
    name: file.name,
    getFile: () => Promise.resolve(file),
    isSameEntry: (other: FileSystemHandle) => Promise.resolve(other === handle),
    createWritable: () =>
      Promise.reject(new DOMException('A picked file is read-only', 'NotAllowedError')),
    createSyncAccessHandle: () =>
      Promise.reject(new DOMException('A picked file is read-only', 'NotAllowedError')),
  }
  return handle as unknown as FileSystemFileHandle
}

export function isFileBackedHandle(handle: FileSystemHandle | null | undefined): boolean {
  return !!handle && FILE_BACKED in handle
}

export interface FileInputOptions {
  /** An `<input accept>` value: MIME types and extensions, comma-separated. */
  accept?: string
  multiple?: boolean
}

/**
 * Opens the browser's file dialog through a file input. Rejects with an
 * `AbortError` when the user cancels, as the pickers do.
 */
export function pickFilesWithInput(options: FileInputOptions = {}): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple ?? false
    if (options.accept) input.accept = options.accept
    input.style.display = 'none'
    const finish = () => input.remove()
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? [])
      finish()
      if (files.length === 0) reject(new DOMException('No file was picked', 'AbortError'))
      else resolve(files)
    })
    input.addEventListener('cancel', () => {
      finish()
      reject(new DOMException('The user aborted a request.', 'AbortError'))
    })
    document.body.append(input)
    input.click()
  })
}

/**
 * The files directly inside a folder the user picks, through a directory
 * input, standing in for `showDirectoryPicker({ mode: 'read' })`.
 */
export async function pickFolderFilesWithInput(): Promise<File[]> {
  const files = await new Promise<File[]>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.style.display = 'none'
    input.addEventListener('change', () => {
      input.remove()
      resolve(Array.from(input.files ?? []))
    })
    input.addEventListener('cancel', () => {
      input.remove()
      reject(new DOMException('The user aborted a request.', 'AbortError'))
    })
    document.body.append(input)
    input.click()
  })
  return files.filter((file) => file.webkitRelativePath.split('/').length === 2)
}

/** `FilePickerAcceptType`s as an `<input accept>` value. */
export function acceptFromPickerTypes(types: readonly FilePickerAcceptType[]): string {
  const parts = new Set<string>()
  for (const type of types) {
    for (const [mime, extensions] of Object.entries(type.accept ?? {})) {
      parts.add(mime)
      for (const extension of [extensions].flat()) parts.add(extension)
    }
  }
  return [...parts].join(',')
}

/**
 * A drop's files and the names of its folders, for browsers without
 * `getAsFileSystemHandle`. Read it in the drop event, before any `await`.
 */
export function filesFromDataTransfer(dataTransfer: DataTransfer): {
  files: File[]
  folders: string[]
} {
  const files: File[] = []
  const folders: string[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      folders.push(entry.name)
      continue
    }
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return { files, folders }
}
