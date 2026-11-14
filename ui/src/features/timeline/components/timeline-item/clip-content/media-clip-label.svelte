<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import ClipTitleText from './clip-title-text.svelte'

  interface Props {
    label: string
    isLinked: boolean
    linkedSyncOffsetLabel: string | null
    showLinkIcon?: boolean
    showLabel?: boolean
    showSyncOffset?: boolean
  }

  let { label, isLinked, linkedSyncOffsetLabel, showLinkIcon, showLabel, showSyncOffset }: Props =
    $props()
</script>

<div
  class="px-2 text-[11px] font-medium truncate shrink-0"
  style:height={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  style:line-height={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
>
  <ClipTitleText
    {label}
    {isLinked}
    {linkedSyncOffsetLabel}
    {showLinkIcon}
    {showLabel}
    {showSyncOffset}
  />
</div>
