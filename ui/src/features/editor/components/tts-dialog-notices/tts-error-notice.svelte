<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { error }: { error: string } = $props()
</script>

<div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
  {error}
</div>
