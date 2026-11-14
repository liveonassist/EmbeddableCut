// SPDX-License-Identifier: MIT

/** Play/pause and percent-seek for a media element; `media` and `duration` are read when called. */
export function useMediaPlaybackControls<T extends HTMLMediaElement>(
  media: () => T | null | undefined,
  duration: () => number,
  setCurrentTime: (time: number) => void,
) {
  const togglePlay = () => {
    const el = media()
    if (!el) return
    if (el.paused) {
      void el.play()
    } else {
      el.pause()
    }
  }

  const seekToPercent = (values: number[]) => {
    const el = media()
    const total = duration()
    if (!el || !total) return
    const time = ((values[0] ?? 0) / 100) * total
    el.currentTime = time
    setCurrentTime(time)
  }

  return { togglePlay, seekToPercent }
}
