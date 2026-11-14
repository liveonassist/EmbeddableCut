<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  interface LayerRenameInputProps {
    value: string
    ariaLabel: string
    bold?: boolean
    onDraftChange: (value: string) => void
    onCommit: () => void
    onCancel: () => void
  }

  /** The one inline rename field, shared by layer rows and layer-group headers. */
  let { value, ariaLabel, bold = false, onDraftChange, onCommit, onCancel }: LayerRenameInputProps =
    $props()
</script>

<!-- svelte-ignore a11y_autofocus -->
<input
  autofocus
  {value}
  oninput={(event) => onDraftChange(event.currentTarget.value)}
  onfocus={(event) => event.currentTarget.select()}
  onblur={onCommit}
  onkeydown={(event) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') onCancel()
  }}
  aria-label={ariaLabel}
  class={cn(
    'h-5 min-w-24 flex-1 rounded border border-primary/50 bg-background px-1.5 text-[11px] outline-none',
    bold ? 'font-semibold' : 'font-medium',
  )}
/>
