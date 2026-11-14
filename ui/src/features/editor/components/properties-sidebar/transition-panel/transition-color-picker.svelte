<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import HexColorPicker from '@/shared/ui/property-controls/hex-color-picker.svelte'

  let {
    label,
    initialColor,
    onColorChange,
  }: {
    label: string
    initialColor: string
    onColorChange: (color: string) => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let color = $state(initialColor)
  let isOpen = $state(false)
  let container: HTMLDivElement | null = $state(null)

  $effect.pre(() => {
    color = initialColor
  })

  const handleColorChange = (newColor: string) => {
    color = newColor
    onColorChange(newColor)
  }

  $effect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      // A shadow-root editor retargets the event; the composed path still has the target.
      const target = event.composedPath()[0] ?? event.target
      if (container && !container.contains(target as Node)) {
        isOpen = false
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

<div bind:this={container} class="relative flex-1">
  <button
    type="button"
    aria-label={t('editor.transitionPanel.paramColorAria', { label })}
    onclick={() => (isOpen = !isOpen)}
    class="flex w-full items-center gap-2"
  >
    <div
      class="h-6 w-6 flex-shrink-0 rounded border border-border"
      style:background-color={color}
    ></div>
    <span class="text-xs font-mono uppercase text-muted-foreground">{color}</span>
  </button>

  {#if isOpen}
    <div
      class="absolute left-0 top-8 z-50 rounded-lg border border-border bg-popover p-2 shadow-lg"
    >
      <HexColorPicker {color} onChange={handleColorChange} />
    </div>
  {/if}
</div>
