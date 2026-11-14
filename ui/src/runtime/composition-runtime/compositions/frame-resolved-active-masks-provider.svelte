<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { useClockFrameSelector } from '@/runtime/composition-runtime/deps/player'
  import type { ShapeMaskWithTrackOrder } from '@/runtime/composition-runtime/utils/scene-assembly'
  import {
    resolveActiveShapeMasksAtFrame,
    selectMaskRenderFrame,
  } from '@/runtime/composition-runtime/utils/frame-scene'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { useKeyframesContext } from '../contexts/keyframes-context-core'
  import { useLiveTransformDependencySignatureForItems } from '../contexts/live-item-transform-context.svelte'
  import type { MaskInfo } from '../components/item-types'
  import { EMPTY_MASK_INFOS, materializeMaskInfos, reuseStableMaskInfos } from '../utils/mask-info'
  import { setActiveMasks } from './active-masks-context'

  let {
    masks,
    canvasWidth,
    canvasHeight,
    children,
  }: {
    masks: ShapeMaskWithTrackOrder[]
    canvasWidth: number
    canvasHeight: number
    children: Snippet
  } = $props()

  const frame = useClockFrameSelector((clockFrame) => selectMaskRenderFrame(masks, clockFrame))
  const videoConfig = useVideoConfig()
  const keyframesCtx = useKeyframesContext()
  let previousMasks: MaskInfo[] = EMPTY_MASK_INFOS
  const maskItems = $derived(masks.map(({ mask }) => mask))
  const liveMaskDependencySignature = useLiveTransformDependencySignatureForItems(
    () => maskItems,
    () => keyframesCtx?.getItemKeyframes,
  )

  const activeMasks = $derived.by((): MaskInfo[] => {
    void liveMaskDependencySignature.current
    if (masks.length === 0) {
      previousMasks = EMPTY_MASK_INFOS
      return EMPTY_MASK_INFOS
    }

    const nextMasks = materializeMaskInfos(
      resolveActiveShapeMasksAtFrame(masks, {
        canvas: { width: canvasWidth, height: canvasHeight, fps: videoConfig.fps },
        frame: frame.current,
        getKeyframes: keyframesCtx?.getItemKeyframes,
        getItem: keyframesCtx?.getItem,
      }),
    )
    const stableMasks = reuseStableMaskInfos(previousMasks, nextMasks)
    previousMasks = stableMasks
    return stableMasks
  })

  setActiveMasks({
    get current() {
      return activeMasks
    },
  })
</script>

{@render children()}
