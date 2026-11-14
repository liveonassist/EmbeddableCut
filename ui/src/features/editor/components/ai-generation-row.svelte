<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CheckCircle2 from 'lucide-svelte/icons/circle-check'
  import Download from 'lucide-svelte/icons/download'
  import ListPlus from 'lucide-svelte/icons/list-plus'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'
  import AiPanelMiniAudioPlayer from './ai-panel-mini-audio-player.svelte'
  import { formatBytes, type AudioGeneration } from './ai-panel-types'

  interface GenerationRowProps {
    generation: AudioGeneration
    onSave: (gen: AudioGeneration) => Promise<void>
    onSaveAndInsert: (gen: AudioGeneration) => Promise<void>
    onRemove: (id: string) => void
  }

  /** One entry of the AI panel's generation history. */
  let { generation: gen, onSave, onSaveAndInsert, onRemove }: GenerationRowProps = $props()

  const saved = $derived(gen.savedMediaId !== null)
</script>

<div
  class="rounded-lg border p-3 space-y-2 {saved
    ? 'border-emerald-500/25 bg-emerald-500/5'
    : 'border-border bg-secondary/20'}"
>
  <!-- Meta row -->
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0 space-y-0.5">
      <p class="line-clamp-3 text-xs leading-relaxed" title={gen.textSnippet}>
        {gen.textSnippet}
      </p>
      <p class="text-[11px] text-muted-foreground">
        {gen.voice} / {gen.model} / {gen.duration > 0 ? `${gen.duration.toFixed(1)}s` : '-'} / {formatBytes(
          gen.byteSize,
        )}
      </p>
    </div>
    {#if !gen.saving}
      <button
        type="button"
        class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        onclick={() => onRemove(gen.id)}
        aria-label={t('editor.aiPanel.remove')}
      >
        <X class="h-3.5 w-3.5" />
      </button>
    {/if}
  </div>

  <!-- Audio player -->
  <AiPanelMiniAudioPlayer src={gen.objectUrl} />

  <!-- Actions -->
  <div class="flex flex-wrap items-center gap-1.5">
    {#if saved}
      <span class="flex items-center gap-1 text-[11px] text-emerald-400">
        <CheckCircle2 class="h-3 w-3" />
        {t('editor.aiPanel.saved')}
      </span>
    {:else}
      <Button
        variant="secondary"
        size="sm"
        class="h-7 gap-1 px-2 text-[11px]"
        onclick={() => {
          void onSaveAndInsert(gen)
        }}
        disabled={gen.saving}
      >
        {#if gen.saving}
          <Loader2 class="h-3 w-3 animate-spin" />
        {:else}
          <ListPlus class="h-3 w-3" />
        {/if}
        {gen.saving ? t('editor.aiPanel.saving') : t('editor.aiPanel.saveAndInsert')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-[11px]"
        onclick={() => {
          void onSave(gen)
        }}
        disabled={gen.saving}
      >
        <Download class="h-3 w-3" />
        {t('editor.aiPanel.saveToLibrary')}
      </Button>
    {/if}
  </div>
</div>
