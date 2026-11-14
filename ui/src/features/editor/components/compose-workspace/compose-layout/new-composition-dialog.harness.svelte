<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Stands in for NewCompositionDialog in compose-layout.test.ts.
  let { open }: { open: boolean } = $props()
</script>

{#if open}
  <div data-testid="new-composition-dialog"></div>
{/if}
