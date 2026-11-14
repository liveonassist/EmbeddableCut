<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { VECTOR_SCOPE_TARGETS } from '../color-scope-overlay-data'


</script>

<svg
  aria-hidden="true"
  class="pointer-events-none absolute inset-0 h-full w-full"
  preserveAspectRatio="xMidYMid meet"
  viewBox="0 0 100 100"
>
  <circle
    cx="50"
    cy="50"
    r="45"
    fill="none"
    stroke="rgba(148,163,184,0.24)"
  ></circle>
  <circle
    cx="50"
    cy="50"
    r="30"
    fill="none"
    stroke="rgba(148,163,184,0.18)"
  ></circle>
  <circle
    cx="50"
    cy="50"
    r="15"
    fill="none"
    stroke="rgba(148,163,184,0.12)"
  ></circle>
  <path
    d="M50 5 V95 M5 50 H95"
    stroke="rgba(148,163,184,0.2)"
    stroke-width="0.8"
  ></path>
  <path
    d="M50 50 L36 15"
    stroke="rgba(251,191,36,0.72)"
    stroke-width="1.2"
  ></path>
  <text
    x="33"
    y="13"
    fill="rgba(251,191,36,0.9)"
    font-size="4"
    font-family="monospace"
    text-anchor="end"
  >
    skin
  </text>
  {#each VECTOR_SCOPE_TARGETS as target (target.label)}
    <g>
      <rect
        x={target.x - 3}
        y={target.y - 3}
        width="6"
        height="6"
        fill="none"
        stroke="rgba(226,232,240,0.34)"
        stroke-width="0.8"
      ></rect>
      <text
        x={target.x}
        y={target.y - 4.5}
        fill="rgba(226,232,240,0.78)"
        font-size="4"
        font-family="monospace"
        text-anchor="middle"
      >
        {target.label}
      </text>
    </g>
  {/each}
</svg>
