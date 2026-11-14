<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { cssStyle } from '@/features/preview/utils/css-style'
  import AlignCenterHorizontal from 'lucide-svelte/icons/align-center-horizontal'
  import AlignCenterVertical from 'lucide-svelte/icons/align-center-vertical'
  import AlignEndHorizontal from 'lucide-svelte/icons/align-end-horizontal'
  import AlignEndVertical from 'lucide-svelte/icons/align-end-vertical'
  import AlignHorizontalDistributeCenter from 'lucide-svelte/icons/align-horizontal-distribute-center'
  import AlignStartHorizontal from 'lucide-svelte/icons/align-start-horizontal'
  import AlignStartVertical from 'lucide-svelte/icons/align-start-vertical'
  import AlignVerticalDistributeCenter from 'lucide-svelte/icons/align-vertical-distribute-center'
  import Magnet from 'lucide-svelte/icons/magnet'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { useSelectionStore } from '@/shared/state/selection'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSettingsStore } from '@/features/preview/deps/settings'
  import { applyAutoKeyframeOperations, updateItemsTransformMap, useKeyframesStore } from '@/features/preview/deps/timeline-store'
  import { getAutoKeyframeOperation, type AutoKeyframeOperation } from '@/features/preview/deps/keyframes'
  import { useVisualTransforms } from '../../hooks/use-visual-transform.svelte'
  import type { TransformProperties } from '@/types/transform'
  import type { TimelineItem } from '@/types/timeline'

  type AlignmentType =
    | 'left'
    | 'center-h'
    | 'right'
    | 'top'
    | 'center-v'
    | 'bottom'
    | 'distribute-h'
    | 'distribute-v'

  const ALIGNMENT_ACTIONS: Array<{
    type: AlignmentType
    icon: typeof AlignStartHorizontal
    labelKey: string
    minItems: number
  }> = [
    { type: 'left', icon: AlignStartVertical, labelKey: 'preview.align.left', minItems: 1 },
    { type: 'center-h', icon: AlignCenterVertical, labelKey: 'preview.align.centerH', minItems: 1 },
    { type: 'right', icon: AlignEndVertical, labelKey: 'preview.align.right', minItems: 1 },
    { type: 'top', icon: AlignStartHorizontal, labelKey: 'preview.align.top', minItems: 1 },
    { type: 'center-v', icon: AlignCenterHorizontal, labelKey: 'preview.align.centerV', minItems: 1 },
    { type: 'bottom', icon: AlignEndHorizontal, labelKey: 'preview.align.bottom', minItems: 1 },
    {
      type: 'distribute-h',
      icon: AlignHorizontalDistributeCenter,
      labelKey: 'preview.align.distributeH',
      minItems: 3,
    },
    {
      type: 'distribute-v',
      icon: AlignVerticalDistributeCenter,
      labelKey: 'preview.align.distributeV',
      minItems: 3,
    },
  ]

  const BUTTON_STYLE = { height: 22, width: 22 }

  interface AlignmentToolbarProps {
    projectSize: { width: number; height: number }
  }

  interface AlignmentToolbarCoreProps extends AlignmentToolbarProps {
    items: TimelineItem[]
  }
</script>

