import prisma from '@/lib/db'

interface CreateVersionInput {
  fileId: string
  fileName: string
  content: string
  versionLabel?: string
}

interface VersionDiff {
  added: string[]
  removed: string[]
  modified: number
}

export async function createFileVersion(input: CreateVersionInput) {
  const { fileId, fileName, content, versionLabel } = input

  const maxVersion = await prisma.fileVersion.aggregate({
    where: { fileId },
    _max: { version: true }
  })

  const versionNumber = (maxVersion._max.version || 0) + 1

  const version = await prisma.fileVersion.create({
    data: {
      fileId,
      fileName,
      content,
      version: versionNumber,
      fileHash: `v${versionNumber}-${Date.now()}`,
      fileSize: Buffer.byteLength(content, 'utf8'),
      changeDescription: versionLabel || `Version ${versionNumber} created`
    }
  })

  return version
}

export async function getVersions(fileId: string) {
  return prisma.fileVersion.findMany({
    where: { fileId },
    orderBy: { version: 'desc' }
  })
}

export async function getVersionById(versionId: string) {
  return prisma.fileVersion.findUnique({
    where: { id: versionId }
  })
}

export async function getVersionDiff(fileId: string, versionIdA: string, versionIdB: string): Promise<VersionDiff> {
  const [versionA, versionB] = await Promise.all([
    prisma.fileVersion.findUnique({ where: { id: versionIdA } }),
    prisma.fileVersion.findUnique({ where: { id: versionIdB } })
  ])

  if (!versionA || !versionB) {
    throw new Error('One or both versions not found')
  }

  const linesA = versionA.content.split('\n')
  const linesB = versionB.content.split('\n')

  const added: string[] = []
  const removed: string[] = []
  let modified = 0

  const maxLines = Math.max(linesA.length, linesB.length)

  for (let i = 0; i < maxLines; i++) {
    const lineA = linesA[i]
    const lineB = linesB[i]

    if (lineA === undefined && lineB !== undefined) {
      added.push(`+${i + 1}: ${lineB}`)
    } else if (lineA !== undefined && lineB === undefined) {
      removed.push(`-${i + 1}: ${lineA}`)
    } else if (lineA !== lineB) {
      removed.push(`-${i + 1}: ${lineA}`)
      added.push(`+${i + 1}: ${lineB}`)
      modified++
    }
  }

  return { added, removed, modified }
}

export async function rollbackToVersion(fileId: string, versionId: string) {
  const version = await prisma.fileVersion.findUnique({
    where: { id: versionId }
  })

  if (!version) {
    throw new Error('Version not found')
  }

  const newVersion = await createFileVersion({
    fileId,
    fileName: version.fileName,
    content: version.content,
    versionLabel: `Rollback to v${version.version}`
  })

  return {
    rollbackTo: `v${version.version}`,
    newVersion,
    content: version.content
  }
}

export async function deleteFileVersion(versionId: string) {
  return prisma.fileVersion.delete({
    where: { id: versionId }
  })
}
