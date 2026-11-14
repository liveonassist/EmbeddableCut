<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { ItemKeyframes } from '@/types/keyframe'
  import type { ShapeItem, TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import { setSequenceContext, type SequenceContextValue } from '@/runtime/composition-runtime/deps/player'
  import { setItemVisualTransform } from '../contexts/item-visual-transform-context'
  import { KeyframesProvider } from '../contexts/keyframes-context'
  import ShapeContent from './shape-content.svelte'

  // Test harness: ShapeContent under the contexts a test provides.
  let {
    item,
    visualSize,
    sequence,
    keyframes,
    items,
    canvas,
  }: {
    item: ShapeItem
    visualSize?: { width: number; height: number }
    sequence?: SequenceContextValue
    keyframes?: ItemKeyframes[]
    items?: TimelineItem[]
    canvas?: CanvasSettings
  } = $props()

  setItemVisualTransform({
    get current() {
      return visualSize ?? null
    },
  })
  setSequenceContext(untrack(() => sequence) ?? null)
</script>

{#if keyframes}
  <KeyframesProvider {keyframes} {items} {canvas}>
    <ShapeContent {item} />
  </KeyframesProvider>
{:else}
  <ShapeContent {item} />
{/if}
