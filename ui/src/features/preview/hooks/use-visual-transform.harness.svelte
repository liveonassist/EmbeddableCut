<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { useVisualTransforms } from './use-visual-transform.svelte'

  interface Props {
    item: TimelineItem
    projectSize: { width: number; height: number }
    /** A frozen overlay's explicit presentation frame. */
    frame?: number
    /** Called each time the transform map's reader re-runs (React's render count). */
    onRender: () => void
  }

  let { item, projectSize, frame, onRender }: Props = $props()
  const transforms = useVisualTransforms(
    () => [item],
    () => projectSize,
    () => undefined,
    () => frame,
  )
  const resolved = $derived(transforms.current.get(item.id))

  $effect(() => {
    void transforms.current
    onRender()
  })
</script>

{#if frame === undefined}
  <div
    data-testid="visual-probe"
    data-x={String(resolved?.x ?? Number.NaN)}
    data-height={String(resolved?.height ?? Number.NaN)}
  ></div>
{:else}
  <div data-testid="frozen-visual-probe" data-x={String(resolved?.x)}></div>
{/if}
