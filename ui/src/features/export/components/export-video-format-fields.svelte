<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Video format fields for the export dialog: container, codec, quality and
   * resolution, each option gated by what the browser codec probe supported.
   */
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import type { ExportSettings } from '@/types/export'
  import type { ClientVideoContainer } from '@/features/export/deps/renderer'
  import { t } from '$lib/i18n.svelte'
  import type { ExportVideoFormatFieldsProps } from './types'

  let {
    settings,
    setSettings,
    container,
    setContainer,
    containerOptions,
    codecOptions,
    resolutionOptions,
    projectWidth,
    projectHeight,
  }: ExportVideoFormatFieldsProps = $props()
</script>

<div class="grid gap-4 md:grid-cols-2">
  <div class="space-y-2">
    <Label for="container">{t('export.settings.format')}</Label>
    <Select value={container} onValueChange={(v) => setContainer(v as ClientVideoContainer)}>
      <SelectTrigger id="container">
        <SelectValue placeholder={t('export.settings.selectFormat')} />
      </SelectTrigger>
      <SelectContent>
        {#each containerOptions as option (option.value)}
          <SelectItem value={option.value} disabled={!option.supported}>
            {option.label}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <Label for="codec">{t('export.settings.codec')}</Label>
    <Select
      value={settings.codec}
      onValueChange={(value) => setSettings({ ...settings, codec: value as ExportSettings['codec'] })}
    >
      <SelectTrigger id="codec">
        <SelectValue placeholder={t('export.settings.selectCodec')} />
      </SelectTrigger>
      <SelectContent>
        {#each codecOptions as option (option.value)}
          <SelectItem value={option.value} disabled={!option.supported}>
            {option.label}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <Label for="quality">{t('export.settings.quality')}</Label>
    <Select
      value={settings.quality}
      onValueChange={(value) =>
        setSettings({
          ...settings,
          quality: value as ExportSettings['quality'],
        })}
    >
      <SelectTrigger id="quality">
        <SelectValue placeholder={t('export.settings.selectQuality')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="low">{t('export.settings.qualityLow')}</SelectItem>
        <SelectItem value="medium">{t('export.settings.qualityMedium')}</SelectItem>
        <SelectItem value="high">{t('export.settings.qualityHigh')}</SelectItem>
        <SelectItem value="ultra">{t('export.settings.qualityUltra')}</SelectItem>
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <Label for="resolution">{t('export.settings.resolution')}</Label>
    <Select
      value={`${settings.resolution.width}x${settings.resolution.height}`}
      onValueChange={(value) => {
        const parts = value.split('x').map(Number)
        const width = parts[0] ?? projectWidth
        const height = parts[1] ?? projectHeight
        setSettings({ ...settings, resolution: { width, height } })
      }}
    >
      <SelectTrigger id="resolution">
        <SelectValue placeholder={t('export.settings.selectResolution')} />
      </SelectTrigger>
      <SelectContent>
        {#each resolutionOptions as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
</div>
