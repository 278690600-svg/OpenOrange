import { NextRequest, NextResponse } from "next/server"

// GET /api/notes/graph - Get all notes and their links for graph visualization

export async function GET(request: NextRequest) {
  // Placeholder: returns empty structure for now
  // Notes use localStorage, so the full graph data is assembled client-side
  // This endpoint exists for future Prisma migration where server-side assembly makes sense
  return NextResponse.json({
    nodes: [],
    edges: [],
    note: "Graph data is assembled client-side via localStorage. This endpoint will support Prisma in the future."
  })
}
