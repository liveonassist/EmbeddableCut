// SPDX-License-Identifier: MIT

import type { AudioPlaybackProps } from './audio-playback-props'

export interface CustomDecoderBufferedAudioProps extends AudioPlaybackProps {
  src: string
  mediaId: string
}
