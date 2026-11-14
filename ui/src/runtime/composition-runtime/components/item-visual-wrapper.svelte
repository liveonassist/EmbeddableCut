<!-- SPDX-License-Identifier: MIT -->
<!--
  Combined visual wrapper for timeline items.

  Replaces TransformWrapper + EffectWrapper + MaskWrapper with a fixed DOM structure:
  - Outer div: Transform positioning + mask (clip-path or SVG mask reference)
  - Inner div: Effects (CSS filter) + overlay container

  Key design decisions:
  - FIXED DOM STRUCTURE: Always renders the same divs regardless of effects/masks
  - Effect overlays use CSS visibility instead of conditional rendering
  - Single hook (useItemVisualState) provides all computed state
  - No redundant store subscriptions (consolidated in hook)
-->
<script lang="ts" module>
  import {
    hasCornerPin,
    drawCornerPinImage,
    resolveCornerPinForSize,
  } from '@/runtime/composition-runtime/utils/corner-pin'
  import { getShapePath } from '@/runtime/composition-runtime/utils/shape-path'
  import type { MaskInfo } from './item-types'

  function createRasterMaskCanvas(
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === 'undefined') {
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return null
    }

    return { canvas, ctx }
  }

  function renderRasterizedMaskLayer(
    mask: MaskInfo,
    canvasWidth: number,
    canvasHeight: number,
  ): HTMLCanvasElement | null {
    const rasterCanvas = createRasterMaskCanvas(canvasWidth, canvasHeight)
    if (!rasterCanvas) {
      return null
    }

    const { canvas, ctx } = rasterCanvas
    const { shape, transform } = mask
    const resolvedTransform = {
      x: transform.x ?? 0,
      y: transform.y ?? 0,
      width: Math.max(1, transform.width ?? canvasWidth),
      height: Math.max(1, transform.height ?? canvasHeight),
      rotation: transform.rotation ?? 0,
      opacity: transform.opacity ?? 1,
    }
    const localWidth = Math.max(1, Math.round(resolvedTransform.width))
    const localHeight = Math.max(1, Math.round(resolvedTransform.height))
    const left = canvasWidth / 2 + resolvedTransform.x - resolvedTransform.width / 2
    const top = canvasHeight / 2 + resolvedTransform.y - resolvedTransform.height / 2
    const centerX = left + resolvedTransform.width / 2
    const centerY = top + resolvedTransform.height / 2
    const resolvedPin = resolveCornerPinForSize(
      shape.cornerPin,
      resolvedTransform.width,
      resolvedTransform.height,
    )

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, resolvedTransform.opacity))

    if (resolvedTransform.rotation !== 0) {
      ctx.translate(centerX, centerY)
      ctx.rotate((resolvedTransform.rotation * Math.PI) / 180)
      ctx.translate(-centerX, -centerY)
    }

    if (resolvedPin && hasCornerPin(resolvedPin)) {
      const localCanvas = createRasterMaskCanvas(localWidth, localHeight)
      if (!localCanvas) {
        ctx.restore()
        return null
      }

      const localPath = getShapePath(
        shape,
        {
          x: 0,
          y: 0,
          width: localWidth,
          height: localHeight,
          rotation: 0,
          opacity: 1,
        },
        {
          canvasWidth: localWidth,
          canvasHeight: localHeight,
        },
      )

      localCanvas.ctx.fillStyle = '#ffffff'
      localCanvas.ctx.fill(new Path2D(localPath))
      if ((shape.strokeWidth ?? 0) > 0) {
        localCanvas.ctx.strokeStyle = '#ffffff'
        localCanvas.ctx.lineWidth = shape.strokeWidth ?? 0
        localCanvas.ctx.stroke(new Path2D(localPath))
      }

      drawCornerPinImage(
        ctx as unknown as OffscreenCanvasRenderingContext2D,
        localCanvas.canvas,
        localWidth,
        localHeight,
        left,
        top,
        resolvedPin,
      )
    } else {
      const svgPath = getShapePath(
        shape,
        {
          x: resolvedTransform.x,
          y: resolvedTransform.y,
          width: resolvedTransform.width,
          height: resolvedTransform.height,
          rotation: 0,
          opacity: resolvedTransform.opacity,
        },
        {
          canvasWidth,
          canvasHeight,
        },
      )

      const path2d = new Path2D(svgPath)
      ctx.fillStyle = '#ffffff'
      ctx.fill(path2d)
      if ((shape.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = shape.strokeWidth ?? 0
        ctx.stroke(path2d)
      }
    }

    ctx.restore()
    return canvas
  }

  function featherRasterMask(
    maskCanvas: HTMLCanvasElement,
    canvasWidth: number,
    canvasHeight: number,
    feather: number,
  ): HTMLCanvasElement {
    if (feather <= 0) return maskCanvas
    const blurredMask = createRasterMaskCanvas(canvasWidth, canvasHeight)
    if (!blurredMask) return maskCanvas
    blurredMask.ctx.filter = `blur(${feather}px)`
    blurredMask.ctx.drawImage(maskCanvas, 0, 0)
    return blurredMask.canvas
  }

  function applyRasterMaskOpacity(
    maskCanvas: HTMLCanvasElement,
    canvasWidth: number,
    canvasHeight: number,
    opacity: number,
  ): HTMLCanvasElement {
    if (opacity >= 1) return maskCanvas
    const opacityMask = createRasterMaskCanvas(canvasWidth, canvasHeight)
    if (!opacityMask) return maskCanvas
    opacityMask.ctx.globalAlpha = Math.max(0, opacity)
    opacityMask.ctx.drawImage(maskCanvas, 0, 0)
    return opacityMask.canvas
  }

  function applyRasterizedMaskLayerSettings(
    maskCanvas: HTMLCanvasElement,
    canvasWidth: number,
    canvasHeight: number,
    settings: {
      invert: boolean
      feather: number
      opacity: number
    },
  ): HTMLCanvasElement {
    if (!settings.invert && settings.feather <= 0 && settings.opacity >= 1) {
      return maskCanvas
    }

    const processedMask = createRasterMaskCanvas(canvasWidth, canvasHeight)
    if (!processedMask) {
      return maskCanvas
    }

    if (settings.invert) {
      processedMask.ctx.fillStyle = '#ffffff'
      processedMask.ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      processedMask.ctx.globalCompositeOperation = 'destination-out'
      processedMask.ctx.drawImage(maskCanvas, 0, 0)
      processedMask.ctx.globalCompositeOperation = 'source-over'
    } else {
      processedMask.ctx.drawImage(maskCanvas, 0, 0)
    }

    return applyRasterMaskOpacity(
      featherRasterMask(processedMask.canvas, canvasWidth, canvasHeight, settings.feather),
      canvasWidth,
      canvasHeight,
      settings.opacity,
    )
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { select } from '$lib/store.svelte'
  import type { TimelineItem } from '@/types/timeline'
  import { BLEND_MODE_CSS } from '@/types/blend-mode-css'
  import {
    computeCornerPinMatrix3d,
    resolveCornerPinTargetRect,
  } from '@/runtime/composition-runtime/utils/corner-pin'
  import {
    useCornerPinStore,
    useGizmoStore,
    usePlaybackStore,
  } from '@/runtime/composition-runtime/deps/stores'
  import { renderSvgMaskPathsToDataUrl } from '@/runtime/composition-runtime/utils/clip-mask-raster'
  import { getRasterizedMaskLayerSettingsList } from '@/runtime/composition-runtime/utils/mask-preview'
  import type { CropSettings } from '@/types/transform'
  import type { MediaCropFitMode } from '@/shared/utils/media-crop'
  import { resolveGizmoDomTranslation } from '@/runtime/composition-runtime/utils/gizmo-dom-translation'
  import { shouldRasterizeSvgMaskForFrame } from '@/runtime/composition-runtime/utils/mask-rendering-policy'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { useItemVisualState } from './hooks/use-item-visual-state.svelte'
  import { useRuntimeItemKeyframes } from './hooks/use-runtime-item-keyframes.svelte'
  import ContainedMediaLayout from './contained-media-layout.svelte'
  import { setItemVisualTransform } from '../contexts/item-visual-transform-context'
  import { useCompositionSpace } from '../contexts/composition-space-context'
  import {
    buildItemTransformDependencyPlan,
    useLiveItemTransform,
    useLiveTimelineItemResolver,
  } from '../contexts/live-item-transform-context.svelte'
  import { useKeyframesContext } from '../contexts/keyframes-context-core'
  import { useStoreSelector } from '../../use-sync-external-store.svelte'
  import { patchStyle, styleToString, type CSSProperties } from '../../style-object'

  let {
    item: itemProp,
    masks: masksProp,
    mediaContent,
    children,
  }: {
    item: TimelineItem
    masks?: MaskInfo[]
    mediaContent?: {
      fitMode: MediaCropFitMode
      sourceWidth?: number
      sourceHeight?: number
      crop?: CropSettings
    }
    children: Snippet
  } = $props()

  const masks = $derived(masksProp ?? [])
  const liveItem = useLiveItemTransform(() => itemProp)
  const item = $derived(liveItem.current)
  const itemId = $derived(item.id)
  const videoConfig = useVideoConfig()
  const canvasWidth = $derived(videoConfig.width)
  const canvasHeight = $derived(videoConfig.height)
  const compositionSpace = useCompositionSpace()
  const scaleX = $derived(compositionSpace.current?.scaleX ?? 1)
  const scaleY = $derived(compositionSpace.current?.scaleY ?? 1)
  const getLiveItem = useLiveTimelineItemResolver()
  const keyframesContext = useKeyframesContext()
  const itemKeyframes = useRuntimeItemKeyframes(() => itemId)
  const transformDependencyPlan = $derived.by(() => {
    const ownKeyframes = itemKeyframes.current
    const getItem = keyframesContext?.getItem
    const getItemKeyframes = keyframesContext?.getItemKeyframes
    return buildItemTransformDependencyPlan(
      item,
      (dependencyId: string) => getLiveItem(dependencyId) ?? getItem?.(dependencyId),
      (dependencyId: string) =>
        dependencyId === itemId ? ownKeyframes : getItemKeyframes?.(dependencyId),
    )
  })

  // Get all visual state from consolidated hook
  const visualState = useItemVisualState(
    () => item,
    () => masks,
    () => ({ transformDependencyPlan }),
  )
  const contentWidth = $derived(visualState.transform.width)
  const contentHeight = $derived(visualState.transform.height)
  const contentVisualTransform = $derived({ width: contentWidth, height: contentHeight })
  setItemVisualTransform({
    get current() {
      return contentVisualTransform
    },
  })
  const followsActiveTranslate = (activeItemId: string) =>
    transformDependencyPlan.linearTranslateSourceItemIds.has(activeItemId)
  let transformNodeElement = $state<HTMLDivElement | null>(null)
  let renderedTransform = visualState.transform
  let presentationInteraction: {
    interactionId: number
    startTransform: typeof visualState.transform
  } | null = null
  let acknowledgedHandoff: number | null = null

  function syncGizmoPresentation(gizmoState: ReturnType<typeof useGizmoStore.getState>) {
    const transformNode = transformNodeElement
    if (!transformNode) return

    const activeGizmo = gizmoState.activeGizmo
    const handoff = gizmoState.presentationHandoff
    const livePresentation =
      activeGizmo?.mode === 'translate' && gizmoState.previewTransform
        ? {
            interactionId: activeGizmo.interactionId,
            itemId: activeGizmo.itemId,
            startTransform: activeGizmo.startTransform,
            finalTransform: gizmoState.previewTransform,
            settling: false,
          }
        : null
    const presentation =
      livePresentation ??
      (handoff?.mode === 'translate'
        ? {
            interactionId: handoff.interactionId,
            itemId: handoff.itemId,
            startTransform: handoff.startTransform,
            finalTransform: handoff.finalTransform,
            settling: true,
          }
        : null)
    if (
      !presentation ||
      (presentation.settling &&
        acknowledgedHandoff === presentation.interactionId)
    ) {
      presentationInteraction = null
      transformNode.style.removeProperty('translate')
      return
    }
    const interactionId = presentation.interactionId

    if (presentationInteraction?.interactionId !== interactionId) {
      presentationInteraction = {
        interactionId,
        startTransform: { ...renderedTransform },
      }
      acknowledgedHandoff = null
    }

    const translation = resolveGizmoDomTranslation({
      itemId,
      followsActiveItem: followsActiveTranslate(presentation.itemId),
      activeItemId: presentation.itemId,
      activeStartTransform: presentation.startTransform,
      previewTransform: presentation.finalTransform,
      renderedTransform: renderedTransform,
      interactionStartTransform: presentationInteraction.startTransform,
      scaleX,
      scaleY,
    })
    if (!translation) {
      presentationInteraction = null
      transformNode.style.removeProperty('translate')
      return
    }

    if (
      presentation.settling &&
      Math.abs(translation.x) < 0.01 &&
      Math.abs(translation.y) < 0.01
    ) {
      acknowledgedHandoff = interactionId
      presentationInteraction = null
      transformNode.style.removeProperty('translate')
      requestAnimationFrame(() =>
        useGizmoStore.getState().completePresentationHandoff(interactionId),
      )
      return
    }

    transformNode.style.setProperty('translate', `${translation.x}px ${translation.y}px`)
  }

  const isPlaying = select(usePlaybackStore, (playback) => playback.isPlaying)
  const shouldRasterizeSvgMask = $derived(
    shouldRasterizeSvgMaskForFrame({
      maskType: visualState.maskType,
      hasPaths: !!visualState.svgMaskPaths,
      feather: visualState.maskFeather,
      isPlaying: isPlaying.current,
    }),
  )
  const hasCornerPinnedMask = $derived(masks.some((mask) => hasCornerPin(mask.shape.cornerPin)))

  // Compute mask style based on mask type
  const rasterSvgMaskDataUrl = $derived.by(() => {
    if (!shouldRasterizeSvgMask || !visualState.svgMaskPaths) {
      return null
    }

    return renderSvgMaskPathsToDataUrl(
      visualState.svgMaskPaths,
      canvasWidth,
      canvasHeight,
      visualState.maskFeather,
      visualState.maskInvert,
      visualState.maskOpacity,
    )
  })
  const rasterCornerPinnedMaskDataUrl = $derived.by(() => {
    if (!hasCornerPinnedMask || masks.length === 0 || typeof document === 'undefined') {
      return null
    }

    const width = Math.max(1, Math.round(canvasWidth))
    const height = Math.max(1, Math.round(canvasHeight))
    const combinedMask = createRasterMaskCanvas(width, height)
    if (!combinedMask) {
      return null
    }

    const maskLayerSettings = getRasterizedMaskLayerSettingsList(masks.map(({ shape }) => shape))
    combinedMask.ctx.clearRect(0, 0, width, height)
    combinedMask.ctx.fillStyle = '#ffffff'
    combinedMask.ctx.fillRect(0, 0, width, height)

    let appliedMaskCount = 0
    for (const [index, mask] of masks.entries()) {
      const maskLayer = renderRasterizedMaskLayer(mask, width, height)
      if (!maskLayer) {
        continue
      }

      const processedLayer = applyRasterizedMaskLayerSettings(
        maskLayer,
        width,
        height,
        maskLayerSettings[index] ?? { invert: false, feather: 0, opacity: 1 },
      )

      combinedMask.ctx.globalCompositeOperation = 'destination-in'
      combinedMask.ctx.drawImage(processedLayer, 0, 0)
      combinedMask.ctx.globalCompositeOperation = 'source-over'
      appliedMaskCount += 1
    }

    if (appliedMaskCount === 0) {
      return null
    }

    return combinedMask.canvas.toDataURL('image/png')
  })

  const maskStyle = $derived.by((): CSSProperties => {
    if (rasterCornerPinnedMaskDataUrl) {
      return {
        maskImage: `url("${rasterCornerPinnedMaskDataUrl}")`,
        WebkitMaskImage: `url("${rasterCornerPinnedMaskDataUrl}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        maskPosition: '0 0',
        WebkitMaskPosition: '0 0',
      }
    }
    if (visualState.maskType === 'clip' && visualState.maskClipPath) {
      return { clipPath: visualState.maskClipPath }
    }
    if (visualState.maskType === 'svg-mask' && rasterSvgMaskDataUrl) {
      return {
        maskImage: `url("${rasterSvgMaskDataUrl}")`,
        WebkitMaskImage: `url("${rasterSvgMaskDataUrl}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        maskPosition: '0 0',
        WebkitMaskPosition: '0 0',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        contain: 'paint',
      }
    }
    if (visualState.maskType === 'svg-mask' && visualState.svgMaskId) {
      return {
        mask: `url(#${visualState.svgMaskId})`,
        WebkitMask: `url(#${visualState.svgMaskId})`,
      }
    }
    return {}
  })

  // Corner pin CSS matrix3d — use preview during drag for smooth interaction
  const cornerPinPreview = useStoreSelector(useCornerPinStore, (s) =>
    s.editingItemId === itemId ? s.previewCornerPin : null,
  )
  const effectiveCornerPin = $derived(cornerPinPreview.current ?? item.cornerPin)
  const hasMediaContent = $derived(mediaContent !== undefined)
  const mediaFitMode = $derived(mediaContent?.fitMode)
  const mediaSourceWidth = $derived(mediaContent?.sourceWidth)
  const mediaSourceHeight = $derived(mediaContent?.sourceHeight)
  const effectiveCrop = $derived(
    visualState.propertiesPreview?.crop ?? visualState.animatedCrop ?? mediaContent?.crop,
  )
  const cornerPinTargetRect = $derived.by(() => {
    if (visualState.maskType !== null) {
      return resolveCornerPinTargetRect(visualState.transform.width, visualState.transform.height)
    }

    if (hasMediaContent && mediaFitMode) {
      return resolveCornerPinTargetRect(visualState.transform.width, visualState.transform.height, {
        sourceWidth: mediaSourceWidth ?? visualState.transform.width,
        sourceHeight: mediaSourceHeight ?? visualState.transform.height,
        crop: effectiveCrop,
        fitMode: mediaFitMode,
      })
    }

    return resolveCornerPinTargetRect(visualState.transform.width, visualState.transform.height)
  })
  const containedMediaStyle = $derived.by((): CSSProperties => {
    const width = contentWidth
    const height = contentHeight
    const toPercent = (value: number, total: number) => {
      if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return '0%'
      }
      return `${(value / total) * 100}%`
    }

    return {
      position: 'absolute',
      left: toPercent(cornerPinTargetRect.x, width),
      top: toPercent(cornerPinTargetRect.y, height),
      width: toPercent(cornerPinTargetRect.width, width),
      height: toPercent(cornerPinTargetRect.height, height),
    }
  })
  const cornerPinStyle = $derived.by((): CSSProperties | null => {
    const w = cornerPinTargetRect.width
    const h = cornerPinTargetRect.height
    const resolvedCornerPin = resolveCornerPinForSize(effectiveCornerPin, w, h)
    if (!resolvedCornerPin || !hasCornerPin(resolvedCornerPin)) return null
    const activeCornerPin = resolvedCornerPin
    return {
      transformOrigin: '0 0',
      transform: computeCornerPinMatrix3d(w, h, activeCornerPin),
    }
  })

  // SVG mask defs for SVG-based masks
  const showSvgMaskDefs = $derived(
    !rasterSvgMaskDataUrl &&
      visualState.maskType === 'svg-mask' &&
      !!visualState.svgMaskId &&
      !!visualState.svgMaskPaths,
  )
  const filterId = $derived(`blur-${visualState.svgMaskId}`)

  const blendModeCss = $derived(
    item.type === 'shape' && item.isMask
      ? undefined
      : item.blendMode && item.blendMode !== 'normal'
        ? BLEND_MODE_CSS[item.blendMode]
        : undefined,
  )

  const maskContainerStyle = $derived(
    styleToString({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      ...maskStyle,
      mixBlendMode: blendModeCss,
    }),
  )

  const cornerPinFrameStyle = $derived.by((): CSSProperties => {
    if (hasMediaContent && cornerPinStyle) {
      return containedMediaStyle
    }

    return {
      width: '100%',
      height: '100%',
    }
  })

  const pinnedCornerPinStyle = $derived(
    cornerPinStyle
      ? styleToString({
          ...cornerPinFrameStyle,
          ...cornerPinStyle,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          overflow: visualState.transform.cornerRadius > 0 ? 'hidden' : undefined,
        })
      : '',
  )
  const filterStyle = $derived(
    styleToString({
      width: '100%',
      height: '100%',
      position: 'relative',
      filter: visualState.cssFilter || undefined,
    }),
  )

  // The transform node's style is patched property by property, as React
  // applies a style object, so the imperative drag `translate` survives
  // re-renders that change other properties.
  const transformNodeStyle = $derived<CSSProperties>({
    ...visualState.transformStyle,
    overflow: visualState.transform.cornerRadius > 0 && !cornerPinStyle ? 'hidden' : undefined,
    ...(visualState.maskType === null ? { mixBlendMode: blendModeCss } : {}),
  })
  let patchedNode: HTMLDivElement | null = null
  let patchedStyle: CSSProperties | null = null
  $effect.pre(() => {
    const node = transformNodeElement
    const next = transformNodeStyle
    if (!node) return
    if (node !== patchedNode) {
      patchedNode = node
      patchedStyle = null
    }
    patchedStyle = patchStyle(node, patchedStyle, next)
  })

  $effect.pre(() => {
    void transformNodeElement
    void [itemId, scaleX, scaleY, transformDependencyPlan]
    renderedTransform = visualState.transform
    syncGizmoPresentation(useGizmoStore.getState())
  })

  $effect(() => {
    void [itemId, scaleX, scaleY, transformDependencyPlan]
    return useGizmoStore.subscribe(syncGizmoPresentation)
  })
</script>

{#snippet mediaBody(width: number, height: number, containerWidth: number, containerHeight: number)}
  {#if mediaContent}
    <ContainedMediaLayout
      sourceWidth={width}
      sourceHeight={height}
      {containerWidth}
      {containerHeight}
      crop={effectiveCrop}
      fitMode={mediaContent.fitMode}
    >
      {@render children()}
    </ContainedMediaLayout>
  {:else}
    {@render children()}
  {/if}
{/snippet}

{#snippet innerContent()}
  {#if cornerPinStyle}
    <div style="width: 100%; height: 100%; position: relative;">
      <div style={pinnedCornerPinStyle}>
        <div style={filterStyle}>
          {@render mediaBody(
            cornerPinTargetRect.width,
            cornerPinTargetRect.height,
            cornerPinTargetRect.width,
            cornerPinTargetRect.height,
          )}
        </div>
      </div>
    </div>
  {:else}
    <div style="width: 100%; height: 100%;">
      <div style={filterStyle}>
        {@render mediaBody(
          mediaContent?.sourceWidth ?? contentWidth,
          mediaContent?.sourceHeight ?? contentHeight,
          contentWidth,
          contentHeight,
        )}
      </div>
    </div>
  {/if}
{/snippet}

{#if visualState.maskType === null}
  <!-- When there's no mask, skip the full-canvas mask container div entirely -->
  <div bind:this={transformNodeElement}>
    {@render innerContent()}
  </div>
{:else}
  <!-- SVG mask definitions (hidden, referenced by CSS) -->
  {#if showSvgMaskDefs && visualState.svgMaskId && visualState.svgMaskPaths}
    <svg
      style="position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none;"
      aria-hidden="true"
    >
      <defs>
        {#if visualState.maskFeather > 0}
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={visualState.maskFeather} />
          </filter>
        {/if}
        <mask
          id={visualState.svgMaskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={canvasWidth}
          height={canvasHeight}
        >
          <!-- Background: black=hidden, white=visible -->
          <rect
            x="0"
            y="0"
            width={canvasWidth}
            height={canvasHeight}
            fill={visualState.maskInvert ? 'white' : 'black'}
            fill-opacity={visualState.maskInvert ? visualState.maskOpacity : 1}
          />
          <!-- Mask shapes with optional stroke -->
          {#each visualState.svgMaskPaths as { path: pathD, strokeWidth }, i (i)}
            <path
              d={pathD}
              fill={visualState.maskInvert ? 'black' : 'white'}
              fill-opacity={visualState.maskInvert ? 1 : visualState.maskOpacity}
              stroke={strokeWidth > 0 ? (visualState.maskInvert ? 'black' : 'white') : undefined}
              stroke-width={strokeWidth > 0 ? strokeWidth : undefined}
              filter={visualState.maskFeather > 0 ? `url(#${filterId})` : undefined}
            />
          {/each}
        </mask>
      </defs>
    </svg>
  {/if}

  <!-- Masks are authored in composition space, so they must be applied on a
       full-canvas wrapper instead of the item-sized transform node. -->
  <div style={maskContainerStyle}>
    <div bind:this={transformNodeElement}>
      {@render innerContent()}
    </div>
  </div>
{/if}
