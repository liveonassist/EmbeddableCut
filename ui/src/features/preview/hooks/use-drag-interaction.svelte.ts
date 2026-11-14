// SPDX-License-Identifier: MIT

/**
 * Escape key cancellation helper for interactions managed elsewhere.
 */
export function useEscapeCancel(getIsActive: () => boolean, getOnCancel: () => () => void): void {
  const isActive = $derived(getIsActive())
  const onCancel = $derived(getOnCancel())
  const onEscapeKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  $effect(() => {
    if (!isActive) return

    window.addEventListener('keydown', onEscapeKeyDown)
    return () => window.removeEventListener('keydown', onEscapeKeyDown)
  })
}
