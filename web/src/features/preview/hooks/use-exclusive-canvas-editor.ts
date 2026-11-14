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
  const cornerPin = useCornerPinStore((s) => s.isEditing)
  const mask = useMaskEditorStore((s) => s.isEditing)
  const powerWindow = usePowerWindowEditorStore((s) => s.isEditing)
  const spatialEffect = useSpatialEffectEditorStore((s) => s.isEditing)

  return {
    cornerPin,
    mask,
    powerWindow,
    spatialEffect,
    active: hasExclusiveCanvasEditor({ cornerPin, mask, powerWindow, spatialEffect }),
  }
}
