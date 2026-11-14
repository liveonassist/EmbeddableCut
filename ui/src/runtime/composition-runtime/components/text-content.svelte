<!-- SPDX-License-Identifier: MIT -->
<!--
  Text content with live property preview support.
  Reads preview values from gizmo store for real-time updates during slider/picker drag.

  Style resolution (defaults + per-span cascade) goes through the shared
  resolveTextStyle/resolveSpanStyles so the DOM preview, the canvas renderer,
  and the GPU pipeline agree on every default; this component keeps native CSS
  layout (it is the WYSIWYG reference) and applies the composition-space scale
  on top of the resolved values.
-->
<script lang="ts" module>
  const VERTICAL_ALIGN_TO_FLEX: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }
  const TEXT_ALIGN_TO_FLEX: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }
</script>

<script lang="ts">
  import { useGizmoStore, useKeyframesStore } from '@/runtime/composition-runtime/deps/stores'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import type { TextItem } from '@/types/timeline'
  import { resolveSpanStyles, resolveTextStyle } from '@/shared/typography/text-style'
  import { loadFont } from '@/runtime/composition-runtime/utils/fonts'
  import { useSequenceContext } from '@/runtime/composition-runtime/deps/player'
  import { resolveAnimatedTextItem } from '@/runtime/composition-runtime/deps/keyframes'
  import { useCompositionSpace } from '../contexts/composition-space-context'
  import { useItemKeyframesFromContext } from '../contexts/keyframes-context'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { useStoreSelector } from '../../use-sync-external-store.svelte'
  import { styleToString } from '../../style-object'

  let { item }: { item: TextItem & { _sequenceFrameOffset?: number } } = $props()

  const compositionSpace = useCompositionSpace()
  const videoConfig = useVideoConfig()
  const sequenceContext = useSequenceContext()
  const itemId = $derived(item.id)
  const contextKeyframes = useItemKeyframesFromContext(() => itemId)
  const storeKeyframes = useStoreSelector(useKeyframesStore, (s) => s.keyframesByItemId[itemId])
  const itemKeyframes = $derived(contextKeyframes.current ?? storeKeyframes.current)
  const relativeFrame = $derived(
    (sequenceContext?.localFrame ?? 0) - (item._sequenceFrameOffset ?? 0),
  )
  const scaleX = $derived(compositionSpace.current?.scaleX ?? 1)
  const scaleY = $derived(compositionSpace.current?.scaleY ?? 1)
  const scale = $derived(compositionSpace.current?.scale ?? 1)
  const logicalCanvas = $derived({
    width: compositionSpace.current?.projectWidth ?? DEFAULT_PROJECT_WIDTH,
    height: compositionSpace.current?.projectHeight ?? DEFAULT_PROJECT_HEIGHT,
    fps: videoConfig.fps,
  })
  const resolvedItem = $derived(
    resolveAnimatedTextItem(item, itemKeyframes, relativeFrame, logicalCanvas),
  )

  // Read preview values from unified preview system
  const itemPreview = useStoreSelector(useGizmoStore, (s) => s.preview?.[itemId])
  const preview = $derived(itemPreview.current?.properties)

  // Merge live preview overrides onto the resolved item, then run the shared
  // style resolver so defaults + span cascade match the other render paths.
  const mergedItem = $derived.by((): TextItem => {
    const hasTextShadowPreview =
      preview !== undefined && Object.prototype.hasOwnProperty.call(preview, 'textShadow')
    const hasStrokePreview =
      preview !== undefined && Object.prototype.hasOwnProperty.call(preview, 'stroke')
    const hasTextSpansPreview =
      preview !== undefined && Object.prototype.hasOwnProperty.call(preview, 'textSpans')
    return {
      ...resolvedItem,
      text: preview?.text ?? resolvedItem.text,
      textSpans: hasTextSpansPreview ? preview?.textSpans : resolvedItem.textSpans,
      fontSize: preview?.fontSize ?? resolvedItem.fontSize,
      letterSpacing: preview?.letterSpacing ?? resolvedItem.letterSpacing,
      lineHeight: preview?.lineHeight ?? resolvedItem.lineHeight,
      color: preview?.color ?? resolvedItem.color,
      backgroundColor: preview?.backgroundColor ?? resolvedItem.backgroundColor,
      backgroundRadius: preview?.backgroundRadius ?? resolvedItem.backgroundRadius,
      textPadding: preview?.textPadding ?? resolvedItem.textPadding,
      textShadow: hasTextShadowPreview ? preview?.textShadow : resolvedItem.textShadow,
      stroke: hasStrokePreview ? preview?.stroke : resolvedItem.stroke,
    }
  })

  const style = $derived(resolveTextStyle(mergedItem))
  const spanStyles = $derived(resolveSpanStyles(mergedItem))

  const justifyContent = $derived(TEXT_ALIGN_TO_FLEX[style.textAlign] ?? 'center')
  const alignItems = $derived(VERTICAL_ALIGN_TO_FLEX[style.verticalAlign] ?? 'center')

  const cssTextShadow = $derived(
    style.textShadow
      ? `${style.textShadow.offsetX * scaleX}px ${style.textShadow.offsetY * scaleY}px ${style.textShadow.blur * scale}px ${style.textShadow.color}`
      : undefined,
  )
  const strokeWidth = $derived(style.stroke?.width ? `${style.stroke.width * scale * 2}px` : undefined)

  // Inline span flow: one wrapped text stream, spans recolor/underline words
  // inside a line. Font/size come from the FIRST span — same base-style rule as
  // the shared layoutTextBlock inline path. Otherwise every span is its own
  // block line-group.
  const inline = $derived(mergedItem.spanLayout === 'inline' && spanStyles.length > 0)

  const outerStyle = $derived(
    styleToString({
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems,
      justifyContent,
      padding: style.backgroundColor ? 0 : `${style.textPadding * scale}px`,
      boxSizing: 'border-box',
    }),
  )
  const boxStyle = $derived(
    styleToString({
      backgroundColor: style.backgroundColor,
      borderRadius: `${style.backgroundRadius * scale}px`,
      padding: style.backgroundColor ? `${style.textPadding * scale}px` : 0,
      textAlign: style.textAlign,
      textShadow: cssTextShadow,
      WebkitTextStrokeWidth: strokeWidth,
      WebkitTextStrokeColor: style.stroke?.color,
      // Paint stroke first, then fill on top — without this, a thick
      // stroke covers the fill entirely (text becomes solid stroke
      // color, e.g. illegible black-on-black for the TikTok preset).
      paintOrder: 'stroke fill',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      width: 'fit-content',
      maxWidth: '100%',
      boxSizing: 'border-box',
    }),
  )
