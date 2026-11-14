<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { EditTwoUpPanelData } from '../edit-2up-panels'


  const TEXT_SPACE = 56

  const GAP = 8

  const CORNER_SCALE = 0.22

  interface EditFourUpPanelsProps {
    leftPanel: EditTwoUpPanelData
    rightPanel: EditTwoUpPanelData
    topLeftCorner?: EditTwoUpPanelData
    topRightCorner?: EditTwoUpPanelData
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { useEditOverlayPanelPrewarm } from '../use-edit-overlay-panel-prewarm.svelte'
  import { getItemAspectRatio } from '../edit-panel-media-utils'
  import MainPanel from './main-panel.svelte'
  import CornerThumbnail from './corner-thumbnail.svelte'
  let { leftPanel, rightPanel, topLeftCorner, topRightCorner }: EditFourUpPanelsProps = $props()
  const containerRef: { current: HTMLDivElement | null } = { current: null }
  let containerSize = $state.raw({ width: 0, height: 0 })
  const setContainerSize = (next: typeof containerSize | ((prev: typeof containerSize) => typeof containerSize)) => {
    containerSize = typeof next === 'function' ? (next as (prev: typeof containerSize) => typeof containerSize)(untrack(() => containerSize)) : next
  }
  useEditOverlayPanelPrewarm(() => [
    leftPanel,
    rightPanel,
    topLeftCorner ?? { item: null },
    topRightCorner ?? { item: null },
  ])

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

  // Corner thumbnail sizing
  const cornerWidth = $derived(Math.max(panelWidth * CORNER_SCALE, 1))
  const cornerHeight = $derived(Math.max(cornerWidth / (16 / 9), 1))
  const hasSize = $derived(containerSize.width > 0 && containerSize.height > 0)
</script>

<!-- One element for both states: the resize observer stays on it, as React reused the node. -->
<div
  bind:this={containerRef.current}
  class={hasSize ? 'absolute inset-0 z-30 bg-preview-letterbox flex items-center' : 'absolute inset-0 z-30 bg-preview-letterbox'}
  style:gap={hasSize ? `${GAP}px` : undefined}
>
  {#if hasSize}
    <!-- Corner thumbnails - absolutely positioned -->
    {#if topLeftCorner?.item}
      <CornerThumbnail
        item={topLeftCorner.item}
        sourceTime={topLeftCorner.sourceTime}
        sourceFrame={topLeftCorner.sourceFrame}
        width={cornerWidth}
        height={cornerHeight}
        position="top-left"
       />
    {/if}
    {#if topRightCorner?.item}
      <CornerThumbnail
        item={topRightCorner.item}
        sourceTime={topRightCorner.sourceTime}
        sourceFrame={topRightCorner.sourceFrame}
        width={cornerWidth}
        height={cornerHeight}
        position="top-right"
       />
    {/if}
    <!-- Main panels -->
    <MainPanel
      data={leftPanel}
      areaHeight={sharedAreaHeight}
      panelWidth={panelWidth}
     />
    <MainPanel
      data={rightPanel}
      areaHeight={sharedAreaHeight}
      panelWidth={panelWidth}
     />
    {/if}
</div>
