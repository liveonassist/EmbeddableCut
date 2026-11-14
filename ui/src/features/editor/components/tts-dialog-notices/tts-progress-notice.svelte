<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { progress }: { progress: string } = $props()
</script>

<div class="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
  {progress}
</div>
