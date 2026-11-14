<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cssStyle } from '@/features/preview/utils/css-style'
  import { cn } from '@/shared/ui/cn'

  type ScopeViewMode = 'rgb' | 'r' | 'g' | 'b' | 'luma'

  let { mode, onChange }: {
    mode: ScopeViewMode
    onChange: (m: ScopeViewMode) => void
  } = $props()
  const modes: Array<{ value: ScopeViewMode; label: string; activeColor?: string }> = [
    { value: 'rgb', label: 'RGB' },
    { value: 'r', label: 'R', activeColor: '#ff6666' },
    { value: 'g', label: 'G', activeColor: '#66cc66' },
    { value: 'b', label: 'B', activeColor: '#6688ff' },
    { value: 'luma', label: 'Y', activeColor: '#ccccaa' },
  ]
</script>

<div class="flex items-center gap-0.5">
  {#each modes as m (m.value)}
    <button
      class={cn(
        'h-4 px-1 text-[9px] font-semibold font-mono rounded transition-colors',
        mode === m.value ? 'text-white' : 'text-muted-foreground hover:text-foreground',
      )}
      style={cssStyle(mode === m.value
        ? {
            backgroundColor: `${m.activeColor ?? '#888'}33`,
            borderBottom: `1.5px solid ${m.activeColor ?? '#888'}`,
          }
        : undefined)}
      onclick={() => onChange(m.value)}
      aria-pressed={mode === m.value}
    >
      {m.label}
    </button>
  {/each}
</div>
