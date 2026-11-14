// SPDX-License-Identifier: MIT

/**
 * Binds the engine's framework-neutral state to React: store hooks through
 * zustand's `useStore`, translations through react-i18next, and the engine's
 * notices through sonner. Imported before anything renders, by the app entry
 * and the test setup.
 */

import { useStore } from 'zustand'
import { setI18n } from 'react-i18next'
import { toast } from 'sonner'
import { bindStoreHook, type StoreHookBinding } from '@/shared/state/bound-store'
import { onNotification } from '@/shared/notifications'
import { i18n } from '@/i18n'

bindStoreHook(useStore as StoreHookBinding)
setI18n(i18n)
onNotification(({ level, message }) => toast[level](message))
