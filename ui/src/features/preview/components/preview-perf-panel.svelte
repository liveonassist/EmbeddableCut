<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { type PreviewPerfSnapshot } from '@/features/preview/utils/preview-constants'

  interface PreviewPerfPanelProps {
    snapshot: PreviewPerfSnapshot
    latestRenderSourceSwitch: PreviewPerfSnapshot['renderSourceHistory'][number] | null
  }

  function formatRenderSource(source: string) {
    return source === 'fast_scrub_overlay'
      ? 'Overlay'
      : source === 'playback_transition_overlay'
        ? 'Transition'
        : 'Player'
  }
</script>

<script lang="ts">
  import { PREVIEW_PERF_PANEL_QUERY_KEY } from '@/features/preview/utils/preview-constants'
  let { snapshot, latestRenderSourceSwitch }: PreviewPerfPanelProps = $props()
  const srcLabel = $derived(formatRenderSource(snapshot.renderSource))
  const srcColor = $derived(snapshot.renderSource === 'player' ? '#4ade80' : '#60a5fa')
  const seekOk = $derived(snapshot.seekLatencyAvgMs < 50)
  const qualOk = $derived(snapshot.effectivePreviewQuality >= snapshot.userPreviewQuality)
  const frameOk = $derived(snapshot.frameTimeEmaMs <= snapshot.frameTimeBudgetMs * 1.2)
  const transitionActive = $derived(snapshot.transitionSessionActive)
  const transitionMode = $derived(snapshot.transitionSessionMode === 'none'
      ? null
      : snapshot.transitionSessionMode === 'dom'
        ? 'DOM'
        : 'Canvas')
</script>

<div
  class="absolute right-2 bottom-2 z-30 bg-black/80 text-white/90 rounded-md text-[10px] leading-[14px] font-mono pointer-events-none select-none backdrop-blur-sm"
  style:padding="6px 8px"
  style:min-width="180px"
  data-testid="preview-perf-panel"
  title={`Toggle: Alt+Shift+P | URL: ?${PREVIEW_PERF_PANEL_QUERY_KEY}=1`}
