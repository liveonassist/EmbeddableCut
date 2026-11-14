<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { untrack } from 'svelte'
  import type { EditTwoUpPanelData } from './types'
  import { getItemAspectRatio } from '../edit-panel-media-utils'
  import { useEditOverlayPanelPrewarm } from '../use-edit-overlay-panel-prewarm.svelte'
  import FramePanel from './frame-panel.svelte'

  const TEXT_SPACE = 56

  const GAP = 8

  interface EditTwoUpPanelsProps {
    leftPanel: EditTwoUpPanelData
    rightPanel: EditTwoUpPanelData
  }
</script>

<script lang="ts">
  let { leftPanel, rightPanel }: EditTwoUpPanelsProps = $props()
  const containerRef: { current: HTMLDivElement | null } = { current: null }
  let containerSize = $state.raw({ width: 0, height: 0 })
  const setContainerSize = (next: typeof containerSize | ((prev: typeof containerSize) => typeof containerSize)) => {
    containerSize = typeof next === 'function' ? (next as (prev: typeof containerSize) => typeof containerSize)(untrack(() => containerSize)) : next
  }
  useEditOverlayPanelPrewarm(() => [leftPanel, rightPanel])

  $effect(() => untrack(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setContainerSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    })

    ro.observe(el)
    return () => ro.disconnect()
  }))

  const panelWidth = $derived(Math.max((containerSize.width - GAP) / 2, 1))
  const maxAreaHeight = $derived(containerSize.height - TEXT_SPACE)

  const leftNatural = $derived(panelWidth / getItemAspectRatio(leftPanel.item))
  const rightNatural = $derived(panelWidth / getItemAspectRatio(rightPanel.item))
  const sharedAreaHeight = $derived(Math.max(1, Math.min(Math.max(leftNatural, rightNatural), maxAreaHeight)))
</script>

<div
  bind:this={containerRef.current}
  class="absolute inset-0 z-30 bg-black flex items-center"
  style:gap="{GAP}px"
>
  <FramePanel
    item={leftPanel.item}
    sourceTime={leftPanel.sourceTime}
    sourceFrame={leftPanel.sourceFrame}
    timecode={leftPanel.timecode}
    label={leftPanel.label}
    areaHeight={sharedAreaHeight}
    panelWidth={panelWidth}
    placeholderText={leftPanel.placeholderText}
   />
  <FramePanel
    item={rightPanel.item}
    sourceTime={rightPanel.sourceTime}
    sourceFrame={rightPanel.sourceFrame}
    timecode={rightPanel.timecode}
    label={rightPanel.label}
    areaHeight={sharedAreaHeight}
    panelWidth={panelWidth}
    placeholderText={rightPanel.placeholderText}
   />
</div>
