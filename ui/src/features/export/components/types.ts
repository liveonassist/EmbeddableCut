// SPDX-License-Identifier: MIT

/**
 * Prop types of the export dialog's parts. The dialog prepares each region's
 * props and the parts lay them out, so the shapes are shared between them.
 */

import type { IconRef } from '../../../extensions/contributions'
import type {
  ExportMode,
  ExportSettings,
  SourceVideoEncodingInfo,
  SubtitleExportMode,
} from '@/types/export'
import type { ClientAudioContainer, ClientVideoContainer } from '@/features/export/deps/renderer'
import type { ExportPreflightResult } from '@/features/export/utils/export-preflight'
import type { ExportRange } from '@/features/export/utils/export-range'
import type { SmartCopyAssessment } from '@/features/export/utils/smart-copy'
import type {
  ExportPreset,
  ResolutionOption,
  VideoCodecOption,
  VideoContainerOption,
} from '@/features/export/utils/export-options'

/** React's `Dispatch<SetStateAction<T>>`: a value, or an updater of the previous one. */
export type SetState<T> = (next: T | ((previous: T) => T)) => void

export interface ExportSequencePickerProps {
  /** Every exportable sequence; `null` is the Main timeline. */
  options: Array<{ id: string | null; name: string }>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export interface ExportModeToggleProps {
  mode: ExportMode
  onChange: (mode: ExportMode) => void
}

export interface ExportRangeSummaryProps {
  /** Frame window the export covers. */
  range: ExportRange
  fps: number
  hasInOutPoints: boolean
  renderWholeProject: boolean
  onRenderWholeProjectChange: (renderWholeProject: boolean) => void
}

export interface ExportPresetGridProps {
  presets: readonly ExportPreset[]
  /** The preset the current settings exactly match, or null for "Custom". */
  activePresetId: ExportPreset['id'] | null
  onApplyPreset: (preset: ExportPreset) => void
}

export interface ExportCapabilityAlertsProps {
  /** The codec probe is still running — say nothing until it reports. */
  isCheckingSupport: boolean
  /** Message from a failed probe, or null when it reported. */
  supportError: string | null
  /** Whether any container/codec pair the probe reported is usable. */
  hasSupportedPath: boolean
  width: number
  height: number
}

export interface ExportVideoFormatFieldsProps {
  settings: ExportSettings
  setSettings: SetState<ExportSettings>
  container: ClientVideoContainer
  setContainer: SetState<ClientVideoContainer>
  containerOptions: VideoContainerOption[]
  codecOptions: VideoCodecOption[]
  resolutionOptions: ResolutionOption[]
  projectWidth: number
  projectHeight: number
}

export interface ExportRateControlFieldsProps {
  settings: ExportSettings
  setSettings: SetState<ExportSettings>
  /** Bitrate the encoder would pick on auto — the input's fallback value. */
  resolvedVideoBitrate: number
  /** Encoding of the clip supplying the export, when one is known. */
  sourceVideo: SourceVideoEncodingInfo | undefined
}

export interface ExportSmartCopyBlockProps {
  settings: ExportSettings
  setSettings: SetState<ExportSettings>
  /** Why smart copy is or isn't available for the current settings. */
  assessment: SmartCopyAssessment
  /** Whether the export will actually copy the source bytes. */
  willRun: boolean
  /** Bitrate the encoder would pick on auto. */
  resolvedVideoBitrate: number
  estimatedFileSizeBytes: number
  /** Encoding of the clip supplying the export, when one is known. */
  sourceVideo: SourceVideoEncodingInfo | undefined
}

export interface ExportSubtitleFieldsProps {
  /** The subtitle mode the export will use, coerced to one the container supports. */
  mode: SubtitleExportMode
  onModeChange: (mode: SubtitleExportMode) => void
  /** Modes the current container can carry. */
  modeOptions: SubtitleExportMode[]
  /** Whether the timeline holds transcript captions to act on. */
  hasTranscriptSubtitles: boolean
}

export interface ExportVideoSettingsProps {
  presets: ExportPresetGridProps
  alerts: ExportCapabilityAlertsProps
  format: ExportVideoFormatFieldsProps
  rateControl: ExportRateControlFieldsProps
  smartCopy: ExportSmartCopyBlockProps
  subtitles: ExportSubtitleFieldsProps
}

export interface ExportAudioSettingsProps {
  settings: ExportSettings
  setSettings: SetState<ExportSettings>
  container: ClientAudioContainer
  setContainer: SetState<ClientAudioContainer>
}

export interface ExportSettingsFooterProps {
  mode: ExportMode
  /** The render path isn't ready (probe running, blocked, unsupported…) — both actions stay off. */
  actionsDisabled: boolean
  onClose: () => void
  onExport: () => void
  onAddCurrentRange: () => void
  onAddMarkerSegments: () => void
  onSplitChunks: (seconds: number) => void
}

export interface ExportSettingsViewProps {
  sequencePicker: ExportSequencePickerProps
  modeToggle: ExportModeToggleProps
  rangeSummary: ExportRangeSummaryProps
  preflight: ExportPreflightResult | null
  video: ExportVideoSettingsProps
  audio: ExportAudioSettingsProps
  footer: ExportSettingsFooterProps
}

export interface ExportCompleteViewProps {
  mode: ExportMode
  /** Blob URL of the finished render, when it produced one. */
  previewUrl: string | null
  isVideoResult: boolean
  fileSize: number | undefined
  elapsedSeconds: number
  onClose: () => void
  onDownload: () => void
  /** The host's own action in place of Download (`EditorActions.deliver`). */
  /** What the host calls Download, when it takes the file (`EditorActions.deliver`). */
  deliverAction?: { label?: string; icon?: IconRef }
  /** While the host takes the file. */
  delivering?: boolean
}

export interface ExportNoticeViewProps {
  variant: 'error' | 'cancelled'
  /** Failure text — only read for the error variant. */
  message: string | null
  onClose: () => void
}

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  /** Open the render queue panel (called after jobs are added to the queue). */
  onOpenRenderQueue?: () => void
}

export interface ExportsDialogProps {
  open: boolean
  onClose: () => void
  /** Active project — new renders save to `projects/<id>/exports/`. */
  projectId: string
}
