<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Expression dock layer for the dopesheet.
   * Owns the dock's wiring: the guarded draft edits, the pick-whip arming, and the
   * apply/remove/cancel lifecycle. The editor only decides whether the dock is up
   * and hands over its own state handles.
   */
  import DopesheetExpressionDock from './dopesheet-expression-dock.svelte'
  import { formatExpressionValue } from './expression-dock-context'
  import type { DopesheetExpressionDockLayerProps } from './dopesheet-expression-dock-layer'

  let {
    context,
    editor,
    pickingReference,
    itemId,
    rootRef,
    textareaRef,
    setEditor,
    setReferencePick,
    beginReferenceDrag,
    applyPreset,
    onSetPropertyExpression,
    onRemovePropertyExpression,
  }: DopesheetExpressionDockLayerProps = $props()

  const property = $derived(context.property)
</script>

<DopesheetExpressionDock
  {property}
  propertyLabel={context.propertyLabel}
  source={editor.source}
  enabled={editor.enabled}
  preExpressionDisplay={formatExpressionValue(context.preExpressionValue)}
  postExpressionDisplay={formatExpressionValue(context.postExpressionValue)}
  error={context.error}
  hasStoredExpression={context.hasStoredExpression}
  {pickingReference}
  {rootRef}
  {textareaRef}
  onSourceChange={(source, selectionStart, selectionEnd) =>
    setEditor((current) =>
      current?.property === property
        ? { ...current, source, selectionStart, selectionEnd }
        : current,
    )}
  onSelectionChange={(selectionStart, selectionEnd) =>
    setEditor((current) =>
      current?.property === property ? { ...current, selectionStart, selectionEnd } : current,
    )}
  onToggleEnabled={() =>
    setEditor((current) =>
      current?.property === property ? { ...current, enabled: !current.enabled } : current,
    )}
  onApplyPreset={(source) => applyPreset(property, source)}
  onReferencePointerDown={(event, selectionStart, selectionEnd) => {
    setReferencePick(null)
    beginReferenceDrag(event, { itemId, property, selectionStart, selectionEnd })
  }}
  onToggleReferencePicking={(selectionStart, selectionEnd) =>
    setReferencePick((current) =>
      current?.property === property ? null : { itemId, property, selectionStart, selectionEnd },
    )}
  onRemove={() => {
    onRemovePropertyExpression?.(property)
    setReferencePick(null)
    setEditor(null)
  }}
  onCancel={() => {
    setReferencePick(null)
    setEditor(null)
  }}
  onApply={() => {
    if (context.error) return
    onSetPropertyExpression?.(property, editor.source, editor.enabled)
    setReferencePick(null)
    setEditor(null)
  }}
/>
