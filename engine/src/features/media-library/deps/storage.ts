// Media-library-local adapter for workspace-backed storage APIs.
//
// Keep direct workspace-fs imports out of media-library services; this facade is
// intentionally thin and behavior-preserving.
export {
  associateMediaWithProject,
  createMedia,
  decrementContentRef,
  deleteCaptions,
  deleteContent,
  deleteMedia,
  deleteScenes,
  deleteThumbnailsByMediaId,
  deleteTranscript,
  getAllMedia,
  getAllMediaMetadata,
  getMedia,
  getMediaForProject,
  getProjectMediaIds,
  getProjectsUsingMedia,
  getThumbnailByMediaId,
  getThumbnailsByMediaIds,
  hasMediaSource,
  incrementContentRef,
  mirrorBlobToWorkspace,
  mirrorJsonToWorkspace,
  proxyDir,
  proxyFilePath,
  proxyMetaPath,
  readAiOutput,
  readMediaSource,
  readWorkspaceBlob,
  removeMediaBatchFromProject,
  removeMediaFromProject,
  removeWorkspaceCacheEntry,
  saveCaptions,
  saveThumbnail,
  updateMedia,
  writeMediaSource,
} from '@/infrastructure/storage'
// EmbeddableCut: permission checks that hold where the browser has no permission API (Firefox).
export { queryHandlePermission } from '@/infrastructure/storage/handles-db'
