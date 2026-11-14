<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `AudioEqCurveEditor` in tests: one button per callback. */
  let {
    onLiveChange,
    onChange,
  }: {
    onLiveChange: (patch: Record<string, unknown>) => void
    onChange: (patch: Record<string, unknown>) => void
  } = $props()
</script>

<div>
  <button type="button" onclick={() => onLiveChange({ audioEqLowGainDb: 5 })}>live-eq</button>
  <button type="button" onclick={() => onChange({ audioEqLowGainDb: 6 })}>commit-eq</button>
</div>
