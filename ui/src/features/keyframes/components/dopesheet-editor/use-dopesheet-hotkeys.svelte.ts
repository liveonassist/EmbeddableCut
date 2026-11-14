// SPDX-License-Identifier: MIT

/**
 * Dopesheet hotkey registration.
 * Every editing shortcut the sheet owns is registered here, next to the pure
 * helpers that resolve and dispatch them, so the editor body stays free of the
 * ten identical `useHotkeys` blocks. Registration order is FreeCut's.
 */

import { useHotkeys } from '$lib/hotkeys.svelte'
import type { AnimatableProperty, Keyframe, KeyframeRef } from '@/types/keyframe'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import {
  handleAddKeyframeHotkey,
  handleDeleteHotkey,
  handleFitKeyframesHotkey,
  handleNavigateHotkey,
  handleNudgeHotkey,
  handleToggleAutoKeyHotkey,
  resolveDopesheetHotkeys,
  type DopesheetShortcutMap,
} from './dopesheet-hotkeys'
import type { DopesheetPropertyRow } from './dopesheet-types'

export interface UseDopesheetHotkeysOptions {
  /** Activate editor-only shortcuts when this surface owns pointer or keyboard focus. */
  shortcutsEnabled: boolean
  /** Keep the Edit add-keyframe shortcut active while its dock is open. */
  addKeyframeShortcutEnabled: boolean
  disabled: boolean
  /** User-configurable bindings for high-frequency keyframe actions. */
  shortcuts?: DopesheetShortcutMap | undefined
  /** The selected property's row, when it is visible. */
  activePropertyRow: DopesheetPropertyRow | undefined
  hasSelection: boolean
  /** Whether the owner can commit value edits (gates the auto-key shortcut). */
  canCommitValues: boolean
  selectedRefs: KeyframeRef[]
  onRemoveKeyframes?: ((refs: KeyframeRef[]) => void) | undefined
  handleRowAddKeyframe: (property: AnimatableProperty, currentKeyframes: Keyframe[]) => void
  handleRowNavigate: (property: AnimatableProperty, keyframe: Keyframe | null) => void
  handleRowAutoKeyToggle: (property: AnimatableProperty) => void
  fitKeyframesInView: () => void
  nudgeSelectedKeyframes: (deltaFrames: number) => void
}

/** Registers every dopesheet shortcut. Returns nothing; the bindings are the output. */
export function useDopesheetHotkeys(options: () => UseDopesheetHotkeysOptions): void {
  const shortcutsEnabled = $derived(options().shortcutsEnabled)
  const addKeyframeShortcutEnabled = $derived(options().addKeyframeShortcutEnabled)
  const disabled = $derived(options().disabled)
  const shortcuts = $derived(options().shortcuts)
  const hasActivePropertyRow = $derived(!!options().activePropertyRow)
  const hasSelection = $derived(options().hasSelection)
  const canCommitValues = $derived(options().canCommitValues)

  const hotkeyBindings = $derived(
    resolveDopesheetHotkeys({
      shortcutsEnabled,
      addKeyframeShortcutEnabled,
      disabled,
      shortcuts,
      hasActivePropertyRow,
      hasSelection,
      canCommitValues,
    }),
  )
  const keys = $derived(hotkeyBindings.keys)
  const enabled = $derived(hotkeyBindings.enabled)

  // Handlers read the latest options when a key fires.
  useHotkeys(
    () => keys.add,
    (event) =>
      handleAddKeyframeHotkey(event, options().activePropertyRow, options().handleRowAddKeyframe),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.add }),
  )

  useHotkeys(
    () => keys.prev,
    (event) => {
      const { activePropertyRow, handleRowNavigate } = options()
      handleNavigateHotkey(
        event,
        activePropertyRow,
        activePropertyRow?.controls.prevKeyframe ?? null,
        handleRowNavigate,
      )
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.prev }),
  )

  useHotkeys(
    () => keys.next,
    (event) => {
      const { activePropertyRow, handleRowNavigate } = options()
      handleNavigateHotkey(
        event,
        activePropertyRow,
        activePropertyRow?.controls.nextKeyframe ?? null,
        handleRowNavigate,
      )
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.next }),
  )

  useHotkeys(
    () => keys.toggleAutoKey,
    (event) =>
      handleToggleAutoKeyHotkey(
        event,
        options().activePropertyRow,
        options().handleRowAutoKeyToggle,
      ),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.toggleAutoKey }),
  )

  useHotkeys(
    () => keys.fit,
    (event) => handleFitKeyframesHotkey(event, options().fitKeyframesInView),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.fit }),
  )

  useHotkeys(
    'delete,backspace',
    (event) => handleDeleteHotkey(event, options().selectedRefs, options().onRemoveKeyframes),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.edit }),
  )

  useHotkeys(
    'left',
    (event) => handleNudgeHotkey(event, -1, options().nudgeSelectedKeyframes),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.edit }),
  )

  useHotkeys(
    'right',
    (event) => handleNudgeHotkey(event, 1, options().nudgeSelectedKeyframes),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.edit }),
  )

  useHotkeys(
    'shift+left',
    (event) => handleNudgeHotkey(event, -10, options().nudgeSelectedKeyframes),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.edit }),
  )

  useHotkeys(
    'shift+right',
    (event) => handleNudgeHotkey(event, 10, options().nudgeSelectedKeyframes),
    () => ({ ...HOTKEY_OPTIONS, enabled: enabled.edit }),
  )
}
