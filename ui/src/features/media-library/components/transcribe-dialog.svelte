<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Square from 'lucide-svelte/icons/square'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import { Combobox } from '@/components/ui/combobox'
  import { cn } from '@/shared/ui/cn'
  import { useEditorStore } from '@/shared/state/editor'
  import { usePlaybackStore } from '@/shared/state/playback'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { useSettingsStore } from '@/features/media-library/deps/settings-contract'
  import { getMediaTranscriptionModelOptions } from '@/features/media-library/transcription/registry'
  import {
    isParakeetModel,
    PARAKEET_SUPPORTED_LANGUAGES,
  } from '@/features/media-library/transcription/transcription-engine'
  import {
    getWhisperLanguageSelectValue,
    getWhisperLanguageSettingValue,
    normalizeSelectableWhisperModel,
    WHISPER_AUTO_LANGUAGE_VALUE,
    WHISPER_LANGUAGE_OPTIONS,
    WHISPER_QUANTIZATION_OPTIONS,
  } from '@/shared/utils/whisper-settings'
  import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import type { TranscribeDialogValues } from './transcribe-dialog-types'

  interface TranscribeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    fileName: string
    hasTranscript: boolean
    isRunning: boolean
    /** Progress within the current stage, not across the whole job. */
    progressPercent: number | null
    /** Set while a stage reports no progress (ONNX graph compile) — render a moving bar, not a stalled one. */
    progressIndeterminate?: boolean
    progressLabel: string
    /** Secondary line: a byte counter while downloading, prose while compiling. */
    progressDetail?: string | null
    errorMessage?: string | null
    onStart: (values: TranscribeDialogValues) => void
    onCancel: () => void
  }

  let {
    open,
    onOpenChange,
    fileName,
    hasTranscript,
    isRunning,
    progressPercent,
    progressIndeterminate = false,
    progressLabel,
    progressDetail = null,
    errorMessage,
    onStart,
    onCancel,
  }: TranscribeDialogProps = $props()

  const defaultModel = select(useSettingsStore, (s) => s.defaultWhisperModel)
  const defaultQuantization = select(useSettingsStore, (s) => s.defaultWhisperQuantization)
  const defaultLanguage = select(useSettingsStore, (s) => s.defaultWhisperLanguage)

  const modelOptions = getMediaTranscriptionModelOptions()

  let model = $state<MediaTranscriptModel>(
    untrack(() => normalizeSelectableWhisperModel(defaultModel.current)),
  )
  let quantization = $state<MediaTranscriptQuantization>(untrack(() => defaultQuantization.current))
  let languageValue = $state<string>(
    untrack(() => getWhisperLanguageSelectValue(defaultLanguage.current)),
  )

  $effect.pre(() => {
    if (!open) return
    const nextModel = normalizeSelectableWhisperModel(defaultModel.current)
    const nextQuantization = defaultQuantization.current
    const nextLanguage = defaultLanguage.current
    untrack(() => {
      model = nextModel
      quantization = nextQuantization
      languageValue = isParakeetModel(nextModel)
        ? WHISPER_AUTO_LANGUAGE_VALUE
        : getWhisperLanguageSelectValue(nextLanguage)
    })
  })

  $effect(() => {
    if (!open) return
    const editor = useEditorStore.getState()
    editor.beginTranscriptionDialog()
    editor.clearMediaSkimPreview()
    editor.clearCompoundClipSkimPreview()
    usePlaybackStore.getState().setPreviewFrame(null)
    usePlaybackStore.getState().pause()

    return () => {
      useEditorStore.getState().endTranscriptionDialog()
    }
  })

  const handleStart = () => {
    onStart({
      model,
      quantization,
      language: isParakeetModel(model)
        ? getWhisperLanguageSettingValue(WHISPER_AUTO_LANGUAGE_VALUE)
        : getWhisperLanguageSettingValue(languageValue),
    })
  }

  const handleModelChange = (value: string) => {
    const nextModel = value as MediaTranscriptModel
    model = nextModel
    if (isParakeetModel(nextModel)) {
      // Parakeet detects its supported languages itself and does not accept a language hint.
      // Clear a previous Whisper-only choice so the visible model always matches the engine used.
      languageValue = WHISPER_AUTO_LANGUAGE_VALUE
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (isRunning && !nextOpen) {
      return
    }
    onOpenChange(nextOpen)
  }

  const title = $derived(
    hasTranscript ? t('media.transcribe.refreshTitle') : t('media.transcribe.generateTitle'),
  )
</script>

<Dialog bind:open={() => open, handleOpenChange}>
  <DialogContent
    class="sm:max-w-md"
    hideCloseButton={isRunning}
    onInteractOutside={(event) => event.preventDefault()}
    onEscapeKeydown={(event) => {
      if (isRunning) event.preventDefault()
    }}
  >
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription class="truncate">{fileName}</DialogDescription>
    </DialogHeader>

    <div class="space-y-3">
      <div class="space-y-1.5">
        <Label for="transcribe-model" class="text-sm">
          {t('media.transcribe.model')}
        </Label>
        <Select value={model} onValueChange={handleModelChange} disabled={isRunning}>
          <SelectTrigger id="transcribe-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {#each modelOptions as option (option.value)}
              <SelectItem value={option.value}>
                {option.label}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>

      {#if !isParakeetModel(model)}
        <div class="space-y-1.5">
          <Label for="transcribe-quantization" class="text-sm">
            {t('media.transcribe.quantization')}
          </Label>
          <Select
            value={quantization}
            onValueChange={(value) => (quantization = value as MediaTranscriptQuantization)}
            disabled={isRunning}
          >
            <SelectTrigger id="transcribe-quantization">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {#each WHISPER_QUANTIZATION_OPTIONS as option (option.value)}
                <SelectItem value={option.value}>
                  {option.label}
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
      {/if}

      {#if isParakeetModel(model)}
        <div class="space-y-1.5">
          <Label class="text-sm">{t('media.transcribe.language')}</Label>
          <div class="rounded-md border border-border bg-secondary/35 px-3 py-2.5">
            <div class="text-sm font-medium">{t('media.transcribe.autoDetect')}</div>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {t('media.transcribe.parakeetAutoDetects', {
                count: PARAKEET_SUPPORTED_LANGUAGES.size,
              })}
            </p>
            <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('media.transcribe.parakeetChooseWhisper')}
            </p>
          </div>
        </div>
      {:else}
        <div class="space-y-1.5">
          <Label for="transcribe-language" class="text-sm">
            {t('media.transcribe.language')}
          </Label>
          <Combobox
            id="transcribe-language"
            value={languageValue}
            onValueChange={(value) => (languageValue = value)}
            options={WHISPER_LANGUAGE_OPTIONS}
            placeholder={t('media.transcribe.autoDetect')}
            searchPlaceholder={t('media.transcribe.searchLanguages')}
            emptyMessage={t('media.transcribe.noLanguages')}
            disabled={isRunning}
          />
          <p class="text-xs leading-relaxed text-muted-foreground">
            {t('media.transcribe.whisperLanguageHint')}
          </p>
        </div>
      {/if}

      {#if errorMessage && !isRunning}
        <div
          role="alert"
          class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {errorMessage}
        </div>
      {/if}

      {#if isRunning}
        <div class="space-y-1.5 rounded-md border border-border bg-secondary/40 px-3 py-2">
          <div class="flex items-center gap-2 text-sm">
            <Loader2 class="h-3.5 w-3.5 animate-spin" />
            <span class="truncate">{progressLabel}</span>
            {#if !progressIndeterminate && progressPercent !== null}
              <span class="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {progressPercent}%
              </span>
            {/if}
          </div>
          {#if progressIndeterminate || progressPercent !== null}
            <div
              role="progressbar"
              aria-label={t('media.transcribe.progressAria')}
              aria-valuemin={progressIndeterminate ? undefined : 0}
              aria-valuemax={progressIndeterminate ? undefined : 100}
              aria-valuenow={progressIndeterminate ? undefined : (progressPercent ?? undefined)}
              class="h-1 overflow-hidden rounded-full bg-secondary"
            >
              <div
                class={cn(
                  'h-full rounded-full bg-blue-500 transition-all duration-300',
                  progressIndeterminate && 'w-1/3 animate-pulse',
                )}
                style:width={progressIndeterminate || progressPercent === null
                  ? undefined
                  : `${progressPercent}%`}
              ></div>
            </div>
          {/if}
          {#if progressDetail}
            <div class="text-xs text-muted-foreground tabular-nums">{progressDetail}</div>
          {/if}
        </div>
      {/if}
    </div>

    <DialogFooter>
      {#if isRunning}
        <Button variant="destructive" onclick={onCancel}>
          <Square class="mr-1.5 h-3.5 w-3.5" />
          {t('media.transcribe.stop')}
        </Button>
      {:else}
        <Button variant="outline" onclick={() => handleOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button onclick={handleStart}>{t('media.transcribe.start')}</Button>
      {/if}
    </DialogFooter>
  </DialogContent>
</Dialog>
