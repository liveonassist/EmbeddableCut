<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { VideoConfigProvider } from '@/runtime/composition-runtime/deps/player'
  import NestedMediaResolutionProvider from '../contexts/nested-media-resolution-provider.svelte'
  import CompositionContent from './composition-content.svelte'
  import Item from './item.svelte'

  // Test harness: CompositionContent (or an Item) in a 1280×720, 30 fps player config.
  let {
    nestedMediaResolution = 'source',
    itemProps,
    ...props
  }: Partial<ComponentProps<typeof CompositionContent>> & {
    nestedMediaResolution?: 'source' | 'proxy'
    itemProps?: ComponentProps<typeof Item>
  } = $props()
</script>

<VideoConfigProvider fps={30} width={1280} height={720} durationInFrames={120}>
  <NestedMediaResolutionProvider value={nestedMediaResolution}>
    {#if itemProps}
      <Item {...itemProps} />
    {:else if props.item}
      <CompositionContent {...props} item={props.item} />
    {/if}
  </NestedMediaResolutionProvider>
</VideoConfigProvider>
