<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ItemKeyframes } from '@/types/keyframe'
  import type { TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import { setKeyframesContext } from './keyframes-context-core'
  import { useLiveTimelineItemResolver } from './live-item-transform-context.svelte'

  interface KeyframesProviderProps {
    keyframes: ItemKeyframes[] | undefined
    items?: TimelineItem[]
    canvas?: CanvasSettings
    children: Snippet
  }

  let { keyframes, items = [], canvas, children }: KeyframesProviderProps = $props()

  const keyframesMap = $derived.by(() => {
    const map = new Map<string, ItemKeyframes>()
    if (keyframes) {
      for (const kf of keyframes) {
        map.set(kf.itemId, kf)
      }
    }
    return map
  })

  // New function identities when the maps change, as React's useCallback, so
  // readers that depend on the getter re-run.
  const getItemKeyframes = $derived.by(() => {
    const map = keyframesMap
    return (itemId: string) => map.get(itemId)
  })
  const itemsMap = $derived(new Map(items.map((item) => [item.id, item])))
  const getLiveItem = useLiveTimelineItemResolver()
  const getItem = $derived.by(() => {
    const map = itemsMap
    return (itemId: string) => getLiveItem(itemId) ?? map.get(itemId)
  })

  setKeyframesContext({
    get keyframes() {
      return keyframes ?? []
    },
    get getItemKeyframes() {
      return getItemKeyframes
    },
    get getItem() {
      return getItem
    },
    get canvas() {
      return canvas
    },
  })
</script>

{@render children()}
