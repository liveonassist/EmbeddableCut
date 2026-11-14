<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  interface FormatToggleButtonProps {
    active: boolean
    onClick: () => void
    label: string
    glyph: string
    /** Inline CSS for the glyph (italic / bold / underline). */
    glyphStyle?: string
  }

  let { active, onClick, label, glyph, glyphStyle }: FormatToggleButtonProps = $props()
</script>

<button
  type="button"
  title={label}
  aria-label={label}
  aria-pressed={active}
  onclick={onClick}
  class={cn(
    'h-5 w-5 rounded border text-[11px] leading-none transition-colors',
    active
      ? 'border-primary bg-primary/15 text-foreground'
      : 'border-border text-muted-foreground hover:bg-secondary/40',
  )}
  style={glyphStyle}
>
  {glyph}
</button>
