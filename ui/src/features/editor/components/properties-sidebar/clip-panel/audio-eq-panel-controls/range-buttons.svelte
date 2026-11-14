<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { AUDIO_EQ_CONTROL_RANGES, type AudioEqControlRangeId } from '../audio-eq-ui'

  let {
    value,
    onChange,
  }: {
    value: AudioEqControlRangeId
    onChange: (value: AudioEqControlRangeId) => void
  } = $props()
</script>

<div class="flex overflow-hidden rounded-[4px] border border-border/70">
  {#each AUDIO_EQ_CONTROL_RANGES as range (range.id)}
    <button
      type="button"
      class={cn(
        'flex-1 border-r border-border/70 py-1 text-[10px] font-medium transition-colors last:border-r-0',
        value === range.id
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
      onclick={() => onChange(range.id)}
    >
      {range.label}
    </button>
  {/each}
</div>
