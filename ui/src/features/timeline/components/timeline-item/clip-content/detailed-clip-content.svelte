<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import DetailedCompositionClipContent from './detailed-composition-clip-content.svelte'
  import StaticClipContent from './static-clip-content.svelte'
  import type { ClipContentProps } from './types'

  const props: ClipContentProps = $props()
</script>

{#if props.item.type === 'composition' || (props.item.type === 'audio' && props.item.compositionId)}
  <DetailedCompositionClipContent {...props} />
{:else}
  <StaticClipContent item={props.item} />
{/if}
