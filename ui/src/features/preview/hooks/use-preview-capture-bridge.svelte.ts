// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { CaptureOptions } from '@/shared/state/playback'

interface UsePreviewCaptureBridgeParams {
  captureCurrentFrame: (options?: CaptureOptions) => Promise<string | null>
  captureCurrentFrameImageData: (options?: CaptureOptions) => Promise<ImageData | null>
  captureCanvasSource: (
    options?: CaptureOptions,
  ) => Promise<OffscreenCanvas | HTMLCanvasElement | null>
  setCaptureFrame: (fn: ((options?: CaptureOptions) => Promise<string | null>) | null) => void
  setCaptureFrameImageData: (
    fn: ((options?: CaptureOptions) => Promise<ImageData | null>) | null,
  ) => void
  setCaptureCanvasSource: (
    fn: ((options?: CaptureOptions) => Promise<OffscreenCanvas | HTMLCanvasElement | null>) | null,
  ) => void
  setDisplayedFrame: (frame: number | null) => void
  captureInFlightRef: { current: Promise<string | null> | null }
  captureImageDataInFlightRef: { current: Promise<ImageData | null> | null }
  captureScaleCanvasRef: { current: HTMLCanvasElement | null }
}

export function usePreviewCaptureBridge(params: () => UsePreviewCaptureBridgeParams) {
  const {
    captureCurrentFrame,
    captureCurrentFrameImageData,
    captureCanvasSource,
    setCaptureFrame,
    setCaptureFrameImageData,
    setCaptureCanvasSource,
    setDisplayedFrame,
    captureInFlightRef,
    captureImageDataInFlightRef,
    captureScaleCanvasRef,
  } = $derived(params())
  const unmountingRef = { current: false }

  $effect(() =>
    untrack(() => {
      unmountingRef.current = false
      return () => {
        unmountingRef.current = true
      }
    }),
  )

  $effect(() => {
    void [setDisplayedFrame]

    setCaptureFrame(captureCurrentFrame)
    setCaptureFrameImageData(captureCurrentFrameImageData)
    setCaptureCanvasSource(captureCanvasSource)
    return () => {
      setCaptureFrame(null)
      setCaptureFrameImageData(null)
      setCaptureCanvasSource(null)
      if (unmountingRef.current) {
        setDisplayedFrame(null)
      }
      captureInFlightRef.current = null
      captureImageDataInFlightRef.current = null
      captureScaleCanvasRef.current = null
    }
  })
}
