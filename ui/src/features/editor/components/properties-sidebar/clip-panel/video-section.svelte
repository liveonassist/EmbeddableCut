<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem, VideoItem, CompositionItem } from '@/types/timeline'
  import type { CropSettings } from '@/types/transform'
  import type { ItemKeyframes } from '@/types/keyframe'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import { getCropPropertyValue, resolveAnimatedCrop } from '@/features/editor/deps/keyframes'
  import {
    cropPixelsToRatio,
    cropSignedPixelsToRatio,
    getCropSoftnessReferenceDimension,
    normalizeCropSettings,
  } from '@/shared/utils/media-crop'

  const MIN_SPEED = 0.1
  const MAX_SPEED = 10.0
  const MIN_FRAME_RATE = 1
  const CROP_STEP = 1
  const CROP_TOLERANCE = 0.01

  function snapCropPixels(value: number): number {
    return Number.isFinite(value) ? Math.round(value) : 0
  }

  interface VideoSectionProps {
    items: TimelineItem[]
  }

  type CropEdge = 'left' | 'right' | 'top' | 'bottom'
  type CropProperty = 'cropLeft' | 'cropRight' | 'cropTop' | 'cropBottom' | 'cropSoftness'
  type CropDimensions = { width: number; height: number }
  type CropItem = VideoItem | CompositionItem
  type ResolvedCropState = {
    crop: CropSettings | undefined
    dimensions: CropDimensions
  }

  const CROP_EDGE_PROPERTY: Record<CropEdge, Exclude<CropProperty, 'cropSoftness'>> = {
    left: 'cropLeft',
    right: 'cropRight',
    top: 'cropTop',
    bottom: 'cropBottom',
  }

  function getCropDimensions(item: CropItem): CropDimensions {
    if (item.type === 'composition') {
      return {
        width: Math.max(1, item.compositionWidth),
        height: Math.max(1, item.compositionHeight),
      }
    }

    return {
      width: Math.max(1, item.sourceWidth ?? item.transform?.width ?? DEFAULT_PROJECT_WIDTH),
      height: Math.max(1, item.sourceHeight ?? item.transform?.height ?? DEFAULT_PROJECT_HEIGHT),
    }
  }

  function getSharedCropDimension(items: CropItem[], dimension: keyof CropDimensions): number {
    if (items.length === 0) return 1
    return Math.min(...items.map((item) => getCropDimensions(item)[dimension]))
  }

  function buildCropUpdate(
    crop: CropSettings | undefined,
    edge: CropEdge,
    pixels: number,
    dimensions: CropDimensions,
  ): CropSettings | undefined {
    const dimension = edge === 'left' || edge === 'right' ? dimensions.width : dimensions.height
    return normalizeCropSettings({
      ...crop,
      [edge]: cropPixelsToRatio(snapCropPixels(pixels), dimension),
    })
  }

  function buildCropSoftnessUpdate(
    crop: CropSettings | undefined,
    pixels: number,
    dimensions: CropDimensions,
  ): CropSettings | undefined {
    return normalizeCropSettings({
      ...crop,
      softness: cropSignedPixelsToRatio(
        snapCropPixels(pixels),
        Math.max(1, getCropSoftnessReferenceDimension(dimensions.width, dimensions.height)),
      ),
    })
  }

  function getResolvedCropState(
    item: CropItem,
    currentFrame: number,
    itemKeyframes: ItemKeyframes | null | undefined,
  ): ResolvedCropState {
    const dimensions = getCropDimensions(item)
    return {
      dimensions,
      crop: resolveAnimatedCrop(
        item.crop,
        itemKeyframes ?? undefined,
        currentFrame - item.from,
        dimensions,
      ),
    }
  }

  function formatCropValue(value: number): string {
    return value.toFixed(0)
  }

  function getResolvedCropPropertyValue(
    state: ResolvedCropState | undefined,
    property: CropProperty,
  ): number | undefined {
    if (!state) return undefined
    return getCropPropertyValue(state.crop, property, state.dimensions)
  }

  function getCropPropertyValuesByItemId(
    items: CropItem[],
    statesByItem: ReadonlyMap<string, ResolvedCropState>,
    property: CropProperty,
  ): Record<string, number> {
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        getResolvedCropPropertyValue(statesByItem.get(item.id), property) ?? 0,
      ]),
    )
  }
</script>

