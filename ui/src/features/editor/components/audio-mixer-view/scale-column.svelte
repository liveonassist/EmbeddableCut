<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { FADER_SCALE_MARKS, dbToFaderPercent } from './fader'
</script>

<div class="relative w-[24px] min-w-[24px] shrink-0">
  <!-- Top label spacer -->
  <div class="h-[18px]"></div>
  <!-- S/M spacer -->
  <div class="h-[18px]"></div>

  <!-- Scale area -->
  <div class="relative flex-1" style:height="calc(100% - 54px)">
    {#each FADER_SCALE_MARKS as mark (mark)}
      <div
        class="absolute right-0 -translate-y-1/2 text-[9px] font-mono text-muted-foreground/70 leading-none whitespace-nowrap"
        style:bottom="{dbToFaderPercent(mark)}%"
      >
        {mark}
      </div>
    {/each}
  </div>
</div>
