<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '@/shared/ui/cn'
  import ScopeOverlay from './scope-overlay.svelte'

  type ScopeOverlayKind = 'waveform' | 'parade' | 'histogram' | 'vectorscope'

  interface ScopeCanvasFrameProps {
    children: Snippet
    class?: string
    containerRef: { current: HTMLDivElement | null }
    kind: ScopeOverlayKind
  }

  let { children, class: className, containerRef, kind }: ScopeCanvasFrameProps = $props()
</script>

<div
  bind:this={containerRef.current}
  class={cn(
    'relative overflow-hidden rounded border border-border/70 bg-black/80',
    className,
  )}
>
  {@render children?.()}
  <ScopeOverlay kind={kind} />
</div>
