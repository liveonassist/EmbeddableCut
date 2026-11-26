<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import Clock from '@lucide/svelte/icons/clock'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import X from '@lucide/svelte/icons/x'
  import type { RenderJobStatus } from '@/features/export/stores/render-queue-store'

  let { status }: { status: RenderJobStatus } = $props()
</script>

{#if status === 'queued'}
  <Clock class="h-4 w-4 text-muted-foreground" />
{:else if status === 'rendering'}
  <Loader2 class="h-4 w-4 animate-spin text-primary" />
{:else if status === 'completed'}
  <CheckCircle2 class="h-4 w-4 text-green-500" />
{:else if status === 'failed'}
  <AlertCircle class="h-4 w-4 text-destructive" />
{:else if status === 'cancelled'}
  <X class="h-4 w-4 text-muted-foreground" />
{/if}