<script lang="ts">
  import Crop from '@lucide/svelte/icons/crop'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Video from '@lucide/svelte/icons/video'
  import { t } from '$lib/i18n.svelte'
  import { select, shallow } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import type { AudioItem } from '@/types/timeline'
  import {
    applyAutoKeyframeOperations,
    captureSnapshot,
    rateStretchItemWithoutHistory,
    resetSpeedWithRipple,
    updateItem,
    useItemsStore,
    useKeyframesStore,
    useTimelineCommandStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import {
    timelineToSourceFrames,
    sourceToTimelineFrames,
  } from '@/features/editor/deps/timeline-utils'
  import {
    getAutoKeyframeOperation,
    type AutoKeyframeOperation,
    KeyframeToggle,
  } from '@/features/editor/deps/keyframes'
  import { PropertySection, PropertyRow, SliderInput } from '../components'
  import { demixValue, getMixedValue } from '../utils'

  /**
   * Playback section - playback rate, frame rate, video fades, and edge crop.
   *
   * Speed changes affect clip duration (rate stretch behavior):
   * - Faster speed = shorter clip (same content plays faster)
   * - Slower speed = longer clip (same content plays slower)
   */
  let { items }: VideoSectionProps = $props()

  const currentFrame = useThrottledFrame()

  type PropertiesPreviews = Parameters<
    ReturnType<typeof useGizmoStore.getState>['setPropertiesPreviewNew']
  >[0]
  const setPropertiesPreviewNew = (previews: PropertiesPreviews) =>
    useGizmoStore.getState().setPropertiesPreviewNew(previews)

  const videoItems = $derived(items.filter((item): item is VideoItem => item.type === 'video'))

  const cropItems = $derived(
    items.filter((item): item is CropItem => item.type === 'video' || item.type === 'composition'),
  )
  const videoItemIds = $derived(videoItems.map((item) => item.id))
  const cropItemIds = $derived(cropItems.map((item) => item.id))

  const rateStretchableIds = $derived(
    items
      .filter(
        (item): item is VideoItem | AudioItem => item.type === 'video' || item.type === 'audio',
      )
      .map((item) => item.id),
  )

  const itemKeyframes = $derived(
    select(
      useKeyframesStore,
      (s) => cropItemIds.map((itemId) => s.keyframesByItemId[itemId] ?? null),
      shallow,
    ),
  )
  const keyframesByItemId = $derived.by(() => {
    const keyframes = itemKeyframes.current
    const map = new Map<string, (typeof keyframes)[number]>()
    for (const [index, itemId] of cropItemIds.entries()) {
      map.set(itemId, keyframes[index] ?? null)
    }
    return map
  })

  const resolvedCropStatesByItem = $derived.by(() => {
    const map = new Map<string, ResolvedCropState>()
    for (const item of cropItems) {
      map.set(
        item.id,
        getResolvedCropState(item, currentFrame.current, keyframesByItemId.get(item.id)),
      )
    }
    return map
  })

  const projectFps = select(useTimelineSettingsStore, (s) => s.fps)
  const speed = $derived(getMixedValue(videoItems, (item) => item.speed, 1))
  // An unset frame rate plays every frame, so it reads as the project's.
  const frameRate = $derived(
    getMixedValue(videoItems, (item) => item.frameRate, projectFps.current),
  )
  const fadeIn = $derived(getMixedValue(videoItems, (item) => item.fadeIn, 0))
  const fadeOut = $derived(getMixedValue(videoItems, (item) => item.fadeOut, 0))
  const cropValue = (property: CropProperty) =>
    getMixedValue(
      cropItems,
      (item) => getResolvedCropPropertyValue(resolvedCropStatesByItem.get(item.id), property),
      0,
    )
  const cropLeft = $derived(cropValue('cropLeft'))
  const cropRight = $derived(cropValue('cropRight'))
  const cropTop = $derived(cropValue('cropTop'))
  const cropBottom = $derived(cropValue('cropBottom'))
  const cropSoftness = $derived(cropValue('cropSoftness'))
  const cropValuesByProperty = $derived({
    cropLeft: getCropPropertyValuesByItemId(cropItems, resolvedCropStatesByItem, 'cropLeft'),
    cropRight: getCropPropertyValuesByItemId(cropItems, resolvedCropStatesByItem, 'cropRight'),
    cropTop: getCropPropertyValuesByItemId(cropItems, resolvedCropStatesByItem, 'cropTop'),
    cropBottom: getCropPropertyValuesByItemId(cropItems, resolvedCropStatesByItem, 'cropBottom'),
    cropSoftness: getCropPropertyValuesByItemId(cropItems, resolvedCropStatesByItem, 'cropSoftness'),
  })

  const sharedSourceWidth = $derived(getSharedCropDimension(cropItems, 'width'))
  const sharedSourceHeight = $derived(getSharedCropDimension(cropItems, 'height'))
  const maxCropSoftness = $derived(
    Math.max(
      1,
      ...cropItems.map((item) => {
        const dimensions = getCropDimensions(item)
        return Math.max(1, getCropSoftnessReferenceDimension(dimensions.width, dimensions.height))
      }),
    ),
  )
  let speedDragSnapshot: ReturnType<typeof captureSnapshot> | null = null

  const applySpeedChangeWithoutHistory = (newSpeed: number) => {
    const roundedSpeed = Math.round(newSpeed * 100) / 100
    const clampedSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, roundedSpeed))

    const { items: currentItems } = useItemsStore.getState()
    const { fps } = useTimelineSettingsStore.getState()
    currentItems
      .filter(
        (item: TimelineItem): item is VideoItem | AudioItem =>
          (item.type === 'video' || item.type === 'audio') && rateStretchableIds.includes(item.id),
      )
      .forEach((item: VideoItem | AudioItem) => {
        const currentSpeed = item.speed || 1
        const sourceFps = item.sourceFps ?? fps
        const effectiveSourceFrames =
          item.sourceEnd !== undefined && item.sourceStart !== undefined
            ? item.sourceEnd - item.sourceStart
            : timelineToSourceFrames(item.durationInFrames, currentSpeed, fps, sourceFps)
        const newDuration = Math.max(
          1,
          sourceToTimelineFrames(effectiveSourceFrames, clampedSpeed, sourceFps, fps),
        )
        rateStretchItemWithoutHistory(item.id, item.from, newDuration, clampedSpeed)
      })

    return clampedSpeed
  }

  const commitSpeedChange = (newSpeed: number) => {
    const beforeSnapshot = speedDragSnapshot ?? captureSnapshot()
    const clampedSpeed = applySpeedChangeWithoutHistory(newSpeed)
    useTimelineCommandStore.getState().addUndoEntry(
      {
        type: 'RATE_STRETCH_ITEM',
        payload: { ids: rateStretchableIds, newSpeed: clampedSpeed },
      },
      beforeSnapshot,
    )
    speedDragSnapshot = null
  }

  const handleSpeedLiveChange = (newSpeed: number) => {
    if (!speedDragSnapshot) {
      speedDragSnapshot = captureSnapshot()
    }
    applySpeedChangeWithoutHistory(newSpeed)
  }

  const commitPreviewClear = () => {
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  /** At or above the project's rate every frame plays, so the field clears. */
  const toFrameRate = (value: number): number | undefined =>
    value >= projectFps.current ? undefined : Math.max(MIN_FRAME_RATE, value)

  const handleFrameRateLiveChange = (value: number) => {
    const previews: Record<string, { frameRate: number | undefined }> = {}
    videoItemIds.forEach((id) => {
      previews[id] = { frameRate: toFrameRate(value) }
    })
    setPropertiesPreviewNew(previews)
  }

  const handleFrameRateChange = (value: number) => {
    const nextFrameRate = toFrameRate(value)
    videoItemIds.forEach((id) => updateItem(id, { frameRate: nextFrameRate }))
    commitPreviewClear()
  }

  const handleResetFrameRate = () => {
    const heldIds = useItemsStore
      .getState()
      .items.filter(
        (item: TimelineItem) =>
          item.type === 'video' && videoItemIds.includes(item.id) && item.frameRate !== undefined,
      )
      .map((item: TimelineItem) => item.id)
    heldIds.forEach((id) => updateItem(id, { frameRate: undefined }))
  }

  const handleFadeInLiveChange = (value: number) => {
    const previews: Record<string, { fadeIn: number }> = {}
    videoItemIds.forEach((id) => {
      previews[id] = { fadeIn: value }
    })
    setPropertiesPreviewNew(previews)
  }

  const handleFadeInChange = (value: number) => {
    videoItemIds.forEach((id) => updateItem(id, { fadeIn: value }))
    commitPreviewClear()
  }

  const handleFadeOutLiveChange = (value: number) => {
    const previews: Record<string, { fadeOut: number }> = {}
    videoItemIds.forEach((id) => {
      previews[id] = { fadeOut: value }
    })
    setPropertiesPreviewNew(previews)
  }

  const handleFadeOutChange = (value: number) => {
    videoItemIds.forEach((id) => updateItem(id, { fadeOut: value }))
    commitPreviewClear()
  }

  const previewCropEdge = (edge: CropEdge, pixels: number) => {
    const previews: Record<string, { crop: CropItem['crop'] }> = {}
    cropItems.forEach((item) => {
      const cropState = resolvedCropStatesByItem.get(item.id)
      if (!cropState) return
      previews[item.id] = {
        crop: buildCropUpdate(cropState.crop, edge, pixels, cropState.dimensions),
      }
    })
    setPropertiesPreviewNew(previews)
  }

  const commitCropEdge = (edge: CropEdge, pixels: number) => {
    const property = CROP_EDGE_PROPERTY[edge]
    const snappedPixels = snapCropPixels(pixels)
    const autoOps: AutoKeyframeOperation[] = []

    cropItems.forEach((item) => {
      const operation = getAutoKeyframeOperation(
        item,
        keyframesByItemId.get(item.id) ?? undefined,
        property,
        snappedPixels,
        currentFrame.current,
      )
      if (operation) {
        autoOps.push(operation)
        return
      }

      updateItem(item.id, {
        crop: buildCropUpdate(item.crop, edge, snappedPixels, getCropDimensions(item)),
      })
    })

    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }

    commitPreviewClear()
  }

  const previewCropSoftness = (pixels: number) => {
    const previews: Record<string, { crop: CropItem['crop'] }> = {}
    cropItems.forEach((item) => {
      const cropState = resolvedCropStatesByItem.get(item.id)
      if (!cropState) return
      previews[item.id] = {
        crop: buildCropSoftnessUpdate(cropState.crop, pixels, cropState.dimensions),
      }
    })
    setPropertiesPreviewNew(previews)
  }

  const commitCropSoftness = (pixels: number) => {
    const snappedPixels = snapCropPixels(pixels)
    const autoOps: AutoKeyframeOperation[] = []

    cropItems.forEach((item) => {
      const operation = getAutoKeyframeOperation(
        item,
        keyframesByItemId.get(item.id) ?? undefined,
        'cropSoftness',
        snappedPixels,
        currentFrame.current,
      )
      if (operation) {
        autoOps.push(operation)
        return
      }

      updateItem(item.id, {
        crop: buildCropSoftnessUpdate(item.crop, snappedPixels, getCropDimensions(item)),
      })
    })

    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }

    commitPreviewClear()
  }

  const resetCropEdge = (edge: CropEdge) => {
    const property = CROP_EDGE_PROPERTY[edge]
    const needsUpdate = cropItems.some((item) => {
      const cropState = resolvedCropStatesByItem.get(item.id)
      return Math.abs(getResolvedCropPropertyValue(cropState, property) ?? 0) > CROP_TOLERANCE
    })
    if (!needsUpdate) return
    commitCropEdge(edge, 0)
  }

  const resetCropSoftness = () => {
    const needsUpdate = cropItems.some((item) => {
      const cropState = resolvedCropStatesByItem.get(item.id)
      return Math.abs(getResolvedCropPropertyValue(cropState, 'cropSoftness') ?? 0) > CROP_TOLERANCE
    })
    if (!needsUpdate) return
    commitCropSoftness(0)
  }

  const handleResetSpeed = () => {
    resetSpeedWithRipple(rateStretchableIds)
  }

  const handleResetFadeIn = () => {
    const tolerance = 0.01
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item: TimelineItem) =>
        videoItemIds.includes(item.id) && ((item as VideoItem).fadeIn ?? 0) > tolerance,
    )
    if (needsUpdate) {
      videoItemIds.forEach((id) => updateItem(id, { fadeIn: 0 }))
    }
  }

  const handleResetFadeOut = () => {
    const tolerance = 0.01
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item: TimelineItem) =>
        videoItemIds.includes(item.id) && ((item as VideoItem).fadeOut ?? 0) > tolerance,
    )
    if (needsUpdate) {
      videoItemIds.forEach((id) => updateItem(id, { fadeOut: 0 }))
    }
  }
