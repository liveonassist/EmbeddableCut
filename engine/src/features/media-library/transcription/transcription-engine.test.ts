// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { resolveTranscriptionEngine } from './transcription-engine'

describe('resolveTranscriptionEngine', () => {
  it('keeps explicit whisper models on the whisper engine', () => {
    expect(resolveTranscriptionEngine('whisper-small', 'en')).toEqual({
      engine: 'whisper',
      model: 'whisper-small',
    })
  })

  it('uses parakeet for supported languages', () => {
    expect(resolveTranscriptionEngine('parakeet-tdt-v3', 'fr')).toEqual({
      engine: 'parakeet',
      model: 'parakeet-tdt-v3',
    })
  })

  it('uses parakeet for auto-detect (no language)', () => {
    expect(resolveTranscriptionEngine('parakeet-tdt-v3', '')).toEqual({
      engine: 'parakeet',
      model: 'parakeet-tdt-v3',
    })
  })

  it('falls back to whisper base for unsupported languages', () => {
    expect(resolveTranscriptionEngine('parakeet-tdt-v3', 'ja')).toEqual({
      engine: 'whisper',
      model: 'whisper-base',
      fallbackReason: 'language',
    })
  })

  it('normalizes language casing and whitespace', () => {
    expect(resolveTranscriptionEngine('parakeet-tdt-v3', '  EN ')).toEqual({
      engine: 'parakeet',
      model: 'parakeet-tdt-v3',
    })
  })
})
