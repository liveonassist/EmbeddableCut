<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Button } from '@/components/ui/button'
  import Link2 from '@lucide/svelte/icons/link-2'
  import Link2Off from '@lucide/svelte/icons/link-2-off'
  import { NumberInput } from './number-input'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'

  type MixedValue = number | 'mixed'

  interface LinkedDimensionsProps {
    width: MixedValue
    height: MixedValue
    aspectLocked: boolean
    onWidthChange: (value: number) => void
    onHeightChange: (value: number) => void
    /** Called during scrub for live preview */
    onWidthLiveChange?: (value: number) => void
    /** Called during scrub for live preview */
    onHeightLiveChange?: (value: number) => void
    onAspectLockToggle: () => void
    disabled?: boolean
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    step?: number
    class?: string
  }

  /**
   * Width/Height inputs with aspect ratio lock toggle.
   * When locked, changing one dimension proportionally changes the other.
   */
  let {
    width,
    height,
    aspectLocked,
    onWidthChange,
    onHeightChange,
    onWidthLiveChange,
    onHeightLiveChange,
    onAspectLockToggle,
    disabled = false,
    minWidth = 1,
    minHeight = 1,
    maxWidth = 7680,
    maxHeight = 7680,
    step = 1,
    class: className,
  }: LinkedDimensionsProps = $props()
</script>

<div class={cn('grid grid-cols-[1fr_auto_1fr] gap-1 flex-1 min-w-0 items-center', className)}>
  <NumberInput
    value={width}
    onChange={(newWidth) => onWidthChange(newWidth)}
    onLiveChange={(newWidth) => onWidthLiveChange?.(newWidth)}
    label="W"
    unit="px"
    min={minWidth}
    max={maxWidth}
    {step}
    {disabled}
  />

  <Button
    variant="ghost"
    size="icon"
    class={cn('h-7 w-7', aspectLocked && 'text-primary')}
    onclick={onAspectLockToggle}
    {disabled}
    title={aspectLocked
      ? t('editor.layoutSection.unlockAspect')
      : t('editor.layoutSection.lockAspect')}
  >
    {#if aspectLocked}
      <Link2 class="w-3.5 h-3.5" />
    {:else}
      <Link2Off class="w-3.5 h-3.5" />
    {/if}
  </Button>

  <NumberInput
    value={height}
    onChange={(newHeight) => onHeightChange(newHeight)}
    onLiveChange={(newHeight) => onHeightLiveChange?.(newHeight)}
    label="H"
    unit="px"
    min={minHeight}
    max={maxHeight}
    {step}
    {disabled}
  />
</div>
