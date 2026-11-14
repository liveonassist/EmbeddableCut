<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    areMotionDopesheetLanesPropsEqual,
    type MotionDopesheetLanesProps,
  } from '../motion-dopesheet-lanes-equality'
  import { cn } from '@/shared/ui/cn'
  import MotionDopesheetContent from './motion-dopesheet-content.svelte'
  import {
    getEstimatedMotionDopesheetLaneHeight,
    getMotionDopesheetLaneHeight,
  } from './motion-dopesheet-model'

  let props: MotionDopesheetLanesProps = $props()

  // FreeCut memoizes the lanes with `areMotionDopesheetLanesPropsEqual`, so a
  // text-motion edit or a fresh callback doesn't invalidate the dopesheet
  // subtree. Holding the last equal props keeps everything below as still.
  let lastProps: MotionDopesheetLanesProps | null = null
  const stableProps = $derived.by(() => {
    const next = { ...props }
    if (lastProps && areMotionDopesheetLanesPropsEqual(lastProps, next)) return lastProps
    lastProps = next
    return next
  })

  const paneMode = $derived(stableProps.paneMode ?? 'lanes')
  let shell: HTMLDivElement | undefined = $state()
  let isNearScrollViewport = $state(
    (props.paneMode ?? 'lanes') !== 'lanes' || typeof IntersectionObserver === 'undefined',
  )

  $effect(() => {
    const enabled = paneMode === 'lanes'
    if (!enabled) {
      isNearScrollViewport = true
      return
    }
    const node = shell
    if (!node || typeof IntersectionObserver === 'undefined') return
    const motionScrollRoot = node.closest('[data-testid="motion-layer-scroll-area"]')
    let isIntersecting = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        isIntersecting = entry.isIntersecting
        if (!entry.isIntersecting && node.contains(document.activeElement)) return
        isNearScrollViewport = entry.isIntersecting
      },
      {
        root: motionScrollRoot,
        rootMargin: '160px 0px',
      },
    )
    const handleFocusOut = (event: FocusEvent) => {
      if (isIntersecting || node.contains(event.relatedTarget as Node | null)) return
      isNearScrollViewport = false
    }
    observer.observe(node)
    node.addEventListener('focusout', handleFocusOut)
    return () => {
      observer.disconnect()
      node.removeEventListener('focusout', handleFocusOut)
    }
  })

  let expandedGroups = $state.raw<Record<string, boolean>>({})
  const estimatedHeight = $derived(
    getEstimatedMotionDopesheetLaneHeight({
      item: stableProps.item,
      itemKeyframes: stableProps.itemKeyframes,
      properties: stableProps.properties,
      propertyFilter: stableProps.propertyFilter,
      expandedGroups,
    }),
  )
  const heightStructureKey = $derived(
    `${stableProps.propertyFilter}:${stableProps.properties.join('|')}:${estimatedHeight}`,
  )
  let reportedHeight = $state.raw<{ structureKey: string; height: number } | null>(null)
  const renderedHeight = $derived(
    reportedHeight?.structureKey === heightStructureKey ? reportedHeight.height : estimatedHeight,
  )
  function handleRenderedHeightChange(height: number) {
    const current = reportedHeight
    if (current?.structureKey === heightStructureKey && current.height === height) return
    reportedHeight = { structureKey: heightStructureKey, height }
  }
  const shouldRenderContent = $derived(paneMode === 'graph' || isNearScrollViewport)
  const shellHeight = $derived(getMotionDopesheetLaneHeight(paneMode, renderedHeight))
</script>

<div
  bind:this={shell}
  data-testid={`motion-dopesheet-shell-${stableProps.item.id}`}
  data-motion-dopesheet-near-viewport={isNearScrollViewport ? 'true' : 'false'}
  class={cn('w-full bg-background/35', paneMode === 'graph' && 'h-full')}
  style:height={shellHeight === undefined ? undefined : `${shellHeight}px`}
>
  {#if shouldRenderContent}
    <MotionDopesheetContent
      {...stableProps}
      initialExpandedGroups={expandedGroups}
      onExpandedGroupsChange={(groups) => (expandedGroups = groups)}
      onRenderedHeightChange={handleRenderedHeightChange}
    />
  {/if}
</div>
