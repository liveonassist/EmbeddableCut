<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import type { TranscriptScope } from './transcript-segments'

  let {
    scope,
    onChange,
  }: {
    scope: TranscriptScope
    onChange: (scope: TranscriptScope) => void
  } = $props()

  const options = $derived<{ value: TranscriptScope; label: string }[]>([
    { value: 'selection', label: t('transcript.scopeSelection', { defaultValue: 'Selection' }) },
    { value: 'project', label: t('transcript.scopeProject', { defaultValue: 'Whole project' }) },
  ])
</script>

<div class="flex w-full gap-1">
  {#each options as option (option.value)}
    <button
      type="button"
      onclick={() => onChange(option.value)}
      class={cn(
        'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
        scope === option.value
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {option.label}
    </button>
  {/each}
</div>
