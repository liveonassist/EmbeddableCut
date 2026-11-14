// SPDX-License-Identifier: MIT

/**
 * Dopesheet expression dock wiring.
 * Builds the dock's context from the open draft, the sheet rows and the
 * property values, closes a dock whose context can no longer be built, and
 * hands the dock layer its props. The dock component itself stays
 * presentational; this hook owns the plumbing between the editor's expression
 * state and it.
 *
 * React returned the rendered layer; here the hook returns the layer's props
 * (`layerProps`, null while no dock is up) and the editor renders
 * `dopesheet-expression-dock-element.svelte` with them where React placed
 * `expressionDockElement`.
 */

import { untrack } from 'svelte'
import type { TFunction } from 'i18next'
import { t } from '$lib/i18n.svelte'
import { buildExpressionDockContext, type ExpressionDockContext } from './expression-dock-context'
import { getKeyframePropertyLabel } from '@/features/keyframes/utils/property-i18n'
import type { DopesheetExpressionDockLayerProps } from './dopesheet-expression-dock-layer'
import type { PropertyExpressionEditorApi } from './use-property-expression-editor.svelte'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import type { DopesheetPropertyRow } from './dopesheet-types'

export interface UseDopesheetExpressionDockOptions {
  editor: PropertyExpressionEditorApi['expressionEditor']
  referencePick: PropertyExpressionEditorApi['expressionReferencePick']
  dockRef: PropertyExpressionEditorApi['expressionDockRef']
  textareaRef: PropertyExpressionEditorApi['expressionTextareaRef']
  setEditor: PropertyExpressionEditorApi['setExpressionEditor']
  setReferencePick: PropertyExpressionEditorApi['setExpressionReferencePick']
  beginReferenceDrag: PropertyExpressionEditorApi['beginExpressionReferenceDrag']
  applyPreset: PropertyExpressionEditorApi['applyExpressionPreset']
  itemId: string
  rows: DopesheetPropertyRow[]
  compoundRows: NonNullable<DopesheetEditorProps['compoundPropertyRows']>
  preExpressionValues: NonNullable<DopesheetEditorProps['preExpressionPropertyValues']>
  propertyValues: NonNullable<DopesheetEditorProps['propertyValues']>
  expressions: NonNullable<DopesheetEditorProps['propertyExpressions']>
  currentFrame: number
  globalFrame: DopesheetEditorProps['globalFrame']
  itemFrom: number
  fps: number
  resolveExpressionReference: DopesheetEditorProps['resolveExpressionReference']
  onSetPropertyExpression: DopesheetEditorProps['onSetPropertyExpression']
  onRemovePropertyExpression: DopesheetEditorProps['onRemovePropertyExpression']
}

export interface UseDopesheetExpressionDockReturn {
  /** The open draft's dock context, or null when no dock is up. */
  readonly context: ExpressionDockContext | null
  /** Props for the dock layer, or null when no dock is up. */
  readonly layerProps: DopesheetExpressionDockLayerProps | null
}

export function useDopesheetExpressionDock(
  options: () => UseDopesheetExpressionDockOptions,
): UseDopesheetExpressionDockReturn {
  const opts = $derived(options())
  const editor = $derived(opts.editor)
  const rows = $derived(opts.rows)
  const compoundRows = $derived(opts.compoundRows)
  const preExpressionValues = $derived(opts.preExpressionValues)
  const propertyValues = $derived(opts.propertyValues)
  const expressions = $derived(opts.expressions)
  const globalFrame = $derived(opts.globalFrame)
  const itemFrom = $derived(opts.itemFrom)
  const currentFrame = $derived(opts.currentFrame)
  const fps = $derived(opts.fps)
  const resolveExpressionReference = $derived(opts.resolveExpressionReference)
  const context = $derived.by(() => {
    if (!editor) return null
    return buildExpressionDockContext({
      editor,
      rows,
      compoundRows,
      preExpressionValues,
      propertyValues,
      expressions,
      currentGlobalFrame: globalFrame ?? itemFrom + currentFrame,
      fps,
      resolveExpressionReference,
      getPropertyLabel: (property) => getKeyframePropertyLabel(t as TFunction, property),
    })
  })
  $effect(() => {
    if (editor && !context) {
      untrack(() => {
        opts.setReferencePick(null)
        opts.setEditor(null)
      })
    }
  })

  const layerProps = $derived.by((): DopesheetExpressionDockLayerProps | null => {
    if (!editor || !context) return null
    return {
      context,
      editor,
      pickingReference: opts.referencePick?.property === context.property,
      itemId: opts.itemId,
      rootRef: opts.dockRef,
      textareaRef: opts.textareaRef,
      setEditor: opts.setEditor,
      setReferencePick: opts.setReferencePick,
      beginReferenceDrag: opts.beginReferenceDrag,
      applyPreset: opts.applyPreset,
      onSetPropertyExpression: opts.onSetPropertyExpression,
      onRemovePropertyExpression: opts.onRemovePropertyExpression,
    }
  })

  return {
    get context() {
      return context
    },
    get layerProps() {
      return layerProps
    },
  }
}
