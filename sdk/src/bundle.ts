// SPDX-License-Identifier: MIT

/**
 * A project in one file: its document, and the bytes of every asset that
 * isn't at a URL. A store-only ZIP, so it's written and read without holding
 * the media in memory: media is spliced in and sliced out as `Blob`s.
 */

import { EditorError } from './errors'

export const BUNDLE_MIME_TYPE = 'application/zip'
const DOCUMENT_PATH = 'document.json'
const MEDIA_FOLDER = 'media/'

export interface BundleContents {
  document: unknown
  /** The bytes of embedded assets, by asset id. */
  media: Map<string, Blob>
}

interface Entry {
  path: string
  blob: Blob
}

/**
 * CRC-32 tables for slicing by 8: table `k` advances a byte through `k` more
 * zero bytes, so eight table reads take eight bytes at once. A bundle CRCs
 * every media byte on the main thread; byte at a time, that's seconds per GB.
 */
const CRC_TABLES = (() => {
  const tables = new Uint32Array(256 * 8)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tables[n] = c >>> 0
  }
  for (let n = 0; n < 256; n++) {
    for (let k = 1; k < 8; k++) {
      const previous = tables[(k - 1) * 256 + n]!
      tables[k * 256 + n] = (previous >>> 8) ^ tables[previous & 0xff]!
    }
  }
  return tables
})()

function updateCrc32(crc: number, bytes: Uint8Array): number {
  const t = CRC_TABLES
  let i = 0
  for (const end = bytes.length - 7; i < end; i += 8) {
    const word =
      crc ^ (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24))
    crc =
      t[1792 + (word & 0xff)]! ^
      t[1536 + ((word >>> 8) & 0xff)]! ^
      t[1280 + ((word >>> 16) & 0xff)]! ^
      t[1024 + (word >>> 24)]! ^
      t[768 + bytes[i + 4]!]! ^
      t[512 + bytes[i + 5]!]! ^
      t[256 + bytes[i + 6]!]! ^
      t[bytes[i + 7]!]!
  }
  for (; i < bytes.length; i++) crc = t[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  return crc
}

/** How much of a file is read at once. */
const CHUNK_LENGTH = 4 << 20

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  for (let at = 0; at < blob.size; at += CHUNK_LENGTH) {
    crc = updateCrc32(crc, new Uint8Array(await blob.slice(at, at + CHUNK_LENGTH).arrayBuffer()))
  }
  return (crc ^ 0xffffffff) >>> 0
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
const LOCAL_LENGTH = 30
const CENTRAL_LENGTH = 46
const END_LENGTH = 22
/** Without ZIP64, sizes and offsets are 32 bits. */
const MAX_LENGTH = 0xffffffff
/** UTF-8 file names. */
const FLAGS = 0x0800
/** 1 January 1980, the earliest date a ZIP can name, so equal projects make equal files. */
const DOS_DATE = 0x21

/** Writes the fields local and central headers share, starting at `at`. */
function writeCommonFields(
  view: DataView,
  at: number,
  entry: { crc: number; size: number; name: Uint8Array },
): void {
  view.setUint16(at, 20, true) // version needed
  view.setUint16(at + 2, FLAGS, true)
  view.setUint16(at + 4, 0, true) // stored
  view.setUint16(at + 6, 0, true) // time
  view.setUint16(at + 8, DOS_DATE, true)
  view.setUint32(at + 10, entry.crc, true)
  view.setUint32(at + 14, entry.size, true)
  view.setUint32(at + 18, entry.size, true)
  view.setUint16(at + 22, entry.name.length, true)
}

async function writeZip(entries: Entry[]): Promise<Blob> {
  const parts: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralLength = 0
  for (const { path, blob } of entries) {
    const name = new TextEncoder().encode(path)
    const record = { crc: await crc32(blob), size: blob.size, name }
    const local = new DataView(new ArrayBuffer(LOCAL_LENGTH))
    local.setUint32(0, LOCAL_SIGNATURE, true)
    writeCommonFields(local, 4, record)
    const header = new DataView(new ArrayBuffer(CENTRAL_LENGTH))
    header.setUint32(0, CENTRAL_SIGNATURE, true)
    header.setUint16(4, 20, true) // version made by
    writeCommonFields(header, 6, record)
    header.setUint32(42, offset, true)
    parts.push(local.buffer as ArrayBuffer, name as Uint8Array<ArrayBuffer>, blob)
    central.push(header.buffer as ArrayBuffer, name as Uint8Array<ArrayBuffer>)
    offset += LOCAL_LENGTH + name.length + blob.size
    centralLength += CENTRAL_LENGTH + name.length
  }
  if (offset + centralLength > MAX_LENGTH) {
    throw new EditorError(
      'BUNDLE_TOO_LARGE',
      'The project and its media are over 4 GB, more than one file can hold',
    )
  }
  const end = new DataView(new ArrayBuffer(END_LENGTH))
  end.setUint32(0, END_SIGNATURE, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralLength, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer as ArrayBuffer], { type: BUNDLE_MIME_TYPE })
}

