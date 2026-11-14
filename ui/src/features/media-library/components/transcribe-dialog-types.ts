// SPDX-License-Identifier: MIT

import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'

export interface TranscribeDialogValues {
  model: MediaTranscriptModel
  quantization: MediaTranscriptQuantization
  language: string
}
