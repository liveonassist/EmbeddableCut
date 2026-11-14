<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import HexColorPicker from '@/shared/ui/property-controls/hex-color-picker.svelte'

  /**
   * Isolated color picker on the ported react-colorful picker.
   * Local state for instant preview, commits on mouse release.
   * Uses gizmo store for live canvas preview during drag.
   * Click outside to close.
   */
  let {
    initialColor,
    onColorChange,
  }: {
    initialColor: string
    onColorChange: (color: string) => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let color = $state(initialColor)
  let isOpen = $state(false)
  let container: HTMLDivElement | null = $state(null)

  // Sync local state when initialColor changes from outside (e.g., reset button)
  $effect.pre(() => {
    color = initialColor
  })

  const handleColorChange = (newColor: string) => {
    color = newColor
    // Live preview on canvas
    useGizmoStore.getState().setCanvasBackgroundPreview(newColor)
  }

  const handleCommit = () => {
    // Clear preview and commit to store
    useGizmoStore.getState().clearCanvasBackgroundPreview()
    onColorChange(color)
  }

  const handleClose = () => {
    handleCommit()
    isOpen = false
  }

  // Click outside to close
  $effect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // A shadow-root editor retargets the event; the composed path still has the target.
      const target = e.composedPath()[0] ?? e.target
      if (container && !container.contains(target as Node)) {
        handleClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

<div bind:this={container} class="relative flex-1">
  <button type="button" onclick={() => (isOpen = !isOpen)} class="flex items-center gap-2 w-full">
    <div
      class="w-6 h-6 rounded border border-border flex-shrink-0"
      style:background-color={color}
    ></div>
    <span class="text-xs font-mono text-muted-foreground uppercase">{color}</span>
  </button>

  {#if isOpen}
    <div
      class="absolute top-8 left-0 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg"
    >
      <HexColorPicker {color} onChange={handleColorChange} />
    </div>
  {/if}
</div>
