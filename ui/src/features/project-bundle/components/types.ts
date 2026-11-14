// SPDX-License-Identifier: MIT

export interface BundleExportDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onBeforeExport?: () => Promise<void>
  /** Pre-acquired file handle for streaming export (avoids native picker inside modal) */
  fileHandle?: FileSystemFileHandle
}
