<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CheckCircle2 from '@lucide/svelte/icons/circle-check'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'

  interface TtsDialogActionsProps {
    isGenerating: boolean
    isInserting: boolean
    hasResult: boolean
    inserted: boolean
    canGenerate: boolean
    onGenerate: () => void
    onInsert: () => void
  }

  /** Footer actions: synthesize (or re-synthesize) and insert-and-link. */
  let {
    isGenerating,
    isInserting,
    hasResult,
    inserted,
    canGenerate,
    onGenerate,
    onInsert,
  }: TtsDialogActionsProps = $props()

  const generateVariant = $derived(hasResult && !inserted ? 'secondary' : 'default')
</script>

<div class="flex items-center gap-2">
  <Button
    size="sm"
    variant={generateVariant}
    onclick={onGenerate}
    disabled={!canGenerate}
    class="h-8 gap-1.5"
  >
    {#if isGenerating}
      <Loader2 class="h-3.5 w-3.5 animate-spin" />
    {:else}
      <WandSparkles class="h-3.5 w-3.5" />
    {/if}
    {isGenerating
      ? t('editor.tts.generating')
      : hasResult
        ? t('editor.tts.regenerate')
        : t('editor.tts.generate')}
  </Button>

  {#if hasResult && !inserted}
    <Button size="sm" onclick={onInsert} disabled={isInserting || isGenerating} class="h-8 gap-1.5">
      {#if isInserting}
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
      {:else}
        <CheckCircle2 class="h-3.5 w-3.5" />
      {/if}
      {isInserting ? t('editor.tts.inserting') : t('editor.tts.insertAndLink')}
    </Button>
  {/if}
</div>
