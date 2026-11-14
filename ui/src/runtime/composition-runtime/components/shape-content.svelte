<!-- SPDX-License-Identifier: MIT -->
<!--
  Shape content with live property preview support.
  Renders the shared shapes (Rect, Circle, Triangle, Ellipse, Star, Polygon).
  Reads preview values from gizmo store for real-time updates during editing.
-->
<script lang="ts">
  import { useItemGizmoPreview, useKeyframesStore } from '@/runtime/composition-runtime/deps/stores'
  import type { ShapeItem } from '@/types/timeline'
  import { useSequenceContext } from '@/runtime/composition-runtime/deps/player'
  import { resolveAnimatedShapeItem } from '@/runtime/composition-runtime/deps/keyframes'
  import { useCompositionSpace } from '../contexts/composition-space-context'
  import { useItemVisualTransform } from '../contexts/item-visual-transform-context'
  import { useItemKeyframesFromContext } from '../contexts/keyframes-context'
  import { useKeyframesContext } from '../contexts/keyframes-context-core'
  import { useStoreSelector } from '../../use-sync-external-store.svelte'
  import ShapeGeometry from './shape-content-geometry.svelte'
  import { resolveShapePaint, resolveShapeRenderProps } from './shape-content-props'
  import {
    resolveRenderScale,
    resolveShapeLayout,
    resolveShapeRelativeFrame,
  } from './shape-content-layout'

  let { item }: { item: ShapeItem & { _sequenceFrameOffset?: number } } = $props()

  const uid = $props.id()
  const compositionSpace = useCompositionSpace()
  const renderScale = $derived(resolveRenderScale(compositionSpace.current))
  const visualTransform = useItemVisualTransform()
  const sequenceContext = useSequenceContext()
  const keyframesContext = useKeyframesContext()
  const itemId = $derived(item.id)
  const contextKeyframes = useItemKeyframesFromContext(() => itemId)
  const storeKeyframes = useStoreSelector(useKeyframesStore, (s) => s.keyframesByItemId[itemId])
  const relativeFrame = $derived(resolveShapeRelativeFrame(item, sequenceContext))
  const resolvedItem = $derived.by(() => {
    const canvas = keyframesContext?.canvas
    return resolveAnimatedShapeItem(
      item,
      contextKeyframes.current ?? storeKeyframes.current,
      relativeFrame,
      canvas && keyframesContext
        ? {
            globalFrame: item.from + relativeFrame,
            canvas,
            getItem: keyframesContext.getItem,
            getKeyframes: keyframesContext.getItemKeyframes,
          }
        : undefined,
    )
  })

  const gizmo = useItemGizmoPreview(
    () => itemId,
    () => ({ imperativeTranslate: true }),
  )
  const gradientId = `shape-gradient-${uid.replaceAll(':', '')}`

  const shapeProps = $derived(
    resolveShapeRenderProps(gizmo.itemPreview?.properties, resolvedItem, renderScale.scale),
  )
  const paint = $derived(resolveShapePaint(shapeProps, gradientId))

  const layout = $derived(
    resolveShapeLayout({
      item,
      visualTransform: visualTransform.current,
      itemPreviewTransform: gizmo.itemPreview?.transform,
      previewTransform: gizmo.previewTransform,
      activeGizmo: gizmo.activeGizmo,
      renderScaleX: renderScale.scaleX,
      renderScaleY: renderScale.scaleY,
    }),
  )
</script>

<ShapeGeometry
  {shapeProps}
  {paint}
  {layout}
  {gradientId}
  pathVertices={resolvedItem.pathVertices}
/>
