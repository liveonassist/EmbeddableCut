// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { normalizeKeyframeNavigatorViewport } from './compact-navigator-utils'
import { MIN_VISIBLE_FRAMES } from './dopesheet-constants'
import type { Viewport } from './dopesheet-types'

interface UseDopesheetViewportOptions {
  /** Current clip id — switching clips refits the viewport. */
  itemId: string
  totalFrames: number
  /** Frame range covered by the clip's keyframes, or null when there are none. */
  keyframeFrameBounds: { min: number; max: number } | null
  frameViewport: Viewport | undefined
  onFrameViewportChange: ((viewport: Viewport) => void) | undefined
  /** Preserve an externally supplied viewport beyond clip bounds for global timeline alignment. */
  clampToContent?: boolean
}

interface UseDopesheetViewportResult {
  readonly viewport: Viewport
  updateViewport: (next: Viewport | ((prev: Viewport) => Viewport)) => void
  normalizeViewport: (next: Viewport) => Viewport
  readonly contentFrameMax: number
  readonly minViewportFrames: number
}

/**
 * Owns the visible-frame viewport for the dopesheet, syncing with an optional
 * external `frameViewport` prop (used in split mode where the editor shares
 * its viewport with a sibling). Keeps the viewport clamped to the content
 * range and notifies the parent only when it actually changes.
 */
export function useDopesheetViewport(
  options: () => UseDopesheetViewportOptions,
): UseDopesheetViewportResult {
  const itemId = $derived(options().itemId)
  const totalFrames = $derived(options().totalFrames)
  const keyframeFrameBounds = $derived(options().keyframeFrameBounds)
  const frameViewport = $derived(options().frameViewport)
  const clampToContent = $derived(options().clampToContent ?? true)

  const contentFrameMax = $derived(Math.max(totalFrames, 1))
  const minViewportFrames = $derived(Math.max(1, Math.min(MIN_VISIBLE_FRAMES, contentFrameMax)))

  const normalizeViewport = (nextViewport: Viewport): Viewport => {
    if (clampToContent) {
      return normalizeKeyframeNavigatorViewport(nextViewport, contentFrameMax, minViewportFrames)
    }
    const startFrame = Number.isFinite(nextViewport.startFrame) ? nextViewport.startFrame : 0
    const endFrame = Number.isFinite(nextViewport.endFrame) ? nextViewport.endFrame : startFrame + 1
    return { startFrame, endFrame: Math.max(startFrame + 1, endFrame) }
  }

  // Fit the viewport to the keyframes (with padding) so a short animation on a
  // long clip — e.g. a 0.5s entrance preset on a multi-minute clip — is visible
  // instead of squished into a few pixels at the left edge. Falls back to the
  // full clip when there are no keyframes or they already span most of it.
  // Reads the latest bounds without making every keyframe edit a viewport
  // dependency (which would discard the user's zoom/pan).
  const buildDefaultViewport = (): Viewport =>
    untrack(() => {
      const bounds = keyframeFrameBounds
      if (bounds && bounds.max > bounds.min) {
        const span = bounds.max - bounds.min
        const pad = Math.max(Math.ceil(span * 0.4), 3)
        const fittedSpan = span + pad * 2
        // Only zoom in when fitting actually helps; otherwise show the whole clip.
        if (fittedSpan < contentFrameMax * 0.6) {
          return normalizeViewport({
            startFrame: Math.max(0, bounds.min - pad),
            endFrame: Math.min(contentFrameMax, bounds.max + pad),
          })
        }
      }
      return normalizeViewport({ startFrame: 0, endFrame: contentFrameMax })
    })

  let internalViewport = $state.raw<Viewport>(
    untrack(() => (frameViewport ? normalizeViewport(frameViewport) : buildDefaultViewport())),
  )
  const controlledViewport = $derived(frameViewport ? normalizeViewport(frameViewport) : null)
  const viewport = $derived(controlledViewport ?? internalViewport)

  // The last controlled viewport handed to the owner, so several updates
  // before the owner's next prop arrive chain off each other.
  let lastControlled: Viewport | null = null
  let lastEmitted: Viewport | null = null

  const updateViewport = (next: Viewport | ((prev: Viewport) => Viewport)) => {
    const controlled = controlledViewport
    if (controlled) {
      if (controlled !== lastControlled) {
        lastControlled = controlled
        lastEmitted = controlled
      }
      const previous = lastEmitted ?? controlled
      const resolved = normalizeViewport(typeof next === 'function' ? next(previous) : next)
      if (resolved.startFrame !== previous.startFrame || resolved.endFrame !== previous.endFrame) {
        lastEmitted = resolved
        options().onFrameViewportChange?.(resolved)
      }
      return
    }

    const prev = internalViewport
    const resolved = normalizeViewport(typeof next === 'function' ? next(prev) : next)
    if (resolved.startFrame !== prev.startFrame || resolved.endFrame !== prev.endFrame) {
      options().onFrameViewportChange?.(resolved)
    }
    internalViewport = resolved
  }

  // Refit the viewport when the clip changes (a different clip or duration) or
  // when keyframes first appear for the current clip (e.g. a preset was applied).
  // Do NOT refit on every keyframe edit — the frame axis is shared across a
  // clip's properties, so refitting there would discard the user's zoom/pan.
  let prevItemId = untrack(() => itemId)
  let prevHadBounds = untrack(() => Boolean(keyframeFrameBounds))
  $effect(() => {
    const id = itemId
    const hasBounds = Boolean(keyframeFrameBounds)
    if (frameViewport) {
      // Controlled mode derives the viewport directly. Only keep the refit
      // bookkeeping in sync here.
      prevItemId = id
      prevHadBounds = hasBounds
      return
    }

    const clipChanged = prevItemId !== id
    const keyframesAppeared = !prevHadBounds && hasBounds
    prevItemId = id
    prevHadBounds = hasBounds

    if (clipChanged || keyframesAppeared) {
      internalViewport = buildDefaultViewport()
    }
  })

  // Keep the viewport clamped if the clip duration shrinks below the current view.
  $effect(() => {
    void contentFrameMax
    if (frameViewport) return
    const prev = untrack(() => internalViewport)
    const clamped = normalizeViewport(prev)
    if (clamped.startFrame !== prev.startFrame || clamped.endFrame !== prev.endFrame) {
      internalViewport = clamped
    }
  })

  return {
    get viewport() {
      return viewport
    },
    updateViewport,
    normalizeViewport,
    get contentFrameMax() {
      return contentFrameMax
    },
    get minViewportFrames() {
      return minViewportFrames
    },
  }
}
