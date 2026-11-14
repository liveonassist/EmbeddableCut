<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { getTextItemPlainText } from '@/shared/utils/text-item-spans'

  let { item }: { item: TimelineItem } = $props()
</script>

{#if item.type === 'text'}
  <div class="absolute inset-0 flex flex-col px-2 py-1 overflow-hidden">
    <div class="text-[10px] text-muted-foreground truncate">Text</div>
    <div class="text-xs font-medium truncate flex-1">
      {getTextItemPlainText(item) || 'Empty text'}
    </div>
  </div>
{:else if item.type === 'subtitle'}
  {@const cueCount = item.cues.length}
  {@const firstCueText = item.cues[0]?.text ?? ''}
  <div class="absolute inset-0 flex flex-col px-2 py-1 overflow-hidden">
    <div class="text-[10px] text-muted-foreground truncate">
      {`Subtitles · ${cueCount} cue${cueCount === 1 ? '' : 's'}`}
    </div>
    <div class="text-xs font-medium truncate flex-1">
      {firstCueText || item.label || 'Subtitles'}
    </div>
  </div>
{:else if item.type === 'adjustment'}
  {@const enabledEffectsCount = item.effects?.filter((effect) => effect.enabled).length ?? 0}
  <div class="absolute inset-0 flex flex-col px-2 py-1 overflow-hidden">
    <div class="text-[10px] text-muted-foreground truncate">Adjustment Layer</div>
    <div class="text-xs font-medium truncate flex-1">
      {enabledEffectsCount > 0
        ? `${enabledEffectsCount} effect${enabledEffectsCount > 1 ? 's' : ''}`
        : 'No effects'}
    </div>
  </div>
{:else}
  <div class="px-2 py-1 text-xs font-medium truncate">{item.label}</div>
{/if}
