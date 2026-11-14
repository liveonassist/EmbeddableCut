<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import DetailedClipContent from './detailed-clip-content.svelte'
  import WidthGatedMediaClipContent from './width-gated-media-clip-content.svelte'
  import { hasBasicMediaVisuals, type ClipContentProps } from './types'

  /**
   * Renders the visual content of a timeline clip based on its type.
   * - Video: 2-row layout — label | filmstrip
   * - Audio: Label row + waveform
   * - Composition (with video): Label | filmstrip | waveform
   * - Text: Text content preview
   * - Adjustment: Effects summary
   * - Image/Shape: Simple label
   */
  const props: ClipContentProps = $props()
</script>

<!--
  Compact clips already retain the full interactive TimelineItem root. Do
  not also mount a label/filmstrip/waveform subtree that cannot be read at
  this width. Besides reducing layout work, returning before the width-gated
  media component avoids one live zoom-store subscription per compact clip.
  Detail is restored only by real-pixel zoom, never by hover or selection.
-->
{#if props.isCompactWidth !== true}
  {#if hasBasicMediaVisuals(props.item)}
    <WidthGatedMediaClipContent {...props} />
  {:else if props.isDetailEligible !== false}
    <DetailedClipContent {...props} />
  {/if}
{/if}
