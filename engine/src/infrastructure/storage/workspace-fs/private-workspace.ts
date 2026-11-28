// SPDX-License-Identifier: MIT

/**
 * The workspace in the origin's private storage (OPFS): the SDK's default,
 * and the app's where the browser can't open a folder (Firefox). Browsers
 * evict best-effort storage under disk pressure and cap it low (Firefox at
 * 10 GiB), so a workspace that holds copied media asks for persistence.
 */

const PRIVATE_WORKSPACE_DIRECTORY = 'embeddablecut'

export async function openPrivateWorkspace(): Promise<FileSystemDirectoryHandle> {
  const storage = await navigator.storage.getDirectory()
  return storage.getDirectoryHandle(PRIVATE_WORKSPACE_DIRECTORY, { create: true })
}

/**
 * Where a bundle's media lands when the browser can't pick a folder for it.
 * Beside the workspace rather than in it, so the workspace's own sweeps never
 * see files they didn't write.
 */
export async function openPrivateImportDirectory(): Promise<FileSystemDirectoryHandle> {
  const storage = await navigator.storage.getDirectory()
  return storage.getDirectoryHandle(`${PRIVATE_WORKSPACE_DIRECTORY}-imports`, { create: true })
}

/** Whether a handle lives in the origin's private storage rather than on disk. */
export async function isPrivateWorkspace(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const storage = await navigator.storage.getDirectory()
    return (await storage.resolve(handle)) !== null
  } catch {
    return false
  }
}

/** `true` once the browser has made the origin's storage persistent; `null` where it can't say. */
export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return typeof navigator.storage?.persisted === 'function'
      ? await navigator.storage.persisted()
      : null
  } catch {
    return null
  }
}

/** Asks for persistent storage. Firefox prompts the user; Chromium decides by engagement. */
export async function requestStoragePersistence(): Promise<boolean> {
  try {
    return typeof navigator.storage?.persist === 'function'
      ? await navigator.storage.persist()
      : false
  } catch {
    return false
  }
}
