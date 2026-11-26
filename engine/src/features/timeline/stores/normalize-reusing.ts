// SPDX-License-Identifier: MIT

/**
 * Normalizes what a bulk setter is handed, keeping each element the store
 * already holds as it is: it was normalized on the way in, and a copy would
 * change the identity every index and memo downstream keys on. Undo restores
 * snapshots of the store's own objects, so most of a restore is reused.
 * Returns `current` itself when nothing differs, for the setter to skip.
 */
export function normalizeReusing<T extends { id: string }>(
  next: readonly T[],
  current: readonly T[],
  normalize: (value: T) => T,
): T[] {
  const held = new Map(current.map((value) => [value.id, value]))
  const result = next.map((value) => (held.get(value.id) === value ? value : normalize(value)))
  const unchanged =
    result.length === current.length && result.every((value, index) => value === current[index])
  return unchanged ? (current as T[]) : result
}
