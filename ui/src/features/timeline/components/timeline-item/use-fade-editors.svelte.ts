// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import {
  clearMixerLiveGain,
  getMixerLiveGain,
  setMixerLiveGains,
} from '@/shared/state/mixer-live-gain'
import {
  getAudioFadeRatio,
  getAudioFadeSecondsFromOffset,
  type AudioFadeHandle,
} from '@/features/timeline/utils/audio-fade'
import { getAudioFadeCurveFromOffset } from '@/features/timeline/utils/audio-fade-curve'
import {
  getAudioVisualizationScale,
  getAudioVolumeDbFromDragDelta,
  getAudioVolumeLineY,
} from '@/features/timeline/utils/audio-volume'
import { supportsVisualFadeControls } from './visual-fade-items'

const VIDEO_FADE_EPSILON = 0.0001
const AUDIO_FADE_EPSILON = 0.0001
const AUDIO_VOLUME_EPSILON = 0.05
const AUDIO_ENVELOPE_VIEWBOX_HEIGHT = 100
const AUDIO_VOLUME_DRAG_ACTIVATION_DELAY_MS = 120
const AUDIO_VOLUME_DRAG_ACTIVATION_DISTANCE_PX = 4

export interface VideoFadeEditState {
  handle: AudioFadeHandle
  previewFadeIn: number
  previewFadeOut: number
  originalFadeIn: number
  originalFadeOut: number
  isCommitting: boolean
}

export interface AudioFadeEditState {
  handle: AudioFadeHandle
  previewFadeIn: number
  previewFadeOut: number
  originalFadeIn: number
  originalFadeOut: number
  isCommitting: boolean
}

export interface AudioFadeCurveEditState {
  handle: AudioFadeHandle
  previewFadeInCurve: number
  previewFadeOutCurve: number
  previewFadeInCurveX: number
  previewFadeOutCurveX: number
  originalFadeInCurve: number
  originalFadeOutCurve: number
  originalFadeInCurveX: number
  originalFadeOutCurveX: number
  isCommitting: boolean
}

export interface AudioVolumeEditState {
  originalVolume: number
  isCommitting: boolean
}

interface UseFadeEditorsParams {
  item: TimelineItemType
  fps: number
  activeTool: string
  trackLocked: boolean
  isAnyDragActiveRef: { current: boolean }
  transform: HTMLDivElement | null
  updateTimelineItem: (id: string, patch: Partial<TimelineItemType>) => void
}

export interface FadeEditorsHandle {
  /** Attached by `FadeEnvelopeOverlay` (`bind:this={videoControlsRef.current}`). */
  videoControlsRef: { current: HTMLDivElement | null }
  audioControlsRef: { current: HTMLDivElement | null }
  volumeLineRef: { current: HTMLDivElement | null }
  /** The live volume readout's `<span>`, written directly during a volume drag. */
  audioVolumeEditLabelRef: { current: HTMLElement | null }

  readonly isVisualFadeItem: boolean
  readonly videoFadeEdit: VideoFadeEditState | null
  readonly audioFadeEdit: AudioFadeEditState | null
  readonly audioFadeCurveEdit: AudioFadeCurveEditState | null
  readonly audioVolumeEdit: AudioVolumeEditState | null

  readonly displayedVideoFadeIn: number
  readonly displayedVideoFadeOut: number
  readonly displayedAudioFadeIn: number
  readonly displayedAudioFadeOut: number
  readonly displayedAudioFadeInCurve: number
  readonly displayedAudioFadeOutCurve: number
  readonly displayedAudioFadeInCurveX: number
  readonly displayedAudioFadeOutCurveX: number
  readonly displayedAudioVolumeDb: number

  audioVolumePreviewRef: { current: number }

  handleVideoFadeHandleMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
  handleVideoFadeHandleDoubleClick: (handle: AudioFadeHandle) => void
  handleAudioFadeHandleMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
  handleAudioFadeHandleDoubleClick: (handle: AudioFadeHandle) => void
  handleAudioFadeCurveDotMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
  handleAudioFadeCurveDotDoubleClick: (handle: AudioFadeHandle) => void
  handleAudioVolumeMouseDown: (e: MouseEvent) => void
  handleAudioVolumeDoubleClick: () => void
}