<script lang="ts">
  let { projectSize, items }: AlignmentToolbarCoreProps = $props()

  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const canvasSnapEnabled = select(useSettingsStore, (s) => s.canvasSnapEnabled)
  const setSetting = useSettingsStore.getState().setSetting

  const visualItems = $derived.by(() => items.filter((item) => item.type !== 'audio' && item.type !== 'adjustment'))

  const selectedItemIdsSet = $derived.by(() => new Set(selectedItemIds.current))

  const selectedVisualItems = $derived.by(() => {
    void [selectedItemIdsSet]

    return visualItems.filter((item) => selectedItemIdsSet.has(item.id))
  })

  const visualTransformsMap = useVisualTransforms(() => selectedVisualItems, () => projectSize, () => items)

  const itemCount = $derived(selectedVisualItems.length)

  const handleAlign = (alignment: AlignmentType) => {
      const tolerance = 0.5
      const updates = new Map<string, Partial<TransformProperties>>()

      const entries = selectedVisualItems
        .map((item) => {
          const resolved = visualTransformsMap.current.get(item.id)
          if (!resolved) return null
          return {
            id: item.id,
            x: resolved.x,
            y: resolved.y,
            width: resolved.width,
            height: resolved.height,
          }
        })
        .filter(<T,>(v: T | null): v is T => v !== null)

      if (entries.length === 0) return

      if (alignment === 'distribute-h' || alignment === 'distribute-v') {
        if (entries.length < 3) return
        const axis = alignment === 'distribute-h' ? 'x' : 'y'
        const size = axis === 'x' ? 'width' : 'height'
        const sorted = [...entries].sort((a, b) => a[axis] - b[axis])
        const first = sorted[0]!
        const last = sorted[sorted.length - 1]!

        // Distribute gaps evenly between item edges, not centers
        const spanStart = first[axis] - first[size] / 2
        const spanEnd = last[axis] + last[size] / 2
        const totalItemSize = sorted.reduce((sum, e) => sum + e[size], 0)
        const gap = (spanEnd - spanStart - totalItemSize) / (sorted.length - 1)

        let cursor = spanStart + first[size]
        for (let index = 1; index < sorted.length - 1; index += 1) {
          const entry = sorted[index]!
          const target = cursor + gap + entry[size] / 2
          cursor = target + entry[size] / 2
          if (Math.abs(target - entry[axis]) <= tolerance) continue
          updates.set(entry.id, axis === 'x' ? { x: target } : { y: target })
        }
      } else {
        for (const entry of entries) {
          let nextX: number | undefined
          let nextY: number | undefined

          switch (alignment) {
            case 'left':
              nextX = -projectSize.width / 2 + entry.width / 2
              break
            case 'center-h':
              nextX = 0
              break
            case 'right':
              nextX = projectSize.width / 2 - entry.width / 2
              break
            case 'top':
              nextY = -projectSize.height / 2 + entry.height / 2
              break
            case 'center-v':
              nextY = 0
              break
            case 'bottom':
              nextY = projectSize.height / 2 - entry.height / 2
              break
          }

          const props: Partial<TransformProperties> = {}
          if (nextX !== undefined && Math.abs(nextX - entry.x) > tolerance) props.x = nextX
          if (nextY !== undefined && Math.abs(nextY - entry.y) > tolerance) props.y = nextY
          if (Object.keys(props).length > 0) updates.set(entry.id, props)
        }
      }

      if (updates.size === 0) return

      // Split updates into keyframe operations and base transform updates
      const currentFrame = usePlaybackStore.getState().currentFrame
      const autoOps: AutoKeyframeOperation[] = []
      const baseUpdates = new Map<string, Partial<TransformProperties>>()

      for (const [itemId, props] of updates) {
        const item = selectedVisualItems.find((i) => i.id === itemId)
        if (!item) continue

        const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[itemId]
        const baseProps: Partial<TransformProperties> = {}

        for (const axis of ['x', 'y'] as const) {
          if (props[axis] === undefined) continue
          const op = getAutoKeyframeOperation(item, itemKeyframes, axis, props[axis], currentFrame)
          if (op) {
            autoOps.push(op)
          } else {
            baseProps[axis] = props[axis]
          }
        }

        if (Object.keys(baseProps).length > 0) {
          baseUpdates.set(itemId, baseProps)
        }
      }

      if (autoOps.length > 0) {
        applyAutoKeyframeOperations(autoOps)
      }
      if (baseUpdates.size > 0) {
        updateItemsTransformMap(baseUpdates, { operation: 'move' })
      }
    }
</script>

{#snippet renderButton({
    type,
    icon: Icon,
    labelKey,
    minItems,
  }: (typeof ALIGNMENT_ACTIONS)[number])}
  {#key type}
    <Button
      variant="ghost"
      size="icon"
      class="flex-shrink-0 text-muted-foreground hover:text-foreground"
      style={cssStyle(BUTTON_STYLE)}
      onclick={() => handleAlign(type)}
      disabled={itemCount < minItems}
      data-tooltip={t(labelKey)}
      aria-label={t(labelKey)}
    >
      <Icon class="w-3.5 h-3.5" />
    </Button>
  {/key}
{/snippet}

{#if !(itemCount < 1)}
  {ALIGNMENT_ACTIONS.slice(0, 3).map(renderButton)}
  <div class="w-px h-3.5 bg-border mx-0.5"></div>
  {ALIGNMENT_ACTIONS.slice(3, 6).map(renderButton)}
  <div class="w-px h-3.5 bg-border mx-0.5"></div>
  {ALIGNMENT_ACTIONS.slice(6).map(renderButton)}
  <div class="w-px h-3.5 bg-border mx-0.5"></div>
  <Button
    variant="ghost"
    size="icon"
    class={cn(
      'flex-shrink-0 text-muted-foreground hover:text-foreground',
      canvasSnapEnabled.current && 'text-foreground bg-accent',
    )}
    style={cssStyle(BUTTON_STYLE)}
    onclick={() => setSetting('canvasSnapEnabled', !canvasSnapEnabled.current)}
    data-tooltip={canvasSnapEnabled.current
      ? t('preview.align.disableCanvasSnap')
      : t('preview.align.enableCanvasSnap')}
    aria-label={t('preview.align.toggleCanvasSnap')}
    aria-pressed={canvasSnapEnabled.current}
  >
    <Magnet class="w-3.5 h-3.5" />
  </Button>
{/if}
