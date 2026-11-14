<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { MINI_TIMELINE_RULER_HEIGHT } from './constants'
  import { formatMiniTimelineClock } from './utils'

  const RULER_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const

  interface MiniTimelineRulerProps {
    labelWidth: number
    maxFrame: number
    fps: number
    height?: number
    formatTime?: (frame: number, fps: number) => string
  }

  /** Quarter-mark time ruler aligned to the track content (inset by labelWidth). */
  let {
    labelWidth,
    maxFrame,
    fps,
    height = MINI_TIMELINE_RULER_HEIGHT,
    formatTime = formatMiniTimelineClock,
  }: MiniTimelineRulerProps = $props()
</script>

<div class="relative border-b border-black/40" style:height="{height}px">
  <div class="absolute inset-y-0 right-0" style:left="{labelWidth}px">
    {#each RULER_RATIOS as ratio (ratio)}
      <div
        class="absolute top-0 h-full border-l border-zinc-500/45 pl-1 pt-0.5 text-[10px] text-zinc-500"
        style:left="{ratio * 100}%"
      >
        {formatTime(Math.round(ratio * maxFrame), fps)}
      </div>
    {/each}
  </div>
</div>
