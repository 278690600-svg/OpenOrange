"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Search, Maximize2, RotateCcw, Link2, Sparkles, HelpCircle } from "lucide-react"
import { getGraphData } from "@/lib/note-links"

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

interface GraphNode {
  id: string
  title: string
  folder: string
  // 3D coordinates
  x: number
  y: number
  z: number
  // 3D velocities
  vx: number
  vy: number
  vz: number
  // Projected 2D coordinates for rendering and mouse detection
  projX?: number
  projY?: number
  projZ?: number
  scale?: number
}

interface GraphEdge {
  source: string
  target: string
}

const FOLDER_COLORS: Record<string, string> = {
  "Unfiled": "#a1a1aa",
}

function getFolderColor(folder: string): string {
  if (FOLDER_COLORS[folder]) return FOLDER_COLORS[folder]
  const palette = [
    "#3b82f6", // Cool Blue
    "#8b5cf6", // Purple Aura
    "#ec4899", // Neon Pink
    "#10b981", // Emerald
    "#f59e0b", // Gold
    "#06b6d4", // Cyan
    "#f97316", // Amber
    "#14b8a6", // Teal
    "#6366f1", // Indigo
  ]
  let hash = 0
  for (let i = 0; i < folder.length; i++) {
    hash = folder.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function KnowledgeGraph() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })

  // 3D Camera / Transform States
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 3D Rotation angles and targets (for smooth easing)
  const angleXRef = useRef(0.3)
  const angleYRef = useRef(0.5)
  const targetAngleXRef = useRef(0.3)
  const targetAngleYRef = useRef(0.5)

  // Interactive states inside refs to avoid re-triggering canvas loops
  const isDraggingRef = useRef(false)
  const dragStartMouseRef = useRef({ x: 0, y: 0 })
  const dragStartAnglesRef = useRef({ x: 0, y: 0 })
  const draggedNodeIdRef = useRef<string | null>(null)
  const hoveredNodeIdRef = useRef<string | null>(null)

  // Physics Simulation running status
  const simulationWarmupRef = useRef(1.0)

  // Loaded notes
  useEffect(() => {
    const saved = localStorage.getItem("notes")
    if (saved) {
      setNotes(JSON.parse(saved))
    }
    setLoaded(true)
  }, [])

  // Resize observer to auto-adapt canvas size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Construct stable graph nodes and edges
  const graphData = useMemo(() => {
    if (!loaded) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[], folders: [] as string[] }
    const raw = getGraphData(notes)

    const noteMap = new Map(raw.nodes.map(n => [n.id, n]))
    for (const note of notes) {
      if (!noteMap.has(note.id)) {
        noteMap.set(note.id, { id: note.id, title: note.title, folder: note.folder ?? "Unfiled", tags: note.tags })
      }
    }

    const folders = [...new Set(Array.from(noteMap.values()).map(n => n.folder ?? "Unfiled"))]

    // Create 3D Nodes
    const radius3D = 220
    const graphNodes: GraphNode[] = Array.from(noteMap.entries()).map(([id, n], i, arr) => {
      // Distribute nodes evenly on a 3D sphere using Fibonacci sphere algorithm for perfect aesthetic grouping
      const phi = Math.acos(1 - 2 * (i + 0.5) / arr.length)
      const theta = Math.PI * (1 + 5 ** 0.5) * i

      return {
        id,
        title: n.title,
        folder: n.folder ?? "Unfiled",
        x: radius3D * Math.sin(phi) * Math.cos(theta),
        y: radius3D * Math.sin(phi) * Math.sin(theta),
        z: radius3D * Math.cos(phi),
        vx: 0,
        vy: 0,
        vz: 0,
      }
    })

    return { nodes: graphNodes, edges: raw.edges, folders }
  }, [notes, loaded])

  const { nodes, edges, folders } = graphData

  // Ref container for physics simulation inside requestAnimationFrame
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    simulationWarmupRef.current = 1.0 // Reset simulation heat
  }, [nodes, edges])

  // Filter nodes for search query highlight
  const filteredNodeIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return new Set(nodes.map(n => n.id))
    return new Set(
      nodes
        .filter(n => n.title.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q))
        .map(n => n.id)
    )
  }, [nodes, searchQuery])

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId])

  // Smooth focus on node
  const focusOnNode = useCallback((node: GraphNode) => {
    // Transition angles to orient the selected node toward the screen front (z = -radius)
    // Calculate polar coordinates of the node to set camera rotations
    const dist = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 1
    const targetTheta = Math.atan2(node.y, node.x)
    const targetPhi = Math.acos(node.z / dist)

    targetAngleYRef.current = -targetTheta + Math.PI / 2
    targetAngleXRef.current = targetPhi - Math.PI / 2
    setZoom(1.2)
    setPan({ x: 0, y: 0 })
    setSelectedNodeId(node.id)
  }, [])

  // Canvas Main Loop: Physics + 3D Transform + Projection + Z-sorted Rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animFrameId: number

    const tick = () => {
      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current
      const width = canvasSize.width
      const height = canvasSize.height
      const centerX = width / 2
      const centerY = height / 2

      // 1. --- 3D Force-Directed Simulation ---
      const alpha = simulationWarmupRef.current
      if (alpha > 0.01 && currentNodes.length > 0) {
        // Multi-body 3D Repulsion Force
        for (let i = 0; i < currentNodes.length; i++) {
          const a = currentNodes[i]
          for (let j = i + 1; j < currentNodes.length; j++) {
            const b = currentNodes[j]
            const dx = a.x - b.x
            const dy = a.y - b.y
            const dz = a.z - b.z
            let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < 10) dist = 10
            
            // Inverse square repulsion with alpha cooling
            const force = (160 / (dist * dist)) * alpha
            a.vx += (dx / dist) * force
            a.vy += (dy / dist) * force
            a.vz += (dz / dist) * force
            b.vx -= (dx / dist) * force
            b.vy -= (dy / dist) * force
            b.vz -= (dz / dist) * force
          }
        }

        // Link Attraction Force in 3D
        for (const edge of currentEdges) {
          const source = currentNodes.find(n => n.id === edge.source)
          const target = currentNodes.find(n => n.id === edge.target)
          if (!source || !target) continue

          const dx = target.x - source.x
          const dy = target.y - source.y
          const dz = target.z - source.z
          let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < 10) dist = 10

          const idealDist = 130
          const force = ((dist - idealDist) / 800) * alpha
          source.vx += (dx / dist) * force
          source.vy += (dy / dist) * force
          source.vz += (dz / dist) * force
          target.vx -= (dx / dist) * force
          target.vy -= (dy / dist) * force
          target.vz -= (dz / dist) * force
        }

        // Center Gravity & Damping
        const gravityStrength = 0.008 * alpha
        for (const node of currentNodes) {
          // Attract to origin (0, 0, 0)
          node.vx -= node.x * gravityStrength
          node.vy -= node.y * gravityStrength
          node.vz -= node.z * gravityStrength

          // Apply velocity and friction
          node.vx *= 0.82
          node.vy *= 0.82
          node.vz *= 0.82

          // If not currently dragged by user
          if (draggedNodeIdRef.current !== node.id) {
            node.x += node.vx
            node.y += node.vy
            node.z += node.vz
          }
        }

        // Cool down alpha simulation
        simulationWarmupRef.current *= 0.992
      }

      // 2. --- 3D Rotation & Camera Perspective Easing ---
      angleXRef.current += (targetAngleXRef.current - angleXRef.current) * 0.12
      angleYRef.current += (targetAngleYRef.current - angleYRef.current) * 0.12

      const cosX = Math.cos(angleXRef.current)
      const sinX = Math.sin(angleXRef.current)
      const cosY = Math.cos(angleYRef.current)
      const sinY = Math.sin(angleYRef.current)

      // Perspective values
      const focalLength = 480
      const cameraZ = 380

      // Calculate projected 2D coordinates for all nodes
      currentNodes.forEach(node => {
        // Rotate around Y-axis (Yaw)
        let x1 = node.x * cosY - node.z * sinY
        let z1 = node.z * cosY + node.x * sinY

        // Rotate around X-axis (Pitch)
        let y2 = node.y * cosX - z1 * sinX
        let z2 = z1 * cosX + node.y * sinX

        // Perspective scaling
        const scale = focalLength / (focalLength + z2 + cameraZ)
        
        // Final screen project coordinates
        node.projX = centerX + x1 * scale * zoom + pan.x
        node.projY = centerY + y2 * scale * zoom + pan.y
        node.projZ = z2
        node.scale = scale
      })

      // 3. --- Rendering ---
      ctx.clearRect(0, 0, width, height)

      // Draw starry ambient space background particles (premium aesthetics)
      ctx.fillStyle = "rgba(99, 102, 241, 0.05)"
      const tNow = Date.now() / 4000
      for (let i = 0; i < 30; i++) {
        const sx = (Math.sin(i * 99 + tNow) * 0.5 + 0.5) * width
        const sy = (Math.cos(i * 45 + tNow * 0.7) * 0.5 + 0.5) * height
        const sSize = (Math.sin(i * 12 + tNow * 1.5) * 0.4 + 0.6) * 2
        ctx.beginPath()
        ctx.arc(sx, sy, sSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw links/edges with glowing flow particles
      currentEdges.forEach((edge, edgeIdx) => {
        const source = currentNodes.find(n => n.id === edge.source)
        const target = currentNodes.find(n => n.id === edge.target)
        if (!source || !target) return

        // Skip rendering if source or target node is not active in search filters
        const sourceActive = filteredNodeIds.has(source.id)
        const targetActive = filteredNodeIds.has(target.id)
        if (!sourceActive || !targetActive) return

        const isHighlight = selectedNodeId === source.id || selectedNodeId === target.id
        const isMuted = selectedNodeId && !isHighlight

        // Draw connecting fiber link line
        ctx.beginPath()
        ctx.moveTo(source.projX!, source.projY!)
        ctx.lineTo(target.projX!, target.projY!)

        // Link style based on state
        const midZ = (source.projZ! + target.projZ!) / 2
        const lineAlpha = Math.max(0.05, Math.min(0.7, (1 - (midZ / 400)) * (isHighlight ? 0.8 : isMuted ? 0.08 : 0.35)))
        ctx.strokeStyle = isHighlight 
          ? `rgba(99, 102, 241, ${lineAlpha})` 
          : `rgba(161, 161, 170, ${lineAlpha})`
        ctx.lineWidth = isHighlight ? 2.5 : 1.2
        ctx.stroke()

        // Flow particle stream effect on active links
        if (!isMuted || isHighlight) {
          const flowSpeed = 1600 // ms per cycle
          const progress = ((tNow * flowSpeed) + (edgeIdx * 73)) % flowSpeed / flowSpeed
          
          const pX = source.projX! + (target.projX! - source.projX!) * progress
          const pY = source.projY! + (target.projY! - source.projY!) * progress
          const pScale = source.scale! + (target.scale! - source.scale!) * progress

          ctx.beginPath()
          ctx.arc(pX, pY, 2.2 * pScale, 0, Math.PI * 2)
          ctx.fillStyle = isHighlight ? "rgba(139, 92, 246, 0.9)" : "rgba(99, 102, 241, 0.5)"
          ctx.shadowBlur = 8
          ctx.shadowColor = isHighlight ? "#8b5cf6" : "#6366f1"
          ctx.fill()
          ctx.shadowBlur = 0 // Reset shadow
        }
      })

      // Sort nodes from back to front (large projZ is far away/backwards, small projZ is near/front)
      const sortedNodes = [...currentNodes].sort((a, b) => b.projZ! - a.projZ!)

      // Draw node spheres and hover tags
      sortedNodes.forEach(node => {
        const isSearchMatch = filteredNodeIds.has(node.id)
        if (!isSearchMatch && searchQuery) return // Completely hide if not matched when searching

        const isSelected = selectedNodeId === node.id
        const isHovered = hoveredNodeIdRef.current === node.id
        const isConnected = selectedNodeId && currentEdges.some(
          e => (e.source === selectedNodeId && e.target === node.id) ||
               (e.target === selectedNodeId && e.source === node.id)
        )
        const isMuted = selectedNodeId && !isSelected && !isConnected

        const baseColor = getFolderColor(node.folder)
        const scale = node.scale!
        
        // Size calculation
        const nodeRadius = (isSelected ? 20 : isHovered ? 16 : isConnected ? 14 : 11) * scale
        
        ctx.save()
        
        // Node opacity based on 3D depth and selection focus state
        const depthAlpha = Math.max(0.12, Math.min(1.0, (1 - (node.projZ! / 450)) * scale))
        ctx.globalAlpha = isMuted ? depthAlpha * 0.15 : depthAlpha

        // Glowing corona for selected node
        if (isSelected || isHovered) {
          ctx.beginPath()
          ctx.arc(node.projX!, node.projY!, nodeRadius + 5 * scale, 0, Math.PI * 2)
          ctx.fillStyle = baseColor
          ctx.globalAlpha = isSelected ? 0.28 : 0.15
          ctx.shadowBlur = 15
          ctx.shadowColor = baseColor
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.globalAlpha = isMuted ? depthAlpha * 0.15 : depthAlpha
        }

        // Beautiful glass-sphere 3D gradient node
        const radialGrad = ctx.createRadialGradient(
          node.projX! - nodeRadius * 0.25,
          node.projY! - nodeRadius * 0.25,
          nodeRadius * 0.05,
          node.projX!,
          node.projY!,
          nodeRadius
        )
        radialGrad.addColorStop(0, "#ffffff")
        radialGrad.addColorStop(0.35, baseColor)
        radialGrad.addColorStop(1, "rgba(9, 9, 11, 0.95)") // Dark border shadow for 3D realism

        ctx.beginPath()
        ctx.arc(node.projX!, node.projY!, nodeRadius, 0, Math.PI * 2)
        ctx.fillStyle = radialGrad
        ctx.fill()

        // Ring border
        ctx.strokeStyle = isSelected 
          ? "rgba(255, 255, 255, 0.9)" 
          : isConnected 
            ? "rgba(255, 255, 255, 0.5)" 
            : "rgba(255, 255, 255, 0.2)"
        ctx.lineWidth = isSelected ? 2.5 * scale : 1 * scale
        ctx.stroke()

        // Text title tags - Only draw for close nodes or hovered/selected node
        const shouldShowText = isSelected || isHovered || isConnected || (scale > 0.6 && !isMuted)
        if (shouldShowText) {
          const fontSize = Math.max(9, Math.floor((isSelected ? 12 : isHovered ? 11 : 9.5) * scale))
          ctx.font = `${isSelected ? "600" : "500"} ${fontSize}px Outfit, Inter, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"

          const txt = node.title.length > 20 ? node.title.slice(0, 18) + "..." : node.title
          const textY = node.projY! + nodeRadius + 14 * scale

          // Text glow background pill
          const textWidth = ctx.measureText(txt).width
          ctx.fillStyle = "rgba(9, 9, 11, 0.7)"
          ctx.beginPath()
          ctx.roundRect(node.projX! - textWidth/2 - 6, textY - 8, textWidth + 12, 16, 6)
          ctx.fill()

          ctx.fillStyle = isSelected 
            ? "#ffffff" 
            : isHovered 
              ? "#6366f1" 
              : "rgba(244, 244, 245, 0.85)"
          ctx.fillText(txt, node.projX!, textY)
        }

        ctx.restore()
      })

      animFrameId = requestAnimationFrame(tick)
    }

    animFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameId)
  }, [canvasSize, zoom, pan, selectedNodeId, searchQuery, nodes, edges])

  // Hit-test to find which node was clicked
  const getNodeAtPosition = useCallback((x: number, y: number): GraphNode | null => {
    const currentNodes = nodesRef.current
    // Traverse from front nodes to back nodes to ensure we select the visually topmost node
    const sorted = [...currentNodes].sort((a, b) => a.projZ! - b.projZ!)
    
    for (const node of sorted) {
      if (node.projX === undefined || node.projY === undefined) continue
      const dx = x - node.projX
      const dy = y - node.projY
      const scale = node.scale!
      const radius = (selectedNodeId === node.id ? 20 : 12) * scale
      
      if (dx * dx + dy * dy <= (radius + 6) * (radius + 6)) {
        return node
      }
    }
    return null
  }, [selectedNodeId])

  // Mouse interactivity handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const hitNode = getNodeAtPosition(mouseX, mouseY)

    if (hitNode) {
      // Direct drag on node
      draggedNodeIdRef.current = hitNode.id
      simulationWarmupRef.current = 1.0 // Inject heat into physics on interaction
    } else {
      // Rotation drag on background
      isDraggingRef.current = true
      dragStartMouseRef.current = { x: e.clientX, y: e.clientY }
      dragStartAnglesRef.current = { x: targetAngleXRef.current, y: targetAngleYRef.current }
    }
  }, [getNodeAtPosition])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Dragging a node in 3D
    if (draggedNodeIdRef.current) {
      const node = nodesRef.current.find(n => n.id === draggedNodeIdRef.current)
      if (node) {
        // Project screen mouse delta to physics coordinates
        // For simplicity in three dimensions, map mouse drag directly to rotated 3D coordinates
        const scale = node.scale!
        const deltaX = e.movementX / (scale * zoom)
        const deltaY = e.movementY / (scale * zoom)

        // De-rotate coordinates using current camera matrix inverse
        const cosX = Math.cos(angleXRef.current)
        const sinX = Math.sin(angleXRef.current)
        const cosY = Math.cos(angleYRef.current)
        const sinY = Math.sin(angleYRef.current)

        // Basic approximation of de-rotating drag offsets into physics world space
        const worldDx = deltaX * cosY + deltaY * sinX * sinY
        const worldDy = deltaY * cosX
        const worldDz = -deltaX * sinY + deltaY * sinX * cosY

        node.x += worldDx * 0.8
        node.y += worldDy * 0.8
        node.z += worldDz * 0.8

        node.vx = 0
        node.vy = 0
        node.vz = 0
        simulationWarmupRef.current = 0.8
      }
      return
    }

    // Dragging background space to rotate scene
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartMouseRef.current.x
      const dy = e.clientY - dragStartMouseRef.current.y
      
      // Fine-tuned rotation sensitivity
      const sensitivity = 0.007
      targetAngleYRef.current = dragStartAnglesRef.current.y + dx * sensitivity
      targetAngleXRef.current = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, dragStartAnglesRef.current.x + dy * sensitivity))
      return
    }

    // Hover detection
    const hoveredNode = getNodeAtPosition(mouseX, mouseY)
    hoveredNodeIdRef.current = hoveredNode ? hoveredNode.id : null
    canvas.style.cursor = hoveredNode ? "pointer" : isDraggingRef.current ? "grabbing" : "grab"
  }, [getNodeAtPosition, zoom])

  const handleMouseUp = useCallback(() => {
    draggedNodeIdRef.current = null
    isDraggingRef.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.25, Math.min(3.5, z * factor)))
  }, [])

  const handleResetView = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
    targetAngleXRef.current = 0.3
    targetAngleYRef.current = 0.5
    simulationWarmupRef.current = 1.0 // Re-heat physics
    setSelectedNodeId(null)
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 bg-zinc-950">
        <div className="flex flex-col items-center gap-2">
          <HelpCircle className="size-8 text-indigo-500 animate-spin" />
          <span className="text-xs font-mono">Initializing 3D Particle Space...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-zinc-900 text-zinc-100">
      {/* Left List Control Panel */}
      <div className="w-68 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 pt-14 md:pt-16">
        <div className="p-3 border-b border-zinc-800 bg-zinc-950/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search 3D nodes..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800">
          {nodes
            .filter(node => {
              if (!searchQuery) return true
              const q = searchQuery.toLowerCase()
              return node.title.toLowerCase().includes(q) || node.folder.toLowerCase().includes(q)
            })
            .map(node => {
              const linkCount = edges.filter(
                e => e.source === node.id || e.target === node.id
              ).length
              const isSel = selectedNodeId === node.id
              
              return (
                <button
                  key={node.id}
                  onClick={() => focusOnNode(node)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    isSel
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-inner"
                      : "hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <span
                    className="size-2 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: getFolderColor(node.folder) }}
                  />
                  <span className="truncate flex-1 font-medium">{node.title}</span>
                  {linkCount > 0 && (
                    <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded font-mono shrink-0">
                      {linkCount}
                    </span>
                  )}
                </button>
              )
            })}
        </div>

        {/* Folder legend */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/40">
          <p className="text-[10px] font-bold text-zinc-500 mb-1.5 uppercase tracking-widest">Clusters</p>
          <div className="flex flex-col gap-1.5">
            {folders.map(folder => (
              <span key={folder} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: getFolderColor(folder) }}
                />
                <span className="truncate">{folder}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3D Canvas Space */}
      <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden" ref={containerRef}>
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md z-10 absolute top-0 left-0 right-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-semibold text-zinc-300 font-mono">
              3D Neural Graph Space
            </span>
            <span className="text-[10px] text-zinc-500 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
              {nodes.length} nodes, {edges.length} synaptic links
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
              className="px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
            >
              -
            </button>
            <span className="text-[10px] text-zinc-400 w-12 text-center font-mono">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(3.0, z + 0.15))}
              className="px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
            >
              +
            </button>
            <button
              onClick={handleResetView}
              className="p-1 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 ml-1 transition-colors"
              title="Reset View and Run Simulation"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        </div>

        {/* The 3D Canvas element */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full select-none cursor-grab"
        />

        {/* Hint banner */}
        <div className="absolute bottom-3 left-4 text-[10px] text-zinc-600 pointer-events-none select-none font-mono">
          Drag background to rotate perspective | Drag node to position in 3D space | Scroll wheel to zoom
        </div>

        {/* Detail Glassmorphism panel */}
        {selectedNode && (
          <div className="absolute bottom-4 right-4 max-w-sm border border-zinc-800 bg-zinc-950/80 backdrop-blur-lg p-3 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <span
                className="size-3 rounded-full shrink-0 animate-ping"
                style={{ backgroundColor: getFolderColor(selectedNode.folder) }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-200 truncate">{selectedNode.title}</p>
                <p className="text-[10px] text-zinc-500 font-mono">Cluster: {selectedNode.folder}</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                <Link2 className="size-3 text-indigo-400" />
                <span>
                  {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} synapses
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

