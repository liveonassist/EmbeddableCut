// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { Project } from '@/types/project'
import { CURRENT_SCHEMA_VERSION } from '@/shared/projects/migrations'
import type { AssetRecord } from './asset'
import { SchemaError } from './errors'
import {
  PROJECT_DOCUMENT_FORMAT,
  readProjectDocument,
  writeProjectDocument,
} from './project-document'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Demo',
    description: '',
    createdAt: 1,
    updatedAt: 2,
    duration: 3,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { width: 1920, height: 1080, fps: 30 },
    timeline: {
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          kind: 'video',
          height: 80,
          locked: false,
          visible: true,
          muted: false,
          solo: false,
          order: 0,
        },
      ],
      items: [
        {
          id: 'clip-1',
          type: 'video',
          trackId: 'v1',
          from: 0,
          durationInFrames: 90,
          label: 'clip.mp4',
          mediaId: 'media-1',
        },
      ],
    },
    ...overrides,
  } as Project
}

const asset: AssetRecord = {
  id: 'media-1',
  fileName: 'clip.mp4',
  mimeType: 'video/mp4',
  fileSize: 1024,
  duration: 3,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'avc1.640028',
  bitrate: 1000,
  source: { type: 'url', url: 'https://cdn.example.com/clip.mp4', expiresAt: 1_900_000_000_000 },
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    if (error instanceof SchemaError) return error.code
    throw error
  }
  return undefined
}

describe('project documents', () => {
  it('round-trips a project and its assets without loss', () => {
    const written = writeProjectDocument(makeProject(), [asset])
    const { document, warnings } = readProjectDocument(JSON.parse(JSON.stringify(written)))

    expect(document.project.timeline?.items[0]).toMatchObject({ id: 'clip-1', mediaId: 'media-1' })
    expect(document.assets).toEqual([asset])
    expect(warnings).toEqual([])
  })

  it('migrates an older project inside the document', () => {
    const written = writeProjectDocument(makeProject(), [asset])
    const older = { ...written, project: { ...written.project, schemaVersion: 7 } }

    const { document, migrated } = readProjectDocument(older)

    expect(migrated).toBe(true)
    expect(document.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('reads a v1 envelope as v2, which only added a kind of asset source', () => {
    const written = writeProjectDocument(makeProject(), [asset])

    const { document, migrated } = readProjectDocument({ ...written, schemaVersion: 1 })

    expect(migrated).toBe(true)
    expect(document).toEqual(readProjectDocument(written).document)
  })

  it('refuses newer envelopes and newer projects rather than reading what it can', () => {
    const written = writeProjectDocument(makeProject(), [asset])

    expect(codeOf(() => readProjectDocument({ ...written, schemaVersion: 3 }))).toBe(
      'SCHEMA_TOO_NEW',
    )
    expect(
      codeOf(() =>
        readProjectDocument({
          ...written,
          project: { ...written.project, schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
        }),
      ),
    ).toBe('SCHEMA_TOO_NEW')
  })

  it('refuses other formats and fields it does not know', () => {
    const written = writeProjectDocument(makeProject(), [asset])

    expect(codeOf(() => readProjectDocument(makeProject()))).toBe('SCHEMA_UNKNOWN_FORMAT')
    expect(codeOf(() => readProjectDocument({ ...written, clips: [] }))).toBe('SCHEMA_INVALID')
  })

  it('names the path of invalid content', () => {
    const written = writeProjectDocument(makeProject(), [asset])

    try {
      readProjectDocument({
        ...written,
        assets: [{ ...asset, source: { type: 'url', url: 'not a url' } }],
      })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError)
      expect((error as SchemaError).issues[0]?.path).toBe('assets.0.source.url')
    }
  })

  it('warns about items whose media has no asset record', () => {
    const { warnings } = readProjectDocument(writeProjectDocument(makeProject(), []))

    expect(warnings).toEqual([
      expect.objectContaining({ code: 'ASSET_MISSING', mediaId: 'media-1', itemIds: ['clip-1'] }),
    ])
  })

  it('writes the format and both versions', () => {
    const written = writeProjectDocument(makeProject({ schemaVersion: undefined }), [asset])

    expect(written.format).toBe(PROJECT_DOCUMENT_FORMAT)
    expect(written.schemaVersion).toBe(2)
    expect(written.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(codeOf(() => writeProjectDocument(makeProject({ schemaVersion: 7 }), [asset]))).toBe(
      'SCHEMA_INVALID',
    )
  })
})
