// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { useCornerPinStore } from '@/features/preview/stores/corner-pin-store'
import { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
import { usePowerWindowEditorStore } from '@/features/preview/stores/power-window-editor-store'
import { useSpatialEffectEditorStore } from '@/features/preview/stores/spatial-effect-editor-store'

interface CanvasEditorFlags {
  cornerPin: boolean
  mask: boolean
  powerWindow: boolean
  spatialEffect: boolean
}

export function hasExclusiveCanvasEditor(flags: CanvasEditorFlags): boolean {
  return flags.cornerPin || flags.mask || flags.powerWindow || flags.spatialEffect
}

export function useExclusiveCanvasEditor() {
  const cornerPin = select(useCornerPinStore, (s) => s.isEditing)
  const mask = select(useMaskEditorStore, (s) => s.isEditing)
  const powerWindow = select(usePowerWindowEditorStore, (s) => s.isEditing)
  const spatialEffect = select(useSpatialEffectEditorStore, (s) => s.isEditing)

  return {
    get cornerPin() {
      return cornerPin.current
    },
    get mask() {
      return mask.current
    },
    get powerWindow() {
      return powerWindow.current
    },
    get spatialEffect() {
      return spatialEffect.current
    },
    get active() {
      return hasExclusiveCanvasEditor({
        cornerPin: cornerPin.current,
        mask: mask.current,
        powerWindow: powerWindow.current,
        spatialEffect: spatialEffect.current,
      })
    },
  }
}
