import { BROWSER_WHISPER_MODEL_LABELS } from '@/shared/utils/browser-whisper-models'
import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'

const MIB = 1024 * 1024

// Parakeet ONNX footprint: int8 encoder (~0.65 GB) + int8 decoder_joint (~18 MB) + nemo128
// preprocessor.
const PARAKEET_RUNTIME_MIB = 637

const WHISPER_MODEL_BASE_ESTIMATES_MIB: Record<MediaTranscriptModel, number> = {
  // Parakeet is sized via estimateParakeetRuntimeBytes(); this entry only satisfies the
  // exhaustive map and is never scaled by the whisper quantization factor.
  'parakeet-tdt-v3': PARAKEET_RUNTIME_MIB,
  'whisper-tiny': 220,
  'whisper-base': 420,
  'whisper-small': 900,
  'whisper-large': 2_600,
}

const QUANTIZATION_MULTIPLIER: Record<MediaTranscriptQuantization, number> = {
  hybrid: 0.65,
  fp32: 1,
  fp16: 0.62,
  q8: 0.58,
  q4: 0.38,
}

const QUANTIZATION_LABELS: Record<MediaTranscriptQuantization, string> = {
  hybrid: 'Hybrid',
  fp32: 'FP32',
  fp16: 'FP16',
  q8: 'Q8',
  q4: 'Q4',
}

export function estimateWhisperRuntimeBytes(
  model: MediaTranscriptModel,
  quantization: MediaTranscriptQuantization,
): number {
  return Math.round(
    WHISPER_MODEL_BASE_ESTIMATES_MIB[model] * QUANTIZATION_MULTIPLIER[quantization] * MIB,
  )
}

export function formatWhisperRuntimeModelLabel(
  model: MediaTranscriptModel,
  quantization: MediaTranscriptQuantization,
): string {
  return `${BROWSER_WHISPER_MODEL_LABELS[model]} · ${QUANTIZATION_LABELS[quantization]}`
}

export function estimateParakeetRuntimeBytes(): number {
  return PARAKEET_RUNTIME_MIB * MIB
}

export function formatParakeetRuntimeModelLabel(): string {
  return BROWSER_WHISPER_MODEL_LABELS['parakeet-tdt-v3']
}
