<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import type { EasingType } from '@/types/keyframe'
  import { cn } from '@/shared/ui/cn'
  import { Button } from '@/components/ui/button'
  import InterpolationTypeIcon from './interpolation-type-icon.svelte'

  interface DopesheetInterpolationButtonsProps {
    options: ReadonlyArray<{ value: EasingType; label: string }>
    selected: EasingType | null | undefined
    disabled: boolean
    onSelect?: (value: EasingType) => void
  }

  let { options, selected, disabled, onSelect }: DopesheetInterpolationButtonsProps = $props()
</script>

{#if options.length > 0}
  <div
    class="flex items-center gap-0.5 rounded-md border border-border/80 bg-muted/20 px-0.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    aria-label={t('timeline.keyframeEditor.interpolationControls', {
      defaultValue: 'Interpolation controls',
    })}
  >
    {#each options as option (option.value)}
      {@const isActive = selected === option.value}
      <Button
        variant="ghost"
        size="sm"
        class={cn(
          'h-6 w-6 p-0 text-muted-foreground/80 hover:bg-background/60 hover:text-foreground',
          isActive &&
            'bg-background text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-background hover:text-foreground',
        )}
        onclick={() => onSelect?.(option.value)}
        disabled={disabled || !onSelect}
        title={option.label}
        aria-label={t('timeline.keyframeEditor.setInterpolationTo', {
          label: option.label,
          defaultValue: `Set interpolation to ${option.label}`,
        })}
        aria-pressed={isActive}
      >
        <InterpolationTypeIcon type={option.value} />
      </Button>
    {/each}
  </div>
{/if}
