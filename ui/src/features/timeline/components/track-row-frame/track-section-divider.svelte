<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { TRACK_SECTION_DIVIDER_HEIGHT } from '@/features/timeline/constants'
  import { cn } from '@/shared/ui/cn'
  import type { TrackSectionDividerProps } from './types'

  let { class: className, onMouseDown }: TrackSectionDividerProps = $props()
</script>

<div class={cn('relative', className)} style:height="{TRACK_SECTION_DIVIDER_HEIGHT}px">
  <div
    aria-hidden="true"
    data-testid="track-row-section-divider"
    class="pointer-events-none absolute inset-0 z-30"
  >
    <div
      class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80 shadow-[0_1px_0_rgba(255,255,255,0.15)]"
    ></div>
  </div>
  {#if onMouseDown}
    <button
      type="button"
      data-track-section-divider="true"
      class="absolute inset-0 z-40 cursor-row-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      aria-label={t('timeline.trackRow.resizeSections')}
      onmousedown={onMouseDown}
    ></button>
  {/if}
</div>
