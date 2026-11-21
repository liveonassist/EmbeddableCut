// SPDX-License-Identifier: MIT

import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'

export interface TranscribeDialogValues {
  model: MediaTranscriptModel
  quantization: MediaTranscriptQuantization
  language: string
  /** EmbeddableCut: set when captions should be placed; a null preset keeps the project's look. */
  captions?: { stylePresetId: string | null }
  /** EmbeddableCut: place captions from the stored transcript instead of transcribing again. */
  reuseTranscript?: boolean
}

/**
 * EmbeddableCut: what the dialog offers about captions. `always` generates
 * them (a clip's "Generate captions"), `optional` offers them beside the
 * transcript (the media library), `none` is transcript only.
 */
export type TranscribeDialogCaptionMode = 'always' | 'optional' | 'none'
