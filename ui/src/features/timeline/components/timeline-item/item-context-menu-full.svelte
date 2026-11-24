<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import type { LazyContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'
  import { replayContextMenuEvent } from '@/features/timeline/utils/lazy-context-menu'
  import { useSelectionStore } from '@/shared/state/selection'
  import { PROPERTY_LABELS } from '@/types/keyframe'
  import { getSceneVerificationModelOptions } from '@/features/timeline/deps/analysis'
  import { formatHotkeyBinding } from '@/config/hotkeys'
  import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
  import ContributedMenuItems from '@/components/contributed-menu-items.svelte'
  import GradeActions from './item-context-menu-grade-actions.svelte'
  import { useFeatures } from '../../../../extensions/feature-gate.svelte'
  import type { FeatureId } from '../../../../extensions/features'
  import type {
    CaptionActionsConfig,
    CompositionActionsConfig,
    DestructiveActionsConfig,
    ItemContextMenuProps,
    JoinActionsConfig,
    LinkActionsConfig,
    MediaActionsConfig,
    SceneDetectionActionsConfig,
  } from './item-context-menu'

  type ItemContextMenuFullProps = ItemContextMenuProps & {
    pendingActivation?: LazyContextMenuEventInit | null
    onPendingActivationHandled?: () => void
  }

  /** Full bits-ui ContextMenu tree — only mounted after first right-click activation. */
  let {
    children,
    trackLocked,
    joinActions,
    destructiveActions,
    linkActions,
    keyframeActions,
    layoutActions,
    mediaActions,
    sceneDetectionActions,
    captionActions,
    compositionActions,
    item,
    pendingActivation,
    onPendingActivationHandled,
  }: ItemContextMenuFullProps = $props()

  let trigger = $state<HTMLSpanElement | null>(null)
  const hotkeys = useResolvedHotkeys()
  const selectedCount = select(useSelectionStore, (s) => s.selectedItemIds.length)
  // Filter to only properties that actually have keyframes
  const propertiesWithKeyframes = $derived.by(() => {
    if (!keyframeActions?.keyframedProperties) return []
    return keyframeActions.keyframedProperties.filter((p) => p.keyframes.length > 0)
  })
  const sceneVerificationModelOptions = getSceneVerificationModelOptions()
  // What the host hid or locked, for the clips the menu acts on (the selection).
  const features = useFeatures()
  const shown = (id: FeatureId) => features.mode(id) !== 'hidden'
  const locked = (id: FeatureId) => features.mode(id) === 'locked'

  $effect(() => {
    void [pendingActivation, trigger]
    untrack(() => {
      if (!pendingActivation || !trigger) {
        return
      }

      replayContextMenuEvent(trigger, pendingActivation)
      onPendingActivationHandled?.()
    })
  })
</script>

{#snippet joinSection({
  canJoinSelected,
  hasJoinableLeft,
  hasJoinableRight,
  closerEdge,
  onJoinSelected,
  onJoinLeft,
  onJoinRight,
}: JoinActionsConfig)}
  {@const showJoinLeft = hasJoinableLeft && (closerEdge === 'left' || !hasJoinableRight)}
  {@const showJoinRight = hasJoinableRight && (closerEdge === 'right' || !hasJoinableLeft)}
  {#if (showJoinLeft || showJoinRight || canJoinSelected) && shown('clip.join')}
    {#if showJoinLeft}
      <ContextMenuItem onclick={onJoinLeft} disabled={locked('clip.join')}
        >{t('timeline.contextMenu.joinWithPrevious')}<ContextMenuShortcut>J</ContextMenuShortcut
        ></ContextMenuItem
      >
    {/if}
    {#if showJoinRight}
      <ContextMenuItem onclick={onJoinRight} disabled={locked('clip.join')}
        >{t('timeline.contextMenu.joinWithNext')}<ContextMenuShortcut>J</ContextMenuShortcut
        ></ContextMenuItem
      >
    {/if}
    {#if canJoinSelected}
      <ContextMenuItem onclick={onJoinSelected} disabled={locked('clip.join')}
        >{t('timeline.contextMenu.joinSelected')}<ContextMenuShortcut>J</ContextMenuShortcut
        ></ContextMenuItem
      >
    {/if}
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet linkSection({
  canLinkSelected,
  canUnlinkSelected,
  onLinkSelected,
  onUnlinkSelected,
}: LinkActionsConfig)}
  {#if (canLinkSelected || canUnlinkSelected) && shown('clip.link')}
    {#if canLinkSelected && onLinkSelected}
      <ContextMenuItem onclick={onLinkSelected} disabled={locked('clip.link')}
        >{t('timeline.contextMenu.linkClips')}<ContextMenuShortcut
          >{formatHotkeyBinding(hotkeys.current.LINK_AUDIO_VIDEO)}</ContextMenuShortcut
        ></ContextMenuItem
      >
    {/if}
    {#if canUnlinkSelected && onUnlinkSelected}
      <ContextMenuItem onclick={onUnlinkSelected} disabled={locked('clip.link')}
        >{t('timeline.contextMenu.unlinkClips')}<ContextMenuShortcut
          >{formatHotkeyBinding(hotkeys.current.UNLINK_AUDIO_VIDEO)}</ContextMenuShortcut
        ></ContextMenuItem
      >
    {/if}
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet keyframeSection()}
  {#if propertiesWithKeyframes.length > 0}
    <ContextMenuSub>
      <ContextMenuSubTrigger>{t('timeline.contextMenu.clearKeyframes')}</ContextMenuSubTrigger>
      <ContextMenuSubContent class="w-48">
        <ContextMenuItem onclick={keyframeActions?.onClearAllKeyframes}
          >{t('timeline.contextMenu.clearAll')}<ContextMenuShortcut
            >{formatHotkeyBinding(hotkeys.current.CLEAR_KEYFRAMES)}</ContextMenuShortcut
          ></ContextMenuItem
        >
        <ContextMenuSeparator />
        {#each propertiesWithKeyframes as { property } (property)}
          <ContextMenuItem onclick={() => keyframeActions?.onClearPropertyKeyframes?.(property)}
            >{PROPERTY_LABELS[property]}</ContextMenuItem
          >
        {/each}
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet layoutSection()}
  {#if selectedCount.current >= 2 && layoutActions?.onBentoLayout}
    <ContextMenuItem onclick={layoutActions.onBentoLayout}
      >{t('timeline.contextMenu.bentoLayout')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet mediaSection({
  canReverse,
  isReversed,
  isVideoItem,
  playheadInBounds,
  canRemoveSilence,
  canRemoveFillers,
  isRemovingFillers,
  isTextItem,
  onReverse,
  onFreezeFrame,
  onRemoveSilence,
  onRemoveFillers,
  onGenerateAudioFromText,
}: MediaActionsConfig)}
  {#if canReverse && onReverse && shown('clip.reverse')}
    <ContextMenuItem onclick={onReverse} disabled={locked('clip.reverse')}
      >{isReversed
        ? t('timeline.contextMenu.unreverse')
        : t('timeline.contextMenu.reverse')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}

  {#if isVideoItem && playheadInBounds && onFreezeFrame && shown('clip.freeze-frame')}
    <ContextMenuItem onclick={onFreezeFrame} disabled={locked('clip.freeze-frame')}
      >{t('timeline.contextMenu.insertFreezeFrame')}<ContextMenuShortcut
        >Shift+F</ContextMenuShortcut
      ></ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}

  {#if canRemoveSilence && onRemoveSilence && shown('ai.cleanup')}
    <ContextMenuItem onclick={onRemoveSilence} disabled={locked('ai.cleanup')}
      >{t('timeline.contextMenu.removeSilence')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}

  {#if canRemoveFillers && onRemoveFillers && shown('ai.cleanup')}
    <ContextMenuItem onclick={onRemoveFillers} disabled={isRemovingFillers || locked('ai.cleanup')}
      >{isRemovingFillers
        ? t('timeline.contextMenu.detectingFillers')
        : t('timeline.contextMenu.removeFillerWords')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}

  {#if isTextItem && onGenerateAudioFromText && shown('ai.speech')}
    <ContextMenuItem onclick={onGenerateAudioFromText} disabled={locked('ai.speech')}
      >{t('timeline.contextMenu.generateAudioFromText')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet sceneDetectionSection({
  canDetectScenes,
  isDetectingScenes,
  onDetectScenes,
}: SceneDetectionActionsConfig)}
  {#if canDetectScenes && onDetectScenes && shown('ai.scenes')}
    {#if isDetectingScenes}
      <ContextMenuItem disabled>{t('timeline.contextMenu.detectingScenes')}</ContextMenuItem>
    {:else}
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={locked('ai.scenes')}
          >{t('timeline.contextMenu.detectScenesAndSplit')}</ContextMenuSubTrigger
        >
        <ContextMenuSubContent class="w-48">
          <ContextMenuItem onclick={() => onDetectScenes('histogram')}
            >{t('timeline.contextMenu.detectScenesFast')}</ContextMenuItem
          >
          {#each sceneVerificationModelOptions as option (option.value)}
            <ContextMenuItem onclick={() => onDetectScenes('adaptive', option.value)}
              >{t('timeline.contextMenu.detectScenesAi', { model: option.label })}</ContextMenuItem
            >
          {/each}
        </ContextMenuSubContent>
      </ContextMenuSub>
    {/if}
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet captionSection({
  canManageCaptions,
  hasCaptions,
  isGeneratingCaptions,
  canExtractEmbeddedSubtitles,
  canConsolidateCaptionsToSegment,
  onOpenCaptionDialog,
  onExtractEmbeddedSubtitles,
  onConsolidateCaptionsToSegment,
}: CaptionActionsConfig)}
  {#if canManageCaptions && onOpenCaptionDialog && shown('ai.captions')}
    {#if isGeneratingCaptions}
      <ContextMenuItem disabled>{t('timeline.contextMenu.updatingCaptions')}</ContextMenuItem>
    {:else}
      <ContextMenuItem onclick={onOpenCaptionDialog} disabled={locked('ai.captions')}
        >{hasCaptions
          ? t('timeline.contextMenu.regenerateCaptions')
          : t('timeline.contextMenu.generateCaptions')}</ContextMenuItem
      >
    {/if}
    <ContextMenuSeparator />
  {/if}

  {#if canExtractEmbeddedSubtitles && onExtractEmbeddedSubtitles}
    <ContextMenuItem onclick={onExtractEmbeddedSubtitles}
      >{t('timeline.contextMenu.extractEmbeddedSubtitles')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}

  {#if canConsolidateCaptionsToSegment && onConsolidateCaptionsToSegment}
    <ContextMenuItem onclick={onConsolidateCaptionsToSegment}
      >{t('timeline.contextMenu.consolidateCaptionsToSegment')}</ContextMenuItem
    >
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet compositionSection({
  isCompositionItem,
  canCreatePreComp,
  onEnterComposition,
  onDissolveComposition,
  onCreatePreComp,
}: CompositionActionsConfig)}
  {#if ((isCompositionItem && (onEnterComposition || onDissolveComposition)) || (canCreatePreComp && onCreatePreComp)) && shown('clip.compound')}
    {#if isCompositionItem && onEnterComposition}
      <ContextMenuItem onclick={onEnterComposition} disabled={locked('clip.compound')}
        >{t('timeline.contextMenu.openCompoundClip')}</ContextMenuItem
      >
    {/if}
    {#if isCompositionItem && onDissolveComposition}
      <ContextMenuItem onclick={onDissolveComposition} disabled={locked('clip.compound')}
        >{t('timeline.contextMenu.dissolveCompoundClip')}</ContextMenuItem
      >
    {/if}
    {#if canCreatePreComp && onCreatePreComp}
      <ContextMenuItem onclick={onCreatePreComp} disabled={locked('clip.compound')}
        >{t('timeline.contextMenu.createCompoundClip')}</ContextMenuItem
      >
    {/if}
    <ContextMenuSeparator />
  {/if}
{/snippet}

{#snippet destructiveSection({ isSelected, onRippleDelete, onDelete }: DestructiveActionsConfig)}
  {#if shown('clip.ripple-delete')}
    <ContextMenuItem
      onclick={onRippleDelete}
      disabled={!isSelected || locked('clip.ripple-delete')}
      class="text-destructive focus:text-destructive"
      >{t('timeline.contextMenu.rippleDelete')}<ContextMenuShortcut>Ctrl+Del</ContextMenuShortcut
      ></ContextMenuItem
    >
  {/if}
  {#if shown('clip.delete')}
    <ContextMenuItem
      onclick={onDelete}
      disabled={!isSelected || locked('clip.delete')}
      class="text-destructive focus:text-destructive"
      >{t('common.delete')}<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem
    >
  {/if}
{/snippet}

<ContextMenu>
  <ContextMenuTrigger disabled={trackLocked}>
    {#snippet child({ props })}
      <span {...props} bind:this={trigger} data-item-context-anchor style:display="contents"
        >{@render children()}</span
      >
    {/snippet}
  </ContextMenuTrigger>
  <!-- Keep the timeline menu non-modal (Radix's `modal={false}`: bits-ui's scroll lock is
       what sets `pointer-events: none` on `body`). Several actions (including Reverse) hand
       off directly to a dialog; overlapping modal layers can race while restoring `body`
       pointer events and leave the timeline unable to receive hover/move events after the
       dialog closes. -->
  <ContextMenuContent preventScroll={false}>
    {@render joinSection(joinActions)}
    {#if linkActions}{@render linkSection(linkActions)}{/if}
    {@render keyframeSection()}
    {@render layoutSection()}
    {#if mediaActions}{@render mediaSection(mediaActions)}{/if}
    {#if sceneDetectionActions}{@render sceneDetectionSection(sceneDetectionActions)}{/if}
    {#if captionActions}{@render captionSection(captionActions)}{/if}
    <GradeActions />
    {#if compositionActions}{@render compositionSection(compositionActions)}{/if}
    {#if item}<ContributedMenuItems menu="clip" target={{ item }} />{/if}
    {@render destructiveSection(destructiveActions)}
  </ContextMenuContent>
</ContextMenu>
