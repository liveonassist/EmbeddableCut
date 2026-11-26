<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Carry the current color's alpha onto a freshly-sampled opaque `#rrggbb` (from
   * the eyedropper) so picking a hue doesn't silently reset transparency.
   */
  function withPreservedAlpha(pickedHex: string, current: string): string {
    const digits = current.startsWith('#') ? current.slice(1) : ''
    if (digits.length === 8) return pickedHex + digits.slice(6)
    if (digits.length === 4) {
      const a = digits.slice(3) // single alpha nibble → expand to a byte
      return pickedHex + a + a
    }
    return pickedHex
  }

  interface ColorPickerProps {
    /** Current color value (hex or oklch format) */
    color: string
    /** Called when color is committed (picker closed) */
    onChange: (color: string) => void
    /** Called during drag for live preview */
    onLiveChange?: (color: string) => void
    /** Optional reset handler */
    onReset?: () => void
    /** Default color for reset comparison */
    defaultColor?: string
    /** Disable the picker */
    disabled?: boolean
    /** Preset color swatches to show */
    presets?: string[]
    /** Label for PropertyRow wrapper (omit for inline mode) */
    label?: string
    /** Enable an alpha channel (4-/8-digit hex + alpha slider in the picker) */
    allowAlpha?: boolean
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import Pipette from '@lucide/svelte/icons/pipette'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import AppEyedropperOverlay from './app-eyedropper.svelte'
  import HexColorPicker from './hex-color-picker.svelte'
  import HexInput from './hex-input.svelte'
  import PropertyRow from './property-row.svelte'

  /**
   * Unified color picker component.
   * - Supports live preview during drag via onLiveChange
   * - Supports preset color swatches
   * - Supports reset to default
   * - Can be used inline (no label) or wrapped in PropertyRow (with label)
   */
  let {
    color,
    onChange,
    onLiveChange,
    onReset,
    defaultColor,
    disabled,
    presets,
    label,
    allowAlpha,
  }: ColorPickerProps = $props()

  let localColor = $state(untrack(() => color))
  let isOpen = $state(false)
  let picking = $state(false)
  let container = $state<HTMLDivElement | null>(null)

  // Sync local state when color prop changes
  $effect(() => {
    localColor = color
  })

  const handleColorChange = (newColor: string) => {
    localColor = newColor
    onLiveChange?.(newColor)
  }

  const handleCommit = () => {
    onChange(localColor)
  }

  // Commit a specific value (from the hex field) and keep local state in sync.
  const commitColor = (newColor: string) => {
    localColor = newColor
    onChange(newColor)
  }

  const handleClose = () => {
    handleCommit()
    isOpen = false
  }

  const handlePresetClick = (preset: string) => {
    localColor = preset
    onChange(preset)
  }

  const handleEyeDropper = () => {
    isOpen = false
    picking = true
  }

  const handlePicked = (picked: string | null) => {
    picking = false
    if (!picked) return
    commitColor(allowAlpha ? withPreservedAlpha(picked, localColor) : picked)
  }

  // Click outside to close
  $effect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // composedPath reaches into the editor's shadow root, where e.target is retargeted.
      if (container && !e.composedPath().includes(container)) {
        handleClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

{#snippet pickerContent()}
  <div bind:this={container} class="relative flex items-center gap-1 w-full">
    <button
      type="button"
      onclick={() => !disabled && (isOpen = !isOpen)}
      class="flex-shrink-0 {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
      {disabled}
      title="Open color picker"
    >
      <div class="w-6 h-6 rounded border border-border" style:background-color={localColor}></div>
    </button>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-6 w-6 flex-shrink-0"
      onclick={handleEyeDropper}
      {disabled}
      title="Pick a color from anywhere in the app"
    >
      <Pipette class="w-3.5 h-3.5" />
    </Button>
    <label
      class="flex min-w-0 flex-1 items-center gap-0.5 rounded px-1 py-0.5 text-xs font-mono uppercase hover:bg-muted/40 focus-within:bg-muted/60 focus-within:ring-1 focus-within:ring-ring {disabled
        ? 'opacity-50 cursor-not-allowed'
        : ''}"
    >
      <span class="text-muted-foreground select-none">#</span>
      <HexInput
        color={localColor}
        onLiveChange={handleColorChange}
        onCommit={commitColor}
        {allowAlpha}
        {disabled}
        class="min-w-0 flex-1 bg-transparent uppercase text-foreground outline-none"
      />
    </label>

    {#if onReset && defaultColor && color !== defaultColor && !disabled}
      <Button variant="ghost" size="icon" class="h-7 w-7 flex-shrink-0" onclick={onReset} title="Reset">
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    {/if}

    {#if isOpen && !disabled}
      <div class="absolute top-8 left-0 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg">
        <!-- Preset color swatches -->
        {#if presets && presets.length > 0}
          <div class="flex gap-1 mb-2">
            {#each presets as preset (preset)}
              <button
                type="button"
                onclick={() => handlePresetClick(preset)}
                class="w-6 h-6 rounded border border-border hover:ring-1 hover:ring-ring transition-[transform,box-shadow] duration-150 active:scale-90"
                style:background-color={preset}
                title={preset}
              ></button>
            {/each}
          </div>
        {/if}
        <!-- Full color picker -->
        <HexColorPicker color={localColor} onChange={handleColorChange} alpha={allowAlpha} />
        <!-- Editable hex field -->
        <label
          class="mt-2 flex items-center gap-0.5 bg-input border border-border rounded px-2 py-1 text-xs font-mono uppercase focus-within:ring-1 focus-within:ring-ring"
        >
          <span class="text-muted-foreground select-none">#</span>
          <HexInput
            color={localColor}
            onLiveChange={handleColorChange}
            onCommit={commitColor}
            {allowAlpha}
            class="min-w-0 flex-1 bg-transparent uppercase text-foreground outline-none"
          />
        </label>
      </div>
    {/if}

    {#if picking}
      <AppEyedropperOverlay onResolve={handlePicked} />
    {/if}
  </div>
{/snippet}

<!-- If label provided, wrap in PropertyRow; otherwise render inline -->
{#if label}
  <PropertyRow {label}>{@render pickerContent()}</PropertyRow>
{:else}
  {@render pickerContent()}
{/if}
