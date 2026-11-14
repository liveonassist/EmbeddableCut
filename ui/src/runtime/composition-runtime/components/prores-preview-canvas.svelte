<!-- SPDX-License-Identifier: MIT -->
<!--
  DOM-layer preview for ProRes clips, which the browser cannot decode through a
  `<video>` element (off-Safari). Decodes ProRes frames via turbores and paints
  them to a `<canvas>`, driven **imperatively** by the player Clock: it subscribes
  to the clock's `framechange` event and draws in the callback, so the component
  mounts once and never re-runs during playback. Only the sequence's start frame
  is read reactively (React split this into a wrapper and a memoized inner
  component to keep the per-frame context read out of the decoder's renders). A
  small lookahead cache keeps upcoming frames decoded ahead of the playhead so
  each tick only pays for a canvas draw.
-->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { ProResPreviewSession } from '@/infrastructure/browser/prores-preview-session'

  const log = createLogger('ProResPreviewCanvas')

  /**
   * Upper bound on the preview canvas backing-store width. The player preview area is far
   * smaller than a 4K source, so a 4K backing store just burns memory bandwidth on every
   * composite. Drawing downscaled to this width keeps preview quality while cutting the
   * per-frame draw/composite cost for high-res ProRes. Export and thumbnails decode at full
   * resolution through their own paths — this only caps the on-screen preview.
   */
  const MAX_PREVIEW_WIDTH = 1920

  interface ProResPreviewState {
    session: ProResPreviewSession | null
    disposed: boolean
    /** True while a decode+draw is in flight, so ticks coalesce instead of piling up. */
    rendering: boolean
    /** Latest local frame requested while a render was in flight; drives one re-run. */
    queuedLocalFrame: number | null
  }
</script>

<script lang="ts">
  import { useClock, useSequenceContext } from '@/runtime/composition-runtime/deps/player'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { getVideoTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import { acquireProResSession } from '@/infrastructure/browser/prores-sink-cache'

  let props: {
    itemId: string
    src: string
    safeTrimBefore: number
    sequenceFrameOffset?: number
    sourceFps: number
    playbackRate: number
    isReversed?: boolean
    reverseSourceEnd?: number
    onError: (error: Error) => void
  } = $props()

  const itemId = $derived(props.itemId)
  const src = $derived(props.src)
  const safeTrimBefore = $derived(props.safeTrimBefore)
  const sequenceFrameOffset = $derived(props.sequenceFrameOffset ?? 0)
  const sourceFps = $derived(props.sourceFps)
  const playbackRate = $derived(props.playbackRate)
  const isReversed = $derived(props.isReversed ?? false)
  const reverseSourceEnd = $derived(props.reverseSourceEnd)

  const sequence = useSequenceContext()
  /** Absolute start frame of this clip's sequence, used to map clock frame → local frame. */
  const sequenceAbsoluteFrom = $derived(sequence?.from ?? 0)

  const videoConfig = useVideoConfig()
  const clock = useClock()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let previewState: ProResPreviewState | null = null

  const onError = (error: Error) => props.onError(error)

  // Decode one local (sequence-relative) frame and paint it. The session owns the returned
  // sample (borrowed), so it is never closed here.
  async function drawOnce(state: ProResPreviewState, localFrame: number): Promise<void> {
    const session = state.session
    if (!session || state.disposed) return
    const targetTime = getVideoTargetTimeSeconds(
      safeTrimBefore,
      sourceFps,
      localFrame,
      playbackRate,
      videoConfig.fps,
      sequenceFrameOffset,
      isReversed,
      reverseSourceEnd,
    )
    const sample = await session.getSampleForTime(targetTime)
    if (state.disposed || !sample) return

    // Coalescing (see `render`) guarantees this is the latest requested frame, so it is
    // always the one to paint — no stale-draw guard needed.
    if (canvas) {
      // Cap the backing store so we don't allocate and composite a full 4K canvas every
      // frame for a preview area that is far smaller. Drawing the decoded frame
      // downscaled to ~1080p cuts per-frame draw + compositor cost ~4x for 4K sources
      // with no visible loss at preview size (a single 2x downscale, well clear of the
      // moire territory that only bites tiny thumbnail jumps). CSS `objectFit: fill`
      // still stretches the canvas to the container.
      const scale = Math.min(1, MAX_PREVIEW_WIDTH / sample.displayWidth)
      const drawWidth = Math.max(1, Math.round(sample.displayWidth * scale))
      const drawHeight = Math.max(1, Math.round(sample.displayHeight * scale))
      if (canvas.width !== drawWidth) canvas.width = drawWidth
      if (canvas.height !== drawHeight) canvas.height = drawHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        sample.draw(ctx, 0, 0, drawWidth, drawHeight)
      }
    }
  }

  // Draw the given local frame, coalescing ticks that arrive mid-decode onto a single
  // re-run targeting the latest frame, so work never piles up behind a slow decode. The
  // session holds a warm decoder and pulls its forward stream to the target, so each tick
  // only decodes the frames between the last draw and now.
  async function render(state: ProResPreviewState, localFrame: number): Promise<void> {
    if (!state.session || state.disposed) return
    if (state.rendering) {
      state.queuedLocalFrame = localFrame
      return
    }
    state.rendering = true
    try {
      let frame = localFrame
      while (!state.disposed) {
        try {
          await drawOnce(state, frame)
        } catch (error) {
          log.warn('ProRes preview decode failed', { itemId, error })
          onError(error instanceof Error ? error : new Error(String(error)))
        }
        const next = state.queuedLocalFrame
        if (next === null) break
        state.queuedLocalFrame = null
        frame = next
      }
    } finally {
      state.rendering = false
    }
  }

  // Acquire a warm decode session for this source. The session cache keeps the decoder
  // and its forward stream alive across mount/unmount, so re-entering a clip (e.g. the
  // playhead crossing into it during playback after a prior seek) reuses the warm decoder
  // and paints immediately instead of cold-starting to black.
  $effect(() => {
    const source = src
    const state: ProResPreviewState = {
      session: null,
      disposed: false,
      rendering: false,
      queuedLocalFrame: null,
    }
    previewState = state

    const lease = acquireProResSession(source)
    void lease.session
      .then((session) => {
        if (state.disposed) return
        if (!session) {
          onError(new Error('ProRes source could not be opened'))
          return
        }
        state.session = session
        // Paint the current frame now that the decoder is ready.
        void render(state, clock.currentFrame - sequenceAbsoluteFrom)
      })
      .catch((error) => {
        if (!state.disposed) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      })

    return () => {
      state.disposed = true
      // The session is shared and kept warm by the cache — release our hold, don't close.
      lease.release()
      if (previewState === state) {
        previewState = null
      }
    }
  })

  // Drive draws imperatively from the clock — no reactive work per frame. `seek`
  // also emits `framechange`, so this covers both playback and scrubbing.
  $effect(() => {
    const unsubscribe = clock.onFrameChange((globalFrame) => {
      const state = previewState
      if (state) void render(state, globalFrame - sequenceAbsoluteFrom)
    })
    return unsubscribe
  })

  // Redraw the current frame when timing-affecting props change (e.g. a trim/move while
  // paused), since those emit no clock event.
  $effect(() => {
    const from = sequenceAbsoluteFrom
    void [
      itemId,
      safeTrimBefore,
      sourceFps,
      playbackRate,
      videoConfig.fps,
      sequenceFrameOffset,
      isReversed,
      reverseSourceEnd,
    ]
    const state = previewState
    if (state?.session) void render(state, clock.currentFrame - from)
  })
</script>

<canvas
  bind:this={canvas}
  style="width: 100%; height: 100%; object-fit: fill; display: block;"
></canvas>
