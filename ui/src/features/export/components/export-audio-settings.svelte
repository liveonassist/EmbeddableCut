<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Audio side of the export settings: the audio-only note, the file format and
   * the quality the encoder targets.
   */
  import Music from 'lucide-svelte/icons/music'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import type { ExportSettings } from '@/types/export'
  import type { ClientAudioContainer } from '@/features/export/deps/renderer'
  import { t } from '$lib/i18n.svelte'
  import type { ExportAudioSettingsProps } from './types'

  let { settings, setSettings, container, setContainer }: ExportAudioSettingsProps = $props()

  const getAudioContainerOptions = () => [
    { value: 'mp3', label: 'MP3', description: t('export.audioContainer.mp3') },
    { value: 'aac', label: 'AAC', description: t('export.audioContainer.aac') },
    { value: 'wav', label: 'WAV', description: t('export.audioContainer.wav') },
  ]
</script>

<div class="space-y-4">
  <Alert>
    <Music class="h-4 w-4" />
    <AlertDescription>{t('export.settings.audioOnlyNote')}</AlertDescription>
  </Alert>

  <div class="space-y-2">
    <Label for="audio-format">{t('export.settings.format')}</Label>
    <Select value={container} onValueChange={(v) => setContainer(v as ClientAudioContainer)}>
      <SelectTrigger id="audio-format">
        <SelectValue placeholder={t('export.settings.selectFormat')} />
      </SelectTrigger>
      <SelectContent>
        {#each getAudioContainerOptions() as option (option.value)}
          <SelectItem value={option.value}>
            <span>{option.label}</span>
            <span class="ml-2 text-xs text-muted-foreground">{option.description}</span>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <Label for="audio-quality">{t('export.settings.quality')}</Label>
    <Select
      value={settings.quality}
      onValueChange={(value) => setSettings({ ...settings, quality: value as ExportSettings['quality'] })}
    >
      <SelectTrigger id="audio-quality">
        <SelectValue placeholder={t('export.settings.selectQuality')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="low">{t('export.settings.audioQualityLow')}</SelectItem>
        <SelectItem value="medium">{t('export.settings.audioQualityMedium')}</SelectItem>
        <SelectItem value="high">{t('export.settings.audioQualityHigh')}</SelectItem>
        <SelectItem value="ultra">{t('export.settings.audioQualityUltra')}</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
