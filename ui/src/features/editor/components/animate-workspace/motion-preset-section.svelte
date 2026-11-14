<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import type { MotionPreset, MotionPresetCategory } from '@/features/editor/deps/keyframes'
  import MotionPresetThumbnail from './motion-preset-thumbnail.svelte'

  interface MotionPresetSectionProps {
    category: MotionPresetCategory
    presets: MotionPreset[]
    reasonFor: (preset: MotionPreset) => string | null
    onApply: (preset: MotionPreset) => void
    showHeading?: boolean
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /** One category of built-in motion presets, rendered as an animated icon grid. */
  let { category, presets, reasonFor, onApply, showHeading = true, t }: MotionPresetSectionProps =
    $props()
</script>

<section class="flex flex-col gap-1.5">
  {#if showHeading}
    <h3 class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {t(`editor.motionPresets.categories.${category}`)}
    </h3>
  {/if}
  <div class="grid grid-cols-3 gap-1.5">
    {#each presets as preset (preset.id)}
      {@const reason = reasonFor(preset)}
      {@const disabled = reason !== null}
      {@const label = t(`editor.motionPresets.items.${preset.labelKey}`)}
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              aria-disabled={disabled}
              onclick={() => {
                if (!disabled) onApply(preset)
              }}
              class={cn(
                'group flex min-h-16 w-full flex-col items-center gap-1 rounded-md border border-border/60 p-1.5 text-[10px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                disabled
                  ? 'cursor-not-allowed text-muted-foreground/50'
                  : 'text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
              )}
            >
              <MotionPresetThumbnail thumbnail={preset.thumbnail} />
              <span class="w-full truncate text-center leading-tight">{label}</span>
            </button>
          {/snippet}
        </TooltipTrigger>
        {#if reason}<TooltipContent>{reason}</TooltipContent>{/if}
      </Tooltip>
    {/each}
  </div>
</section>
