<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const MUSIC_PROMPT_PRESETS = [
    {
      labelKey: 'editor.aiPanel.musicPresets.lofiChillLabel',
      promptKey: 'editor.aiPanel.musicPresets.lofiChillPrompt',
    },
    {
      labelKey: 'editor.aiPanel.musicPresets.pop80sLabel',
      promptKey: 'editor.aiPanel.musicPresets.pop80sPrompt',
    },
    {
      labelKey: 'editor.aiPanel.musicPresets.rock90sLabel',
      promptKey: 'editor.aiPanel.musicPresets.rock90sPrompt',
    },
    {
      labelKey: 'editor.aiPanel.musicPresets.upbeatEdmLabel',
      promptKey: 'editor.aiPanel.musicPresets.upbeatEdmPrompt',
    },
    {
      labelKey: 'editor.aiPanel.musicPresets.countryLabel',
      promptKey: 'editor.aiPanel.musicPresets.countryPrompt',
    },
    {
      labelKey: 'editor.aiPanel.musicPresets.lofiElectroLabel',
      promptKey: 'editor.aiPanel.musicPresets.lofiElectroPrompt',
    },
  ]
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import Info from 'lucide-svelte/icons/info'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles'
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
  import { Label } from '@/components/ui/label'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { Textarea } from '@/components/ui/textarea'
  import { getMusicgenModelDefinition } from '@/shared/utils/musicgen-models'
  import {
    getStoredTtsEngine,
    setStoredTtsEngine,
    type StoredTtsEngine,
  } from '@/shared/utils/tts-settings'
  import { SliderInput } from '@/shared/ui/property-controls'
  import { cn } from '@/shared/ui/cn'
  import {
    importMediaLibraryService,
    useMediaLibraryStore,
  } from '@/features/editor/deps/media-library'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { MediaMetadata } from '@/types/storage'
  import {
    KOKORO_TTS_BEST_MODEL,
    KOKORO_TTS_VOICE_OPTIONS,
    getKokoroTtsModelOption,
    getKokoroTtsVoiceOption,
    kokoroTtsService,
    type KokoroTtsModel,
    type KokoroTtsVoice,
  } from '@/features/editor/services/kokoro-tts-service'
  import {
    MOSS_TTS_VOICE_OPTIONS,
    getMossTtsVoiceOption,
    mossTtsService,
    type MossTtsVoice,
  } from '@/features/editor/services/moss-tts-service'
  import {
    SUPERTONIC_TTS_EXPRESSIVE_TAG_OPTIONS,
    SUPERTONIC_TTS_LANGUAGE_OPTIONS,
    SUPERTONIC_TTS_VOICE_OPTIONS,
    supertonicTtsService,
    type SupertonicTtsLanguageSelection,
    type SupertonicTtsVoice,
  } from '@/features/editor/services/supertonic-tts-service'
  import {
    DEFAULT_MUSICGEN_MODEL,
    MUSICGEN_MODEL_OPTIONS,
    musicgenService,
    type MusicgenModelId,
  } from '@/features/editor/services/musicgen-service'
  import { insertGeneratedAudioOnNewTrack } from '@/features/editor/utils/insert-generated-audio'
  import {
    getLanguageDisplayName,
    insertTextAtCursor,
  } from '@/features/editor/utils/tts-ui-helpers'
  import { select } from '$lib/store.svelte'
  import { i18n, locale, t } from '$lib/i18n.svelte'
  import AiGenerationRow from './ai-generation-row.svelte'
  import { formatBytes, type AudioGeneration } from './ai-panel-types'

  /** Which history list a save/remove acts on. */
  type GenerationListId = 'tts' | 'music'

  const currentProjectId = select(useMediaLibraryStore, (state) => state.currentProjectId)

  let ttsText = $state(i18n.t('editor.aiPanel.defaultTtsPrompt'))
  let ttsEngine = $state<StoredTtsEngine>(getStoredTtsEngine())
  let ttsKokoroVoice = $state<KokoroTtsVoice>('af_heart')
  let ttsMossVoice = $state<MossTtsVoice>('Xiaoyu')
  let ttsSupertonicVoice = $state<SupertonicTtsVoice>('M3')
  let ttsSupertonicLanguage = $state<SupertonicTtsLanguageSelection>('auto')
  const ttsModel: KokoroTtsModel = KOKORO_TTS_BEST_MODEL
  let ttsSpeed = $state(1)
  let isTtsGenerating = $state(false)
  let ttsProgress = $state<string | null>(null)
  let ttsError = $state<string | null>(null)
  let ttsGenerations = $state.raw<AudioGeneration[]>([])
  let ttsSectionOpen = $state(true)

  let musicPrompt = $state(i18n.t(MUSIC_PROMPT_PRESETS[0]!.promptKey))
  const musicModel: MusicgenModelId = DEFAULT_MUSICGEN_MODEL
  const currentMusicModel = getMusicgenModelDefinition(musicModel)
  // Clamped to the model's range, as React's mount effect did.
  let musicDuration = $state(
    Math.min(
      currentMusicModel.maxDurationSeconds,
      Math.max(currentMusicModel.minDurationSeconds, currentMusicModel.defaultDurationSeconds),
    ),
  )
  let isMusicGenerating = $state(false)
  let musicProgress = $state<string | null>(null)
  let musicError = $state<string | null>(null)
  let musicGenerations = $state.raw<AudioGeneration[]>([])
  let musicProgressPct = $state<number | null>(null)
  let musicInfoOpen = $state(false)
  let musicSectionOpen = $state(true)

  let musicAbort: AbortController | null = null
  let ttsTextarea: HTMLTextAreaElement | null = $state(null)
  const generationUrls = new Set<string>()

  // Abort in-flight generation and revoke all blob URLs on unmount
  $effect(() => {
    return () => {
      musicAbort?.abort()
      musicAbort = null
      for (const url of generationUrls) {
        URL.revokeObjectURL(url)
      }
    }
  })

  $effect(() => {
    setStoredTtsEngine(ttsEngine)
  })

  const isKokoroSupported = kokoroTtsService.isSupported()
  const isMossSupported = mossTtsService.isSupported()
  const isSupertonicSupported = supertonicTtsService.isSupported()
  const supportsNativeTtsSpeed = $derived(ttsEngine === 'kokoro' || ttsEngine === 'supertonic')
  const ttsSpeedMin = $derived(ttsEngine === 'supertonic' ? 0.8 : 0.5)
  const ttsSpeedMax = $derived(ttsEngine === 'supertonic' ? 1.3 : 2)

  $effect(() => {
    const min = ttsSpeedMin
    const max = ttsSpeedMax
    untrack(() => {
      ttsSpeed = Math.min(max, Math.max(min, ttsSpeed))
    })
  })

  const effectiveTtsSpeed = $derived(supportsNativeTtsSpeed ? ttsSpeed : 1)
  const isTtsSupported = $derived(
    ttsEngine === 'kokoro'
      ? isKokoroSupported
      : ttsEngine === 'moss'
        ? isMossSupported
        : isSupertonicSupported,
  )
  const isMusicSupported = musicgenService.isSupported()
  const trimmedTtsText = $derived(ttsText.trim())
  const trimmedMusicPrompt = $derived(musicPrompt.trim())

  const totalTtsBytes = $derived(
    ttsGenerations.reduce((sum, generation) => sum + generation.byteSize, 0),
  )
  const totalMusicBytes = $derived(
    musicGenerations.reduce((sum, generation) => sum + generation.byteSize, 0),
  )

  const anyTtsSaving = $derived(ttsGenerations.some((generation) => generation.saving))
  const anyMusicSaving = $derived(musicGenerations.some((generation) => generation.saving))
  const voice = $derived(
    ttsEngine === 'kokoro'
      ? ttsKokoroVoice
      : ttsEngine === 'moss'
        ? ttsMossVoice
        : ttsSupertonicVoice,
  )
  const currentTtsBackendLabel = $derived(
    ttsEngine === 'kokoro' ? 'WebGPU' : ttsEngine === 'moss' ? 'CPU' : 'WebGPU/WASM',
  )
  const currentTtsRuntimeLabel = $derived(
    ttsEngine === 'kokoro' ? 'Kokoro TTS Best' : ttsEngine === 'moss' ? 'MOSS Nano' : 'Supertonic 3',
  )
  const uiLanguage = $derived((void locale.current, i18n.language))

  // --- actions ---

  async function handleTtsGenerate() {
    if (!currentProjectId.current) {
      ttsError = t('editor.tts.errors.openProject')
      return
    }
    if (!trimmedTtsText) {
      ttsError = t('editor.tts.errors.enterText')
      return
    }
    if (!isTtsSupported) {
      ttsError =
        ttsEngine === 'kokoro'
          ? t('editor.tts.errors.kokoroUnsupported')
          : ttsEngine === 'moss'
            ? t('editor.tts.errors.mossUnsupported')
            : t('editor.tts.errors.supertonicUnsupported', {
                defaultValue:
                  'This browser cannot run the local Supertonic TTS runtime. Try a recent Chrome or Edge browser.',
              })
      return
    }

    const engine = ttsEngine
    const text = trimmedTtsText
    const kokoroVoice = ttsKokoroVoice
    const mossVoice = ttsMossVoice
    const supertonicVoice = ttsSupertonicVoice
    const speed = effectiveTtsSpeed
    const onProgress = (message: string) => {
      ttsProgress = message
    }

    ttsError = null
    isTtsGenerating = true
    ttsProgress = t('editor.tts.progressPreparing')

    try {
      const result =
        engine === 'kokoro'
          ? await kokoroTtsService.generateSpeechFile({
              text,
              voice: kokoroVoice,
              speed,
              model: ttsModel,
              onProgress,
            })
          : engine === 'moss'
            ? await mossTtsService.generateSpeechFile({
                text,
                voice: mossVoice,
                speed,
                onProgress,
              })
            : await supertonicTtsService.generateSpeechFile({
                text,
                voice: supertonicVoice,
                language: ttsSupertonicLanguage,
                speed,
                onProgress,
              })

      const { blob, file, duration } = result

      const objectUrl = URL.createObjectURL(blob)
      generationUrls.add(objectUrl)
      const voiceLabel =
        engine === 'kokoro'
          ? getKokoroTtsVoiceOption(kokoroVoice).label
          : engine === 'moss'
            ? getMossTtsVoiceOption(mossVoice).label
            : (SUPERTONIC_TTS_VOICE_OPTIONS.find((option) => option.value === supertonicVoice)
                ?.label ?? supertonicVoice)
      const modelLabel =
        engine === 'kokoro'
          ? getKokoroTtsModelOption(ttsModel).label
          : engine === 'moss'
            ? 'Multilingual Nano'
            : 'Supertonic 3'
      const engineTags =
        engine === 'kokoro'
          ? [
              'ai-generated',
              'kokoro-tts',
              'tts-engine:kokoro',
              `kokoro-quality:${ttsModel}`,
              `kokoro-voice:${kokoroVoice}`,
            ]
          : engine === 'moss'
            ? ['ai-generated', 'moss-tts', 'tts-engine:moss', `moss-voice:${mossVoice}`]
            : [
                'ai-generated',
                'supertonic-tts',
                'tts-engine:supertonic',
                `supertonic-voice:${supertonicVoice}`,
              ]

      const generation: AudioGeneration = {
        id: crypto.randomUUID(),
        file,
        objectUrl,
        byteSize: blob.size,
        duration,
        textSnippet: text,
        voice: voiceLabel,
        model: modelLabel,
        summary: text,
        details: `${voiceLabel} / ${modelLabel} / ${duration > 0 ? `${duration.toFixed(1)}s` : '-'} / ${formatBytes(blob.size)}`,
        tags: engineTags,
        savedMediaId: null,
        saving: false,
      }

      ttsGenerations = [generation, ...ttsGenerations]
      ttsProgress = null
    } catch (generationError) {
      ttsError =
        generationError instanceof Error
          ? generationError.message
          : t('editor.tts.errors.generateFailed')
      ttsProgress = null
    } finally {
      isTtsGenerating = false
    }
  }

  async function handleMusicGenerate() {
    if (!currentProjectId.current) return null
    if (!trimmedMusicPrompt) {
      musicError = t('editor.aiPanel.errors.describeMusic')
      return null
    }
    if (!isMusicSupported) {
      musicError = t('editor.aiPanel.errors.musicgenUnsupported')
      return null
    }

    const prompt = trimmedMusicPrompt
    const targetDuration = musicDuration
    const abortController = new AbortController()
    musicAbort = abortController

    musicError = null
    isMusicGenerating = true
    musicProgress = t('editor.aiPanel.progressPreparingMusic')
    musicProgressPct = null

    try {
      const { blob, file, duration } = await musicgenService.generateMusicFile({
        prompt,
        model: musicModel,
        durationSeconds: targetDuration,
        onProgress: (stage, fraction) => {
          musicProgress = stage
          musicProgressPct = fraction ?? null
        },
        signal: abortController.signal,
      })

      const objectUrl = URL.createObjectURL(blob)
      generationUrls.add(objectUrl)

      const modelLabel =
        MUSICGEN_MODEL_OPTIONS.find((option) => option.value === musicModel)?.label ?? musicModel
      const generation: AudioGeneration = {
        id: crypto.randomUUID(),
        file,
        objectUrl,
        byteSize: blob.size,
        duration,
        textSnippet: prompt,
        voice: modelLabel,
        model: `target ${targetDuration}s`,
        summary: prompt,
        details: `${modelLabel} / target ${targetDuration}s / ${duration > 0 ? `${duration.toFixed(1)}s` : '-'} / ${formatBytes(blob.size)}`,
        tags: [
          'ai-generated',
          'musicgen',
          `musicgen-model:${musicModel}`,
          `musicgen-target:${targetDuration}s`,
        ],
        savedMediaId: null,
        saving: false,
      }

      musicGenerations = [generation, ...musicGenerations]
    } catch (generationError) {
      if (generationError instanceof DOMException && generationError.name === 'AbortError') {
        // Intentional cancellation — no error shown.
      } else {
        musicError =
          generationError instanceof Error
            ? generationError.message
            : t('editor.aiPanel.errors.generateMusicFailed')
      }
    } finally {
      musicAbort = null
      isMusicGenerating = false
      musicProgress = null
      musicProgressPct = null
    }
  }

  function handleMusicCancel() {
    musicAbort?.abort()
  }

  function getGenerations(list: GenerationListId): AudioGeneration[] {
    return list === 'tts' ? ttsGenerations : musicGenerations
  }

  function setGenerations(list: GenerationListId, next: AudioGeneration[]) {
    if (list === 'tts') ttsGenerations = next
    else musicGenerations = next
  }

  function setListError(list: GenerationListId, message: string) {
    if (list === 'tts') ttsError = message
    else musicError = message
  }

  function updateGenerationInList(
    list: GenerationListId,
    id: string,
    patch: Partial<AudioGeneration>,
  ) {
    setGenerations(
      list,
      getGenerations(list).map((generation) =>
        generation.id === id ? { ...generation, ...patch } : generation,
      ),
    )
  }

  async function saveGeneration(
    generation: AudioGeneration,
    list: GenerationListId,
  ): Promise<MediaMetadata | null> {
    const projectId = currentProjectId.current
    if (!projectId) return null
    updateGenerationInList(list, generation.id, { saving: true })

    try {
      const { mediaLibraryService } = await importMediaLibraryService()
      const media = await mediaLibraryService.importGeneratedAudio(generation.file, projectId, {
        tags: generation.tags,
      })

      const { loadMediaItems, selectMedia } = useMediaLibraryStore.getState()
      await loadMediaItems()
      selectMedia([media.id])
      // Remove from tracked URLs so unmount cleanup won't revoke a URL
      // that may be referenced by a timeline item's src
      generationUrls.delete(generation.objectUrl)
      updateGenerationInList(list, generation.id, {
        saving: false,
        savedMediaId: media.id,
      })
      return media
    } catch (saveError) {
      setListError(
        list,
        saveError instanceof Error ? saveError.message : t('editor.aiPanel.errors.saveAudioFailed'),
      )
      updateGenerationInList(list, generation.id, { saving: false })
      return null
    }
  }

  async function handleSave(generation: AudioGeneration, list: GenerationListId) {
    const media = await saveGeneration(generation, list)
    if (media) {
      useMediaLibraryStore.getState().showNotification({
        type: 'success',
        message: t('editor.aiPanel.notifications.savedToLibrary', {
          fileName: media.fileName,
        }),
      })
    }
  }

  async function handleSaveAndInsert(generation: AudioGeneration, list: GenerationListId) {
    // Saving is asynchronous, so capture the user's intended insertion point
    // when they click rather than after the media import finishes.
    const insertionFrame = usePlaybackStore.getState().currentFrame
    const media = await saveGeneration(generation, list)
    if (!media) return

    const inserted = insertGeneratedAudioOnNewTrack(media, generation.objectUrl, insertionFrame)
    useMediaLibraryStore.getState().showNotification({
      type: inserted ? 'success' : 'warning',
      message: inserted
        ? t('editor.aiPanel.notifications.savedAndAdded', { fileName: media.fileName })
        : t('editor.tts.notifications.savedNoTrack', { fileName: media.fileName }),
    })
  }

  function removeGenerationFromList(list: GenerationListId, id: string) {
    const previous = getGenerations(list)
    const generation = previous.find((entry) => entry.id === id)
    // Only revoke the blob URL if it has not been saved; saved items may
    // have their blob URL referenced by a timeline audio item's `src`.
    if (generation && !generation.savedMediaId) {
      URL.revokeObjectURL(generation.objectUrl)
      generationUrls.delete(generation.objectUrl)
    }
    setGenerations(
      list,
      previous.filter((entry) => entry.id !== id),
    )
  }

  function clearGenerationList(list: GenerationListId) {
    // Only revoke blob URLs for unsaved generations; saved ones may be
    // referenced by timeline items.
    for (const generation of getGenerations(list)) {
      if (!generation.savedMediaId) {
        URL.revokeObjectURL(generation.objectUrl)
        generationUrls.delete(generation.objectUrl)
      }
    }
    setGenerations(list, [])
  }

  function handleVoiceChange(value: string) {
    if (ttsEngine === 'kokoro') {
      ttsKokoroVoice = value as KokoroTtsVoice
    } else if (ttsEngine === 'moss') {
      ttsMossVoice = value as MossTtsVoice
    } else {
      ttsSupertonicVoice = value as SupertonicTtsVoice
    }
  }

  const voiceOptions = $derived(
    ttsEngine === 'kokoro'
      ? KOKORO_TTS_VOICE_OPTIONS
      : ttsEngine === 'moss'
        ? MOSS_TTS_VOICE_OPTIONS
        : SUPERTONIC_TTS_VOICE_OPTIONS,
  )
