<!-- SPDX-License-Identifier: MIT -->
<!--
  Clean fallback shown in the preview when an item's media source can't be
  rendered — either it's still resolving, or it's genuinely missing and needs
  relinking. Replaces the ad-hoc per-type "not loaded" cards so video, image
  and Lottie all read the same, and so a dead source shows an actionable state
  instead of letting the renderer spam the console with failed blob fetches.
-->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { AbsoluteFill } from '@/runtime/composition-runtime/deps/player'

  let {
    offline,
    label,
  }: {
    /**
     * True when the item's media is known-missing/broken (relink needed). False
     * while the source is merely still resolving — we show a neutral loading hint
     * instead of alarming the user during a normal load.
     */
    offline: boolean
    /** File name / clip label to help the user identify which media is missing. */
    label?: string
  } = $props()
</script>

<AbsoluteFill
  style="background-color: #1a1a1a; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 16px; text-align: center;"
>
  {#if offline}
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffb84d"
      stroke-width={1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m18.84 12.25 1.72-1.71a4.24 4.24 0 0 0-6-6l-1.71 1.72" />
      <path d="m5.17 11.75-1.72 1.71a4.24 4.24 0 0 0 6 6l1.71-1.72" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" />
      <line x1="19" y1="16" x2="22" y2="16" />
    </svg>
    <span style="color: #ffb84d; font-size: 14px; font-weight: 600;"
      >{t('preview.mediaOffline.title')}</span
    >
    {#if label}
      <span style="color: #999; font-size: 12px; word-break: break-word;">{label}</span>
    {/if}
    <span style="color: #777; font-size: 12px;">{t('preview.mediaOffline.relink')}</span>
  {:else}
    <span style="color: #666; font-size: 14px;">{t('preview.mediaOffline.loading')}</span>
  {/if}
</AbsoluteFill>
