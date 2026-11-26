<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function isDifferentSliderValue(previousValue: number | null, nextValue: number): boolean {
    return previousValue === null || Math.abs(previousValue - nextValue) > 0.000001
  }

  function isSameZoomLevel(left: number, right: number): boolean {
    const tolerance = Math.max(0.000001, Math.max(Math.abs(left), Math.abs(right)) * 0.0001)
    return Math.abs(left - right) <= tolerance
  }

  function blurSliderFocus(root: HTMLElement | null): void {
    const activeElement = (root?.getRootNode() as Document | ShadowRoot | undefined)
      ?.activeElement
    if (activeElement instanceof HTMLElement && root?.contains(activeElement)) {
      activeElement.blur()
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Slider } from '@/components/ui/slider'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { ZOOM_MIN, ZOOM_MAX } from '@/features/timeline/constants'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import type { TimelineHeaderProps } from './timeline-header-types'

  let { onZoomChange, onZoomIn, onZoomOut, onZoomToFit }: TimelineHeaderProps = $props()

  const settledZoomLevel = select(useZoomStore, (state) => state.contentLevel)
  let slider = $state<HTMLElement | null>(null)
  let sliderRaf: number | null = null
  let pendingSliderValue: number | null = null
  let latestSliderValue: number | null = null
  let sliderInteraction: 'idle' | 'dragging' | 'awaiting-zoom' = 'idle'
  let sliderCommitBaseZoom: number | null = null
  let sliderKeyboardInput = false
  let sliderZoomGestureHeld = false
  let liveZoomLevel = useZoomStore.getState().level
  let keyboardSliderRevision = $state(0)
  const btnStyle = `width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`

  function applyZoom(newZoom: number, synchronizeContent = false) {
    const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
    if (onZoomChange) {
      onZoomChange(clampedZoom)
    } else if (synchronizeContent) {
      useZoomStore.getState().setZoomLevelSynchronized(clampedZoom)
    } else {
      useZoomStore.getState().setZoomLevelImmediate(clampedZoom)
    }
  }

  const sliderToZoom = (sliderValue: number) =>
    ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, sliderValue)

  const zoomToSlider = (zoom: number) => Math.log(zoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)

  function renderSliderPreview(sliderValue: number) {
    const root = slider
    const thumb = root?.querySelector<HTMLElement>('[role="slider"]')
    // Radix wraps the thumb in a positioned span; bits-ui positions the thumb
    // itself, with the same containment offset.
    const thumbPositioner = thumb?.parentElement === root ? thumb : thumb?.parentElement
    const track = root?.firstElementChild as HTMLElement | null
    const range = track?.firstElementChild as HTMLElement | null
    if (!thumb || !thumbPositioner || !range) return

    const value = Math.max(0, Math.min(1, sliderValue))
    const percentage = value * 100
    const thumbOffset = 8 - value * 16
    thumbPositioner.style.left = `calc(${percentage}% + ${thumbOffset}px)`
    range.style.left = '0%'
    range.style.right = `${100 - percentage}%`
    thumb.setAttribute('aria-valuenow', String(value))
  }

  function releaseSliderZoomGesture() {
    if (!sliderZoomGestureHeld) {
      return
    }
    sliderZoomGestureHeld = false
    useZoomStore.getState().endZoomGesture()
  }

  function finishSliderZoomInteraction() {
    releaseSliderZoomGesture()
    // The slider can restore thumb focus after onValueCommit returns. Defer the
    // blur until the pointer/key event has fully finished so Space immediately
    // returns to the editor transport.
    queueMicrotask(() => blurSliderFocus(slider))
  }

  function beginSliderZoomGesture() {
    if (sliderZoomGestureHeld) {
      return
    }
    sliderZoomGestureHeld = true
    useZoomStore.getState().beginZoomGesture()
  }

  function flushSliderChange() {
    sliderRaf = null
    const sliderValue = pendingSliderValue
    pendingSliderValue = null
    if (sliderValue === null) return
    applyZoom(sliderToZoom(sliderValue))
  }

  // Runs after each settled-zoom render, as FreeCut's layout effect.
  $effect(() => {
    void settledZoomLevel.current
    untrack(() => {
      const nextLiveZoomLevel = useZoomStore.getState().level
      liveZoomLevel = nextLiveZoomLevel
      const sliderPreviewValue = latestSliderValue
      if (sliderPreviewValue !== null && sliderInteraction !== 'dragging') {
        const commitBaseZoom = sliderCommitBaseZoom
        if (commitBaseZoom === null || !isSameZoomLevel(nextLiveZoomLevel, commitBaseZoom)) {
          // The first store update after release owns the controlled value even when
          // another zoom gesture superseded the slider's queued target.
          latestSliderValue = null
          sliderCommitBaseZoom = null
          sliderInteraction = 'idle'
        }
      }

      if (sliderInteraction !== 'dragging') {
        const previewValue = latestSliderValue
        renderSliderPreview(previewValue ?? zoomToSlider(nextLiveZoomLevel))
      }
    })
  })

  $effect(() => {
    return useZoomStore.subscribe((state) => {
      const nextZoomLevel = state.level
      if (isSameZoomLevel(nextZoomLevel, liveZoomLevel)) return
      liveZoomLevel = nextZoomLevel
      if (sliderInteraction === 'dragging') return

      const commitBaseZoom = sliderCommitBaseZoom
      if (
        sliderInteraction === 'awaiting-zoom' &&
        commitBaseZoom !== null &&
        !isSameZoomLevel(nextZoomLevel, commitBaseZoom)
      ) {
        latestSliderValue = null
        sliderCommitBaseZoom = null
        sliderInteraction = 'idle'
      }

      renderSliderPreview(zoomToSlider(nextZoomLevel))
    })
  })

  $effect(() => {
    window.addEventListener('pointerup', finishSliderZoomInteraction)
    window.addEventListener('pointercancel', finishSliderZoomInteraction)

    return () => {
      window.removeEventListener('pointerup', finishSliderZoomInteraction)
      window.removeEventListener('pointercancel', finishSliderZoomInteraction)
      if (sliderRaf !== null) {
        cancelAnimationFrame(sliderRaf)
      }
      releaseSliderZoomGesture()
    }
  })

  function handleSliderChange(values: number[]) {
    const sliderValue = values[0] ?? 0.5
    sliderInteraction = 'dragging'
    sliderCommitBaseZoom = null
    latestSliderValue = sliderValue
    renderSliderPreview(sliderValue)
    if (sliderKeyboardInput) {
      // The slider derives the next arrow-key step from its controlled value. Keep
      // that value current for keyboard input even though wheel zoom remains
      // on the imperative DOM path until content zoom settles.
      keyboardSliderRevision++
      if (onZoomChange) {
        applyZoom(sliderToZoom(sliderValue))
        return
      }
      if (sliderRaf !== null) {
        cancelAnimationFrame(sliderRaf)
        sliderRaf = null
      }
      pendingSliderValue = null
      applyZoom(sliderToZoom(sliderValue), true)
      return
    }
    if (onZoomChange) {
      applyZoom(sliderToZoom(sliderValue))
      return
    }

    pendingSliderValue = sliderValue
    if (sliderRaf === null) {
      sliderRaf = requestAnimationFrame(flushSliderChange)
    }
  }

  function commitSliderZoom(sliderValue: number, previousSliderValue: number | null) {
    if (onZoomChange) {
      if (isDifferentSliderValue(previousSliderValue, sliderValue)) {
        applyZoom(sliderToZoom(sliderValue))
      }
      return
    }

    if (pendingSliderValue === null && isDifferentSliderValue(previousSliderValue, sliderValue)) {
      pendingSliderValue = sliderValue
    }
    if (sliderRaf !== null) {
      cancelAnimationFrame(sliderRaf)
      sliderRaf = null
    }
    flushSliderChange()
  }

  function handleSliderCommit(values: number[]) {
    const sliderValue = values[0] ?? 0.5
    const previousSliderValue = latestSliderValue
    sliderInteraction = 'awaiting-zoom'
    sliderCommitBaseZoom = useZoomStore.getState().level
    latestSliderValue = sliderValue
    renderSliderPreview(sliderValue)
    commitSliderZoom(sliderValue, previousSliderValue)
    if (sliderKeyboardInput) {
      releaseSliderZoomGesture()
    } else {
      finishSliderZoomInteraction()
    }
  }

  // The controlled value re-renders only on settled zoom and keyboard steps;
  // the preview fields are read as of that render, as in FreeCut.
  const sliderValue = $derived.by(() => {
    void keyboardSliderRevision
    const controlledSliderValue = zoomToSlider(settledZoomLevel.current)
    return untrack(() => {
      const commitBaseZoom = sliderCommitBaseZoom
      const shouldRenderSliderPreview =
        latestSliderValue !== null &&
        (sliderInteraction === 'dragging' ||
          (sliderInteraction === 'awaiting-zoom' &&
            commitBaseZoom !== null &&
            isSameZoomLevel(liveZoomLevel, commitBaseZoom)))
      return [
        shouldRenderSliderPreview
          ? (latestSliderValue ?? controlledSliderValue)
          : controlledSliderValue,
      ]
    })
  })
