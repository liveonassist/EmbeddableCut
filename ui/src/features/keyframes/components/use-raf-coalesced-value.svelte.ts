// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

/**
 * Limits high-frequency input (wheel, pointer move) to one update per
 * painted frame while always committing the newest value.
 */
export function useRafCoalescedValue<T>(onValue: (value: T) => void) {
  let pending: T | undefined
  let hasPending = false
  let rafId: number | null = null

  const flush = () => {
    rafId = null
    const value = pending
    const had = hasPending
    pending = undefined
    hasPending = false
    if (had) onValue(value as T)
  }

  const queue = (value: T) => {
    pending = value
    hasPending = true
    if (rafId === null) rafId = requestAnimationFrame(flush)
  }

  const flushNow = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    flush()
  }

  const cancel = () => {
    pending = undefined
    hasPending = false
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  $effect(() => cancel)

  return { queue, flushNow, cancel }
}
