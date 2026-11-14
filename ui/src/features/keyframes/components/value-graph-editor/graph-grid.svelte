<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function formatFrameLabel(frame: number, rulerUnit: 'frames' | 'seconds', fps: number): string {
    if (rulerUnit === 'frames' || fps <= 0) {
      return String(Math.round(frame))
    }

    const seconds = frame / fps
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60)
      const remainder = seconds - minutes * 60
      return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`
    }

    return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`
  }

  /**
   * Format a value for display (handles decimals nicely).
   */
  function formatValue(value: number): string {
    if (Math.abs(value) >= 1000) {
      return value.toFixed(0)
    }
    if (Math.abs(value) >= 100) {
      return value.toFixed(0)
    }
    if (Math.abs(value) >= 10) {
      return value.toFixed(1)
    }
    if (Math.abs(value) >= 1) {
      return value.toFixed(1)
    }
    return value.toFixed(2)
  }
</script>

<script lang="ts">
  import type { GraphViewport } from './types'

  interface GraphGridProps {
    /** Viewport dimensions and range */
    viewport: GraphViewport
    /** Padding inside the graph area */
    padding: { top: number; right: number; bottom: number; left: number }
    /** Show axis labels */
    labelVisibility?: 'both' | 'y-only'
    /** Major grid line interval for X (frames) */
    xMajorInterval?: number
    /** Major grid line interval for Y (value) */
    yMajorInterval?: number
    /** How to display the time ruler */
    rulerUnit?: 'frames' | 'seconds'
    /** FPS used when the ruler is shown in seconds */
    fps?: number
  }

  /**
   * Background grid with axis labels.
   * Automatically calculates grid intervals based on viewport.
   */
  let {
    viewport,
    padding,
    labelVisibility = 'both',
    xMajorInterval: xMajorProp,
    yMajorInterval: yMajorProp,
    rulerUnit = 'frames',
    fps = 30,
  }: GraphGridProps = $props()

  const showXLabels = $derived(labelVisibility === 'both')
  const showYLabels = $derived(labelVisibility === 'both' || labelVisibility === 'y-only')

  // Calculate usable area
  const graphLeft = $derived(padding.left)
  const graphTop = $derived(padding.top)
  const graphWidth = $derived(viewport.width - padding.left - padding.right)
  const graphHeight = $derived(viewport.height - padding.top - padding.bottom)

  // Calculate frame and value ranges
  const frameRange = $derived(viewport.endFrame - viewport.startFrame)
  const valueRange = $derived(viewport.maxValue - viewport.minValue)

  // Auto-calculate intervals if not provided
  const xMajorInterval = $derived.by(() => {
    if (xMajorProp) return xMajorProp
    // Target ~5-10 major lines
    const pixelsPerFrame = graphWidth / frameRange
    const targetSpacing = 80 // pixels
    const roughInterval = targetSpacing / pixelsPerFrame
    // Round to nice numbers
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)))
    const normalized = roughInterval / magnitude
    if (normalized < 2) return magnitude
    if (normalized < 5) return 2 * magnitude
    return 5 * magnitude
  })

  const yMajorInterval = $derived.by(() => {
    if (yMajorProp) return yMajorProp
    // Nice intervals including 0.25 for opacity and 45/90/180 for rotation
    const niceIntervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 45, 50, 90, 100, 180, 250, 500, 1000]
    // Target 4-6 major lines
    const targetLines = 5
    const idealInterval = valueRange / targetLines
    // Find the smallest nice interval >= idealInterval
    let bestInterval = niceIntervals[niceIntervals.length - 1]
    for (const interval of niceIntervals) {
      if (interval >= idealInterval) {
        bestInterval = interval
        break
      }
    }
    return bestInterval
  })

  // Generate vertical grid lines (X axis - frames)
  const xLines = $derived.by(() => {
    const { startFrame, endFrame } = viewport
    const lines: Array<{ x: number; frame: number; isMajor: boolean }> = []
    // Never draw sub-frame minor lines — keyframes are integer frames, so a
    // fractional interval (e.g. 0.2) just adds noise that reads as an uneven grid.
    const minorInterval = Math.max(1, xMajorInterval / 5)
    const firstFrame = Math.ceil(startFrame / minorInterval) * minorInterval

    for (let frame = firstFrame; frame <= endFrame; frame += minorInterval) {
      // Round to whole pixels so every line is crisp and evenly spaced.
      const x = Math.round(graphLeft + ((frame - startFrame) / frameRange) * graphWidth)
      const isMajor = Math.abs(frame % xMajorInterval) < 0.01
      lines.push({ x, frame, isMajor })
    }
    return lines
  })

  // Generate horizontal grid lines (Y axis - values)
  const yLines = $derived.by(() => {
    const { minValue, maxValue } = viewport
    if (!yMajorInterval) return []
    const lines: Array<{ y: number; value: number; isMajor: boolean }> = []
    // For small intervals, skip minor lines to avoid clutter
    const useMinorLines = yMajorInterval >= 1
    const minorInterval = useMinorLines ? yMajorInterval / 5 : yMajorInterval

    // Start from a clean multiple of the interval at or below minValue
    const firstValue = Math.floor(minValue / minorInterval) * minorInterval
    // Use small epsilon for floating point comparison
    const epsilon = minorInterval * 0.001

    for (let value = firstValue; value <= maxValue + epsilon; value += minorInterval) {
      // Snap to clean values to avoid floating point drift
      const snappedValue = Math.round(value / minorInterval) * minorInterval
      if (snappedValue < minValue - epsilon || snappedValue > maxValue + epsilon) continue

      const y = Math.round(graphTop + (1 - (snappedValue - minValue) / valueRange) * graphHeight)
      // Check if major: value is a multiple of major interval
      const isMajor =
        Math.abs(Math.round(snappedValue / yMajorInterval) * yMajorInterval - snappedValue) <
        epsilon
      lines.push({ y, value: snappedValue, isMajor })
    }
    return lines
  })

  const zeroY = $derived(graphTop + (1 - (0 - viewport.minValue) / valueRange) * graphHeight)
