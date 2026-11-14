// SPDX-License-Identifier: MIT

/**
 * Panel chrome sizing for the keyframe graph panel: the container/parent
 * measurements, the user-resizable content height and the drag handle.
 *
 * The panel binds the two measured elements to `container` and `panel`
 * (`bind:this={chrome.container}`); the measurements follow them as the panel
 * opens and closes.
 */

import type { KeyframeEditorSurface } from './keyframe-graph-panel-model'

/** Height of the panel header bar in pixels */
const GRAPH_PANEL_HEADER_HEIGHT = 32

/** Height of the resize handle in pixels */
export const RESIZE_HANDLE_HEIGHT = 6

/** Default ratio of parent height for the graph content area */
const DEFAULT_PARENT_RATIO = 0.6

/** Minimum content height */
export const MIN_CONTENT_HEIGHT = 100

/** Fallback maximum content height when parent size is unknown */
const MAX_CONTENT_HEIGHT_FALLBACK = 500

/** Maximum ratio the panel can occupy of its parent container */
const MAX_PARENT_RATIO = 0.8

interface KeyframeGraphPanelChromeParams {
  isOpen: boolean
  placement: 'bottom' | 'top' | 'side' | undefined
  surface: KeyframeEditorSurface | undefined
}

interface KeyframeGraphPanelChrome {
  container: HTMLDivElement | null
  panel: HTMLDivElement | null
  readonly containerWidth: number
  /** Content height, clamped to the current maximum for the parent size. */
  readonly clampedContentHeight: number
  readonly parentHeight: number
  readonly panelHeaderHeight: number
  readonly isResizing: boolean
  handleResizeStart: (e: MouseEvent) => void
}

export function useKeyframeGraphPanelChrome(
  params: () => KeyframeGraphPanelChromeParams,
): KeyframeGraphPanelChrome {
  // Elements to measure
  let container = $state<HTMLDivElement | null>(null)
  let panel = $state<HTMLDivElement | null>(null)
  let containerWidth = $state(0)
  let parentHeight = $state(0)
  let hasInitialSized = false

  // Track content height (user can resize)
  let contentHeight = $state(MIN_CONTENT_HEIGHT)

  // Edit's classic sheet has no redundant title bar; its timeline toolbar and
  // clip diamond already own panel visibility.
  const surface = $derived(params().surface)
  const placement = $derived(params().placement)
  const isOpen = $derived(params().isOpen)
  const panelHeaderHeight = $derived(surface === 'edit' ? 0 : GRAPH_PANEL_HEADER_HEIGHT)
  const chrome = $derived(panelHeaderHeight + RESIZE_HANDLE_HEIGHT)
  const maxParentRatio = $derived(surface === 'edit' ? 0.65 : MAX_PARENT_RATIO)
  const defaultParentRatio = $derived(surface === 'edit' ? 0.38 : DEFAULT_PARENT_RATIO)
  const maxContentHeight = $derived(
    parentHeight > 0
      ? Math.max(MIN_CONTENT_HEIGHT, Math.floor(parentHeight * maxParentRatio) - chrome)
      : MAX_CONTENT_HEIGHT_FALLBACK,
  )

  // Set default height to 60% of parent on first measurement
  $effect(() => {
    if (parentHeight > 0 && !hasInitialSized) {
      hasInitialSized = true
      const defaultHeight = Math.floor(parentHeight * defaultParentRatio) - chrome
      contentHeight = Math.max(MIN_CONTENT_HEIGHT, Math.min(maxContentHeight, defaultHeight))
    }
  })

  // Resize state
  let isResizing = $state(false)
  let resizeStartY = 0
  let resizeStartHeight = 0

  // Measure container width on mount and resize; re-measure when the panel opens
  $effect(() => {
    void isOpen
    const element = container
    if (!element) return

    const updateWidth = () => {
      containerWidth = element.clientWidth
    }

    // Initial measurement
    updateWidth()

    // Use ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  })

  // Measure parent height so the panel can cap at MAX_PARENT_RATIO
  $effect(() => {
    void isOpen
    const parent = panel?.parentElement
    if (!parent) return

    const update = () => {
      parentHeight = parent.clientHeight
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    return () => observer.disconnect()
  })

  // Handle resize drag
  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing = true
    resizeStartY = e.clientY
    resizeStartHeight = contentHeight
  }

  // Handle resize move and end via document events
  $effect(() => {
    if (!isResizing) return
    const currentPlacement = placement
    const currentMaxContentHeight = maxContentHeight

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY =
        currentPlacement === 'top' ? e.clientY - resizeStartY : resizeStartY - e.clientY
      const newHeight = Math.min(
        currentMaxContentHeight,
        Math.max(MIN_CONTENT_HEIGHT, resizeStartHeight + deltaY),
      )
      contentHeight = newHeight
    }

    const handleMouseUp = () => {
      isResizing = false
      // Note: We intentionally do NOT call onHeightChange during resize
      // The timeline panel should only resize when the graph panel is opened/closed,
      // not when the user drags the resize handle within the existing space
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  })

  // Clamp content height when max shrinks (e.g. parent resized smaller)
  const clampedContentHeight = $derived(Math.min(contentHeight, maxContentHeight))

  return {
    get container() {
      return container
    },
    set container(element) {
      container = element
    },
    get panel() {
      return panel
    },
    set panel(element) {
      panel = element
    },
    get containerWidth() {
      return containerWidth
    },
    get clampedContentHeight() {
      return clampedContentHeight
    },
    get parentHeight() {
      return parentHeight
    },
    get panelHeaderHeight() {
      return panelHeaderHeight
    },
    get isResizing() {
      return isResizing
    },
    handleResizeStart,
  }
}
