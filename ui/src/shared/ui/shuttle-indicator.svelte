<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  interface ShuttleIndicatorProps {
    active: boolean
    playbackRate: number
    class?: string
  }

  let { active, playbackRate, class: className }: ShuttleIndicatorProps = $props()

  const reverse = $derived(playbackRate < 0)
  const speed = $derived(Math.abs(playbackRate))
  const key = $derived(reverse ? 'J' : 'L')
  const direction = $derived(reverse ? '◀' : '▶')
  const label = $derived(`${reverse ? 'Reverse' : 'Forward'} shuttle ${speed}x`)
</script>

{#if active && playbackRate !== 0}
  <output
    class={cn(
      'inline-flex h-5 min-w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded border px-1.5',
      'font-mono text-[10px] font-semibold tabular-nums select-none',
      speed > 1
        ? 'border-primary/40 bg-primary/15 text-primary'
        : 'border-border bg-muted/50 text-muted-foreground',
      className,
    )}
    aria-label={label}
    title={label}
  >
    <!-- No whitespace between the spans: JSX renders none. -->
    <span class="text-[9px] opacity-70">{key}</span><span aria-hidden="true">{direction}</span
    ><span>{speed}×</span>
  </output>
{/if}
