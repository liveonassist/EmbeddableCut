<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { CropEdge } from '@/features/preview/utils/crop-gizmo'
  import type { GizmoHandle } from '@/features/preview/types/gizmo'


  /**
   * Scale handle positions (corners and edges).
   */
  const SCALE_HANDLES: GizmoHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  const CORNER_SCALE_HANDLES = new Set<GizmoHandle>(['nw', 'ne', 'se', 'sw'])

  /**
   * Screen bounds for the gizmo container.
   */
  interface ScreenBounds {
    left: number
    top: number
    width: number
    height: number
  }

  /**
   * Props for GizmoHandles component.
   */
  interface GizmoHandlesProps {
    /** Screen bounds of the gizmo */
    bounds: ScreenBounds
    /** Current rotation of the item (for cursor calculation) */
    rotation: number
    /** Whether currently interacting (darker border color) */
    isInteracting: boolean
    /** Whether this is a mask shape (uses cyan instead of orange) */
    isMask?: boolean
    /** Called when dragging starts on the border (translate) */
    onTranslateStart: (e: MouseEvent) => void
    /** Whether translation is owned by a linked Position property. */
    translateBlocked?: boolean
    translateBlockedLabel?: string
    /** Called when dragging starts on a scale handle */
    onScaleStart: (handle: GizmoHandle, e: MouseEvent) => void
    /** Called when dragging starts on the rotation handle */
    onRotateStart: (e: MouseEvent) => void
    /** Current crop viewport in screen pixels, relative to the gizmo container */
    cropRect?: { left: number; top: number; width: number; height: number }
    /** Called when dragging starts on a crop edge handle */
    onCropStart?: (edge: CropEdge, e: MouseEvent) => void
  }
</script>

<script lang="ts">
  import { cssStyle, type CssStyleObject } from '@/features/preview/utils/css-style'
  import { getScaleCursor, HANDLE_SIZE, ROTATION_HANDLE_OFFSET } from '@/features/preview/utils/coordinate-transform'
  let { bounds, rotation, isInteracting, isMask = false, onTranslateStart, translateBlocked = false, translateBlockedLabel, onScaleStart, onRotateStart, cropRect, onCropStart }: GizmoHandlesProps = $props()
  // Get style for a scale handle
  const getHandleStyle = (handle: GizmoHandle): CssStyleObject => {
    const half = HANDLE_SIZE / 2
    const { width, height } = bounds

    const positions: Record<string, { left: number; top: number }> = {
      nw: { left: -half, top: -half },
      n: { left: width / 2 - half, top: -half },
      ne: { left: width - half, top: -half },
      e: { left: width - half, top: height / 2 - half },
      se: { left: width - half, top: height - half },
      s: { left: width / 2 - half, top: height - half },
      sw: { left: -half, top: height - half },
      w: { left: -half, top: height / 2 - half },
    }

    return {
      position: 'absolute',
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      ...positions[handle],
      cursor: getScaleCursor(handle, rotation),
    }
  }

  // Border color based on mask state and interaction
  const borderColor = $derived(isMask
    ? isInteracting
      ? '#0891b2'
      : '#06b6d4' // Cyan for masks
    : isInteracting
      ? '#ea580c'
      : '#f97316')
</script>

<!-- Selection border -->
<div
  class="absolute cursor-move"
  style:inset="{-2}px"
  style:border={`2px dashed ${borderColor}`}
  style:box-sizing="border-box"
  style:z-index="101"
  role="button"
  aria-label={translateBlocked
    ? (translateBlockedLabel ?? 'Position is controlled by a property link')
    : 'Move selected element'}
  aria-disabled={translateBlocked || undefined}
  tabindex={0}
  data-gizmo="border"
  data-translate-blocked={translateBlocked || undefined}
  onmousedown={onTranslateStart}
  ondblclick={(e) => e.stopPropagation()}
></div>
<!-- Scale handles -->
{#each SCALE_HANDLES.filter((handle) => !cropRect || CORNER_SCALE_HANDLES.has(handle)) as handle (handle)}
  {@const handleLabels = {
            nw: 'Resize from top-left corner',
            n: 'Resize from top edge',
            ne: 'Resize from top-right corner',
            e: 'Resize from right edge',
            se: 'Resize from bottom-right corner',
            s: 'Resize from bottom edge',
            sw: 'Resize from bottom-left corner',
            w: 'Resize from left edge',
            rotate: 'Rotate element',
          }}
  <div
    class="bg-white border border-orange-500"
    style={cssStyle({ ...getHandleStyle(handle), zIndex: 102 })}
    role="button"
    aria-label={handleLabels[handle]}
    tabindex={0}
    data-gizmo={`scale-${handle}`}
    onmousedown={(e) => onScaleStart(handle, e)}
  ></div>
{/each}
{#if cropRect && onCropStart}
  <div
    class="pointer-events-none absolute border border-orange-400/80"
    style:left="{cropRect.left}px"
    style:top="{cropRect.top}px"
    style:width="{cropRect.width}px"
    style:height="{cropRect.height}px"
    style:box-sizing="border-box"
    style:z-index="102"
    data-gizmo="crop-outline"
  ></div>
  {#each (['left', 'right', 'top', 'bottom'] as const) as edge (edge)}
    {@const horizontal = edge === 'top' || edge === 'bottom'}
    {@const width = horizontal ? 24 : 6}
    {@const height = horizontal ? 6 : 24}
    {@const left = horizontal
              ? cropRect.left + cropRect.width / 2 - width / 2
              : edge === 'left'
                ? cropRect.left - width / 2
                : cropRect.left + cropRect.width - width / 2}
    {@const top = horizontal
              ? edge === 'top'
                ? cropRect.top - height / 2
                : cropRect.top + cropRect.height - height / 2
              : cropRect.top + cropRect.height / 2 - height / 2}
    <div
      class="absolute border border-white bg-orange-500 shadow-sm"
      style:left="{left}px"
      style:top="{top}px"
      style:width="{width}px"
      style:height="{height}px"
      style:cursor={getScaleCursor(
                    edge === 'left' ? 'w' : edge === 'right' ? 'e' : edge === 'top' ? 'n' : 's',
                    rotation,
                  )}
      style:z-index="103"
      role="button"
      aria-label={`Crop ${edge} edge`}
      tabindex={0}
      data-gizmo={`crop-${edge}`}
      onmousedown={(e) => onCropStart(edge, e)}
    ></div>
  {/each}
{/if}
<!-- Rotation handle -->
<div
  class="absolute bg-white border border-orange-500 rounded-full cursor-crosshair"
  style:width="10px"
  style:height="10px"
  style:left="50%"
  style:top="{-ROTATION_HANDLE_OFFSET}px"
  style:margin-left="{-5}px"
  style:z-index="102"
  role="button"
  aria-label="Rotate selected element"
  tabindex={0}
  data-gizmo="rotate"
  onmousedown={onRotateStart}
></div>
<!-- Rotation guide line -->
<div
  class="absolute border-l border-dashed border-orange-500 pointer-events-none"
  style:left="50%"
  style:top="{-ROTATION_HANDLE_OFFSET + 10}px"
  style:height="{ROTATION_HANDLE_OFFSET - 10}px"
></div>
