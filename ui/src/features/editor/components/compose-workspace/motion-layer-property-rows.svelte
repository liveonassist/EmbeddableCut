<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function getPathVertexSummary(
    itemId: string,
    showAllPathVertices: boolean,
    maskEditingItemId: string | null,
    selectedPathVertexIndices: readonly number[],
  ): string {
    if (showAllPathVertices) return 'All path vertices'
    if (maskEditingItemId !== itemId || selectedPathVertexIndices.length === 0) return 'Vertex 1'
    const count = selectedPathVertexIndices.length
    return `${count} selected ${count === 1 ? 'vertex' : 'vertices'}`
  }
</script>

<script lang="ts">
  import TextMotionTimelineLanes from './motion-timeline-lanes.svelte'
  import { MotionDopesheetLanes } from './motion-dopesheet-content'
  import { LAYER_COLUMN_WIDTH } from './motion-timeline-primitives'
  import type { MotionLayerPropertyRowsProps } from './motion-layer-property-rows-types'

  /**
   * Everything a layer row expands into: the path-vertex switch, the text-motion
   * lanes and the dope-sheet property rows. Renders nothing while collapsed.
   */
  let {
    item,
    expanded,
    isLayerLocked,
    isPathShape,
    showAllPathVertices,
    maskEditingItemId,
    selectedPathVertexIndices,
    setAllPathVertexItemIds,
    textMotionBands,
    timeViewport,
    itemById,
    itemKeyframes,
    properties,
    durationInFrames,
    fps,
    canvas,
    propertyFilter,
    activeInlineCurve,
    activeCompositionId,
    selectItems,
    setInlineCurve,
    pause,
    setScrubFrame,
    updateTimeViewport,
    beginPropertyLinkDrag,
    handleRemovePropertyLink,
    handleSetPropertyExpression,
    handleRemovePropertyExpression,
  }: MotionLayerPropertyRowsProps = $props()
</script>

{#if expanded}
  <div inert={isLayerLocked ? true : undefined} aria-disabled={isLayerLocked}>
    {#if isPathShape}
      <!-- A path shape's visible-vertex switch and the hint that explains it. -->
      <div
        class="flex h-7 border-b border-border/70 bg-background/45"
        data-testid={`motion-path-vertex-toolbar-${item.id}`}
      >
        <div
          class="flex items-center justify-between gap-2 border-r border-border px-2 text-[10px] text-muted-foreground"
          style:width="{LAYER_COLUMN_WIDTH}px"
        >
          <span>
            {getPathVertexSummary(
              item.id,
              showAllPathVertices,
              maskEditingItemId,
              selectedPathVertexIndices,
            )}
          </span>
          <button
            type="button"
            class="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground hover:bg-accent"
            data-testid={`motion-toggle-all-path-vertices-${item.id}`}
            aria-pressed={showAllPathVertices}
            onclick={() =>
              setAllPathVertexItemIds((current) => {
                const next = new Set(current)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                return next
              })}
          >
            {showAllPathVertices ? 'Selected vertices' : 'All vertices'}
          </button>
        </div>
        <div class="flex flex-1 items-center px-2 text-[10px] text-muted-foreground/70">
          Select path points in the preview to focus these channels.
        </div>
      </div>
    {/if}
    {#if textMotionBands.length > 0}
      <TextMotionTimelineLanes itemId={item.id} bands={textMotionBands} {timeViewport} />
    {/if}
    <MotionDopesheetLanes
      {item}
      {itemById}
      {itemKeyframes}
      {properties}
      compositionDurationInFrames={durationInFrames}
      {fps}
      {canvas}
      {propertyFilter}
      {timeViewport}
      inlineCurveProperty={activeInlineCurve?.itemId === item.id ? activeInlineCurve.property : null}
      disabled={isLayerLocked}
      onSelectItem={(itemId) => selectItems([itemId])}
      onInlineCurveChange={(property) => {
        setInlineCurve(
          property
            ? {
                compositionId: activeCompositionId,
                itemId: item.id,
                property,
              }
            : null,
        )
      }}
      onScrub={(frame) => {
        pause()
        setScrubFrame(frame)
      }}
      onTimeViewportChange={updateTimeViewport}
      onPropertyLinkPointerDown={beginPropertyLinkDrag}
      onRemovePropertyLink={handleRemovePropertyLink}
      onSetPropertyExpression={handleSetPropertyExpression}
      onRemovePropertyExpression={handleRemovePropertyExpression}
    />
  </div>
{/if}
