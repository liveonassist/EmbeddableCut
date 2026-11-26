<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste'
  import Copy from '@lucide/svelte/icons/copy'
  import Scissors from '@lucide/svelte/icons/scissors'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'

  interface DopesheetClipboardActionsProps {
    disabled: boolean
    hasSelection: boolean
    hasKeyframeClipboard: boolean
    isKeyframeClipboardCut: boolean
    onCopyKeyframes?: () => void
    onCutKeyframes?: () => void
    onPasteKeyframes?: () => void
  }

  let {
    disabled,
    hasSelection,
    hasKeyframeClipboard,
    isKeyframeClipboardCut,
    onCopyKeyframes,
    onCutKeyframes,
    onPasteKeyframes,
  }: DopesheetClipboardActionsProps = $props()

  const pasteLabel = $derived(
    isKeyframeClipboardCut
      ? t('timeline.keyframeEditor.moveKeyframesFromClipboard')
      : t('timeline.keyframeEditor.pasteKeyframes'),
  )
</script>

{#if onCopyKeyframes || onCutKeyframes || onPasteKeyframes}
  <div class="flex items-center gap-0.5 rounded-md border border-border/70 bg-background/85 px-0.5 py-0.5">
    <Button
      variant="ghost"
      size="sm"
      class="h-6 w-6 p-0"
      onclick={onCopyKeyframes}
      disabled={disabled || !hasSelection || !onCopyKeyframes}
      title={t('timeline.keyframeEditor.copySelectedKeyframes')}
      aria-label={t('timeline.keyframeEditor.copySelectedKeyframes')}
    >
      <Copy class="h-3 w-3" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      class="h-6 w-6 p-0"
      onclick={onCutKeyframes}
      disabled={disabled || !hasSelection || !onCutKeyframes}
      title={t('timeline.keyframeEditor.cutSelectedKeyframes')}
      aria-label={t('timeline.keyframeEditor.cutSelectedKeyframes')}
    >
      <Scissors class="h-3 w-3" />
    </Button>
    <Button
      variant={isKeyframeClipboardCut ? 'secondary' : 'ghost'}
      size="sm"
      class="h-6 w-6 p-0"
      onclick={onPasteKeyframes}
      disabled={disabled || !hasKeyframeClipboard || !onPasteKeyframes}
      title={pasteLabel}
      aria-label={pasteLabel}
    >
      <ClipboardPaste class="h-3 w-3" />
    </Button>
    {#if isKeyframeClipboardCut && hasKeyframeClipboard}
      <span class="pl-0.5 text-[10px] font-medium text-amber-500">
        {t('timeline.keyframeEditor.cut')}
      </span>
    {/if}
  </div>
{/if}
