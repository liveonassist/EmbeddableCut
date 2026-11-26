<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Info from '@lucide/svelte/icons/info'
  import { Label } from '@/components/ui/label'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { MOSS_TTS_SUPPORTED_LANGUAGES } from '@/features/editor/services/moss-tts-service'
  import {
    SUPERTONIC_TTS_LANGUAGE_OPTIONS,
    SUPERTONIC_TTS_SUPPORTED_LANGUAGES,
    type SupertonicTtsLanguageSelection,
  } from '@/features/editor/services/supertonic-tts-service'
  import type { StoredTtsEngine } from '@/shared/utils/tts-settings'
  import { getLanguageDisplayName } from '@/features/editor/utils/tts-ui-helpers'
  import { i18n, locale, t } from '$lib/i18n.svelte'

  interface TtsEngineVoiceFieldsProps {
    engine: StoredTtsEngine
    onEngineChange: (engine: StoredTtsEngine) => void
    voice: string
    voiceOptions: readonly { value: string; label: string }[]
    onVoiceChange: (voice: string) => void
    language: SupertonicTtsLanguageSelection
    onLanguageChange: (language: SupertonicTtsLanguageSelection) => void
    busy: boolean
  }

  /** Engine picker with its support popover, plus the voice and language pickers. */
  let {
    engine,
    onEngineChange,
    voice,
    voiceOptions,
    onVoiceChange,
    language,
    onLanguageChange,
    busy,
  }: TtsEngineVoiceFieldsProps = $props()

  const mossLanguagesLabel = MOSS_TTS_SUPPORTED_LANGUAGES.join(', ')
  const supertonicLanguagesLabel = SUPERTONIC_TTS_SUPPORTED_LANGUAGES.join(', ')
  const uiLanguage = $derived((void locale.current, i18n.language))
</script>

<div class="space-y-3">
  <div class="space-y-1.5">
    <div class="flex items-center gap-1.5">
      <Label>{t('editor.tts.engine')}</Label>
      <Popover>
        <PopoverTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('editor.tts.engineSupportDetails')}
            >
              <Info class="h-3.5 w-3.5" />
            </button>
          {/snippet}
        </PopoverTrigger>
        <PopoverContent align="start" class="w-80 space-y-2 p-3">
          <div class="space-y-1">
            <p class="text-xs font-medium">Kokoro</p>
            <p class="text-[11px] text-muted-foreground">
              {t('editor.tts.kokoroDescription')}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs font-medium">MOSS Nano</p>
            <p class="text-[11px] text-muted-foreground">
              {t('editor.tts.supportedLanguages', { languages: mossLanguagesLabel })}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs font-medium">Supertonic 3</p>
            <p class="text-[11px] text-muted-foreground">
              {t('editor.tts.supportedLanguages', { languages: supertonicLanguagesLabel })}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
    <Select
      value={engine}
      onValueChange={(value) => onEngineChange(value as StoredTtsEngine)}
      disabled={busy}
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
      <Select value={voice} onValueChange={onVoiceChange} disabled={busy}>
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
    {#if engine === 'supertonic'}
      <div class="space-y-1.5">
        <Label>{t('editor.tts.language', { defaultValue: 'Language' })}</Label>
        <Select
          value={language}
          onValueChange={(value) => onLanguageChange(value as SupertonicTtsLanguageSelection)}
          disabled={busy}
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
                  t('editor.tts.autoDetectLanguage', { defaultValue: 'Auto detect' }),
                )}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>
    {/if}
  </div>
</div>
