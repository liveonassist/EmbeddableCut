<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CheckCircle2 from 'lucide-svelte/icons/circle-check'
  import { t } from '$lib/i18n.svelte'
  import TtsMiniAudioPlayer from './tts-mini-audio-player.svelte'

  const RESULT_CARD_CLASS = {
    inserted: 'border-emerald-500/25 bg-emerald-500/5',
    pending: 'border-border bg-secondary/20',
  } as const

  interface TtsResultPreviewProps {
    result: { voice: string; model: string; duration: number; objectUrl: string }
    inserted: boolean
  }

  /** Generated-clip card: metadata line, preview player and the linked badge. */
  let { result, inserted }: TtsResultPreviewProps = $props()

  const cardClass = $derived(inserted ? RESULT_CARD_CLASS.inserted : RESULT_CARD_CLASS.pending)
</script>

<div class="rounded-xl border p-3 space-y-2 {cardClass}">
  <p class="text-[11px] text-muted-foreground">
    {result.voice} / {result.model} / {result.duration > 0
      ? `${result.duration.toFixed(1)}s`
      : '-'}
  </p>
  <TtsMiniAudioPlayer src={result.objectUrl} />

  {#if inserted}
    <span class="flex items-center gap-1 text-[11px] text-emerald-400">
      <CheckCircle2 class="h-3 w-3" />
      {t('editor.tts.insertedAndLinked')}
    </span>
  {/if}
</div>
