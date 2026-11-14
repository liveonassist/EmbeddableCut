<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import { Textarea } from '@/components/ui/textarea'
  import { SUPERTONIC_TTS_EXPRESSIVE_TAG_OPTIONS } from '@/features/editor/services/supertonic-tts-service'
  import type { StoredTtsEngine } from '@/shared/utils/tts-settings'
  import { insertTextAtCursor } from '@/features/editor/utils/tts-ui-helpers'
  import { t } from '$lib/i18n.svelte'

  interface TtsTextPanelProps {
    engine: StoredTtsEngine
    text: string
    onTextChange: (text: string) => void
    busy: boolean
  }

  /** Script textarea, plus the Supertonic expressive-tag shortcuts. */
  let { engine, text, onTextChange, busy }: TtsTextPanelProps = $props()

  let textarea: HTMLTextAreaElement | null = $state(null)
</script>

<div class="space-y-2">
  <Label for="tts-dialog-text">{t('editor.tts.text')}</Label>
  <Textarea
    bind:ref={textarea}
    id="tts-dialog-text"
    value={text}
    oninput={(event) => onTextChange(event.currentTarget.value)}
    placeholder={t('editor.tts.textPlaceholder')}
    class="min-h-28 resize-y bg-secondary/30 text-sm"
    disabled={busy}
  />
  {#if engine === 'supertonic'}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-[11px] text-muted-foreground">
        {t('editor.tts.expressiveTags', { defaultValue: 'Expressive tags' })}
      </span>
      {#each SUPERTONIC_TTS_EXPRESSIVE_TAG_OPTIONS as tag (tag.value)}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          class="h-6 px-2 text-[11px]"
          onclick={() =>
            insertTextAtCursor({
              input: textarea,
              insertText: tag.value,
              setText: onTextChange,
              text,
            })}
          disabled={busy}
        >
          {tag.label}
        </Button>
      {/each}
    </div>
  {/if}
</div>
