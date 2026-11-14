<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useVisibleItemDetailRange, useVisibleItems } from './use-visible-items.svelte'

  interface Props {
    probe: 'items' | 'detail-range' | 'transitions'
    trackId?: string
    onRender?: (ids: string[]) => void
  }

  let { probe, trackId = 'track-1', onRender }: Props = $props()

  const visible = useVisibleItems(() => trackId)
  const detailRange = useVisibleItemDetailRange(() => trackId)
  const itemIds = $derived(visible.visibleItems.map((item) => item.id))
  const transitionIds = $derived(visible.visibleTransitions.map((transition) => transition.id))

  // One call per update of the probed value, as React's render callback.
  $effect(() => {
    onRender?.(probe === 'transitions' ? transitionIds : itemIds)
  })
</script>

{#if probe === 'items'}
  <div data-testid="visible-items">{itemIds.join(',')}</div>
{:else if probe === 'detail-range'}
  <div
    data-testid="detail-range"
    data-detail-start={String(detailRange.current.start)}
    data-detail-end={String(detailRange.current.end)}
    data-visible-items={itemIds.join(',')}
  ></div>
{:else}
  <div data-testid="visible-transitions-{trackId}">{transitionIds.join(',')}</div>
{/if}
