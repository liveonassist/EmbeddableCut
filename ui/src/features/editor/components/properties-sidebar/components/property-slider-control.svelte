<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { KeyframeToggle } from '@/features/editor/deps/keyframes'
  import type { AnimatableProperty } from '@/types/keyframe'
  import { SliderInput } from './slider-input'

  type SliderInputProps = ComponentProps<typeof SliderInput>

  interface PropertySliderControlProps extends Omit<SliderInputProps, 'class'> {
    class?: string
    keyframe?: {
      itemIds: string[]
      property: AnimatableProperty
      currentValue: number
      disabled?: boolean
    }
    onReset?: () => void
    resetLabel?: string
  }

  /** Standard property-panel composition: slider, optional keyframe, optional reset. */
  let {
    class: className,
    keyframe,
    onReset,
    resetLabel,
    ...sliderProps
  }: PropertySliderControlProps = $props()
</script>

<div class="flex w-full items-center gap-1">
  <SliderInput {...sliderProps} class={`min-w-0 flex-1 ${className ?? ''}`} />
  {#if keyframe}
    <KeyframeToggle
      itemIds={keyframe.itemIds}
      property={keyframe.property}
      currentValue={keyframe.currentValue}
      disabled={keyframe.disabled}
    />
  {/if}
  {#if onReset}
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-7 w-7 flex-shrink-0"
      onclick={onReset}
      title={resetLabel}
      aria-label={resetLabel}
    >
      <RotateCcw class="h-3.5 w-3.5" />
    </Button>
  {/if}
</div>
