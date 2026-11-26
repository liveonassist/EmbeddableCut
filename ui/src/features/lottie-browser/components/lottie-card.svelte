<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Film from '@lucide/svelte/icons/film'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import Plus from '@lucide/svelte/icons/plus'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import type { LottieFilesAnimation } from '@/features/lottie-browser/services/lottiefiles-api'

  interface LottieCardProps {
    animation: LottieFilesAnimation
    isImporting: boolean
    isImported: boolean
    isFailed: boolean
    onImport: (animation: LottieFilesAnimation) => void
  }

  let { animation, isImporting, isImported, isFailed, onImport }: LottieCardProps = $props()

  const disabled = $derived(isImporting || isImported)
  // Some (often freshly uploaded) animations have no rendered GIF yet.
  let previewFailed = $state(false)
  const showPreview = $derived(Boolean(animation.gifUrl) && !previewFailed)

  const actionLabel = $derived(
    isImported
      ? t('lottieBrowser.added')
      : isFailed
        ? t('lottieBrowser.importFailed')
        : t('lottieBrowser.addToMedia'),
  )
</script>

<div class="group flex flex-col gap-1">
  <button
    type="button"
    onclick={() => onImport(animation)}
    {disabled}
    aria-label={actionLabel}
    data-tooltip={actionLabel}
    data-tooltip-side="top"
    class={cn(
      'relative aspect-square w-full overflow-hidden rounded-lg border border-border transition-colors',
      !disabled && 'hover:border-primary/60',
      disabled && 'cursor-default',
      isFailed && 'border-destructive/70',
    )}
    style:background-color={animation.bgColor ?? undefined}
  >
    {#if showPreview}
      <!-- COEP is `require-corp`; a cross-origin <img> must be a CORS
           request or it is blocked. The CDN serves `Access-Control-Allow-
           Origin: *`, so anonymous CORS loads (and animates) fine. -->
      <img
        crossorigin="anonymous"
        src={animation.gifUrl ?? undefined}
        alt={animation.name}
        loading="lazy"
        onerror={() => (previewFailed = true)}
        class="h-full w-full object-contain"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center text-muted-foreground">
        <Film class="h-6 w-6" />
      </div>
    {/if}

    {#if !disabled && !isFailed}
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Plus class="h-6 w-6 text-white" />
      </div>
    {/if}

    {#if isFailed && !isImporting}
      <div class="absolute inset-0 flex items-center justify-center bg-destructive/30">
        <RotateCcw class="h-5 w-5 text-white" />
      </div>
    {/if}

    {#if isImporting}
      <div class="absolute inset-0 flex items-center justify-center bg-black/40">
        <Loader2 class="h-5 w-5 animate-spin text-white" />
      </div>
    {/if}

    {#if isImported}
      <div class="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
        <Check class="h-3 w-3" />
      </div>
    {/if}
  </button>

  <div class="min-w-0 px-0.5">
    <div class="truncate text-[11px] font-medium text-foreground">{animation.name}</div>
    {#if animation.author}
      <div class="truncate text-[10px] text-muted-foreground">
        {t('lottieBrowser.by', { author: animation.author })}
      </div>
    {/if}
  </div>
</div>
