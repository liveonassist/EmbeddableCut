// SPDX-License-Identifier: MIT

import { i18n, t } from '$lib/i18n.svelte'
import type { KokoroTtsModel } from '@/features/editor/services/kokoro-tts-service'
import type { SupertonicTtsLanguageSelection } from '@/features/editor/services/supertonic-tts-service'
import {
  generateTtsAudio,
  type TtsGenerateInput,
  type TtsGenerateOutput,
} from '@/features/editor/services/tts-generate-request'
import {
  getTtsInsertRequest,
  insertTtsResult,
  resolveTtsInsertNotification,
  type TtsInsertOutcome,
} from '@/features/editor/services/tts-insert-result'
import {
  resolveTtsGenerateError,
  TTS_MODEL_LABEL_BY_ENGINE,
  TTS_RESULT_TAGS_BY_ENGINE,
  type TtsTranslate,
} from '@/features/editor/utils/tts-generate-options'
import type { StoredTtsEngine } from '@/shared/utils/tts-settings'

/** i18next's own `t`, for the engine helpers that take a TFunction. */
const translate = i18n.t.bind(i18n) as TtsTranslate

export interface TtsGenerationResult {
  file: File
  objectUrl: string
  duration: number
  voice: string
  model: string
  tags: string[]
}

export interface TtsGenerationParams {
  projectId: string | null
  sourceItemId: string | null
  /** Script text with surrounding whitespace already removed. */
  text: string
  engine: StoredTtsEngine
  voice: string
  voiceLabel: string
  language: SupertonicTtsLanguageSelection
  /** Effective speed: 1 for engines that ignore the slider. */
  speed: number
  model: KokoroTtsModel
  isSupported: boolean
  loadMediaItems: () => Promise<void>
  showNotification: (notification: { type: 'success' | 'warning'; message: string }) => void
}

/**
 * Request/progress state machine for the TTS dialog: synthesizes the script, keeps the
 * result blob URL alive exactly as long as the dialog does, and inserts the clip.
 * `params` is read on every call, so handlers see the latest dialog state.
 */
export function useTtsGeneration(params: () => TtsGenerationParams) {
  let isGenerating = $state(false)
  let isInserting = $state(false)
  let progress = $state<string | null>(null)
  let error = $state<string | null>(null)
  let result = $state.raw<TtsGenerationResult | null>(null)
  let inserted = $state(false)

  let resultUrl: string | null = null
  let sessionId = 0

  /** Drop the previous result's blob URL unless its clip already went to the timeline. */
  function releasePendingResult() {
    if (!resultUrl || inserted) return

    URL.revokeObjectURL(resultUrl)
    resultUrl = null
  }

  /** Invalidate the in-flight session, then clear every piece of result state. */
  function resetSession() {
    sessionId++
    releasePendingResult()
    error = null
    progress = null
    result = null
    inserted = false
  }

  /** Dialog close: the timeline item keeps its URL when the clip was inserted. */
  function releaseResult(keepInserted: boolean) {
    if (!resultUrl) return
    if (!keepInserted) URL.revokeObjectURL(resultUrl)
    resultUrl = null
  }

  function beginGeneration() {
    releasePendingResult()
    error = null
    result = null
    inserted = false
    isGenerating = true
    progress = t('editor.tts.progressPreparing')
    return sessionId
  }

  function applyResult(output: TtsGenerateOutput, current: TtsGenerationParams) {
    const objectUrl = URL.createObjectURL(output.blob)
    resultUrl = objectUrl

    result = {
      file: output.file,
      objectUrl,
      duration: output.duration,
      voice: current.voiceLabel,
      model: TTS_MODEL_LABEL_BY_ENGINE[current.engine],
      tags: TTS_RESULT_TAGS_BY_ENGINE[current.engine](current.voice, current.model),
    }
    progress = null
  }

  async function generate() {
    const current = params()
    const { projectId, text, engine, voice, language, speed, model, isSupported } = current
    const failure = resolveTtsGenerateError(
      { hasProject: Boolean(projectId), trimmedText: text, engine, isSupported },
      translate,
    )
    if (failure) {
      error = failure
      return
    }

    const session = beginGeneration()
    const input: TtsGenerateInput = {
      engine,
      text,
      voice,
      language,
      speed,
      model,
      onProgress: (message) => {
        if (sessionId === session) progress = message
      },
    }
    const outcome = await generateTtsAudio(input, t('editor.tts.errors.generateFailed'))

    // Dialog was closed/reopened — discard the stale result
    if (sessionId !== session) return

    isGenerating = false
    if (outcome.ok) {
      applyResult(outcome.output, current)
      return
    }

    error = outcome.message
    progress = null
  }

  function finishInsert(outcome: TtsInsertOutcome) {
    if (!outcome.ok) {
      error = outcome.message
      return
    }

    inserted = outcome.inserted
    params().showNotification(
      resolveTtsInsertNotification(outcome.inserted, outcome.fileName, translate),
    )
  }

  async function insert() {
    const { projectId, sourceItemId, loadMediaItems } = params()
    const request = getTtsInsertRequest(result, projectId, sourceItemId)
    if (request === null) return

    isInserting = true
    error = null

    const outcome = await insertTtsResult(
      request,
      loadMediaItems,
      t('editor.tts.errors.insertFailed'),
    )
    isInserting = false
    finishInsert(outcome)
  }

  return {
    get isGenerating() {
      return isGenerating
    },
    get isInserting() {
      return isInserting
    },
    get busy() {
      return isGenerating || isInserting
    },
    get canGenerate() {
      const { text, projectId, isSupported } = params()
      return [isGenerating, isInserting, text.length === 0, projectId === null, !isSupported].every(
        (isBlocked) => !isBlocked,
      )
    },
    get progress() {
      return progress
    },
    get error() {
      return error
    },
    get result() {
      return result
    },
    get inserted() {
      return inserted
    },
    generate,
    insert,
    resetSession,
    releaseResult,
  }
}
