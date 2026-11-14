<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Video side of the export settings: quick presets, capability warnings, format
   * fields, rate control, smart copy and subtitles. Layout only — every value it
   * shows is prepared by the dialog, which owns the state behind them.
   */
  import ExportPresetGrid from './export-preset-grid.svelte'
  import ExportCapabilityAlerts from './export-capability-alerts.svelte'
  import ExportVideoFormatFields from './export-video-format-fields.svelte'
  import ExportRateControlFields from './export-rate-control-fields.svelte'
  import ExportSmartCopyBlock from './export-smart-copy-block.svelte'
  import ExportSubtitleFields from './export-subtitle-fields.svelte'
  import type { ExportVideoSettingsProps } from './types'

  let props: ExportVideoSettingsProps = $props()
</script>

<ExportPresetGrid {...props.presets} />

<div class="space-y-4">
  <ExportCapabilityAlerts {...props.alerts} />

  <ExportVideoFormatFields {...props.format} />

  <div class="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
    <ExportRateControlFields {...props.rateControl} />

    <ExportSmartCopyBlock {...props.smartCopy} />
  </div>

  <ExportSubtitleFields {...props.subtitles} />
</div>