</script>

<div class="min-h-0 flex-1 overflow-y-auto p-3">
  <div class="space-y-3">
    <Collapsible bind:open={ttsSectionOpen}>
      <div class="-mx-3 -mt-3 bg-secondary/50 px-3 py-2">
        <CollapsibleTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="flex w-full items-center justify-between gap-2 text-left"
              aria-label={ttsSectionOpen
                ? t('editor.aiPanel.collapseTextToSpeech')
                : t('editor.aiPanel.expandTextToSpeech')}
            >
              <h2 class="text-sm font-medium">{t('editor.aiPanel.textToSpeech')}</h2>
              <ChevronDown
                class={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  ttsSectionOpen && 'rotate-180',
                )}
              />
            </button>
          {/snippet}
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent class="space-y-4 pt-3">
        {#if !isTtsSupported}
          <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {ttsEngine === 'kokoro'
              ? t('editor.tts.kokoroUnsupported')
              : ttsEngine === 'moss'
                ? t('editor.tts.mossUnsupported')
                : t('editor.tts.supertonicUnsupported', {
                    defaultValue:
                      'This browser cannot run the local Supertonic TTS runtime. Try a recent Chrome or Edge browser.',
                  })}
          </div>
        {/if}

        <div class="space-y-2">
          <Label for="ai-tts-text">{t('editor.tts.text')}</Label>
          <Textarea
            bind:ref={ttsTextarea}
            id="ai-tts-text"
            value={ttsText}
            oninput={(event) => (ttsText = event.currentTarget.value)}
            placeholder={t('editor.tts.textPlaceholder')}
            class="min-h-24 resize-y bg-secondary/30 text-sm"
            disabled={isTtsGenerating}
          />
          {#if ttsEngine === 'supertonic'}
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] text-muted-foreground">
                {t('editor.tts.expressiveTags', { defaultValue: 'Expressive tags' })}
              </span>
              {#each SUPERTONIC_TTS_EXPRESSIVE_TAG_OPTIONS as tag (tag.value)}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="h-6 px-2 text-[11px]"
                  onclick={() =>
                    insertTextAtCursor({
                      input: ttsTextarea,
                      insertText: tag.value,
                      setText: (next) => (ttsText = next),
                      text: ttsText,
                    })}
                  disabled={isTtsGenerating}
                >
                  {tag.label}
                </Button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label>{t('editor.tts.engine')}</Label>
            <Select
              value={ttsEngine}
              onValueChange={(value) => (ttsEngine = value as StoredTtsEngine)}
              disabled={isTtsGenerating}
            >
              <SelectTrigger class="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kokoro" class="text-xs">
                  {t('editor.tts.kokoroOption')}
                </SelectItem>
                <SelectItem value="moss" class="text-xs">
                  {t('editor.tts.mossOption')}
                </SelectItem>
                <SelectItem value="supertonic" class="text-xs">
                  {t('editor.tts.supertonicOption', {
                    defaultValue: 'Supertonic 3 (31 languages, local ONNX)',
                  })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="grid grid-cols-1 gap-3">
            <div class="space-y-1.5">
              <Label>{t('editor.tts.voice')}</Label>
              <Select value={voice} onValueChange={handleVoiceChange} disabled={isTtsGenerating}>
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent class="max-h-72">
                  {#each voiceOptions as option (option.value)}
                    <SelectItem value={option.value} class="text-xs">
                      {option.label}
                    </SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
            {#if ttsEngine === 'supertonic'}
              <div class="space-y-1.5">
                <Label>{t('editor.tts.language', { defaultValue: 'Language' })}</Label>
                <Select
                  value={ttsSupertonicLanguage}
                  onValueChange={(value) =>
                    (ttsSupertonicLanguage = value as SupertonicTtsLanguageSelection)}
                  disabled={isTtsGenerating}
                >
                  <SelectTrigger class="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="max-h-72">
                    {#each SUPERTONIC_TTS_LANGUAGE_OPTIONS as option (option.value)}
                      <SelectItem value={option.value} class="text-xs">
                        {getLanguageDisplayName(
                          option.value,
                          option.label,
                          uiLanguage,
                          t('editor.tts.autoDetectLanguage', {
                            defaultValue: 'Auto detect',
                          }),
                        )}
                      </SelectItem>
                    {/each}
                  </SelectContent>
                </Select>
              </div>
            {/if}
          </div>
        </div>

        <div class="flex items-center gap-2">
          {#if supportsNativeTtsSpeed}
            <SliderInput
              label={t('editor.tts.speed')}
              value={ttsSpeed}
              onChange={(next) => (ttsSpeed = next)}
              min={ttsSpeedMin}
              max={ttsSpeedMax}
              step={0.05}
              unit="x"
              disabled={isTtsGenerating}
            />
          {/if}
          <Button
            size="sm"
            onclick={() => {
              void handleTtsGenerate()
            }}
            disabled={isTtsGenerating ||
              !trimmedTtsText ||
              !currentProjectId.current ||
              !isTtsSupported}
            class="h-7 shrink-0 gap-1.5"
          >
            {#if isTtsGenerating}
              <Loader2 class="h-3.5 w-3.5 animate-spin" />
            {:else}
              <WandSparkles class="h-3.5 w-3.5" />
            {/if}
            {isTtsGenerating ? t('editor.tts.generating') : t('editor.tts.generate')}
          </Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          {t('editor.aiPanel.runsLocally', {
            runtime: currentTtsRuntimeLabel,
            backend: currentTtsBackendLabel,
          })}
        </p>

        {#if ttsProgress}
          <div class="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
            {ttsProgress}
          </div>
        {/if}

        {#if ttsError}
          <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {ttsError}
          </div>
        {/if}

        {#if ttsGenerations.length > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {t('editor.aiPanel.history', {
                  count: ttsGenerations.length,
                  size: formatBytes(totalTtsBytes),
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                onclick={() => clearGenerationList('tts')}
                disabled={anyTtsSaving}
              >
                <Trash2 class="h-3 w-3" />
                {t('editor.aiPanel.clearAll')}
              </Button>
            </div>

            <div class="space-y-2">
              {#each ttsGenerations as gen (gen.id)}
                <AiGenerationRow
                  generation={gen}
                  onSave={(entry) => handleSave(entry, 'tts')}
                  onSaveAndInsert={(entry) => handleSaveAndInsert(entry, 'tts')}
                  onRemove={(id) => removeGenerationFromList('tts', id)}
                />
              {/each}
            </div>
          </div>
        {/if}
      </CollapsibleContent>
    </Collapsible>

    <Collapsible bind:open={musicSectionOpen}>
      <div class="-mx-3 bg-secondary/50 px-3 py-2">
        <div class="flex items-center gap-2">
          <CollapsibleTrigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="flex flex-1 items-center justify-between gap-2 text-left"
                aria-label={musicSectionOpen
                  ? t('editor.aiPanel.collapseMusicGeneration')
                  : t('editor.aiPanel.expandMusicGeneration')}
              >
                <h2 class="text-sm font-medium">{t('editor.aiPanel.musicGeneration')}</h2>
                <ChevronDown
                  class={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    musicSectionOpen && 'rotate-180',
                  )}
                />
              </button>
            {/snippet}
          </CollapsibleTrigger>
          <Popover bind:open={musicInfoOpen}>
            <PopoverTrigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={t('editor.aiPanel.musicGenerationInfo')}
                  onmouseenter={() => (musicInfoOpen = true)}
                  onmouseleave={() => (musicInfoOpen = false)}
                >
                  <Info class="h-3.5 w-3.5" />
                </button>
              {/snippet}
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              class="w-72 space-y-2 p-3 text-xs"
              onmouseenter={() => (musicInfoOpen = true)}
              onmouseleave={() => (musicInfoOpen = false)}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  WebGPU
                </span>
                <span
                  class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  Local
                </span>
              </div>
              <p class="leading-relaxed text-muted-foreground">
                {t('editor.aiPanel.musicgenDescription')}
              </p>
              <table class="w-full text-[11px]">
                <tbody>
                  {#each MUSICGEN_MODEL_OPTIONS as option (option.value)}
                    <tr class="border-t border-border/50">
                      <td class="py-1 pr-2 font-medium text-foreground">{option.label}</td>
                      <td class="py-1 text-right text-muted-foreground">
                        {option.downloadLabel}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <p class="leading-relaxed text-muted-foreground">
                {t('editor.aiPanel.musicgenPromptHint')}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <CollapsibleContent class="space-y-4 pt-3">
        {#if !isMusicSupported}
          <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {t('editor.aiPanel.musicgenUnsupported')}
          </div>
        {/if}

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label for="ai-music-prompt">{t('editor.aiPanel.prompt')}</Label>
            <Select
              value=""
              onValueChange={(value) => (musicPrompt = value)}
              disabled={isMusicGenerating}
            >
              <SelectTrigger
                class="h-6 w-auto gap-1 border-none bg-transparent px-1.5 text-[11px] text-muted-foreground shadow-none hover:text-foreground"
              >
                <SelectValue placeholder={t('editor.aiPanel.presets')} />
              </SelectTrigger>
              <SelectContent align="end">
                {#each MUSIC_PROMPT_PRESETS as preset (preset.labelKey)}
                  <SelectItem value={t(preset.promptKey)} class="text-xs">
                    {t(preset.labelKey)}
                  </SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            id="ai-music-prompt"
            value={musicPrompt}
            oninput={(event) => (musicPrompt = event.currentTarget.value)}
            placeholder={t('editor.aiPanel.musicPromptPlaceholder')}
            class="min-h-24 resize-y bg-secondary/30 text-sm"
            disabled={isMusicGenerating}
          />
        </div>

        <div class="flex items-center gap-2">
          <SliderInput
            label={t('editor.aiPanel.length')}
            value={musicDuration}
            onChange={(value) => (musicDuration = Math.round(value))}
            min={currentMusicModel.minDurationSeconds}
            max={currentMusicModel.maxDurationSeconds}
            step={1}
            unit="s"
            disabled={isMusicGenerating}
          />
          {#if isMusicGenerating}
            <Button
              variant="ghost"
              size="sm"
              onclick={handleMusicCancel}
              class="h-7 shrink-0 gap-1.5 text-muted-foreground"
            >
              <X class="h-3.5 w-3.5" />
              {t('common.cancel')}
            </Button>
          {/if}
          <Button
            size="sm"
            onclick={() => {
              void handleMusicGenerate()
            }}
            disabled={isMusicGenerating ||
              !trimmedMusicPrompt ||
              !currentProjectId.current ||
              !isMusicSupported}
            class="h-7 shrink-0 gap-1.5"
          >
            {#if isMusicGenerating}
              <Loader2 class="h-3.5 w-3.5 animate-spin" />
            {:else}
              <WandSparkles class="h-3.5 w-3.5" />
            {/if}
            {isMusicGenerating ? t('editor.tts.generating') : t('editor.tts.generate')}
          </Button>
        </div>

        {#if musicProgress}
          <div class="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
            <p class="text-xs text-muted-foreground">{musicProgress}</p>
            {#if musicProgressPct != null}
              <div class="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  class="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
                  style:width="{Math.round(musicProgressPct * 100)}%"
                ></div>
              </div>
            {/if}
          </div>
        {/if}

        {#if musicError}
          <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {musicError}
          </div>
        {/if}

        {#if musicGenerations.length > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {t('editor.aiPanel.musicHistory', {
                  count: musicGenerations.length,
                  size: formatBytes(totalMusicBytes),
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                onclick={() => clearGenerationList('music')}
                disabled={anyMusicSaving}
              >
                <Trash2 class="h-3 w-3" />
                {t('editor.aiPanel.clearAll')}
              </Button>
            </div>

            <div class="space-y-2">
              {#each musicGenerations as generation (generation.id)}
                <AiGenerationRow
                  {generation}
                  onSave={(entry) => handleSave(entry, 'music')}
                  onSaveAndInsert={(entry) => handleSaveAndInsert(entry, 'music')}
                  onRemove={(id) => removeGenerationFromList('music', id)}
                />
              {/each}
            </div>
          </div>
        {/if}
      </CollapsibleContent>
    </Collapsible>
  </div>
</div>
