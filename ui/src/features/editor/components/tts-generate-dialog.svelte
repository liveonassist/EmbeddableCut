<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles'
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
  } from '@/components/ui/dialog'
  import { SliderInput } from '@/shared/ui/property-controls'
  import {
    getStoredTtsEngine,
    setStoredTtsEngine,
    type StoredTtsEngine,
  } from '@/shared/utils/tts-settings'
  import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
  import {
    KOKORO_TTS_BEST_MODEL,
    kokoroTtsService,
    type KokoroTtsModel,
    type KokoroTtsVoice,
  } from '@/features/editor/services/kokoro-tts-service'
  import { mossTtsService, type MossTtsVoice } from '@/features/editor/services/moss-tts-service'
  import {
    supertonicTtsService,
    type SupertonicTtsLanguageSelection,
    type SupertonicTtsVoice,
  } from '@/features/editor/services/supertonic-tts-service'
  import { useTtsGenerateDialogStore } from '@/shared/state/tts-generate-dialog'
  import { useTtsGeneration } from '../hooks/use-tts-generation.svelte'
  import {
    NATIVE_SPEED_ENGINES,
    TTS_SPEED_RANGE_BY_ENGINE,
    TTS_VOICE_CHANGE_HANDLERS,
    TTS_VOICE_KEY_BY_ENGINE,
    TTS_VOICE_OPTION_RESOLVERS,
    TTS_VOICE_OPTIONS_BY_ENGINE,
    type TtsVoiceSelection,
  } from '@/features/editor/utils/tts-generate-options'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import TtsDialogActions from './tts-dialog-actions.svelte'
  import { TtsErrorNotice, TtsProgressNotice, TtsUnsupportedNotice } from './tts-dialog-notices'
  import TtsEngineVoiceFields from './tts-engine-voice-fields.svelte'
  import TtsResultPreview from './tts-result-preview.svelte'
  import TtsTextPanel from './tts-text-panel.svelte'

  const isOpen = select(useTtsGenerateDialogStore, (s) => s.isOpen)
  const initialText = select(useTtsGenerateDialogStore, (s) => s.initialText)
  const sourceItemId = select(useTtsGenerateDialogStore, (s) => s.sourceItemId)

  const currentProjectId = select(useMediaLibraryStore, (state) => state.currentProjectId)

  let text = $state('')
  let engine = $state<StoredTtsEngine>(getStoredTtsEngine())
  let kokoroVoice = $state<KokoroTtsVoice>('af_heart')
  let mossVoice = $state<MossTtsVoice>('Xiaoyu')
  let supertonicVoice = $state<SupertonicTtsVoice>('M3')
  let supertonicLanguage = $state<SupertonicTtsLanguageSelection>('auto')
  const model: KokoroTtsModel = KOKORO_TTS_BEST_MODEL
  let speed = $state(1)

  const engineSupport: Record<StoredTtsEngine, boolean> = {
    kokoro: kokoroTtsService.isSupported(),
    moss: mossTtsService.isSupported(),
    supertonic: supertonicTtsService.isSupported(),
  }
  const isTtsSupported = $derived(engineSupport[engine])
  const supportsNativeSpeed = $derived(NATIVE_SPEED_ENGINES.includes(engine))
  const speedRange = $derived(TTS_SPEED_RANGE_BY_ENGINE[engine])
  const effectiveSpeed = $derived(supportsNativeSpeed ? speed : 1)
  const trimmedText = $derived(text.trim())
  const voices: TtsVoiceSelection = $derived({
    kokoro: kokoroVoice,
    moss: mossVoice,
    supertonic: supertonicVoice,
  })
  const resolvedVoice = $derived(
    TTS_VOICE_OPTION_RESOLVERS[engine](voices[TTS_VOICE_KEY_BY_ENGINE[engine]]),
  )
  const voiceOptions = $derived(TTS_VOICE_OPTIONS_BY_ENGINE[engine])

  const generation = useTtsGeneration(() => {
    const { loadMediaItems, showNotification } = useMediaLibraryStore.getState()
    return {
      projectId: currentProjectId.current,
      sourceItemId: sourceItemId.current,
      text: trimmedText,
      engine,
      voice: resolvedVoice.value,
      voiceLabel: resolvedVoice.label,
      language: supertonicLanguage,
      speed: effectiveSpeed,
      model,
      isSupported: isTtsSupported,
      loadMediaItems,
      showNotification,
    }
  })

  // Reset state when dialog opens
  $effect(() => {
    if (!isOpen.current) return
    const nextText = initialText.current
    untrack(() => {
      generation.resetSession()
      text = nextText
      engine = getStoredTtsEngine()
    })
  })

  $effect(() => {
    setStoredTtsEngine(engine)
  })

  // Cleanup blob URL when dialog closes
  $effect(() => {
    if (isOpen.current) return
    const inserted = generation.inserted
    untrack(() => generation.releaseResult(inserted))
  })

  $effect(() => {
    const { min, max } = speedRange
    untrack(() => {
      speed = Math.min(max, Math.max(min, speed))
    })
  })

  function handleOpenChange(open: boolean) {
    if (!open) useTtsGenerateDialogStore.getState().close()
  }

  function handleVoiceChange(value: string) {
    TTS_VOICE_CHANGE_HANDLERS[engine](value, {
      kokoro: (next) => (kokoroVoice = next),
      moss: (next) => (mossVoice = next),
      supertonic: (next) => (supertonicVoice = next),
    })
  }
</script>

<Dialog bind:open={() => isOpen.current, handleOpenChange}>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2 text-sm">
        <WandSparkles class="h-4 w-4" />
        {t('editor.tts.dialogTitle')}
      </DialogTitle>
      <DialogDescription class="text-xs">
        {t('editor.tts.dialogDescription')}
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4">
      {#if !isTtsSupported}
        <TtsUnsupportedNotice {engine} />
      {/if}

      <TtsEngineVoiceFields
        {engine}
        onEngineChange={(next) => (engine = next)}
        voice={resolvedVoice.value}
        {voiceOptions}
        onVoiceChange={handleVoiceChange}
        language={supertonicLanguage}
        onLanguageChange={(next) => (supertonicLanguage = next)}
        busy={generation.busy}
      />

      <TtsTextPanel {engine} {text} onTextChange={(next) => (text = next)} busy={generation.busy} />

      {#if supportsNativeSpeed}
        <SliderInput
          label={t('editor.tts.speed')}
          value={speed}
          onChange={(next) => (speed = next)}
          min={speedRange.min}
          max={speedRange.max}
          step={0.05}
          unit="x"
          disabled={generation.busy}
        />
      {/if}

      {#if generation.progress}
        <TtsProgressNotice progress={generation.progress} />
      {/if}

      {#if generation.error}
        <TtsErrorNotice error={generation.error} />
      {/if}

      {#if generation.result}
        <TtsResultPreview result={generation.result} inserted={generation.inserted} />
      {/if}

      <TtsDialogActions
        isGenerating={generation.isGenerating}
        isInserting={generation.isInserting}
        hasResult={generation.result !== null}
        inserted={generation.inserted}
        canGenerate={generation.canGenerate}
        onGenerate={() => void generation.generate()}
        onInsert={() => void generation.insert()}
      />
    </div>
  </DialogContent>
</Dialog>
