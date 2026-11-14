<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CompositionContent from './composition-content.svelte'
  import ItemContent from './item-content.svelte'
  import type { ItemProps, RenderCompositionContentProps } from './item-types'

  let props: Omit<ItemProps, 'renderCompositionContent'> = $props()
</script>

{#snippet renderCompositionContent(contentProps: RenderCompositionContentProps)}
  <CompositionContent {...contentProps} />
{/snippet}

<ItemContent {...props} {renderCompositionContent} />
