<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Terminal step of the export dialog that only reports an outcome: the failure
   * message, or the note that the export was cancelled. Both offer just "Close".
   */
  import AlertCircle from 'lucide-svelte/icons/alert-circle'
  import X from 'lucide-svelte/icons/x'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'
  import type { ExportNoticeViewProps } from './types'

  let { variant, message, onClose }: ExportNoticeViewProps = $props()
</script>

<div class="space-y-4 py-4">
  {#if variant === 'error'}
    <Alert variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  {:else}
    <Alert>
      <X class="h-4 w-4" />
      <AlertDescription>{t('export.cancelled.message')}</AlertDescription>
    </Alert>
  {/if}

  <div class="flex justify-end">
    <Button variant="outline" onclick={onClose}>
      {t('common.close')}
    </Button>
  </div>
</div>
