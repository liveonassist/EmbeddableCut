<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Stands in for `PropertyRow` in tests: the label and its control, without a tooltip. */
  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<!-- svelte-ignore a11y_label_has_associated_control -->
<label><span>{label}</span>{@render children()}</label>
