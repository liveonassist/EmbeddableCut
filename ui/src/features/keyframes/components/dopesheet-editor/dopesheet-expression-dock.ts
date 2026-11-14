// SPDX-License-Identifier: MIT

import type { DirectLinkableProperty } from '@/types/keyframe'
import type { Ref } from '../ref-state.svelte'

export const EXPRESSION_DOCK_HEIGHT = 154

export interface DopesheetExpressionDockProps {
  property: DirectLinkableProperty
  propertyLabel: string
  source: string
  enabled: boolean
  preExpressionDisplay: string
  postExpressionDisplay: string
  error?: string
  hasStoredExpression: boolean
  pickingReference: boolean
  rootRef: Ref<HTMLElement | null>
  textareaRef: Ref<HTMLTextAreaElement | null>
  onSourceChange: (source: string, selectionStart: number, selectionEnd: number) => void
  onSelectionChange: (selectionStart: number, selectionEnd: number) => void
  onToggleEnabled: () => void
  onApplyPreset: (source: string) => void
  onReferencePointerDown: (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    selectionStart: number,
    selectionEnd: number,
  ) => void
  onToggleReferencePicking: (selectionStart: number, selectionEnd: number) => void
  onRemove: () => void
  onCancel: () => void
  onApply: () => void
}
