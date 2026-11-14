<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Blend from 'lucide-svelte/icons/blend'
  import TransitionPreview from './transition-preview/transition-preview.svelte'
  import type { PresentationConfig } from '@/types/transition'
  import { cn } from '@/shared/ui/cn'
  import { transitionRegistry } from '@/shared/timeline/transitions'
  import { TRANSITION_ICON_MAP } from '@/features/editor/utils/transition-ui-config'

  /** The transitions panel's compact card: a small clickable, draggable tile. */
  interface TransitionCardProps {
    config: PresentationConfig
    configIndex: number
    onApply: (index: number) => void
    clickDisabled?: boolean
    onDragStart: (event: DragEvent, index: number) => void
    onDragEnd: () => void
  }

  let { config, configIndex, onApply, clickDisabled, onDragStart, onDragEnd }: TransitionCardProps =
    $props()

  /**
   * The card's visual mode from its config: the fallback icon, whether an
   * animated A/B preview is available (GPU shader or Canvas 2D path), and the
   * direction to preview.
   */
  const visuals = $derived.by(() => {
    const renderer = transitionRegistry.getRenderer(config.id)
    return {
      Icon: TRANSITION_ICON_MAP[config.icon] ?? Blend,
      showPreview: !!(renderer?.gpuTransitionId || renderer?.renderCanvas),
      previewDirection: config.direction ?? config.defaultDirection,
    }
  })
  let hovered = $state(false)

  function handleClick() {
    if (clickDisabled) return
    onApply(configIndex)
  }
</script>

<button
  type="button"
  onclick={handleClick}
  draggable={true}
  ondragstart={(event) => onDragStart(event, configIndex)}
  ondragend={onDragEnd}
  onpointerenter={visuals.showPreview ? () => (hovered = true) : undefined}
  onpointerleave={visuals.showPreview ? () => (hovered = false) : undefined}
  aria-disabled={clickDisabled}
  class={cn(
    'flex flex-col items-center gap-1 p-2 rounded-lg min-w-[60px]',
    'border border-border bg-secondary/30',
    'hover:bg-secondary/50 hover:border-primary/50',
    'transition-colors group text-center cursor-grab active:cursor-grabbing',
    clickDisabled && 'focus-visible:outline-muted-foreground/40',
  )}
  title={config.description}
>
  {#if visuals.showPreview}
    <TransitionPreview
      presentationId={config.id}
      direction={visuals.previewDirection}
      active={hovered}
    />
  {:else}
    {@const Icon = visuals.Icon}
    <div class="flex aspect-video w-full items-center justify-center rounded-[3px] bg-black/40">
      <Icon class="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
    </div>
  {/if}
  <span class="text-[10px] text-muted-foreground group-hover:text-foreground truncate w-full">
    {config.label}
  </span>
</button>