</script>

<div class="flex items-center justify-end gap-1.5">
  <Button
    variant="ghost"
    size="icon"
    style={btnStyle}
    onclick={onZoomOut ?? useZoomStore.getState().zoomOut}
    aria-label={t('timeline.header.zoomOut')}
    data-tooltip={t('timeline.header.zoomOutTooltip')}
  >
    <ZoomOut class="w-3.5 h-3.5" />
  </Button>

  <Slider
    bind:ref={slider}
    value={sliderValue}
    onValueChange={handleSliderChange}
    onValueCommit={handleSliderCommit}
    onpointerdowncapture={beginSliderZoomGesture}
    onpointercancelcapture={finishSliderZoomInteraction}
    onkeydowncapture={() => {
      sliderKeyboardInput = true
    }}
    onkeyupcapture={() => {
      // Keep the keyboard marker set through the slider's onValueCommit, which
      // may run later in this keyup event. The next microtask ends the input.
      queueMicrotask(() => {
        sliderKeyboardInput = false
      })
    }}
    onfocusoutcapture={() => {
      sliderKeyboardInput = false
    }}
    min={0}
    max={1}
    step={0.005}
    class="w-24"
    aria-label={t('timeline.header.zoomSlider')}
  />

  <Button
    variant="ghost"
    size="icon"
    style={btnStyle}
    onclick={onZoomIn ?? useZoomStore.getState().zoomIn}
    aria-label={t('timeline.header.zoomIn')}
    data-tooltip={t('timeline.header.zoomInTooltip')}
  >
    <ZoomIn class="w-3.5 h-3.5" />
  </Button>

  <Button
    variant="ghost"
    size="icon"
    style={btnStyle}
    onclick={onZoomToFit}
    aria-label={t('timeline.header.zoomToFit')}
    data-tooltip={t('timeline.header.zoomToFitTooltip')}
  >
    <Maximize2 class="w-3.5 h-3.5" />
  </Button>
</div>
