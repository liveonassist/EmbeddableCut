<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Rate control fields for the export dialog: the auto/VBR/CBR mode, the target
   * bitrate it lets you override, and a shortcut to the source clip's own rate.
   */
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import type { ExportSettings } from '@/types/export'
  import { t } from '$lib/i18n.svelte'
  import type { ExportRateControlFieldsProps } from './types'

  let { settings, setSettings, resolvedVideoBitrate, sourceVideo }: ExportRateControlFieldsProps = $props()
</script>

<div class="grid gap-3 md:grid-cols-2">
  <div class="space-y-2">
    <Label for="rate-control">{t('export.settings.rateControl')}</Label>
    <Select
      value={settings.rateControl ?? 'auto'}
      onValueChange={(value) =>
        setSettings((previous) => ({
          ...previous,
          rateControl: value as NonNullable<ExportSettings['rateControl']>,
          videoBitrate: value === 'auto' ? undefined : (previous.videoBitrate ?? resolvedVideoBitrate),
        }))}
    >
      <SelectTrigger id="rate-control">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">{t('export.settings.rateControlAuto')}</SelectItem>
        <SelectItem value="variable">{t('export.settings.rateControlVbr')}</SelectItem>
        <SelectItem value="constant">{t('export.settings.rateControlCbr')}</SelectItem>
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <Label for="target-bitrate">{t('export.settings.targetBitrate')}</Label>
      {#if sourceVideo}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-xs"
          onclick={() =>
            setSettings((previous) => ({
              ...previous,
              rateControl: 'variable',
              videoBitrate: sourceVideo.bitrate,
            }))}
        >
          {t('export.settings.useSourceBitrate')}
        </Button>
      {/if}
    </div>
    <div class="relative">
      <Input
        id="target-bitrate"
        type="number"
        min="0.1"
        max="500"
        step="0.1"
        disabled={(settings.rateControl ?? 'auto') === 'auto'}
        value={((settings.videoBitrate ?? resolvedVideoBitrate) / 1_000_000).toFixed(2)}
        oninput={(event) => {
          const mbps = Number(event.currentTarget.value)
          if (!Number.isFinite(mbps) || mbps <= 0) return
          setSettings((previous) => ({
            ...previous,
            videoBitrate: Math.round(mbps * 1_000_000),
          }))
        }}
        class="pr-14"
      />
      <span
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        Mbps
      </span>
    </div>
  </div>
</div>
