// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

import type { CompositionInputProps } from '@/types/export'
import {
  acquireComparisonCompositionRenderSession,
  type ComparisonCompositionRenderLease,
} from './comparison-composition-render-session'

interface UseComparisonCompositionFrameOptions {
  enabled: boolean
  sessionKey: string | null
  compositionId: string
  input: CompositionInputProps | null
  width: number
  height: number
  useProxyMedia: boolean
  frame: number
  displayCanvasRef: { current: HTMLCanvasElement | null }
  onError: (cancelled: boolean, error: unknown) => void
}

export function useComparisonCompositionFrame(params: () => UseComparisonCompositionFrameOptions): {
  readonly current: boolean
} {
  const {
    enabled,
    sessionKey,
    compositionId,
    input,
    width,
    height,
    useProxyMedia,
    frame,
    displayCanvasRef,
    onError,
  } = $derived(params())
  const leaseRef: { current: ComparisonCompositionRenderLease | null } = { current: null }
  const scheduleFrameRef: { current: (frame: number) => void } = { current: () => undefined }
  const lastPresentedFrameRef: { current: number | null } = { current: null }
  const frameRef = { current: frame }
  $effect.pre(() => {
    frameRef.current = frame
  })
  let ready = $state.raw(false)
  const setReady = (next: typeof ready | ((prev: typeof ready) => typeof ready)) => {
    ready =
      typeof next === 'function'
        ? (next as (prev: typeof ready) => typeof ready)(untrack(() => ready))
        : next
  }

  $effect(() => {
    lastPresentedFrameRef.current = null
    setReady(false)
    scheduleFrameRef.current = () => undefined
    if (!enabled || !input || !sessionKey || typeof OffscreenCanvas === 'undefined') return

    const lease = acquireComparisonCompositionRenderSession({
      key: sessionKey,
      compositionId,
      input,
      width,
      height,
      useProxyMedia,
      priorityFrame: frameRef.current,
    })
    const controller = new AbortController()
    let active = true
    let inFlightFrame: number | null = null
    let pendingFrame: number | null = null

    leaseRef.current = lease

    const pumpLatestFrame = () => {
      if (!active || inFlightFrame !== null || pendingFrame === null) return

      const requestedFrame = pendingFrame
      const display = displayCanvasRef.current
      if (!display) return

      pendingFrame = null
      inFlightFrame = requestedFrame

      void lease
        .requestFrame(requestedFrame, display, controller.signal)
        .then((presented) => {
          if (!active || !presented) return
          lastPresentedFrameRef.current = requestedFrame
          setReady(true)
        })
        .catch((error) => onError(!active || controller.signal.aborted, error))
        .finally(() => {
          if (!active) return
          inFlightFrame = null
          if (pendingFrame !== null) {
            queueMicrotask(pumpLatestFrame)
          }
        })
    }

    const scheduleFrame = (nextFrame: number) => {
      if (!active) return
      if (inFlightFrame === nextFrame) {
        pendingFrame = null
        return
      }
      if (pendingFrame === nextFrame) return
      if (inFlightFrame === null && lastPresentedFrameRef.current === nextFrame) {
        pendingFrame = null
        return
      }
      pendingFrame = nextFrame
      pumpLatestFrame()
    }

    scheduleFrameRef.current = scheduleFrame
    scheduleFrame(frameRef.current)

    return () => {
      active = false
      controller.abort()
      pendingFrame = null
      if (scheduleFrameRef.current === scheduleFrame) {
        scheduleFrameRef.current = () => undefined
      }
      lease.release()
      if (leaseRef.current === lease) leaseRef.current = null
    }
  })

  $effect(() => {
    scheduleFrameRef.current(frame)
  })

  return {
    get current() {
      return ready
    },
  }
}
