<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getAudioEqSettings, resolveAudioEqSettings } from '@/shared/utils/audio-eq'
  import AudioEqCurveEditor from './audio-eq-curve-editor.svelte'

  /** Feeds live edits back as settings that also move an untouched band, like a lagging store. */
  let settings = $state.raw(
    resolveAudioEqSettings({
      highGainDb: 0,
      highFrequencyHz: 6000,
    }),
  )
</script>

<AudioEqCurveEditor
  {settings}
  onLiveChange={(patch) => {
    settings = resolveAudioEqSettings({
      ...settings,
      ...getAudioEqSettings(patch),
      highGainDb: 6,
      highFrequencyHz: 2000,
    })
  }}
  onChange={() => undefined}
/>