</script>

<div style={outerStyle}>
  <div style={boxStyle}>
    {#if inline}
      {@const base = spanStyles[0]!}
      <div
        style={styleToString({
          fontSize: base.fontSize * scale,
          fontFamily: loadFont(base.fontFamily),
          fontWeight: base.fontWeight,
          fontStyle: base.fontStyle,
          lineHeight: style.lineHeight,
          letterSpacing: base.letterSpacing * scaleX,
          display: 'block',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          width: '100%',
        })}
      >
        {#each spanStyles as span, index (`${index}:${span.text}`)}<span
            style:color={span.color}
            style:text-decoration={span.underline ? 'underline' : 'none'}>{span.text}</span
          >{/each}
      </div>
    {:else}
      {#each spanStyles as span, index (`${index}:${span.text}`)}
        <div
          style={styleToString({
            fontSize: span.fontSize * scale,
            fontFamily: loadFont(span.fontFamily),
            fontWeight: span.fontWeight,
            fontStyle: span.fontStyle,
            textDecoration: span.underline ? 'underline' : 'none',
            color: span.color,
            lineHeight: style.lineHeight,
            letterSpacing: span.letterSpacing * scaleX,
            display: 'block',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            width: '100%',
          })}>{span.text}</div>
      {/each}
    {/if}
  </div>
</div>
