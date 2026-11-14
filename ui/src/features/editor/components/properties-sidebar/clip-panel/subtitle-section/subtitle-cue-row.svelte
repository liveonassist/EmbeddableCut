<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /** Minimum cue duration (10ms) — prevents start/end inputs from collapsing
   *  the cue to a zero or negative-length range. */
  const MIN_CUE_DURATION_SECONDS = 0.01
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import {
    buildCueText,
    getCueFormatFlags,
    parseSubtitleCueText,
    toggleCueFormat,
    type CueFormatFlags,
  } from '@/shared/utils/subtitle-cue-format'
  import FormatToggleButton from './format-toggle-button.svelte'
  import type { CueChangeHandler, CueSeekHandler } from './types'

  interface SubtitleCueRowProps {
    index: number
    cueId: string
    text: string
    startSeconds: number
    endSeconds: number
    onChange: CueChangeHandler
    onSeek?: CueSeekHandler
  }

  /**
   * Editor row for a single cue.
   *
   * The textarea shows plain text — markup is hidden so users don't see
   * literal `<i>` brackets. The Italic/Bold/Underline toggles below wrap
   * (or unwrap) the entire cue with the corresponding tag, and any ASS
   * `{\anN}` alignment in the original cue text is preserved across edits.
   *
   * Trade-off: cues with mixed-run formatting (e.g. half italic) collapse
   * to whole-cue formatting on first text edit. That's rare in real subs
   * and the alternative — rich-text editing — is a much bigger surface.
   */
  let { index, cueId, text, startSeconds, endSeconds, onChange, onSeek }: SubtitleCueRowProps =
    $props()

  const parsed = $derived(parseSubtitleCueText(text))
  const flags = $derived(getCueFormatFlags(parsed))

  const handlePlainTextChange = (nextPlainText: string) => {
    onChange(cueId, { text: buildCueText(nextPlainText, flags, text) })
  }

  const handleToggle = (format: keyof CueFormatFlags) => {
    onChange(cueId, { text: toggleCueFormat(text, format) })
  }
</script>

<li class="rounded border border-border bg-card/40 p-2">
  <div class="flex items-center gap-2 pb-1.5">
    <button
      type="button"
      title={t('editor.subtitleSection.seekToCue')}
      onclick={() => onSeek?.(startSeconds)}
      class="rounded text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
    >
      #{index + 1}
    </button>
    <Label class="sr-only" for={`cue-${cueId}-start`}>
      {t('editor.subtitleSection.start')}
    </Label>
    <Input
      id={`cue-${cueId}-start`}
      type="number"
      step="0.01"
      min="0"
      value={Number(startSeconds.toFixed(3))}
      oninput={(event) => {
        const value = Number(event.currentTarget.value)
        if (!Number.isFinite(value)) return
        // Clamp against the cue's end so dragging start past end can't
        // produce a zero/negative-length cue.
        const clamped = Math.max(0, Math.min(value, endSeconds - MIN_CUE_DURATION_SECONDS))
        onChange(cueId, { startSeconds: clamped })
      }}
      class="h-6 w-28 text-right text-xs tabular-nums"
    />
    <span class="text-[10px] text-muted-foreground">→</span>
    <Label class="sr-only" for={`cue-${cueId}-end`}>
      {t('editor.subtitleSection.end')}
    </Label>
    <Input
      id={`cue-${cueId}-end`}
      type="number"
      step="0.01"
      min="0"
      value={Number(endSeconds.toFixed(3))}
      oninput={(event) => {
        const value = Number(event.currentTarget.value)
        if (!Number.isFinite(value)) return
        const clamped = Math.max(startSeconds + MIN_CUE_DURATION_SECONDS, value)
        onChange(cueId, { endSeconds: clamped })
      }}
      class="h-6 w-28 text-right text-xs tabular-nums"
    />
  </div>
  <textarea
    value={parsed.plainText}
    oninput={(event) => handlePlainTextChange(event.currentTarget.value)}
    rows={2}
    class="w-full resize-none rounded border border-input bg-transparent px-2 py-1 text-xs leading-snug focus:outline-none focus:ring-1 focus:ring-ring"
  ></textarea>
  <div class="flex items-center gap-1 pt-1">
    <FormatToggleButton
      active={flags.italic}
      onClick={() => handleToggle('italic')}
      label={t('editor.subtitleSection.italic')}
      glyph="I"
      glyphStyle="font-style: italic"
    />
    <FormatToggleButton
      active={flags.bold}
      onClick={() => handleToggle('bold')}
      label={t('editor.subtitleSection.bold')}
      glyph="B"
      glyphStyle="font-weight: 700"
    />
    <FormatToggleButton
      active={flags.underline}
      onClick={() => handleToggle('underline')}
      label={t('editor.subtitleSection.underline')}
      glyph="U"
      glyphStyle="text-decoration: underline"
    />
    {#if parsed.alignment}
      <span
        class="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground"
        title={t('editor.subtitleSection.cuePosition', {
          vertical: parsed.alignment.verticalAlign,
          horizontal: parsed.alignment.textAlign,
        })}
      >
        {parsed.alignment.verticalAlign === 'top'
          ? '▲'
          : parsed.alignment.verticalAlign === 'bottom'
            ? '▼'
            : '◆'}
        {parsed.alignment.textAlign}
      </span>
    {/if}
  </div>
</li>
