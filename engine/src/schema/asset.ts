// SPDX-License-Identifier: MIT

/**
 * The portable media asset record: what a project document says about each
 * piece of media its items reference by `mediaId`, enough for another editor,
 * a renderer or a native client to find the bytes and plan around them
 * without probing first.
 */

import { z } from "zod";
import type { MediaMetadata } from "@/types/storage";

/**
 * Where an asset's bytes are. Credentials never live here: a host supplies
 * them when the asset is opened, and renews signed URLs through its resolver.
 */
export const assetSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      /** Fetched over HTTP(S), with range requests where the server allows them. */
      type: z.literal("url"),
      url: z.string().url(),
      /** Epoch milliseconds after which `url` must be renewed before use (signed URLs). */
      expiresAt: z.number().int().nonnegative().optional(),
      /** A stable key a host's resolver renews `url` from, when `url` itself expires. */
      key: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      /** Held by the editor's own storage (the workspace folder), keyed by asset id. */
      type: z.literal("workspace"),
    })
    .strict(),
  z
    .object({
      /** A file on the user's own disk, referenced but not copied; relinked on another machine. */
      type: z.literal("file"),
      fileName: z.string().min(1),
      lastModified: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);

export const assetRecordSchema = z
  .object({
    id: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    fileSize: z.number().int().nonnegative(),
    /** Seconds; 0 for stills. */
    duration: z.number().nonnegative(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    fps: z.number().nonnegative(),
    codec: z.string(),
    audioCodec: z.string().optional(),
    bitrate: z.number().nonnegative(),
    /** Content identity for matching an asset to bytes a host already has. */
    contentHash: z.string().optional(),
    source: assetSourceSchema,
  })
  .strict();

export type AssetSource = z.infer<typeof assetSourceSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;

function sourceOf(media: MediaMetadata): AssetSource {
  if (media.storageType === "url" && media.remote) {
    return {
      type: "url",
      url: media.remote.url,
      ...(media.remote.expiresAt === undefined ? {} : { expiresAt: media.remote.expiresAt }),
      ...(media.remote.key === undefined ? {} : { key: media.remote.key }),
    };
  }
  if (media.storageType === "handle") {
    return {
      type: "file",
      fileName: media.fileName,
      ...(media.fileLastModified === undefined ? {} : { lastModified: media.fileLastModified }),
    };
  }
  return { type: "workspace" };
}

/** The portable record for a media library entry. */
export function assetRecordFromMedia(media: MediaMetadata): AssetRecord {
  return {
    id: media.id,
    fileName: media.fileName,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    duration: media.duration,
    width: media.width,
    height: media.height,
    fps: media.fps,
    codec: media.codec,
    ...(media.audioCodec === undefined ? {} : { audioCodec: media.audioCodec }),
    bitrate: media.bitrate,
    ...(media.contentHash === undefined ? {} : { contentHash: media.contentHash }),
    source: sourceOf(media),
  };
}

/**
 * The media library entry for an asset record. A `file` asset comes back
 * without its handle, so the editor shows it offline until it's relinked.
 */
export function mediaFromAssetRecord(asset: AssetRecord, now = Date.now()): MediaMetadata {
  const { source } = asset;
  return {
    id: asset.id,
    storageType: source.type === "url" ? "url" : source.type === "file" ? "handle" : "workspace",
    ...(source.type === "url"
      ? {
          remote: {
            url: source.url,
            ...(source.expiresAt === undefined ? {} : { expiresAt: source.expiresAt }),
            ...(source.key === undefined ? {} : { key: source.key }),
          },
        }
      : {}),
    ...(source.type === "file" && source.lastModified !== undefined
      ? { fileLastModified: source.lastModified }
      : {}),
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    codec: asset.codec,
    ...(asset.audioCodec === undefined ? {} : { audioCodec: asset.audioCodec }),
    bitrate: asset.bitrate,
    ...(asset.contentHash === undefined ? {} : { contentHash: asset.contentHash }),
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
