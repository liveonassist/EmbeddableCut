// SPDX-License-Identifier: MIT

/**
 * Keyframe graph panel — view-mode state and canvas settings.
 *
 * The panel's `graph | dopesheet | split` view mode (persisted to
 * localStorage), the selected-property and vector-graph-mode switches, the
 * effective mode the current surface actually renders, and the project canvas
 * settings transforms resolve against.
 *
 * The persisted mode is read once per mount and written back from an effect
 * on `editorMode`.
 */

import { useProjectStore } from '@/features/timeline/deps/projects'
import {
  DEFAULT_PROJECT_FPS,
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'
import type { AnimatableProperty } from '@/types/keyframe'
import type { CanvasSettings } from '@/types/transform'
import { select } from '$lib/store.svelte'
import type { KeyframeEditorSurface } from './keyframe-graph-panel-model'

export type KeyframeEditorMode = 'graph' | 'dopesheet' | 'split'
const KEYFRAME_EDITOR_MODE_STORAGE_KEY = 'timeline:keyframeEditorMode'

function loadKeyframeEditorMode(): KeyframeEditorMode {
  try {
    const value = localStorage.getItem(KEYFRAME_EDITOR_MODE_STORAGE_KEY)
    if (value === 'graph' || value === 'dopesheet' || value === 'split') {
      return value
    }
  } catch {
    // ignore localStorage read errors
  }
  // Default to the stacked split (dopesheet on top, value graph on bottom) for
  // split-capable surfaces; non-split placements fall back to dopesheet via
  // `effectiveEditorMode`.
  return 'split'
}

interface UseKeyframeGraphPanelViewStateParams {
  surface: KeyframeEditorSurface
  splitView: boolean
}

export function useKeyframeGraphPanelViewState(params: () => UseKeyframeGraphPanelViewStateParams) {
  const currentProject = select(useProjectStore, (s) => s.currentProject)
  const canvas = $derived.by<CanvasSettings>(() => {
    const project = currentProject.current
    return {
      width: project?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
      height: project?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
      fps: project?.metadata.fps ?? DEFAULT_PROJECT_FPS,
    }
  })
  // Track selected property for graph editor
  let selectedProperty = $state<AnimatableProperty | null>(null)
  let editorMode = $state<KeyframeEditorMode>(loadKeyframeEditorMode())
  let vectorGraphMode = $state<'value' | 'speed'>('value')
  $effect(() => {
    const mode = editorMode
    try {
      localStorage.setItem(KEYFRAME_EDITOR_MODE_STORAGE_KEY, mode)
    } catch {
      // ignore localStorage write errors
    }
  })

  // "split" is only offered in the Animate workspace (`splitView`); the docked
  // panel is too short to stack both panes, so a persisted "split" falls back
  // to the dopesheet there.
  const effectiveEditorMode = $derived.by<KeyframeEditorMode>(() => {
    const { surface, splitView } = params()
    return surface === 'motion'
      ? 'graph'
      : surface === 'edit'
        ? 'dopesheet'
        : !splitView && editorMode === 'split'
          ? 'dopesheet'
          : editorMode
  })

  return {
    get canvas() {
      return canvas
    },
    get selectedProperty() {
      return selectedProperty
    },
    setSelectedProperty: (property: AnimatableProperty | null) => {
      selectedProperty = property
    },
    setEditorMode: (mode: KeyframeEditorMode) => {
      editorMode = mode
    },
    get vectorGraphMode() {
      return vectorGraphMode
    },
    setVectorGraphMode: (mode: 'value' | 'speed') => {
      vectorGraphMode = mode
    },
    get effectiveEditorMode() {
      return effectiveEditorMode
    },
  }
}
