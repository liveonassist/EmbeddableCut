<!-- SPDX-License-Identifier: MIT -->
<!--
  Draws the SVG geometry for one shape kind from already-resolved values.
  Every prop here is derived by the caller; this module only picks the
  primitive, so it holds no state and reads no store.
-->
<script lang="ts" module>
  /** Centering wrapper for every SVG shape. */
  const SHAPE_CENTER_STYLE =
    'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;'
</script>

<script lang="ts">
  import {
    Rect,
    Circle,
    Triangle,
    Ellipse,
    Star,
    Polygon,
    Heart,
    ShapePath,
    buildBezierPathData,
  } from '@/shared/graphics/shapes'
  import { getLinearGradientUnitEndpoints } from '@/shared/graphics/shapes/linear-gradient'
  import { getTaperedOutlineFillPath } from '@/shared/graphics/shapes/taper-outline'
  import { styleToString } from '../../style-object'
  import { resolvePathTaperedOutline } from './shape-content-path'
  import type { ShapeGeometryProps } from './shape-content-geometry-types'

  let { shapeProps, paint, layout, gradientId, pathVertices }: ShapeGeometryProps = $props()

  const scaleStyle = $derived(styleToString(layout.scaleStyle))
  const shared = $derived({
    ...shapeProps.strokePaint,
    ...shapeProps.trimPath,
    ...shapeProps.taper,
  })
</script>

<!-- Two-stop linear fill definition; renders nothing for solid fills. -->
{#snippet fillDefinition()}
  {#if paint.linearGradient}
    {@const gradient = paint.linearGradient}
    {@const endpoints = getLinearGradientUnitEndpoints(gradient.angle)}
    <defs>
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1={endpoints.start.x * layout.width}
        y1={endpoints.start.y * layout.height}
        x2={endpoints.end.x * layout.width}
        y2={endpoints.end.y * layout.height}
      >
        <stop offset="0%" stop-color={gradient.startColor} />
        <stop offset="100%" stop-color={gradient.endColor} />
      </linearGradient>
    </defs>
  {/if}
{/snippet}

{#if shapeProps.shapeType === 'rectangle'}
  <!-- Rectangle fills the entire container (naturally supports non-proportional). -->
  <div style={SHAPE_CENTER_STYLE}>
    <Rect
      width={layout.width}
      height={layout.height}
      fill={paint.fillPaint}
      {fillDefinition}
      cornerRadius={shapeProps.cornerRadius}
      {...shared}
    />
  </div>
{:else if shapeProps.shapeType === 'circle'}
  <!-- Circle, triangle, star, polygon and heart squish/squash when unlocked. -->
  <div style={SHAPE_CENTER_STYLE}>
    <div style={scaleStyle}>
      <Circle radius={layout.baseSize / 2} fill={paint.fillPaint} {fillDefinition} {...shared} />
    </div>
  </div>
{:else if shapeProps.shapeType === 'triangle'}
  <div style={SHAPE_CENTER_STYLE}>
    <div style={scaleStyle}>
      <Triangle
        length={layout.baseSize}
        direction={shapeProps.direction}
        fill={paint.fillPaint}
        {fillDefinition}
        cornerRadius={shapeProps.cornerRadius}
        {...shared}
      />
    </div>
  </div>
{:else if shapeProps.shapeType === 'ellipse'}
  <!-- Ellipse naturally supports non-proportional via rx/ry. -->
  <div style={SHAPE_CENTER_STYLE}>
    <Ellipse
      rx={layout.width / 2}
      ry={layout.height / 2}
      fill={paint.fillPaint}
      {fillDefinition}
      {...shared}
    />
  </div>
{:else if shapeProps.shapeType === 'star'}
  {@const outerRadius = layout.baseSize / 2}
  <div style={SHAPE_CENTER_STYLE}>
    <div style={scaleStyle}>
      <Star
        points={shapeProps.points}
        {outerRadius}
        innerRadius={outerRadius * shapeProps.innerRadius}
        fill={paint.fillPaint}
        {fillDefinition}
        cornerRadius={shapeProps.cornerRadius}
        {...shared}
      />
    </div>
  </div>
{:else if shapeProps.shapeType === 'polygon'}
  <div style={SHAPE_CENTER_STYLE}>
    <div style={scaleStyle}>
      <Polygon
        points={shapeProps.points}
        radius={layout.baseSize / 2}
        fill={paint.fillPaint}
        {fillDefinition}
        cornerRadius={shapeProps.cornerRadius}
        {...shared}
      />
    </div>
  </div>
{:else if shapeProps.shapeType === 'heart'}
  <!--
    Heart uses the shared Heart component for consistency with mask path
    generation. Heart output width = 1.1 × input height, so the input is scaled
    to fit within baseSize (height = baseSize / 1.1 keeps the width at baseSize).
  -->
  <div style={SHAPE_CENTER_STYLE}>
    <div style={scaleStyle}>
      <Heart height={layout.baseSize / 1.1} fill={paint.fillPaint} {fillDefinition} {...shared} />
    </div>
  </div>
{:else if shapeProps.shapeType === 'path'}
  <!-- Custom bezier path drawn with the pen tool. -->
  {#if !pathVertices || pathVertices.length < 2}
    <div style:width="100%" style:height="100%" style:background={paint.fallbackBackground}></div>
  {:else}
    {@const pathData = buildBezierPathData(
      pathVertices,
      layout.width,
      layout.height,
      shapeProps.pathClosed,
    )}
    {@const taperedOutline = resolvePathTaperedOutline(pathVertices, shapeProps, layout)}
    <div style={SHAPE_CENTER_STYLE}>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox="0 0 {layout.width} {layout.height}"
        overflow="visible"
      >
        {@render fillDefinition()}
        {#if taperedOutline}
          <path d={pathData} fill={paint.fillPaint} />
          <path
            d={getTaperedOutlineFillPath(taperedOutline)}
            fill={shapeProps.strokeColor}
            data-taper-outline="true"
            data-taper-cap-count={taperedOutline.caps.length}
          />
        {:else}
          <ShapePath d={pathData} fill={paint.fillPaint} {...shared} />
        {/if}
      </svg>
    </div>
  {/if}
{:else}
  <!-- Simple coloured div for shape kinds this build does not draw. -->
  <div
    style:width="100%"
    style:height="100%"
    style:background={paint.fallbackBackground}
    style:border-radius={shapeProps.cornerRadius === undefined
      ? undefined
      : `${shapeProps.cornerRadius}px`}
  ></div>
{/if}