</script>

<g class="graph-grid" style:pointer-events="none">
  <!-- Graph background -->
  <rect
    x={graphLeft}
    y={graphTop}
    width={graphWidth}
    height={graphHeight}
    fill="hsl(var(--muted) / 0.3)"
    rx={4}
  />

  <!-- Vertical grid lines -->
  {#each xLines as { x, frame, isMajor } (`x-${frame}`)}
    <line
      x1={x}
      y1={graphTop}
      x2={x}
      y2={graphTop + graphHeight}
      stroke="currentColor"
      stroke-opacity={isMajor ? 0.15 : 0.05}
      stroke-width={isMajor ? 1 : 0.5}
    />
  {/each}

  <!-- Horizontal grid lines -->
  {#each yLines as { y, value, isMajor } (`y-${value}`)}
    <line
      x1={graphLeft}
      y1={y}
      x2={graphLeft + graphWidth}
      y2={y}
      stroke="currentColor"
      stroke-opacity={isMajor ? 0.15 : 0.05}
      stroke-width={isMajor ? 1 : 0.5}
    />
  {/each}

  <!-- Zero line (if visible) -->
  {#if viewport.minValue <= 0 && viewport.maxValue >= 0}
    <line
      x1={graphLeft}
      y1={zeroY}
      x2={graphLeft + graphWidth}
      y2={zeroY}
      stroke="currentColor"
      stroke-opacity={0.3}
      stroke-width={1}
    />
  {/if}

  <!-- X axis labels (hidden when external ruler provides them) -->
  {#if showXLabels}
    {#each xLines.filter((l) => l.isMajor) as { x, frame } (`x-label-${frame}`)}
      <text
        {x}
        y={viewport.height - padding.bottom / 3}
        text-anchor="middle"
        fill="currentColor"
        fill-opacity={0.6}
        font-size={9}
        font-family="monospace"
      >{formatFrameLabel(frame, rulerUnit, fps)}</text>
    {/each}
  {/if}

  <!-- Y axis labels (values) — rendered inside the graph area -->
  {#if showYLabels}
    {#each yLines.filter((l) => l.isMajor) as { y, value } (`y-label-${value}`)}
      <text
        x={graphLeft + 4}
        y={y - 4}
        text-anchor="start"
        dominant-baseline="auto"
        fill="currentColor"
        fill-opacity={0.4}
        font-size={9}
        font-family="monospace"
      >{formatValue(value)}</text>
    {/each}
  {/if}

  <!-- Graph border -->
  <rect
    x={graphLeft}
    y={graphTop}
    width={graphWidth}
    height={graphHeight}
    fill="none"
    stroke="currentColor"
    stroke-opacity={0.2}
    stroke-width={1}
    rx={4}
  />
</g>
