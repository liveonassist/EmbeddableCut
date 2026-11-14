// SPDX-License-Identifier: MIT

/** The open project's metadata, as the editor shell hands it to the toolbar and preview. */
export interface EditorProject {
  id: string
  name: string
  width: number
  height: number
  fps: number
  backgroundColor?: string
}
