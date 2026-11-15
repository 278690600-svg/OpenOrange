// localStorage-backed bi-directional link system for notes

export interface NoteLinkRecord {
  id: string
  sourceNoteId: string
  targetNoteId: string
  linkType: "reference" | "mention" | "related"
  createdAt: string
}

interface Note {
  id: string
  title: string
  content: string
  folder?: string
  tags: string[]
  pinned: boolean
  starred: boolean
  createdAt: string
  updatedAt: string
}

const LINKS_STORAGE_KEY = "note-links"

function getLinks(): NoteLinkRecord[] {
  const raw = localStorage.getItem(LINKS_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as NoteLinkRecord[]
  } catch {
    return []
  }
}

function setLinks(links: NoteLinkRecord[]): void {
  localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links))
}

/**
 * Extracts [[Note Title]] patterns from content.
 * Returns an array of the inner title strings.
 */
export function detectLinks(content: string): string[] {
  const regex = /\[\[(.+?)\]\]/g
  const matches: string[] = []
  let m
  while ((m = regex.exec(content)) !== null) {
    const title = m[1].trim()
    if (title) matches.push(title)
  }
  // Deduplicate
  return [...new Set(matches)]
}

/**
 * Finds a note by exact title match (case-insensitive).
 */
export function findNoteByTitle(notes: Note[], title: string): Note | undefined {
  return notes.find(
    (n) => n.title.toLowerCase() === title.toLowerCase()
  )
}

/**
 * Syncs links between old and new content.
 * Creates new links for added [[references]] and removes stale ones.
 */
export function syncLinks(
  noteId: string,
  oldContent: string,
  newContent: string,
  allNotes: Note[]
): void {
  const oldTitles = detectLinks(oldContent)
  const newTitles = detectLinks(newContent)

  const oldTargets = new Set(
    oldTitles
      .map((t) => findNoteByTitle(allNotes, t)?.id)
      .filter((id): id is string => Boolean(id))
  )

  const newTargets = new Set(
    newTitles
      .map((t) => findNoteByTitle(allNotes, t)?.id)
      .filter((id): id is string => Boolean(id))
  )

  const toRemove = [...oldTargets].filter((id) => !newTargets.has(id))
  const toAdd = [...newTargets].filter((id) => !oldTargets.has(id))

  const links = getLinks()

  // Remove stale links from this source note
  const filtered = links.filter(
    (l) =>
      !(l.sourceNoteId === noteId && toRemove.includes(l.targetNoteId))
  )

  // Add new links
  for (const targetId of toAdd) {
    // Prevent duplicate
    if (!filtered.some((l) => l.sourceNoteId === noteId && l.targetNoteId === targetId)) {
      filtered.push({
        id: `link-${Date.now()}-${targetId}`,
        sourceNoteId: noteId,
        targetNoteId: targetId,
        linkType: "mention",
        createdAt: new Date().toISOString(),
      })
    }
  }

  setLinks(filtered)
}

/**
 * Returns all links where this note is the target (backlinks).
 */
export function getBacklinks(noteId: string): NoteLinkRecord[] {
  return getLinks().filter((l) => l.targetNoteId === noteId)
}

/**
 * Returns all links where this note is the source (outgoing).
 */
export function getOutgoingLinks(noteId: string): NoteLinkRecord[] {
  return getLinks().filter((l) => l.sourceNoteId === noteId)
}

/**
 * Finds notes that share common link targets with this note (related notes).
 */
export function getRelatedNotes(
  noteId: string,
  allNotes: Note[]
): Note[] {
  const links = getLinks()

  // Targets of this note
  const myTargets = new Set(
    links
      .filter((l) => l.sourceNoteId === noteId)
      .map((l) => l.targetNoteId)
  )

  if (myTargets.size === 0) return []

  // Other notes that link to any of my targets
  const relatedIds = new Set<string>()
  for (const link of links) {
    if (link.sourceNoteId !== noteId && myTargets.has(link.targetNoteId)) {
      relatedIds.add(link.sourceNoteId)
    }
  }

  return allNotes.filter((n) => relatedIds.has(n.id))
}

/**
 * Get all links for the graph visualization.
 * Returns { nodes, edges } suitable for graph rendering.
 */
export function getGraphData(allNotes: Note[]) {
  const links = getLinks()
  const noteIdsInLinks = new Set<string>()
  for (const l of links) {
    noteIdsInLinks.add(l.sourceNoteId)
    noteIdsInLinks.add(l.targetNoteId)
  }

  const nodes = allNotes.filter((n) => noteIdsInLinks.has(n.id)).map((n) => ({
    id: n.id,
    title: n.title,
    folder: n.folder ?? "Unfiled",
    tags: n.tags,
  }))

  const edges = links.map((l) => ({
    source: l.sourceNoteId,
    target: l.targetNoteId,
    linkType: l.linkType,
  }))

  return { nodes, edges }
}
