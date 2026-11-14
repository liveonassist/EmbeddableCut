<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /** Estimated rendered height of a `SubtitleCueRow` including the
   *  `gap-2` between siblings. Used as the virtualizer's seed; rows then
   *  self-measure for any variation (e.g. alignment badge present/absent). */
  const CUE_ROW_ESTIMATE_PX = 116
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import SubtitleCueRow from './subtitle-cue-row.svelte'
  import type { CueChangeHandler, CueSeekHandler, SubtitleCue } from './types'

  interface VirtualCueListProps {
    cues: readonly SubtitleCue[]
    onChange: CueChangeHandler
    onSeek?: CueSeekHandler
  }

  /**
   * Windowed cue list for long subtitle segments. A 65-min episode can
   * easily carry 600+ cues; rendering them all blows out the tree
   * even with memoed rows. The virtualizer keeps only the visible rows
   * (plus a small overscan) mounted.
   */
  let { cues, onChange, onSeek }: VirtualCueListProps = $props()

  let scroll: HTMLDivElement | null = $state(null)

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: untrack(() => cues.length),
    getScrollElement: () => scroll,
    estimateSize: () => CUE_ROW_ESTIMATE_PX,
    overscan: 4,
    getItemKey: (index) => cues[index]?.id ?? index,
  })

  $effect(() => {
    const count = cues.length
    untrack(() => $virtualizer.setOptions({ count }))
  })

  const measure = (node: HTMLDivElement) => {
    untrack(() => $virtualizer.measureElement(node))
    return () => untrack(() => $virtualizer.measureElement(null))
  }
</script>

<div bind:this={scroll} class="h-[40vh] overflow-auto pr-2">
  <div class="relative w-full" style:height="{$virtualizer.getTotalSize()}px">
    {#each $virtualizer.getVirtualItems() as virtualRow (virtualRow.key)}
      {@const cue = cues[virtualRow.index]}
      {#if cue}
        <div
          {@attach measure}
          data-index={virtualRow.index}
          class="absolute left-0 right-0 pb-2"
          style:transform="translateY({virtualRow.start}px)"
        >
          <SubtitleCueRow
            index={virtualRow.index}
            cueId={cue.id}
            text={cue.text}
            startSeconds={cue.startSeconds}
            endSeconds={cue.endSeconds}
            {onChange}
            {onSeek}
          />
        </div>
      {/if}
    {/each}
  </div>
</div>