>
  <div style:margin-bottom="3px">
    <span style:color={srcColor}>
      {srcLabel}
    </span>
    {#if snapshot.staleScrubOverlayDrops > 0}
      <span style:color="#f87171">
        {snapshot.staleScrubOverlayDrops}
        stale
      </span>
    {/if}
    {#if latestRenderSourceSwitch}
      <span style:color="#a1a1aa">
        {' '}
        {formatRenderSource(latestRenderSourceSwitch.from)}
        →
        {formatRenderSource(latestRenderSourceSwitch.to)}
        @
        {latestRenderSourceSwitch.atFrame}
      </span>
    {/if}
  </div>
  <div>
    <span style:color={seekOk ? '#a1a1aa' : '#fbbf24'}>
      Seek
      {snapshot.seekLatencyAvgMs.toFixed(0)}
      ms
    </span>
    {#if snapshot.seekLatencyTimeouts > 0}
      <span style:color="#f87171">
        {snapshot.seekLatencyTimeouts}
        timeout
      </span>
    {/if}
    {#if snapshot.scrubDroppedFrames > 0}
      <span style:color="#fbbf24">
        {' '}
        Scrub
        {snapshot.scrubDroppedFrames}
        /
        {snapshot.scrubUpdates}
        dropped
      </span>
    {/if}
  </div>
  <div>
    <span style:color={qualOk ? '#a1a1aa' : '#fbbf24'}>
      Quality
      {snapshot.effectivePreviewQuality}
      x
      {#if snapshot.effectivePreviewQuality < snapshot.userPreviewQuality}
        {` (cap ${snapshot.adaptiveQualityCap}x)`}
      {/if}
    </span>
    {' '}
    <span style:color={frameOk ? '#a1a1aa' : '#f87171'}>
      {snapshot.frameTimeEmaMs.toFixed(0)}
      /
      {snapshot.frameTimeBudgetMs.toFixed(0)}
      ms
    </span>
    {#if (snapshot.adaptiveQualityDowngrades > 0 || snapshot.adaptiveQualityRecovers > 0)}
      <span style:color="#a1a1aa">
        {' '}
        ↓
        {snapshot.adaptiveQualityDowngrades}
        ↑
        {snapshot.adaptiveQualityRecovers}
      </span>
    {/if}
  </div>
  <div style:color="#a1a1aa">
    Pool
    {snapshot.sourceWarmKeep}
    /
    {snapshot.sourceWarmTarget}
    (
    {snapshot.sourcePoolSources}
    src
    {' '}
    {snapshot.sourcePoolElements}
    el)
    {#if snapshot.sourceWarmEvictions > 0}
      <span style:color="#fbbf24">
        {snapshot.sourceWarmEvictions}
        evict
      </span>
    {/if}
  </div>
  {#if (snapshot.preseekRequests > 0 || snapshot.preseekCachedBitmaps > 0)}
    <div style:color="#a1a1aa">
      Preseek
      {snapshot.preseekCacheHits + snapshot.preseekInflightReuses}
      /
      {snapshot.preseekRequests}
      hit post
      {snapshot.preseekWorkerSuccesses}
      /
      {snapshot.preseekWorkerPosts}
      cache
      {snapshot.preseekCachedBitmaps}
      /
      {snapshot.preseekCachedSources}
      src
      {#if snapshot.activePreseekRequests > 0}
        <span>
          {' '}
          active
          {snapshot.activePreseekWorkerPosts}
          /
          {snapshot.activePreseekRequests}
          cancel
          {' '}
          {snapshot.activePreseekCancellations}
          supersede
          {snapshot.activePreseekSuperseded}
          {' '}
          lookahead
          {snapshot.activePreseekLookaheadPosts}
          decoders
          {' '}
          {snapshot.activePreseekExtractorCount}
          /
          {snapshot.activePreseekExtractorPeak}
          ready
          {' '}
          {snapshot.activePreseekReadyNotifications}
        </span>
      {/if}
      {#if snapshot.preseekCacheSourceEvictions > 0}
        <span style:color="#fbbf24">
          evict
          {snapshot.preseekCacheSourceEvictions}
        </span>
      {/if}
      {#if snapshot.preseekWaitMatches > 0}
        <span>
          {' '}
          wait
          {snapshot.preseekWaitResolved}
          /
          {snapshot.preseekWaitMatches}
        </span>
      {/if}
      {#if snapshot.preseekWorkerFailures > 0}
        <span style:color="#fbbf24">
          {snapshot.preseekWorkerFailures}
          fail
        </span>
      {/if}
      {#if snapshot.preseekWaitTimeouts > 0}
        <span style:color="#fbbf24">
          {snapshot.preseekWaitTimeouts}
          timeout
        </span>
      {/if}
      {#if snapshot.scrubProxyFallbackRequests > 0}
        <span>
          {' '}
          proxy fallback
          {snapshot.scrubProxyFallbackHits}
          /
          {snapshot.scrubProxyFallbackRequests}
          {' '}
          cache
          {snapshot.scrubProxyFallbackBitmaps}
          ready
          {snapshot.scrubProxyFallbackReady}
          {' '}
          exact
          {snapshot.scrubProxyExactReplacements}
        </span>
      {/if}
    </div>
  {/if}
  {#if (snapshot.unresolvedQueue > 0 || snapshot.pendingResolves > 0)}
    <div style:color="#fbbf24">
      Resolving
      {snapshot.pendingResolves}
      pending,
      {snapshot.unresolvedQueue}
      queued (
      {snapshot.resolveAvgMs.toFixed(0)}
      ms avg)
    </div>
  {/if}
  {#if (transitionActive || snapshot.transitionSessionCount > 0)}
    <div
      style:border-top="1px solid rgba(255,255,255,0.1)"
      style:margin-top="3px"
      style:padding-top="3px"
    >
      <div>
        <span style:color={transitionActive ? '#60a5fa' : '#a1a1aa'}>
          {#if transitionActive}
            {`Transition ${transitionMode}`}
          {:else}
            Last transition
          {/if}
          {#if snapshot.transitionSessionComplex}
             (complex)
          {:else}
            
          {/if}
        </span>
        {#if transitionActive}
          <span style:color="#a1a1aa">
            {' '}
            {snapshot.transitionSessionStartFrame}
            →
            {snapshot.transitionSessionEndFrame}
            buf:
            {snapshot.transitionBufferedFrames}
          </span>
        {/if}
      </div>
      {#if snapshot.transitionLastPrepareMs > 0}
        <div
          style:color={snapshot.transitionLastEntryMisses > 0 ? '#f87171' : '#a1a1aa'}
        >
          Prep
          {snapshot.transitionLastPrepareMs.toFixed(0)}
          ms
          {#if snapshot.transitionLastReadyLeadMs > 0}
            {` lead ${snapshot.transitionLastReadyLeadMs.toFixed(0)}ms`}
          {/if}
          {#if snapshot.transitionLastEntryMisses > 0}
            {` ${snapshot.transitionLastEntryMisses} miss`}
          {/if}
          <span style:color="#a1a1aa">
            #
            {snapshot.transitionSessionCount}
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>
