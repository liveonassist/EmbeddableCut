<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Capability warnings above the video format fields: the browser probe failed,
   * or it supports none of the container/codec combinations on offer.
   */
  import AlertCircle from 'lucide-svelte/icons/alert-circle'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import { t } from '$lib/i18n.svelte'
  import type { ExportCapabilityAlertsProps } from './types'

  let { isCheckingSupport, supportError, hasSupportedPath, width, height }: ExportCapabilityAlertsProps =
    $props()
</script>

{#if !isCheckingSupport}
  {#if supportError}
    <Alert>
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{t('export.settings.codecSupportUnverified')}</AlertDescription>
    </Alert>
  {:else if !hasSupportedPath}
    <Alert>
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{t('export.settings.cannotEncode', { width, height })}</AlertDescription>
    </Alert>
  {/if}
{/if}
