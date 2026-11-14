<!-- SPDX-License-Identifier: MIT -->
<!--
  react-colorful's HexColorPicker and HexAlphaColorPicker (`alpha`), ported
  from react-colorful 5.6.1 (https://github.com/omgovich/react-colorful).
  Copyright (c) 2020 Vlad Shilov <omgovich@ya.ru>. MIT License.
  Its stylesheet lives in styles/app.css.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import {
    clamp,
    equalColorObjects,
    equalHex,
    hexToHsva,
    hsvaToHex,
    hsvaToHslaString,
    hsvaToHslString,
    interactive,
    round,
    type HsvaColor,
  } from './hex-color-picker'

  interface HexColorPickerProps {
    color?: string
    onChange?: (color: string) => void
    alpha?: boolean
    class?: string
  }

  let { color: colorProp, onChange, alpha = false, class: className }: HexColorPickerProps = $props()

  const color = $derived(colorProp ?? (alpha ? '0001' : '000'))

  // `useColorManipulation`: the picker's own HSVA, synced both ways with the hex prop.
  let hsva = $state.raw<HsvaColor>(untrack(() => hexToHsva(color)))
  let cache = untrack(() => ({ color, hsva }))

  $effect(() => {
    const next = color
    untrack(() => {
      if (!equalHex(next, cache.color)) {
        const nextHsva = hexToHsva(next)
        cache = { hsva: nextHsva, color: next }
        hsva = nextHsva
      }
    })
  })

  $effect(() => {
    const current = hsva
    untrack(() => {
      if (equalColorObjects(current, cache.hsva)) return
      const newColor = hsvaToHex(current, alpha)
      if (equalHex(newColor, cache.color)) return
      cache = { hsva: current, color: newColor }
      onChange?.(newColor)
    })
  })

  const update = (params: Partial<HsvaColor>) => {
    hsva = { ...hsva, ...params }
  }

  const pointerStyle = (left: number, top: number) => `top: ${top * 100}%; left: ${left * 100}%;`
</script>

<div class={['react-colorful', className].filter(Boolean).join(' ')}>
  <div
    class="react-colorful__saturation"
    style:background-color={hsvaToHslString({ h: hsva.h, s: 100, v: 100, a: 1 })}
  >
    <!-- svelte-ignore a11y_role_has_required_aria_props -->
    <div
      {@attach interactive(
        () => (interaction) => update({ s: interaction.left * 100, v: 100 - interaction.top * 100 }),
        () => (offset) =>
          update({
            s: clamp(hsva.s + offset.left * 100, 0, 100),
            v: clamp(hsva.v - offset.top * 100, 0, 100),
          }),
      )}
      class="react-colorful__interactive"
      tabindex={0}
      role="slider"
      aria-label="Color"
      aria-valuetext="Saturation {round(hsva.s)}%, Brightness {round(hsva.v)}%"
    >
      <div
        class="react-colorful__pointer react-colorful__saturation-pointer"
        style={pointerStyle(hsva.s / 100, 1 - hsva.v / 100)}
      >
        <div class="react-colorful__pointer-fill" style:background-color={hsvaToHslString(hsva)}></div>
      </div>
    </div>
  </div>

  <div class={alpha ? 'react-colorful__hue' : 'react-colorful__hue react-colorful__last-control'}>
    <div
      {@attach interactive(
        () => (interaction) => update({ h: 360 * interaction.left }),
        () => (offset) => update({ h: clamp(hsva.h + offset.left * 360, 0, 360) }),
      )}
      class="react-colorful__interactive"
      tabindex={0}
      role="slider"
      aria-label="Hue"
      aria-valuenow={round(hsva.h)}
      aria-valuemax={360}
      aria-valuemin={0}
    >
      <div class="react-colorful__pointer react-colorful__hue-pointer" style={pointerStyle(hsva.h / 360, 0.5)}>
        <div
          class="react-colorful__pointer-fill"
          style:background-color={hsvaToHslString({ h: hsva.h, s: 100, v: 100, a: 1 })}
        ></div>
      </div>
    </div>
  </div>

  {#if alpha}
    <div class="react-colorful__alpha react-colorful__last-control">
      <div
        class="react-colorful__alpha-gradient"
        style:background-image="linear-gradient(90deg, {hsvaToHslaString({
          ...hsva,
          a: 0,
        })}, {hsvaToHslaString({ ...hsva, a: 1 })})"
      ></div>
      <div
        {@attach interactive(
          () => (interaction) => update({ a: interaction.left }),
          () => (offset) => update({ a: clamp(hsva.a + offset.left) }),
        )}
        class="react-colorful__interactive"
        tabindex={0}
        role="slider"
        aria-label="Alpha"
        aria-valuetext="{round(hsva.a * 100)}%"
        aria-valuenow={round(hsva.a * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="react-colorful__pointer react-colorful__alpha-pointer" style={pointerStyle(hsva.a, 0.5)}>
          <div class="react-colorful__pointer-fill" style:background-color={hsvaToHslaString(hsva)}></div>
        </div>
      </div>
    </div>
  {/if}
</div>
