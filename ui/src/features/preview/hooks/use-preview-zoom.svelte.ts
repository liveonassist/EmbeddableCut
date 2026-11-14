// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { usePlaybackStore } from '@/shared/state/playback'

/**
 * Zoom presets for preview
 */
const ZOOM_PRESETS = [
  { label: 'Auto', value: 'fit' as const },
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
] as const

type ZoomPreset = (typeof ZOOM_PRESETS)[number]

/**
 * Hook for managing preview zoom level
 *
 * Provides:
 * - Current zoom level from store
 * - Preset zoom levels (Fit, 50%, 100%, 200%)
 * - Fine-tune zoom setter
 * - Fit-to-viewport calculation
 *
 * @returns Zoom state and controls
 */
export function usePreviewZoom() {
  const zoom = select(usePlaybackStore, (s) => s.zoom)
  const setZoom = usePlaybackStore.getState().setZoom

  /**
   * Handle preset zoom selection
   */
  const handlePresetZoom = (preset: ZoomPreset) => {
    if (preset.value === 'fit') {
      // Set to -1 to enable auto-fit mode
      setZoom(-1)
    } else {
      setZoom(preset.value)
    }
  }

  /**
   * Zoom in by 20%
   */
  const zoomIn = () => {
    setZoom(Math.min(2, Number((zoom.current * 1.2).toFixed(2))))
  }

  /**
   * Zoom out by 20%
   */
  const zoomOut = () => {
    setZoom(Math.max(0.1, Number((zoom.current / 1.2).toFixed(2))))
  }

  /**
   * Reset zoom to 100%
   */
  const resetZoom = () => {
    setZoom(1)
  }

  return {
    get zoom() {
      return zoom.current
    },
    setZoom,
    zoomPresets: ZOOM_PRESETS,
    handlePresetZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  }
}
