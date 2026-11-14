<!-- SPDX-License-Identifier: MIT -->
<!--
  Debug overlay for composition video items.

  Shows detailed information about video timing, trimming, and playback.
  Useful for diagnosing issues with sped-up clips, trimming, and exports.
-->
<script lang="ts">
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'
  import { styleToString } from '../../style-object'

  let {
    id,
    from,
    speed,
    trimBefore,
    safeTrimBefore,
    sourceStart,
    sourceEnd,
    sourceEndBound,
    sourceDuration,
    durationInFrames,
    sourceFramesNeeded,
    sourceEndPosition,
    fps = 30,
    sourceFps = fps,
    isInvalidSeek,
    exceedsSource,
    position = 'top-left',
  }: {
    /** Unique identifier for the item */
    id?: string
    /** Timeline start frame of the item */
    from?: number
    /** Playback speed multiplier */
    speed: number
    /** Original trimBefore value (frames) */
    trimBefore: number
    /** Clamped/safe trimBefore value (frames) */
    safeTrimBefore: number
    /** Source start position (frames) */
    sourceStart?: number
    /** Source end position bound (frames) */
    sourceEnd?: number
    /** Effective source end bound used for clamping (frames) */
    sourceEndBound?: number
    /** Total source duration (frames) */
    sourceDuration: number
    /** Timeline duration (frames) */
    durationInFrames: number
    /** Source frames needed for playback */
    sourceFramesNeeded: number
    /** Source end position needed (frames) */
    sourceEndPosition: number
    /** Source media fps used for source frame conversions */
    sourceFps?: number
    /** Whether seek position is invalid */
    isInvalidSeek: boolean
    /** Whether playback would exceed source */
    exceedsSource: boolean
    /** Frames per second for time calculations */
    fps?: number
    /** Position of overlay */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  } = $props()

  // Debug overlay is only rendered during preview (not during export)
  // so we can always assume preview mode
  const isPreview = true
  // Portals stay inside the editor; the player container is looked up in the
  // same root (a shadow root when the editor is embedded).
  const target = portalTarget()

  // Track player container position for portal mode
  let containerRect = $state<DOMRect | null>(null)

  $effect(() => {
    if (!isPreview) return

    const root = target.getRootNode() as Document | ShadowRoot
    const container = root.querySelector('[data-player-container]')
    if (!container) return

    const updateRect = () => {
      containerRect = container.getBoundingClientRect()
    }

    updateRect()

    // Update on resize/scroll
    const observer = new ResizeObserver(updateRect)
    observer.observe(container)
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  })

  const positionStyles = $derived(
    {
      'top-left': { top: 10, left: 10 },
      'top-right': { top: 10, right: 10 },
      'bottom-left': { bottom: 10, left: 10 },
      'bottom-right': { bottom: 10, right: 10 },
    }[position],
  )

  function copyToClipboard() {
    const data = {
      id: id?.slice(0, 8) ?? 'unknown',
      from: from ?? 'unknown',
      endFrame: from !== undefined ? from + durationInFrames : 'unknown',
      speed: speed.toFixed(3),
      trimBefore,
      safeTrimBefore,
      sourceStart: sourceStart ?? 'undefined',
      sourceEnd: sourceEnd ?? 'undefined',
      sourceEndBound: sourceEndBound ?? 'undefined',
      sourceSpan:
        sourceStart !== undefined && sourceEnd !== undefined ? sourceEnd - sourceStart : 'unknown',
      sourceDuration: sourceDuration || 'NOT SET',
      durationInFrames,
      sourceFramesNeeded,
      sourceFps,
      seekTime: `${(trimBefore / sourceFps).toFixed(2)}s`,
      srcDuration: sourceDuration ? `${(sourceDuration / sourceFps).toFixed(2)}s` : 'N/A',
      srcEndNeeded: `${(sourceEndPosition / sourceFps).toFixed(2)}s`,
      isInvalidSeek,
      exceedsSource,
    }
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }

  // Calculate position for portal mode (anchored to player container bottom-right)
  const portalPositionStyles = $derived(
    containerRect
      ? {
          position: 'fixed',
          bottom: window.innerHeight - containerRect.bottom + 10,
          right: window.innerWidth - containerRect.right + 10,
        }
      : {
          position: 'fixed',
          bottom: 10,
          right: 10,
        },
  )

  const overlayStyle = $derived(
    styleToString({
      ...(isPreview ? portalPositionStyles : { position: 'absolute', ...positionStyles }),
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '8px 12px',
      fontSize: 11,
      fontFamily: 'monospace',
      borderRadius: 4,
      maxWidth: isPreview ? 300 : '50%',
      zIndex: 99999,
      pointerEvents: 'auto',
    }),
  )
</script>

<!--
  In preview mode, portal to escape the player's stacking context. This
  allows the button to be clickable above the GizmoOverlay.
-->
<Portal to={target}>
  <div data-debug-overlay style={overlayStyle}>
    <div
      style="color: #0f0; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;"
    >
      <span>DEBUG: {id?.slice(0, 8) ?? 'unknown'}</span>
      <button
        onclick={(e) => {
          e.stopPropagation()
          copyToClipboard()
        }}
        onpointerdown={(e) => e.stopPropagation()}
        style="background: #333; border: 1px solid #555; color: #fff; padding: 2px 6px; font-size: 10px; cursor: pointer; border-radius: 3px; margin-left: 8px; pointer-events: auto;"
      >
        Copy
      </button>
    </div>
    <div>speed: {speed.toFixed(3)}</div>
    <div>from: {from ?? 'unknown'}</div>
    <div>endFrame: {from !== undefined ? from + durationInFrames : 'unknown'}</div>
    <div>
      trimBefore: {trimBefore}{trimBefore !== safeTrimBefore ? ` → safe: ${safeTrimBefore}` : ''}
    </div>
    <div>sourceStart: {sourceStart ?? 'undefined'}</div>
    <div>sourceEnd: {sourceEnd ?? 'undefined'}</div>
    <div>sourceEndBound: {sourceEndBound ?? 'undefined'}</div>
    <div>
      sourceSpan: {sourceStart !== undefined && sourceEnd !== undefined
        ? sourceEnd - sourceStart
        : 'unknown'}
    </div>
    <div>sourceDuration: {sourceDuration || 'NOT SET'}</div>
    <div>sourceFps: {sourceFps.toFixed(3)}</div>
    <div>durationInFrames: {durationInFrames}</div>
    <div>sourceFramesNeeded: {sourceFramesNeeded}</div>
    <div style="margin-top: 4px; border-top: 1px solid #444; padding-top: 4px;">
      <div>seekTime: {(trimBefore / sourceFps).toFixed(2)}s</div>
      <div>
        srcDuration: {sourceDuration ? (sourceDuration / sourceFps).toFixed(2) + 's' : 'N/A'}
      </div>
      <div>srcEndNeeded: {(sourceEndPosition / sourceFps).toFixed(2)}s</div>
    </div>
    {#if isInvalidSeek || exceedsSource}
      <div style="margin-top: 4px; color: #f00; font-weight: bold;">
        {#if isInvalidSeek}<div>⚠️ INVALID SEEK</div>{/if}
        {#if exceedsSource}<div>⚠️ EXCEEDS SOURCE</div>{/if}
      </div>
    {/if}
  </div>
</Portal>
