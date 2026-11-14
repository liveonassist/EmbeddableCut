// SPDX-License-Identifier: MIT

export interface TimelineHeaderProps {
  onZoomChange?: (newZoom: number) => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomToFit?: () => void
}
