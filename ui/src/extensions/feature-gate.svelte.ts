// SPDX-License-Identifier: MIT

import type { Editor } from '@embeddablecut/sdk'
import type { HotkeyBindingMap, HotkeyKey } from '@/config/hotkeys'
import type { TimelineItem } from '@/types/timeline'
import { findEditorUi } from '$lib/context'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useSelectionStore } from '@/shared/state/selection'
import {
  FEATURE_HOTKEYS,
  resolveFeature,
  type EditorFeatures,
  type FeatureId,
  type FeatureMode,
  type FeatureTarget,
} from './features'

function selectedItems(): TimelineItem[] {
  const { itemById } = useItemsStore.getState()
  return useSelectionStore
    .getState()
    .selectedItemIds.flatMap((id) => (itemById[id] ? [itemById[id]] : []))
}

/**
 * The host's feature switches, read reactively by the editor UI. Predicates
 * see the selection unless the UI names what a feature acts on, and are asked
 * again as the selection changes.
 */
export class FeatureGate {
  #features = $state.raw<EditorFeatures>({})
  #selection = $state.raw<TimelineItem[]>(selectedItems())
  readonly #stop: Array<() => void>

  constructor(
    private readonly editor: Editor,
    features: EditorFeatures = {},
  ) {
    this.#features = features
    const refresh = () => {
      const next = selectedItems()
      const current = this.#selection
      if (next.length !== current.length || next.some((item, i) => item !== current[i])) {
        this.#selection = next
      }
    }
    this.#stop = [useSelectionStore.subscribe(refresh), useItemsStore.subscribe(refresh)]
  }

  /** Replaces every switch the host set (`MountedEditor.setFeatures`). */
  set(features: EditorFeatures): void {
    this.#features = features
  }

  /** How the most restrictive of `ids` shows, for `target` or the selection. */
  mode(ids: FeatureId | readonly FeatureId[], target: FeatureTarget = {}): FeatureMode {
    return resolveFeature(this.#features, ids, {
      editor: this.editor,
      ...target,
      items: target.items ?? this.#selection,
    })
  }

  /** `bindings` with the shortcuts of hidden and locked features unassigned. */
  gateHotkeys(bindings: HotkeyBindingMap): HotkeyBindingMap {
    let gated: HotkeyBindingMap | null = null
    for (const [id, keys] of Object.entries(FEATURE_HOTKEYS) as [FeatureId, HotkeyKey[]][]) {
      if (this.mode(id) === 'on') continue
      gated ??= { ...bindings }
      for (const key of keys) gated[key] = ''
    }
    return gated ?? bindings
  }

  dispose(): void {
    for (const stop of this.#stop.splice(0)) stop()
  }
}

type FeatureReader = Pick<FeatureGate, 'mode' | 'gateHotkeys'>

const ALL_ON: FeatureReader = { mode: () => 'on', gateHotkeys: (bindings) => bindings }

/** The mounted editor's feature switches; call while a component initializes. */
export function useFeatures(): FeatureReader {
  return findEditorUi()?.features ?? ALL_ON
}
