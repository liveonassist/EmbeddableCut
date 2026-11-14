// SPDX-License-Identifier: MIT

/**
 * Filmstrip and waveform modules load on first use, as React.lazy did: each
 * loader starts its import the first time a clip needs it and hands every
 * later clip the same promise.
 */

let clipFilmstrip: Promise<typeof import('../../clip-filmstrip').ClipFilmstrip> | undefined
let imageFilmstrip:
  | Promise<typeof import('../../clip-filmstrip/image-filmstrip.svelte').default>
  | undefined
let clipWaveform: Promise<typeof import('../../clip-waveform').ClipWaveform> | undefined
let compoundClipWaveform:
  | Promise<typeof import('../../clip-waveform/compound-clip-waveform.svelte').default>
  | undefined

export function loadClipFilmstrip() {
  return (clipFilmstrip ??= import('../../clip-filmstrip').then((module) => module.ClipFilmstrip))
}

export function loadImageFilmstrip() {
  return (imageFilmstrip ??= import('../../clip-filmstrip/image-filmstrip.svelte').then(
    (module) => module.default,
  ))
}

export function loadClipWaveform() {
  return (clipWaveform ??= import('../../clip-waveform').then((module) => module.ClipWaveform))
}

export function loadCompoundClipWaveform() {
  return (compoundClipWaveform ??= import('../../clip-waveform/compound-clip-waveform.svelte').then(
    (module) => module.default,
  ))
}
