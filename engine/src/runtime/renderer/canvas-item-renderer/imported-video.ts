// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'
import { importsExternalFramesOnly } from '@/infrastructure/gpu-media/external-image-upload'
import type { ItemRenderContext } from './types'

/**
 * Whether a video item without effects goes to the GPU directly, as video
 * with GPU effects does, instead of through a 2D canvas. Only where drawing a
 * frame onto a canvas reads it back to the CPU but importing it doesn't
 * (Firefox on Windows and macOS); Chromium keeps the canvas path.
 */
export function importsPlainVideo(item: TimelineItem, rctx: ItemRenderContext): boolean {
  if (item.type !== 'video') return false
  const device = rctx.gpuPipeline?.getDevice()
  return !!device && importsExternalFramesOnly(device)
}
