<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import Zap from 'lucide-svelte/icons/zap'
  import FileText from 'lucide-svelte/icons/file-text'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Wind from 'lucide-svelte/icons/wind'
  import Maximize2 from 'lucide-svelte/icons/maximize-2'
  import X from 'lucide-svelte/icons/x'
  import {
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
  } from '@/components/ui/context-menu'
  import { SUPPORTED_INTERPOLATION_FACTORS } from '@/infrastructure/interpolation'
  import { UPSCALE_VARIANTS } from '@/infrastructure/upscale'
  import { t } from '$lib/i18n.svelte'
  import { resolveMenuVisibility, type MediaCardActionMenuProps } from './media-card-helpers'

  type MenuGroup =
    | 'broken'
    | 'proxy'
    | 'interpolation'
    | 'upscale'
    | 'transcript'
    | 'embedded-subtitles'
    | 'ai'
    | 'destructive'

  let props: MediaCardActionMenuProps = $props()

  const visibility = $derived(resolveMenuVisibility(props))

  const groups = $derived.by(() => {
    const next: MenuGroup[] = []
    if (visibility.showBrokenGroup && props.onRelink) next.push('broken')
    if (visibility.showProxyGroup) next.push('proxy')
    if (visibility.showInterpolationGroup) next.push('interpolation')
    if (visibility.showUpscaleGroup) next.push('upscale')
    if (visibility.showTranscriptGroup) next.push('transcript')
    if (visibility.showEmbeddedSubtitleGroup) next.push('embedded-subtitles')
    if (visibility.showAiGroup) next.push('ai')
    next.push('destructive')
    return next
  })
</script>

{#each groups as group, index (group)}
  {#if index > 0}
    <ContextMenuSeparator />
  {/if}
  {#if group === 'broken'}
    <ContextMenuLabel>{t('media.card.menuFile')}</ContextMenuLabel>
    <ContextMenuItem
      onclick={(event) => {
        event.stopPropagation()
        props.onRelink?.()
      }}
      class="text-primary focus:text-primary"
    >
      <RefreshCw class="w-3 h-3 mr-2" />
      {t('media.card.relinkFile')}
    </ContextMenuItem>
  {:else if group === 'proxy'}
    <ContextMenuLabel>{t('media.card.menuProxy')}</ContextMenuLabel>
    {#if visibility.canShowGenerateProxy}
      <ContextMenuItem onclick={props.onGenerateProxy}>
        <Zap class="w-3 h-3 mr-2" />
        {t('media.card.generateProxy')}
      </ContextMenuItem>
    {/if}
    {#if props.hasProxy}
      <ContextMenuItem
        onclick={props.onDeleteProxy}
        class="text-destructive focus:text-destructive"
      >
        <Trash2 class="w-3 h-3 mr-2" />
        {t('media.card.deleteProxy')}
      </ContextMenuItem>
    {/if}
  {:else if group === 'interpolation'}
    <!--
      Frame interpolation renders a NEW library item at `factor`x the frame rate — it is not a
      proxy and it does not modify this clip. Slowing the result gives true slow motion; playing
      it at 1x gives high-frame-rate motion.
    -->
    <ContextMenuLabel>{t('media.card.menuInterpolation')}</ContextMenuLabel>
    {#if props.isInterpolating}
      <ContextMenuItem
        onclick={(event) => {
          event.stopPropagation()
          props.onCancelInterpolation()
        }}
        class="text-destructive focus:text-destructive"
      >
        <X class="w-3 h-3 mr-2" />
        {t('media.card.cancelInterpolation')}
      </ContextMenuItem>
    {:else}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Wind class="w-3 h-3 mr-2" />
          {t('media.card.interpolateFrames')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {#each SUPPORTED_INTERPOLATION_FACTORS as factor (factor)}
            <ContextMenuItem
              onclick={(event) => {
                event.stopPropagation()
                props.onInterpolate(factor)
              }}
            >
              {t('media.card.interpolateFactor', { factor })}
            </ContextMenuItem>
          {/each}
        </ContextMenuSubContent>
      </ContextMenuSub>
    {/if}
  {:else if group === 'upscale'}
    <!--
      Upscaling renders a NEW library item at twice the width and height — it is not a proxy and it
      does not modify this clip. The variants share an architecture and a cost; they differ only in
      the footage they were trained on.
    -->
    <ContextMenuLabel>{t('media.card.menuUpscale')}</ContextMenuLabel>
    {#if props.isUpscaling}
      <ContextMenuItem
        onclick={(event) => {
          event.stopPropagation()
          props.onCancelUpscale()
        }}
        class="text-destructive focus:text-destructive"
      >
        <X class="w-3 h-3 mr-2" />
        {t('media.card.cancelUpscale')}
      </ContextMenuItem>
    {:else}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Maximize2 class="w-3 h-3 mr-2" />
          {t('media.card.upscaleVideo')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {#each UPSCALE_VARIANTS as variant (variant)}
            <ContextMenuItem
              onclick={(event) => {
                event.stopPropagation()
                props.onUpscale(variant)
              }}
            >
              {t(`media.card.upscaleVariant.${variant}`)}
            </ContextMenuItem>
          {/each}
        </ContextMenuSubContent>
      </ContextMenuSub>
    {/if}
  {:else if group === 'transcript'}
    <ContextMenuLabel>{t('media.card.menuTranscript')}</ContextMenuLabel>
    {#if visibility.canShowGenerateTranscript}
      <ContextMenuItem onclick={props.onGenerateTranscript}>
        <FileText class="w-3 h-3 mr-2" />
        {props.hasTranscript ? t('media.card.refreshTranscript') : t('media.card.generateTranscript')}
      </ContextMenuItem>
    {/if}
    {#if visibility.canShowDeleteTranscript}
      <ContextMenuItem
        onclick={props.onDeleteTranscript}
        class="text-destructive focus:text-destructive"
      >
        <Trash2 class="w-3 h-3 mr-2" />
        {t('media.card.deleteTranscript')}
      </ContextMenuItem>
    {/if}
  {:else if group === 'embedded-subtitles'}
    <ContextMenuLabel>{t('media.card.menuCaptions')}</ContextMenuLabel>
    <ContextMenuItem
      onclick={props.onExtractEmbeddedSubtitles}
      disabled={props.isExtractingEmbeddedSubtitles}
    >
      {#if props.isExtractingEmbeddedSubtitles}
        <Loader2 class="w-3 h-3 mr-2 animate-spin" />
      {:else}
        <FileText class="w-3 h-3 mr-2" />
      {/if}
      {t('media.card.extractEmbeddedSubtitles')}
    </ContextMenuItem>
  {:else if group === 'ai'}
    <ContextMenuLabel>{t('media.card.menuAi')}</ContextMenuLabel>
    <ContextMenuItem onclick={props.onAnalyzeWithAI}>
      <Sparkles class="w-3 h-3 mr-2" />
      {t('media.card.analyzeWithAI')}
    </ContextMenuItem>
  {:else}
    <ContextMenuItem onclick={props.onDelete} class="text-destructive focus:text-destructive">
      <Trash2 class="w-3 h-3 mr-2" />
      {t('common.delete')}
    </ContextMenuItem>
  {/if}
{/each}