export function useFadeEditors(params: () => UseFadeEditorsParams): FadeEditorsHandle {
  const item = $derived(params().item)
  const fps = $derived(params().fps)
  const activeTool = $derived(params().activeTool)
  const trackLocked = $derived(params().trackLocked)
  const transform = $derived(params().transform)
  const itemType = $derived(item.type)
  const itemVolume = $derived(item.volume)

  const isVisualFadeItem = $derived(supportsVisualFadeControls(item))

  let videoFadeEdit = $state.raw<VideoFadeEditState | null>(null)
  let videoFadeCleanup: (() => void) | null = null

  let audioFadeEdit = $state.raw<AudioFadeEditState | null>(null)
  let audioFadeCleanup: (() => void) | null = null

  let audioFadeCurveEdit = $state.raw<AudioFadeCurveEditState | null>(null)
  let audioFadeCurveCleanup: (() => void) | null = null

  let audioVolumeEdit = $state.raw<AudioVolumeEditState | null>(null)
  let audioVolumeCleanup: (() => void) | null = null
  const initialItem = params().item
  const audioVolumePreviewRef = {
    current: initialItem.type === 'audio' ? (initialItem.volume ?? 0) : 0,
  }
  const audioVolumeEditLabelRef: { current: HTMLElement | null } = { current: null }

  const videoControlsRef: { current: HTMLDivElement | null } = { current: null }
  // Reactive: the line-snapping effect starts once the overlay attaches it.
  let audioControls = $state.raw<HTMLDivElement | null>(null)
  const audioControlsRef = {
    get current() {
      return audioControls
    },
    set current(element: HTMLDivElement | null) {
      audioControls = element
    },
  }
  const volumeLineRef: { current: HTMLDivElement | null } = { current: null }

  $effect(() => () => {
    videoFadeCleanup?.()
    audioFadeCleanup?.()
    audioFadeCurveCleanup?.()
    audioVolumeCleanup?.()
  })

  const displayedVideoFadeIn = $derived(
    isVisualFadeItem ? (videoFadeEdit?.previewFadeIn ?? item.fadeIn ?? 0) : 0,
  )
  const displayedVideoFadeOut = $derived(
    isVisualFadeItem ? (videoFadeEdit?.previewFadeOut ?? item.fadeOut ?? 0) : 0,
  )
  const displayedAudioFadeIn = $derived(
    item.type === 'audio' ? (audioFadeEdit?.previewFadeIn ?? item.audioFadeIn ?? 0) : 0,
  )
  const displayedAudioFadeOut = $derived(
    item.type === 'audio' ? (audioFadeEdit?.previewFadeOut ?? item.audioFadeOut ?? 0) : 0,
  )
  const displayedAudioFadeInCurve = $derived(
    item.type === 'audio'
      ? (audioFadeCurveEdit?.previewFadeInCurve ?? item.audioFadeInCurve ?? 0)
      : 0,
  )
  const displayedAudioFadeOutCurve = $derived(
    item.type === 'audio'
      ? (audioFadeCurveEdit?.previewFadeOutCurve ?? item.audioFadeOutCurve ?? 0)
      : 0,
  )
  const displayedAudioFadeInCurveX = $derived(
    item.type === 'audio'
      ? (audioFadeCurveEdit?.previewFadeInCurveX ?? item.audioFadeInCurveX ?? 0.52)
      : 0.52,
  )
  const displayedAudioFadeOutCurveX = $derived(
    item.type === 'audio'
      ? (audioFadeCurveEdit?.previewFadeOutCurveX ?? item.audioFadeOutCurveX ?? 0.52)
      : 0.52,
  )
  const displayedAudioVolumeDb = $derived(item.type === 'audio' ? (item.volume ?? 0) : 0)

  const audioVolumeLineY = $derived(
    itemType === 'audio'
      ? getAudioVolumeLineY(displayedAudioVolumeDb, AUDIO_ENVELOPE_VIEWBOX_HEIGHT)
      : AUDIO_ENVELOPE_VIEWBOX_HEIGHT / 2,
  )

  function snapVolumeLineTop(ratio: number) {
    const line = volumeLineRef.current
    const container = audioControls
    if (!line || !container) return
    const rect = container.getBoundingClientRect()
    if (rect.height <= 0) return
    const docY = rect.top + rect.height * ratio
    line.style.top = `${Math.round(docY) - rect.top}px`
  }

  function applyAudioVolumeVisualPreview(previewVolumeDb: number) {
    audioVolumePreviewRef.current = previewVolumeDb

    const transformElement = transform
    if (transformElement) {
      transformElement.style.setProperty(
        '--timeline-audio-volume-line-y',
        `${(getAudioVolumeLineY(previewVolumeDb, AUDIO_ENVELOPE_VIEWBOX_HEIGHT) / AUDIO_ENVELOPE_VIEWBOX_HEIGHT) * 100}%`,
      )
      transformElement.style.setProperty(
        '--timeline-audio-waveform-scale',
        String(getAudioVisualizationScale(previewVolumeDb)),
      )
    }

    snapVolumeLineTop(
      getAudioVolumeLineY(previewVolumeDb, AUDIO_ENVELOPE_VIEWBOX_HEIGHT) /
        AUDIO_ENVELOPE_VIEWBOX_HEIGHT,
    )

    if (audioVolumeEditLabelRef.current) {
      audioVolumeEditLabelRef.current.textContent = `Volume ${previewVolumeDb >= 0 ? '+' : ''}${previewVolumeDb.toFixed(1)} dB`
    }
  }

  $effect(() => {
    void [audioVolumeEdit, itemType, itemVolume, transform]
    untrack(() => {
      if (itemType !== 'audio' || audioVolumeEdit !== null) {
        return
      }
      applyAudioVolumeVisualPreview(itemVolume ?? 0)
    })
  })

  // Runs post-paint (not $effect.pre): the line is already correctly placed
  // by its `top: var(--timeline-audio-volume-line-y)` CSS, so this only refines
  // it to a crisp whole pixel. Keeping the getBoundingClientRect read out of the
  // render phase avoids a forced reflow per audio clip when many mount at once
  // (e.g. zooming out brings a batch into view).
  $effect(() => {
    void [itemType, audioVolumeLineY, audioControls]
    return untrack(() => {
      if (itemType !== 'audio') return
      const container = audioControls
      if (!container) return
      const ratio = audioVolumeLineY / AUDIO_ENVELOPE_VIEWBOX_HEIGHT
      snapVolumeLineTop(ratio)
      const ro = new ResizeObserver(() => snapVolumeLineTop(ratio))
      ro.observe(container)
      return () => ro.disconnect()
    })
  })

  function finalizeAudioVolumeChange(
    nextVolume: number,
    options?: {
      preserveLiveGainOnCommit?: boolean
      commitFromActiveEdit?: boolean
    },
  ) {
    const currentItem = item
    if (currentItem.type !== 'audio') {
      return
    }

    const currentVolume = currentItem.volume ?? 0
    const didChange = Math.abs(currentVolume - nextVolume) > AUDIO_VOLUME_EPSILON

    applyAudioVolumeVisualPreview(nextVolume)

    if (!didChange || !options?.preserveLiveGainOnCommit) {
      clearMixerLiveGain(currentItem.id)
    }

    if (!didChange) {
      audioVolumeEdit = null
      return
    }

    if (options?.commitFromActiveEdit) {
      audioVolumeEdit = audioVolumeEdit ? { ...audioVolumeEdit, isCommitting: true } : null
    } else {
      audioVolumeEdit = null
    }

    params().updateTimelineItem(currentItem.id, { volume: nextVolume })
  }

  // Auto-clear isCommitting once the persisted value matches the preview.
  $effect(() => {
    if (!videoFadeEdit?.isCommitting || !isVisualFadeItem) {
      return
    }
    const committedFade = videoFadeEdit.handle === 'in' ? (item.fadeIn ?? 0) : (item.fadeOut ?? 0)
    const previewFade =
      videoFadeEdit.handle === 'in' ? videoFadeEdit.previewFadeIn : videoFadeEdit.previewFadeOut
    if (Math.abs(committedFade - previewFade) <= VIDEO_FADE_EPSILON) {
      videoFadeEdit = null
    }
  })

  $effect(() => {
    if (!audioFadeEdit?.isCommitting || item.type !== 'audio') {
      return
    }
    const committedFade =
      audioFadeEdit.handle === 'in' ? (item.audioFadeIn ?? 0) : (item.audioFadeOut ?? 0)
    const previewFade =
      audioFadeEdit.handle === 'in' ? audioFadeEdit.previewFadeIn : audioFadeEdit.previewFadeOut
    if (Math.abs(committedFade - previewFade) <= AUDIO_FADE_EPSILON) {
      audioFadeEdit = null
    }
  })

  $effect(() => {
    if (!audioVolumeEdit?.isCommitting || item.type !== 'audio') {
      return
    }
    if (Math.abs((item.volume ?? 0) - audioVolumePreviewRef.current) <= AUDIO_VOLUME_EPSILON) {
      audioVolumeEdit = null
    }
  })

  $effect(() => {
    if (!audioFadeCurveEdit?.isCommitting || item.type !== 'audio') {
      return
    }
    const committedCurve =
      audioFadeCurveEdit.handle === 'in'
        ? (item.audioFadeInCurve ?? 0)
        : (item.audioFadeOutCurve ?? 0)
    const previewCurve =
      audioFadeCurveEdit.handle === 'in'
        ? audioFadeCurveEdit.previewFadeInCurve
        : audioFadeCurveEdit.previewFadeOutCurve
    const committedCurveX =
      audioFadeCurveEdit.handle === 'in'
        ? (item.audioFadeInCurveX ?? 0.52)
        : (item.audioFadeOutCurveX ?? 0.52)
    const previewCurveX =
      audioFadeCurveEdit.handle === 'in'
        ? audioFadeCurveEdit.previewFadeInCurveX
        : audioFadeCurveEdit.previewFadeOutCurveX
    if (
      Math.abs(committedCurve - previewCurve) <= AUDIO_FADE_EPSILON &&
      Math.abs(committedCurveX - previewCurveX) <= AUDIO_FADE_EPSILON
    ) {
      audioFadeCurveEdit = null
    }
  })

  function handleVideoFadeHandleMouseDown(e: MouseEvent, handle: AudioFadeHandle) {
    if (e.button !== 0) return
    if (
      !isVisualFadeItem ||
      trackLocked ||
      activeTool !== 'select' ||
      params().isAnyDragActiveRef.current
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const gestureItem = item
    const gestureFps = fps
    const updateTimelineItem = params().updateTimelineItem
    const originalFadeIn = displayedVideoFadeIn
    const originalFadeOut = displayedVideoFadeOut
    const persistedFadeIn = gestureItem.fadeIn ?? 0
    const persistedFadeOut = gestureItem.fadeOut ?? 0
    const computeFadeSeconds = (clientX: number) => {
      const rect =
        videoControlsRef.current?.getBoundingClientRect() ?? transform?.getBoundingClientRect()
      if (!rect) {
        return handle === 'in' ? originalFadeIn : originalFadeOut
      }
      return getAudioFadeSecondsFromOffset({
        handle,
        clipWidthPixels: rect.width,
        pointerOffsetPixels: clientX - rect.left,
        fps: gestureFps,
        maxDurationFrames: gestureItem.durationInFrames,
      })
    }

    const applyPreview = (nextFadeSeconds: number) => {
      videoFadeEdit = {
        handle,
        previewFadeIn: handle === 'in' ? nextFadeSeconds : originalFadeIn,
        previewFadeOut: handle === 'out' ? nextFadeSeconds : originalFadeOut,
        originalFadeIn,
        originalFadeOut,
        isCommitting: false,
      }
    }

    const finishEdit = () => {
      const latestState = videoFadeEdit
      const committedFade =
        handle === 'in'
          ? (latestState?.previewFadeIn ?? originalFadeIn)
          : (latestState?.previewFadeOut ?? originalFadeOut)
      videoFadeCleanup?.()
      videoFadeCleanup = null

      if (handle === 'in') {
        if (Math.abs(committedFade - persistedFadeIn) > VIDEO_FADE_EPSILON) {
          videoFadeEdit = videoFadeEdit ? { ...videoFadeEdit, isCommitting: true } : null
          updateTimelineItem(gestureItem.id, { fadeIn: committedFade })
        } else {
          videoFadeEdit = null
        }
      } else if (Math.abs(committedFade - persistedFadeOut) > VIDEO_FADE_EPSILON) {
        videoFadeEdit = videoFadeEdit ? { ...videoFadeEdit, isCommitting: true } : null
        updateTimelineItem(gestureItem.id, { fadeOut: committedFade })
      } else {
        videoFadeEdit = null
      }
    }

    applyPreview(computeFadeSeconds(e.clientX))

    const handleWindowMouseMove = (event: MouseEvent) => {
      applyPreview(computeFadeSeconds(event.clientX))
    }
    const handleWindowMouseUp = () => {
      finishEdit()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { once: true })
    videoFadeCleanup = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }

  function handleAudioFadeHandleMouseDown(e: MouseEvent, handle: AudioFadeHandle) {
    if (
      item.type !== 'audio' ||
      trackLocked ||
      activeTool !== 'select' ||
      params().isAnyDragActiveRef.current
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const gestureItem = item
    const gestureFps = fps
    const updateTimelineItem = params().updateTimelineItem
    const originalFadeIn = displayedAudioFadeIn
    const originalFadeOut = displayedAudioFadeOut
    const persistedFadeIn = gestureItem.audioFadeIn ?? 0
    const persistedFadeOut = gestureItem.audioFadeOut ?? 0
    const computeFadeSeconds = (clientX: number) => {
      const rect = audioControls?.getBoundingClientRect() ?? transform?.getBoundingClientRect()
      if (!rect) {
        return handle === 'in' ? originalFadeIn : originalFadeOut
      }
      return getAudioFadeSecondsFromOffset({
        handle,
        clipWidthPixels: rect.width,
        pointerOffsetPixels: clientX - rect.left,
        fps: gestureFps,
        maxDurationFrames: gestureItem.durationInFrames,
      })
    }

    const applyPreview = (nextFadeSeconds: number) => {
      audioFadeEdit = {
        handle,
        previewFadeIn: handle === 'in' ? nextFadeSeconds : originalFadeIn,
        previewFadeOut: handle === 'out' ? nextFadeSeconds : originalFadeOut,
        originalFadeIn,
        originalFadeOut,
        isCommitting: false,
      }
    }

    const finishEdit = () => {
      const latestState = audioFadeEdit
      const committedFade =
        handle === 'in'
          ? (latestState?.previewFadeIn ?? originalFadeIn)
          : (latestState?.previewFadeOut ?? originalFadeOut)
      audioFadeCleanup?.()
      audioFadeCleanup = null

      if (handle === 'in') {
        if (Math.abs(committedFade - persistedFadeIn) > AUDIO_FADE_EPSILON) {
          audioFadeEdit = audioFadeEdit ? { ...audioFadeEdit, isCommitting: true } : null
          updateTimelineItem(gestureItem.id, { audioFadeIn: committedFade })
        } else {
          audioFadeEdit = null
        }
      } else if (Math.abs(committedFade - persistedFadeOut) > AUDIO_FADE_EPSILON) {
        audioFadeEdit = audioFadeEdit ? { ...audioFadeEdit, isCommitting: true } : null
        updateTimelineItem(gestureItem.id, { audioFadeOut: committedFade })
      } else {
        audioFadeEdit = null
      }
    }

    applyPreview(computeFadeSeconds(e.clientX))

    const handleWindowMouseMove = (event: MouseEvent) => {
      applyPreview(computeFadeSeconds(event.clientX))
    }
    const handleWindowMouseUp = () => {
      finishEdit()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { once: true })
    audioFadeCleanup = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }

  function handleAudioFadeCurveDotMouseDown(e: MouseEvent, handle: AudioFadeHandle) {
    if (
      item.type !== 'audio' ||
      trackLocked ||
      activeTool !== 'select' ||
      params().isAnyDragActiveRef.current
    ) {
      return
    }

    const gestureItem = item
    const updateTimelineItem = params().updateTimelineItem

    // Locally compute the fade ratio for this gesture's bounds check.
    // We use item.durationInFrames here (no trim/stretch preview in progress
    // at mouseDown), which avoids a circular dep on visualWidthFrames.
    const clipFadeDurationFrames = Math.max(1, Math.round(gestureItem.durationInFrames))
    const fadeRatio =
      handle === 'in'
        ? getAudioFadeRatio(displayedAudioFadeIn, fps, clipFadeDurationFrames)
        : getAudioFadeRatio(displayedAudioFadeOut, fps, clipFadeDurationFrames)
    if (fadeRatio <= 0) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const originalFadeInCurve = displayedAudioFadeInCurve
    const originalFadeOutCurve = displayedAudioFadeOutCurve
    const originalFadeInCurveX = displayedAudioFadeInCurveX
    const originalFadeOutCurveX = displayedAudioFadeOutCurveX
    const persistedFadeInCurve = gestureItem.audioFadeInCurve ?? 0
    const persistedFadeOutCurve = gestureItem.audioFadeOutCurve ?? 0
    const persistedFadeInCurveX = gestureItem.audioFadeInCurveX ?? 0.52
    const persistedFadeOutCurveX = gestureItem.audioFadeOutCurveX ?? 0.52

    const computeCurve = (clientX: number, clientY: number) => {
      const rect = audioControls?.getBoundingClientRect()
      if (!rect) {
        return {
          curve: handle === 'in' ? originalFadeInCurve : originalFadeOutCurve,
          curveX: handle === 'in' ? originalFadeInCurveX : originalFadeOutCurveX,
        }
      }
      return getAudioFadeCurveFromOffset({
        handle,
        pointerOffsetX: clientX - rect.left,
        pointerOffsetY: clientY - rect.top,
        fadePixels: fadeRatio * rect.width,
        clipWidthPixels: rect.width,
        rowHeight: rect.height,
      })
    }

    const applyPreview = (next: { curve: number; curveX: number }) => {
      audioFadeCurveEdit = {
        handle,
        previewFadeInCurve: handle === 'in' ? next.curve : originalFadeInCurve,
        previewFadeOutCurve: handle === 'out' ? next.curve : originalFadeOutCurve,
        previewFadeInCurveX: handle === 'in' ? next.curveX : originalFadeInCurveX,
        previewFadeOutCurveX: handle === 'out' ? next.curveX : originalFadeOutCurveX,
        originalFadeInCurve,
        originalFadeOutCurve,
        originalFadeInCurveX,
        originalFadeOutCurveX,
        isCommitting: false,
      }
    }

    const finishEdit = () => {
      const latestState = audioFadeCurveEdit
      const committedCurve =
        handle === 'in'
          ? (latestState?.previewFadeInCurve ?? originalFadeInCurve)
          : (latestState?.previewFadeOutCurve ?? originalFadeOutCurve)
      const committedCurveX =
        handle === 'in'
          ? (latestState?.previewFadeInCurveX ?? originalFadeInCurveX)
          : (latestState?.previewFadeOutCurveX ?? originalFadeOutCurveX)
      audioFadeCurveCleanup?.()
      audioFadeCurveCleanup = null

      if (handle === 'in') {
        if (
          Math.abs(committedCurve - persistedFadeInCurve) > AUDIO_FADE_EPSILON ||
          Math.abs(committedCurveX - persistedFadeInCurveX) > AUDIO_FADE_EPSILON
        ) {
          audioFadeCurveEdit = audioFadeCurveEdit
            ? { ...audioFadeCurveEdit, isCommitting: true }
            : null
          updateTimelineItem(gestureItem.id, {
            audioFadeInCurve: committedCurve,
            audioFadeInCurveX: committedCurveX,
          })
        } else {
          audioFadeCurveEdit = null
        }
      } else if (
        Math.abs(committedCurve - persistedFadeOutCurve) > AUDIO_FADE_EPSILON ||
        Math.abs(committedCurveX - persistedFadeOutCurveX) > AUDIO_FADE_EPSILON
      ) {
        audioFadeCurveEdit = audioFadeCurveEdit
          ? { ...audioFadeCurveEdit, isCommitting: true }
          : null
        updateTimelineItem(gestureItem.id, {
          audioFadeOutCurve: committedCurve,
          audioFadeOutCurveX: committedCurveX,
        })
      } else {
        audioFadeCurveEdit = null
      }
    }

    applyPreview(computeCurve(e.clientX, e.clientY))

    const handleWindowMouseMove = (event: MouseEvent) => {
      applyPreview(computeCurve(event.clientX, event.clientY))
    }
    const handleWindowMouseUp = () => {
      finishEdit()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { once: true })
    audioFadeCurveCleanup = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }

  function handleAudioVolumeMouseDown(e: MouseEvent) {
    if (
      item.type !== 'audio' ||
      trackLocked ||
      activeTool !== 'select' ||
      params().isAnyDragActiveRef.current
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const gestureItem = item
    const originalVolume = gestureItem.volume ?? 0
    const dragStartLiveGain = getMixerLiveGain(gestureItem.id)
    const startClientY = e.clientY
    let latestClientY = startClientY
    let latestPreviewVolume = originalVolume
    let isDragActive = false
    let activationTimeoutId: number | null = null
    const dragAnchorY = startClientY
    const dragAnchorVolume = originalVolume

    const applyPreview = (nextVolume: number) => {
      latestPreviewVolume = nextVolume
      applyAudioVolumeVisualPreview(nextVolume)
      const gainRatio = Math.pow(10, (nextVolume - originalVolume) / 20)
      setMixerLiveGains([{ itemId: gestureItem.id, gain: dragStartLiveGain * gainRatio }])
    }

    const clearActivationTimeout = () => {
      if (activationTimeoutId !== null) {
        window.clearTimeout(activationTimeoutId)
        activationTimeoutId = null
      }
    }

    const computeVolumeDb = (clientY: number) => {
      const rect = audioControls?.getBoundingClientRect()
      if (!rect) {
        return originalVolume
      }
      return getAudioVolumeDbFromDragDelta({
        startVolumeDb: dragAnchorVolume,
        pointerDeltaY: clientY - dragAnchorY,
        height: rect.height,
      })
    }

    const activateDrag = () => {
      if (isDragActive) {
        return
      }
      isDragActive = true
      audioVolumeEdit = {
        originalVolume,
        isCommitting: false,
      }
      applyPreview(computeVolumeDb(latestClientY))
    }

    const finishEdit = () => {
      const committedVolume = audioVolumePreviewRef.current ?? latestPreviewVolume
      audioVolumeCleanup?.()
      audioVolumeCleanup = null
      finalizeAudioVolumeChange(committedVolume, {
        preserveLiveGainOnCommit: true,
        commitFromActiveEdit: true,
      })
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      latestClientY = event.clientY
      if (!isDragActive) {
        if (Math.abs(event.clientY - startClientY) < AUDIO_VOLUME_DRAG_ACTIVATION_DISTANCE_PX) {
          return
        }
        clearActivationTimeout()
        activateDrag()
        return
      }
      applyPreview(computeVolumeDb(event.clientY))
    }
    const handleWindowMouseUp = () => {
      if (!isDragActive) {
        audioVolumeCleanup?.()
        audioVolumeCleanup = null
        finalizeAudioVolumeChange(originalVolume)
        return
      }
      finishEdit()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp, { once: true })
    activationTimeoutId = window.setTimeout(() => {
      clearActivationTimeout()
      activateDrag()
    }, AUDIO_VOLUME_DRAG_ACTIVATION_DELAY_MS)
    audioVolumeCleanup = () => {
      clearActivationTimeout()
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }

  function handleAudioVolumeDoubleClick() {
    if (item.type !== 'audio' || trackLocked) {
      return
    }
    audioVolumeCleanup?.()
    audioVolumeCleanup = null
    finalizeAudioVolumeChange(0)
  }

  function handleVideoFadeHandleDoubleClick(handle: AudioFadeHandle) {
    if (!isVisualFadeItem || trackLocked) {
      return
    }
    const currentItem = item
    const updateTimelineItem = params().updateTimelineItem
    videoFadeCleanup?.()
    videoFadeCleanup = null
    videoFadeEdit = null
    if (handle === 'in') {
      if ((currentItem.fadeIn ?? 0) > VIDEO_FADE_EPSILON) {
        updateTimelineItem(currentItem.id, { fadeIn: 0 })
      }
      return
    }
    if ((currentItem.fadeOut ?? 0) > VIDEO_FADE_EPSILON) {
      updateTimelineItem(currentItem.id, { fadeOut: 0 })
    }
  }

  function handleAudioFadeHandleDoubleClick(handle: AudioFadeHandle) {
    if (item.type !== 'audio' || trackLocked) {
      return
    }
    const currentItem = item
    const updateTimelineItem = params().updateTimelineItem
    audioFadeCleanup?.()
    audioFadeCleanup = null
    audioFadeEdit = null
    if (handle === 'in') {
      if ((currentItem.audioFadeIn ?? 0) > AUDIO_FADE_EPSILON) {
        updateTimelineItem(currentItem.id, { audioFadeIn: 0 })
      }
      return
    }
    if ((currentItem.audioFadeOut ?? 0) > AUDIO_FADE_EPSILON) {
      updateTimelineItem(currentItem.id, { audioFadeOut: 0 })
    }
  }

  function handleAudioFadeCurveDotDoubleClick(handle: AudioFadeHandle) {
    if (item.type !== 'audio' || trackLocked) {
      return
    }
    const currentItem = item
    const updateTimelineItem = params().updateTimelineItem
    audioFadeCurveCleanup?.()
    audioFadeCurveCleanup = null
    audioFadeCurveEdit = null
    if (handle === 'in') {
      if (
        Math.abs(currentItem.audioFadeInCurve ?? 0) > AUDIO_FADE_EPSILON ||
        Math.abs((currentItem.audioFadeInCurveX ?? 0.52) - 0.52) > AUDIO_FADE_EPSILON
      ) {
        updateTimelineItem(currentItem.id, { audioFadeInCurve: 0, audioFadeInCurveX: 0.52 })
      }
      return
    }
    if (
      Math.abs(currentItem.audioFadeOutCurve ?? 0) > AUDIO_FADE_EPSILON ||
      Math.abs((currentItem.audioFadeOutCurveX ?? 0.52) - 0.52) > AUDIO_FADE_EPSILON
    ) {
      updateTimelineItem(currentItem.id, { audioFadeOutCurve: 0, audioFadeOutCurveX: 0.52 })
    }
  }

  return {
    videoControlsRef,
    audioControlsRef,
    volumeLineRef,
    audioVolumeEditLabelRef,
    get isVisualFadeItem() {
      return isVisualFadeItem
    },
    get videoFadeEdit() {
      return videoFadeEdit
    },
    get audioFadeEdit() {
      return audioFadeEdit
    },
    get audioFadeCurveEdit() {
      return audioFadeCurveEdit
    },
    get audioVolumeEdit() {
      return audioVolumeEdit
    },
    get displayedVideoFadeIn() {
      return displayedVideoFadeIn
    },
    get displayedVideoFadeOut() {
      return displayedVideoFadeOut
    },
    get displayedAudioFadeIn() {
      return displayedAudioFadeIn
    },
    get displayedAudioFadeOut() {
      return displayedAudioFadeOut
    },
    get displayedAudioFadeInCurve() {
      return displayedAudioFadeInCurve
    },
    get displayedAudioFadeOutCurve() {
      return displayedAudioFadeOutCurve
    },
    get displayedAudioFadeInCurveX() {
      return displayedAudioFadeInCurveX
    },
    get displayedAudioFadeOutCurveX() {
      return displayedAudioFadeOutCurveX
    },
    get displayedAudioVolumeDb() {
      return displayedAudioVolumeDb
    },
    audioVolumePreviewRef,
    handleVideoFadeHandleMouseDown,
    handleVideoFadeHandleDoubleClick,
    handleAudioFadeHandleMouseDown,
    handleAudioFadeHandleDoubleClick,
    handleAudioFadeCurveDotMouseDown,
    handleAudioFadeCurveDotDoubleClick,
    handleAudioVolumeMouseDown,
    handleAudioVolumeDoubleClick,
  }
}
