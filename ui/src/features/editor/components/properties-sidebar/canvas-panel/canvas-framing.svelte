<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { PropertyRow } from '../components'
  import type { CanvasFraming } from '@/features/editor/deps/timeline-store'

  /**
   * How clips of another shape than the canvas meet it: letterboxed or
   * cropped. Choosing one reframes every clip that fills the canvas.
   */
  let {
    framing,
    onFramingChange,
  }: {
    framing: CanvasFraming | 'mixed'
    onFramingChange: (framing: CanvasFraming) => void
  } = $props()

  const OPTIONS = [
    { id: 'fit', label: 'editor.canvasPanel.framingFit', hint: 'editor.canvasPanel.framingFitHint' },
    {
      id: 'fill',
      label: 'editor.canvasPanel.framingFill',
      hint: 'editor.canvasPanel.framingFillHint',
    },
  ] as const
</script>

<PropertyRow label={t('editor.canvasPanel.framing')}>
  <div
    class="grid w-full grid-cols-2 gap-0.5 rounded-md border border-border p-0.5"
    role="group"
    aria-label={t('editor.canvasPanel.framing')}
  >
    {#each OPTIONS as option (option.id)}
      <button
        type="button"
        aria-pressed={framing === option.id}
        data-tooltip={t(option.hint)}
        class={cn(
          'h-6 rounded-[3px] text-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          framing === option.id
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onclick={() => onFramingChange(option.id)}
      >
        {t(option.label)}
      </button>
    {/each}
  </div>
</PropertyRow>