async function viewOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

function invalid(): EditorError {
  return new EditorError('BUNDLE_INVALID', "The file isn't a project, or is damaged")
}

/** The file's entries, as slices of it. Reads only what `writeZip` writes. */
async function readZip(file: Blob): Promise<Map<string, Blob>> {
  // Nothing follows our end record, but a tool that added a comment is tolerated.
  const tailStart = Math.max(0, file.size - END_LENGTH - 0xffff)
  const tail = await viewOf(file.slice(tailStart))
  let end = tail.byteLength - END_LENGTH
  while (end >= 0 && tail.getUint32(end, true) !== END_SIGNATURE) end--
  if (end < 0) throw invalid()

  const count = tail.getUint16(end + 10, true)
  const centralStart = tail.getUint32(end + 16, true)
  const centralLength = tail.getUint32(end + 12, true)
  if (centralStart + centralLength > file.size) throw invalid()
  const central = await viewOf(file.slice(centralStart, centralStart + centralLength))
  const entries = new Map<string, Blob>()
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_LENGTH > central.byteLength) throw invalid()
    if (central.getUint32(at, true) !== CENTRAL_SIGNATURE) throw invalid()
    if (central.getUint16(at + 10, true) !== 0) throw invalid() // compressed
    const size = central.getUint32(at + 20, true)
    const nameLength = central.getUint16(at + 28, true)
    const skipped = central.getUint16(at + 30, true) + central.getUint16(at + 32, true)
    const localStart = central.getUint32(at + 42, true)
    const nameStart = at + CENTRAL_LENGTH
    if (nameStart + nameLength > central.byteLength) throw invalid()
    const path = new TextDecoder().decode(new Uint8Array(central.buffer, nameStart, nameLength))
    const local = await viewOf(file.slice(localStart, localStart + LOCAL_LENGTH))
    if (local.byteLength < LOCAL_LENGTH) throw invalid()
    const dataStart =
      localStart + LOCAL_LENGTH + local.getUint16(26, true) + local.getUint16(28, true)
    if (dataStart + size > file.size) throw invalid()
    entries.set(path, file.slice(dataStart, dataStart + size))
    at = nameStart + nameLength + skipped
  }
  return entries
}

/** Puts a document and its embedded media in one file. */
export async function writeBundle(contents: BundleContents): Promise<Blob> {
  return writeZip([
    { path: DOCUMENT_PATH, blob: new Blob([JSON.stringify(contents.document)]) },
    ...[...contents.media].map(([id, blob]) => ({
      path: MEDIA_FOLDER + encodeURIComponent(id),
      blob,
    })),
  ])
}

/**
 * Reads a file {@link writeBundle} wrote, or a bare document's JSON.
 *
 * @throws {EditorError} `BUNDLE_INVALID` when it's neither.
 */
export async function readBundle(file: Blob): Promise<BundleContents> {
  const signature = await file.slice(0, 4).arrayBuffer()
  const isZip =
    signature.byteLength === 4 && new DataView(signature).getUint32(0, true) === LOCAL_SIGNATURE
  const entries = isZip ? await readZip(file) : null
  const json = entries ? entries.get(DOCUMENT_PATH) : file
  if (!json) throw invalid()
  let document: unknown
  try {
    document = JSON.parse(new TextDecoder().decode(await json.arrayBuffer()))
  } catch {
    throw invalid()
  }
  const media = new Map<string, Blob>()
  for (const [path, blob] of entries ?? []) {
    if (path.startsWith(MEDIA_FOLDER)) {
      media.set(decodeURIComponent(path.slice(MEDIA_FOLDER.length)), blob)
    }
  }
  return { document, media }
}
