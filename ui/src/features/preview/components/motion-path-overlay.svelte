<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { MotionPathScreenPoint } from '@/features/preview/utils/motion-path'

  export interface MotionPathOverlayPath {
    itemId: string
    points: MotionPathScreenPoint[]
  }

  function buildPathD(points: MotionPathScreenPoint[]): string {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.screenX} ${point.screenY}`)
      .join(' ')
  }
</script>

<script lang="ts">
  let { paths, width, height, activeFrame, onKeyframePointerDown, onTangentPointerDown, onCreateSpatialTangents }: {
    paths: MotionPathOverlayPath[]
    width: number
    height: number
    activeFrame?: number
    onKeyframePointerDown?: (
      itemId: string,
      point: MotionPathScreenPoint,
      event: PointerEvent & { currentTarget: SVGCircleElement },
    ) => void
    onTangentPointerDown?: (
      itemId: string,
      point: MotionPathScreenPoint,
      handle: 'in' | 'out',
      event: PointerEvent & { currentTarget: SVGCircleElement },
    ) => void
    onCreateSpatialTangents?: (itemId: string, point: MotionPathScreenPoint) => void
  } = $props()
</script>

{#if !(paths.length === 0)}
  <svg
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 z-[4]"
    data-testid="motion-path-overlay"
    width={width}
    height={height}
    viewBox={`0 0 ${width} ${height}`}
  >
    {#each paths as path (path.itemId)}
      <g>
        <path
          d={buildPathD(path.points)}
          fill="none"
          stroke="rgba(15, 23, 42, 0.65)"
          stroke-width={4}
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        ></path>
        <path
          d={buildPathD(path.points)}
          fill="none"
          stroke="rgba(56, 189, 248, 0.88)"
          stroke-width={1.5}
          stroke-dasharray="5 5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        ></path>
        {#each path.points
            .filter(
              (point) =>
                point.frame === activeFrame &&
                point.keyframeId &&
                point.inHandle &&
                point.outHandle,
            ) as point (`${path.itemId}:${point.keyframeId}:handles`)}
          <g>
            <path
              d={`M ${point.inHandle!.screenX} ${point.inHandle!.screenY} L ${point.screenX} ${point.screenY} L ${point.outHandle!.screenX} ${point.outHandle!.screenY}`}
              fill="none"
              stroke="rgba(250, 204, 21, 0.8)"
              stroke-width={1}
              vector-effect="non-scaling-stroke"
            ></path>
            {#each (['in', 'out'] as const) as handle (handle)}
              {@const position = handle === 'in' ? point.inHandle! : point.outHandle!}
              <circle
                cx={position.screenX}
                cy={position.screenY}
                r={4}
                class="pointer-events-auto cursor-crosshair"
                data-motion-path-handle={handle}
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(250, 204, 21, 0.95)"
                stroke-width={1.5}
                vector-effect="non-scaling-stroke"
                onpointerdown={(event) => {
                  event.stopPropagation()
                  onTangentPointerDown?.(path.itemId, point, handle, event)
                }}
              ></circle>
            {/each}
          </g>
        {/each}
        {#each path.points
            .filter((point) => point.isKeyframe) as point (`${path.itemId}:${point.frame}`)}
          <circle
            cx={point.screenX}
            cy={point.screenY}
            r={3.5}
            fill="rgba(250, 204, 21, 0.95)"
            stroke="rgba(15, 23, 42, 0.85)"
            stroke-width={1.25}
            vector-effect="non-scaling-stroke"
            class={point.keyframeId ? 'pointer-events-auto cursor-move' : undefined}
            data-motion-path-keyframe-id={point.keyframeId}
            onpointerdown={(event) => {
              if (!point.keyframeId) return
              event.stopPropagation()
              onKeyframePointerDown?.(path.itemId, point, event)
            }}
            ondblclick={(event) => {
              if (!point.keyframeId) return
              event.stopPropagation()
              onCreateSpatialTangents?.(path.itemId, point)
            }}
          ></circle>
        {/each}
      </g>
    {/each}
  </svg>
{/if}
