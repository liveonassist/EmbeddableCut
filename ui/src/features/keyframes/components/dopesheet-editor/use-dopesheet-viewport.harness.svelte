<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Viewport } from './dopesheet-types'
  import { useDopesheetViewport } from './use-dopesheet-viewport.svelte'

  // Test probe: renders the hook's viewport and reports every re-render of it.
  let {
    frameViewport,
    onFrameViewportChange,
    clampToContent,
    onRender,
    onSetup,
  }: {
    frameViewport: Viewport | undefined
    onFrameViewportChange?: (viewport: Viewport) => void
    clampToContent?: boolean
    onRender?: () => void
    onSetup?: (result: ReturnType<typeof useDopesheetViewport>) => void
  } = $props()

  const result = useDopesheetViewport(() => ({
    itemId: 'item-1',
    totalFrames: 120,
    keyframeFrameBounds: null,
    frameViewport,
    onFrameViewportChange,
    clampToContent,
  }))
  // svelte-ignore state_referenced_locally
  onSetup?.(result)

  const text = $derived.by(() => {
    onRender?.()
    return `${result.viewport.startFrame}-${result.viewport.endFrame}`
  })
</script>

<div data-testid="viewport">{text}</div>
