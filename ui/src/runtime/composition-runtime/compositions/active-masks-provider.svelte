<!-- SPDX-License-Identifier: MIT -->
<!--
  Avoid subscribing the entire visual layer to the playback clock when the
  composition has no masks. The frame-aware provider is mounted only while
  masks exist, so ordinary projects keep this boundary stable during playback.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ShapeMaskWithTrackOrder } from '@/runtime/composition-runtime/utils/scene-assembly'
  import { EMPTY_MASK_INFOS } from '../utils/mask-info'
  import { setActiveMasks } from './active-masks-context'
  import FrameResolvedActiveMasksProvider from './frame-resolved-active-masks-provider.svelte'

  let props: {
    masks: ShapeMaskWithTrackOrder[]
    canvasWidth: number
    canvasHeight: number
    children: Snippet
  } = $props()

  setActiveMasks({ current: EMPTY_MASK_INFOS })
</script>

{#if props.masks.length === 0}
  {@render props.children()}
{:else}
  <FrameResolvedActiveMasksProvider {...props} />
{/if}
