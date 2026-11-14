// SPDX-License-Identifier: MIT

import { toast } from 'svelte-sonner'
import { useSettingsStore } from '@/features/editor/deps/settings'
import { createLogger } from '@/shared/logging/logger'
import { i18n } from '@/i18n'
import { select } from '$lib/store.svelte'

const logger = createLogger('AutoSave')

interface UseAutoSaveOptions {
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Function to call when auto-saving */
  onSave: () => Promise<void>
  /** Whether auto-save is enabled (can be used to disable during export, etc.) */
  enabled?: boolean
}

/**
 * Automatically saves at the configured interval when there are unsaved changes.
 *
 * Reads `autoSaveInterval` from settings store (in minutes, 0 = disabled).
 * Only triggers save when `isDirty` is true to avoid unnecessary saves.
 *
 * @example
 * useAutoSave(() => ({ isDirty: isDirty.current, onSave: handleSave }))
 */
export function useAutoSave(options: () => UseAutoSaveOptions): void {
  const autoSaveInterval = select(useSettingsStore, (s) => s.autoSaveInterval)
  let isSaving = false

  $effect(() => {
    const { isDirty, onSave, enabled = true } = options()
    const interval = autoSaveInterval.current
    // Auto-save disabled if interval is 0 or hook is disabled
    if (interval === 0 || !enabled) {
      return
    }

    const intervalMs = interval * 60 * 1000 // Convert minutes to ms

    let idleCallbackId: number | undefined

    const intervalId = setInterval(() => {
      // Only save if there are unsaved changes and not already saving
      if (!isDirty || isSaving) {
        return
      }

      // Defer save to idle time so it doesn't interrupt active editing (e.g., dragging).
      // timeout ensures save still fires within 10s even under continuous activity.
      idleCallbackId = requestIdleCallback(
        async () => {
          if (isSaving) return
          isSaving = true
          const event = logger.startEvent('save')
          event.set('interval_min', interval)

          try {
            await onSave()
            event.success()
          } catch (error) {
            event.failure(error)
            toast.error(i18n.t('editor.autoSave.failed'))
          } finally {
            isSaving = false
          }
        },
        { timeout: 10_000 },
      )
    }, intervalMs)

    return () => {
      clearInterval(intervalId)
      if (idleCallbackId !== undefined) cancelIdleCallback(idleCallbackId)
    }
  })
}
