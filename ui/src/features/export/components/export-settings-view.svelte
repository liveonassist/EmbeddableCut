<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Settings step of the export dialog: the source/range column on the left, the
   * video-or-audio settings on the right, and the footer actions below. It owns no
   * state — the dialog prepares each region's props and this lays them out.
   */
  import ExportSequencePicker from './export-sequence-picker.svelte'
  import ExportModeToggle from './export-mode-toggle.svelte'
  import ExportRangeSummary from './export-range-summary.svelte'
  import ExportPreflightPanel from './export-preflight-panel.svelte'
  import ExportVideoSettings from './export-video-settings.svelte'
  import ExportAudioSettings from './export-audio-settings.svelte'
  import ExportSettingsFooter from './export-settings-footer.svelte'
  import type { ExportSettingsViewProps } from './types'

  let props: ExportSettingsViewProps = $props()
</script>

<div class="py-4">
  <div class="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
    <div class="space-y-4">
      <!-- Sequence picker — only when there's more than the Main timeline -->
      {#if props.sequencePicker.options.length > 1}
        <ExportSequencePicker {...props.sequencePicker} />
      {/if}

      <ExportModeToggle {...props.modeToggle} />

      <ExportRangeSummary {...props.rangeSummary} />

      <ExportPreflightPanel preflight={props.preflight} />
    </div>

    <div class="space-y-5 min-w-0">
      {#if props.modeToggle.mode === 'video'}
        <ExportVideoSettings {...props.video} />
      {:else}
        <ExportAudioSettings {...props.audio} />
      {/if}
    </div>
  </div>

  <ExportSettingsFooter {...props.footer} />
</div>
