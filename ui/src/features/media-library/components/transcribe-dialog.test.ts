// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const settingsStoreState = vi.hoisted(() => ({
  defaultWhisperModel: 'whisper-base',
  defaultWhisperQuantization: 'hybrid',
  defaultWhisperLanguage: '',
}))

const editorStoreState = vi.hoisted(() => ({
  clearMediaSkimPreview: vi.fn(),
  clearCompoundClipSkimPreview: vi.fn(),
  beginTranscriptionDialog: vi.fn(),
  endTranscriptionDialog: vi.fn(),
}))

const playbackStoreState = vi.hoisted(() => ({
  setPreviewFrame: vi.fn(),
  pause: vi.fn(),
}))

vi.mock('@/features/media-library/deps/settings-contract', () => ({
  useSettingsStore: { getState: () => settingsStoreState, subscribe: () => () => {} },
}))

vi.mock('@/shared/state/editor', () => ({
  useEditorStore: { getState: () => editorStoreState, subscribe: () => () => {} },
}))

vi.mock('@/shared/state/playback', () => ({
  usePlaybackStore: { getState: () => playbackStoreState },
}))

vi.mock('@/features/media-library/transcription/registry', () => ({
  getMediaTranscriptionModelOptions: () => [
    { value: 'parakeet-tdt-v3', label: 'Parakeet (fast)' },
    { value: 'whisper-base', label: 'Whisper Base' },
    { value: 'whisper-large', label: 'Whisper Large v3 Turbo' },
  ],
}))

vi.mock('@/shared/utils/whisper-settings', () => ({
  getWhisperLanguageSelectValue: (value: string) => value || 'auto',
  getWhisperLanguageSettingValue: (value: string) => (value === 'auto' ? '' : value),
  normalizeSelectableWhisperModel: (value: string) => value,
  WHISPER_AUTO_LANGUAGE_VALUE: 'auto',
  WHISPER_LANGUAGE_OPTIONS: [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'zh', label: 'Chinese' },
  ],
  WHISPER_QUANTIZATION_OPTIONS: [{ value: 'hybrid', label: 'Hybrid' }],
}))

// Native stand-ins, so the tests drive the selects without bits-ui's pointer flow.
vi.mock('@/components/ui/combobox', async () => ({
  Combobox: (await import('./transcribe-dialog-test/combobox.svelte')).default,
}))

vi.mock('@/components/ui/select', async () => {
  const passthrough = (await import('./transcribe-dialog-test/passthrough.svelte')).default
  return {
    Select: (await import('./transcribe-dialog-test/select.svelte')).default,
    SelectItem: (await import('./transcribe-dialog-test/select-item.svelte')).default,
    SelectTrigger: passthrough,
    SelectValue: passthrough,
    SelectContent: passthrough,
  }
})

import TranscribeDialog from './transcribe-dialog.svelte'

const baseProps = {
  open: true,
  fileName: 'clip.mp4',
  hasTranscript: false,
  isRunning: false,
  progressPercent: null,
  progressLabel: 'Idle',
}

describe('TranscribeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsStoreState.defaultWhisperModel = 'whisper-base'
    settingsStoreState.defaultWhisperQuantization = 'hybrid'
    settingsStoreState.defaultWhisperLanguage = ''
  })

  it('clears background skim and scrub previews when opened', () => {
    render(TranscribeDialog, {
      ...baseProps,
      progressLabel: 'Queued...',
      onOpenChange: vi.fn(),
      onStart: vi.fn(),
      onCancel: vi.fn(),
    })

    expect(editorStoreState.clearMediaSkimPreview).toHaveBeenCalledTimes(1)
    expect(editorStoreState.clearCompoundClipSkimPreview).toHaveBeenCalledTimes(1)
    expect(editorStoreState.beginTranscriptionDialog).toHaveBeenCalledTimes(1)
    expect(playbackStoreState.setPreviewFrame).toHaveBeenCalledWith(null)
    expect(playbackStoreState.pause).toHaveBeenCalledTimes(1)
  })

  it('requires stopping before the dialog can close mid-transcription', async () => {
    const onOpenChange = vi.fn()
    const onCancel = vi.fn()

    render(TranscribeDialog, {
      ...baseProps,
      hasTranscript: true,
      isRunning: true,
      progressPercent: 42,
      progressLabel: 'Transcribing... (42%)',
      onOpenChange,
      onStart: vi.fn(),
      onCancel,
    })

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onOpenChange).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('allows closing again once transcription is idle', async () => {
    const onOpenChange = vi.fn()

    render(TranscribeDialog, {
      ...baseProps,
      onOpenChange,
      onStart: vi.fn(),
      onCancel: vi.fn(),
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows Parakeet language coverage instead of a language selector', async () => {
    settingsStoreState.defaultWhisperModel = 'parakeet-tdt-v3'
    settingsStoreState.defaultWhisperLanguage = 'zh'
    const onStart = vi.fn()

    render(TranscribeDialog, {
      ...baseProps,
      onOpenChange: vi.fn(),
      onStart,
      onCancel: vi.fn(),
    })

    expect(screen.getByText('Automatically detects 25 European languages.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'For Chinese, Japanese, Korean, and other languages, choose a Whisper model.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()
    expect(screen.queryByText('Quantization')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onStart).toHaveBeenCalledWith({
      model: 'parakeet-tdt-v3',
      quantization: 'hybrid',
      language: '',
    })
  })

  it('clears a Whisper-only language when switching to Parakeet', async () => {
    settingsStoreState.defaultWhisperLanguage = 'zh'

    render(TranscribeDialog, {
      ...baseProps,
      onOpenChange: vi.fn(),
      onStart: vi.fn(),
      onCancel: vi.fn(),
    })

    expect(screen.getByLabelText('Language')).toHaveValue('zh')
    const modelAndQuantizationSelects = screen.getAllByRole('combobox')
    expect(modelAndQuantizationSelects).toHaveLength(2)
    await fireEvent.change(modelAndQuantizationSelects[0]!, {
      target: { value: 'parakeet-tdt-v3' },
    })

    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'whisper-large' } })
    expect(screen.getByLabelText('Language')).toHaveValue('auto')
  })
})
