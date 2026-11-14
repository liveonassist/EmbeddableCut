<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for a panel or section in tests: renders a fixed text. */
  let { text }: { text: string } = $props()
</script>

<div>{text}</div>