</script>

{#snippet cropEdgeRow(
  edge: CropEdge,
  value: number | 'mixed',
  max: number,
  label: string,
  resetTitle: string,
)}
  {@const property = CROP_EDGE_PROPERTY[edge]}
  <PropertyRow {label}>
    <div class="flex items-center gap-1 w-full">
      <SliderInput
        {value}
        onChange={(next) => commitCropEdge(edge, next)}
        onLiveChange={(next) => previewCropEdge(edge, next)}
        min={0}
        {max}
        step={CROP_STEP}
        unit="px"
        formatValue={formatCropValue}
        formatInputValue={formatCropValue}
        class="flex-1 min-w-0"
      />
      <KeyframeToggle
        itemIds={cropItemIds}
        {property}
        currentValue={demixValue(value, 0)}
        currentValuesByItemId={cropValuesByProperty[property]}
      />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={() => resetCropEdge(edge)}
        title={resetTitle}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>
{/snippet}

{#if cropItems.length > 0}
  {#if videoItems.length > 0}
    <PropertySection title={t('editor.videoSection.playback')} icon={Video} defaultOpen={true}>
      <PropertyRow label={t('editor.videoSection.speed')}>
        <div class="flex items-center gap-1 w-full">
          <SliderInput
            value={speed}
            onChange={commitSpeedChange}
            onLiveChange={handleSpeedLiveChange}
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.01}
            unit="x"
            class="flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetSpeed}
            title={t('editor.videoSection.resetSpeed')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      <PropertyRow label={t('editor.videoSection.frameRate')}>
        <div class="flex items-center gap-1 w-full">
          <SliderInput
            value={frameRate}
            onChange={handleFrameRateChange}
            onLiveChange={handleFrameRateLiveChange}
            min={MIN_FRAME_RATE}
            max={projectFps.current}
            step={1}
            unit="fps"
            class="flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetFrameRate}
            title={t('editor.videoSection.resetFrameRate')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      <PropertyRow label={t('editor.videoSection.fadeIn')}>
        <div class="flex items-center gap-1 w-full">
          <SliderInput
            value={fadeIn}
            onChange={handleFadeInChange}
            onLiveChange={handleFadeInLiveChange}
            min={0}
            max={5}
            step={0.1}
            unit="s"
            class="flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetFadeIn}
            title={t('editor.videoSection.resetToZero')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      <PropertyRow label={t('editor.videoSection.fadeOut')}>
        <div class="flex items-center gap-1 w-full">
          <SliderInput
            value={fadeOut}
            onChange={handleFadeOutChange}
            onLiveChange={handleFadeOutLiveChange}
            min={0}
            max={5}
            step={0.1}
            unit="s"
            class="flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetFadeOut}
            title={t('editor.videoSection.resetToZero')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>
    </PropertySection>
  {/if}

  <PropertySection title={t('editor.videoSection.cropping')} icon={Crop} defaultOpen={true}>
    {@render cropEdgeRow(
      'left',
      cropLeft,
      sharedSourceWidth,
      t('editor.videoSection.cropLeft'),
      t('editor.videoSection.resetCropLeft'),
    )}
    {@render cropEdgeRow(
      'right',
      cropRight,
      sharedSourceWidth,
      t('editor.videoSection.cropRight'),
      t('editor.videoSection.resetCropRight'),
    )}
    {@render cropEdgeRow(
      'top',
      cropTop,
      sharedSourceHeight,
      t('editor.videoSection.cropTop'),
      t('editor.videoSection.resetCropTop'),
    )}
    {@render cropEdgeRow(
      'bottom',
      cropBottom,
      sharedSourceHeight,
      t('editor.videoSection.cropBottom'),
      t('editor.videoSection.resetCropBottom'),
    )}

    <PropertyRow label={t('editor.videoSection.softness')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={cropSoftness}
          onChange={commitCropSoftness}
          onLiveChange={previewCropSoftness}
          min={-maxCropSoftness}
          max={maxCropSoftness}
          step={CROP_STEP}
          unit="px"
          formatValue={formatCropValue}
          formatInputValue={formatCropValue}
          class="flex-1 min-w-0"
        />
        <KeyframeToggle
          itemIds={cropItemIds}
          property="cropSoftness"
          currentValue={demixValue(cropSoftness, 0)}
          currentValuesByItemId={cropValuesByProperty.cropSoftness}
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={resetCropSoftness}
          title={t('editor.videoSection.resetSoftness')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>
  </PropertySection>
{/if}
