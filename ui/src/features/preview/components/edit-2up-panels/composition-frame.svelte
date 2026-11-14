<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { InlineCompositionPreview } from '../inline-composition-preview'

  interface CompositionFrameProps {
    item: TimelineItem
    sourceFrame: number
  }

  let { item, sourceFrame }: CompositionFrameProps = $props()
</script>

{#if !(item.type !== 'composition')}
  <InlineCompositionPreview
    compositionId={item.compositionId}
    seekFrame={sourceFrame}
    containerSize={{
      width: item.compositionWidth,
      height: item.compositionHeight,
    }}
    presentation="frame"
   />
{/if}
