// SPDX-License-Identifier: MIT

/**
 * What the browser lets the editor do, for the features that differ between
 * engines. Chromium has all of them; Firefox has no File System Access API
 * and no native HLS, so the editor falls back where this says so.
 */
export interface PlatformSupport {
  /** A folder the user picks on disk can be the workspace (`showDirectoryPicker`). */
  workspaceFolders: boolean
  /**
   * Media can stay where it is on disk (`storageType: 'handle'`). Without it,
   * imported files are copied into the workspace.
   */
  linkedMedia: boolean
  /**
   * The browser's open and save pickers (`showOpenFilePicker`,
   * `showSaveFilePicker`). Without them the editor uses file inputs and downloads.
   */
  filePickers: boolean
  /** The origin's private storage (OPFS), where a workspace can live without a folder. */
  privateStorage: boolean
  /** `navigator.gpu`: GPU effects, transitions and compositing. */
  webgpu: boolean
  /** A `<video>` plays HLS playlists itself. Without it the preview decodes them. */
  nativeHls: boolean
}

const HLS_PLAYBACK_PROBE = 'application/vnd.apple.mpegurl'

export function getPlatformSupport(): PlatformSupport {
  const hasWindow = typeof window !== 'undefined'
  return {
    workspaceFolders: hasWindow && typeof window.showDirectoryPicker === 'function',
    linkedMedia:
      hasWindow &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof FileSystemHandle !== 'undefined' &&
      'queryPermission' in FileSystemHandle.prototype,
    filePickers:
      hasWindow &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof window.showSaveFilePicker === 'function',
    privateStorage:
      typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function',
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu),
    nativeHls: hasNativeHlsPlayback(),
  }
}

let nativeHls: boolean | null = null

function hasNativeHlsPlayback(): boolean {
  if (nativeHls !== null) return nativeHls
  if (typeof document === 'undefined') return false
  try {
    nativeHls = document.createElement('video').canPlayType(HLS_PLAYBACK_PROBE) !== ''
  } catch {
    nativeHls = false
  }
  return nativeHls
}
