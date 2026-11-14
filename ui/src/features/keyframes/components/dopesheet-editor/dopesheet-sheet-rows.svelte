<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * The sheet body's rows (React's `rowElements`): classic Edit's text-motion
   * bands, then one grid row per rendered group or property entry, each pairing
   * its property-column controls with its culled timeline cell.
   */
  import { GROUP_HEADER_HEIGHT, ROW_HEIGHT } from './dopesheet-constants'
  import { DopesheetGroupHeader, DopesheetPropertyRowContent } from './dopesheet-row-renderers'
  import { GroupTimelineCell, PropertyTimelineCell } from './dopesheet-timeline-cells'
  import TextMotionTimelineRows from './text-motion-timeline-rows.svelte'
  import TimelineViewportCuller from './timeline-viewport-culler.svelte'
  import {
    EMPTY_FRAME_GROUPS,
    EMPTY_KEYFRAMES,
    EMPTY_STRUCTURE_ROWS,
    getSheetRowStyle,
    type UseDopesheetSheetRowsOptions,
  } from './use-dopesheet-sheet-rows'

  let {
    rowContentProps,
    groupHeaderProps,
    renderedSheetEntries,
    groupTimelineById,
    expandedGroups,
    rowKeyframesByProperty,
    renderedKeyframeXById,
    proceduralBandByProperty,
    selectedKeyframeIds,
    transitionBlockedRanges,
    ticks,
    frameToX,
    sharedGridFrameToX,
    getRenderedKeyframeX,
    effectiveTimelineWidth,
    timelineGridDivisions,
    propertyGridStyle,
    presentation,
    disabled,
    isPropertyLocked,
    itemId,
    textMotionBands,
    getLiveDragPixelsPerFrame,
    sheetPreviewFrames,
    sheetPreviewDuplicateKeyframeIds,
    keyframeMetaByIdRef,
    setKeyframeButtonRef,
    handleRowPointerDown,
    handleTimelineBackgroundPointerDown,
    handleKeyframePointerDown,
    handleGroupKeyframePointerDown,
    onSegmentEasingChange,
    onDragStart,
    onDragEnd,
    textMotionHandlers,
  }: UseDopesheetSheetRowsOptions = $props()

  const groupTimelineRowStyle = $derived(
    getSheetRowStyle(propertyGridStyle, GROUP_HEADER_HEIGHT, presentation),
  )
  const propertyTimelineRowStyle = $derived(
    getSheetRowStyle(propertyGridStyle, ROW_HEIGHT, presentation),
  )
  const gridFrameToX = $derived(timelineGridDivisions ? sharedGridFrameToX : undefined)
</script>

<!-- Classic Edit lists the text-motion bands above the property rows; other presentations do not. -->
{#if presentation === 'classic' && textMotionBands.length > 0}
  <TextMotionTimelineRows
    bands={textMotionBands}
    gridStyle={propertyTimelineRowStyle}
    {ticks}
    axisWidth={effectiveTimelineWidth}
    {frameToX}
    getPixelsPerFrame={getLiveDragPixelsPerFrame}
    {disabled}
    onBackgroundPointerDown={handleTimelineBackgroundPointerDown}
    {...textMotionHandlers}
  />
{/if}
{#each renderedSheetEntries.entries as entry (entry.type === 'group' ? `group:${entry.group.id}` : `row:${entry.row.property}`)}
  {#if entry.type === 'group'}
    {@const groupTimeline = groupTimelineById.get(entry.group.id)}
    <div class="grid w-full border-b border-border/60" style={groupTimelineRowStyle}>
      <DopesheetGroupHeader group={entry.group} {...groupHeaderProps} />
      <TimelineViewportCuller>
        <GroupTimelineCell
          groupId={entry.group.id}
          groupLabel={entry.group.label}
          expanded={expandedGroups[entry.group.id] ?? true}
          frameGroups={groupTimeline?.frameGroups ?? EMPTY_FRAME_GROUPS}
          rows={groupTimeline?.rows ?? EMPTY_STRUCTURE_ROWS}
          {ticks}
          axisWidth={effectiveTimelineWidth}
          {frameToX}
          {gridFrameToX}
          {getRenderedKeyframeX}
          {selectedKeyframeIds}
          {disabled}
          {isPropertyLocked}
          onGroupKeyframePointerDown={handleGroupKeyframePointerDown}
          onBackgroundPointerDown={handleTimelineBackgroundPointerDown}
          {sheetPreviewFrames}
          {sheetPreviewDuplicateKeyframeIds}
        />
      </TimelineViewportCuller>
    </div>
  {:else}
    {@const row = entry.row}
    <div class="grid border-b border-border/60" style={propertyTimelineRowStyle}>
      <DopesheetPropertyRowContent
        {row}
        options={{ classic: presentation === 'classic', indented: entry.indented }}
        {...rowContentProps}
      />
      <TimelineViewportCuller>
        <PropertyTimelineCell
          {itemId}
          property={row.property}
          keyframes={rowKeyframesByProperty.get(row.property) ?? EMPTY_KEYFRAMES}
          locked={isPropertyLocked(row.property)}
          {ticks}
          axisWidth={effectiveTimelineWidth}
          {frameToX}
          {gridFrameToX}
          {getRenderedKeyframeX}
          {renderedKeyframeXById}
          {transitionBlockedRanges}
          proceduralBand={proceduralBandByProperty.get(row.property)}
          {selectedKeyframeIds}
          {disabled}
          onRowPointerDown={handleRowPointerDown}
          onKeyframePointerDown={handleKeyframePointerDown}
          {onSegmentEasingChange}
          onSegmentDragStart={onDragStart}
          onSegmentDragEnd={onDragEnd}
          {setKeyframeButtonRef}
          {keyframeMetaByIdRef}
          {sheetPreviewFrames}
          {sheetPreviewDuplicateKeyframeIds}
        />
      </TimelineViewportCuller>
    </div>
  {/if}
{/each}
