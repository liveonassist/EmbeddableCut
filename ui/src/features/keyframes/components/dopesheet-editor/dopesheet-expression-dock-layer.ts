// SPDX-License-Identifier: MIT

import type { DirectLinkableProperty } from '@/types/keyframe'
import type { Ref, SetState } from '../ref-state.svelte'
import type { ExpressionDockContext } from './expression-dock-context'
import type {
  ExpressionReferenceDragOrigin,
  PropertyExpressionDraft,
} from './expression-reference-utils'
import type { PropertyExpressionEditorApi } from './use-property-expression-editor.svelte'

export interface DopesheetExpressionDockLayerProps {
  /** Preview data for the property being edited. */
  context: ExpressionDockContext
  /** Draft source/enabled/selection state for that property. */
  editor: PropertyExpressionDraft
  /** Whether this property's reference pick-whip is armed. */
  pickingReference: boolean
  itemId: string
  rootRef: Ref<HTMLElement | null>
  textareaRef: Ref<HTMLTextAreaElement | null>
  setEditor: SetState<PropertyExpressionDraft | null>
  setReferencePick: SetState<ExpressionReferenceDragOrigin | null>
  beginReferenceDrag: PropertyExpressionEditorApi['beginExpressionReferenceDrag']
  applyPreset: PropertyExpressionEditorApi['applyExpressionPreset']
  /** Create or update the sandboxed expression for the edited property. */
  onSetPropertyExpression?: (
    property: DirectLinkableProperty,
    source: string,
    enabled: boolean,
  ) => void
  /** Remove the sandboxed expression for the edited property. */
  onRemovePropertyExpression?: (property: DirectLinkableProperty) => void
}
