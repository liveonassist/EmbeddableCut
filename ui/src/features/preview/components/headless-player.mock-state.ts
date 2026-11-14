// SPDX-License-Identifier: MIT

/** The imperative handle every mounted mock player exposes; tests swap its methods. */
export const playerHandle: { seekTo: (frame: number) => void } = {
  seekTo: () => {},
}
