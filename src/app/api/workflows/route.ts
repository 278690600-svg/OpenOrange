import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { executeWorkflow, testWorkflowStep, getWorkflowWithSteps, getExecutionHistory } from '@/lib/workflow-engine'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'
import { VALID_STEP_TYPES } from '@/types/workflow'
import { v4 as uuidv4 } from 'uuid'

// ============================================================
// Validation
// ============================================================

function validateSteps(steps: unknown): string | null {
  if (!Array.isArray(steps)) return 'steps must be an array'
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (typeof s.order !== 'number') return `steps[${i}].order is required`
    if (!VALID_STEP_TYPES.includes(s.type)) return `steps[${i}].type must be one of: ${VALID_STEP_TYPES.join(', ')}`
  }
  return null
}

function validateEdges(edges: unknown): string | null {
  if (!Array.isArray(edges)) return 'edges must be an array'
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    if (!e.sourceStepId) return `edges[${i}].sourceStepId is required`
    if (!e.targetStepId) return `edges[${i}].targetStepId is required`
  }
  return null
}

// ============================================================
// GET
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workflowId = searchParams.get('workflowId')
    const stepId = searchParams.get('stepId')
    const action = searchParams.get('action')

    // Test a single step
    if (stepId && action === 'test') {
      const result = await testWorkflowStep(stepId)
      return NextResponse.json({ success: true, result })
    }

    // Get execution history
    if (workflowId && action === 'history') {
      const limit = parseInt(searchParams.get('limit') || '20')
      const history = await getExecutionHistory(workflowId, limit)
      return NextResponse.json(history)
    }

    // Get templates
    if (action === 'templates') {
      return NextResponse.json(WORKFLOW_TEMPLATES)
    }

    // Get single workflow
    if (workflowId) {
      const workflow = await getWorkflowWithSteps(workflowId)
      if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      }
      return NextResponse.json(workflow)
    }

    // List all workflows
    const workflows = await prisma.workflow.findMany({
      include: {
        steps: { orderBy: { order: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
        _count: { select: { executions: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error('Workflow GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 })
  }
}

// ============================================================
// POST
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    // Execute a workflow
    if (action === 'execute') {
      const body = await req.json()
      const { workflowId, input, errorStrategy } = body as {
        workflowId: string
        input?: Record<string, string>
        errorStrategy?: 'abort' | 'skip' | 'retry'
      }

      if (!workflowId) {
        return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
      }

      const result = await executeWorkflow(workflowId, input, errorStrategy || 'abort')
      return NextResponse.json({ success: true, result })
    }

    // Test a single step
    if (action === 'test-step') {
      const body = await req.json()
      const { stepId, context } = body as { stepId: string; context?: Record<string, string> }
      if (!stepId) {
        return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
      }
      const result = await testWorkflowStep(stepId, context)
      return NextResponse.json({ success: true, result })
    }

    // Create from template
    if (action === 'from-template') {
      const body = await req.json()
      const { templateId, name } = body as { templateId: string; name?: string }
      const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId)
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      // Map temporary template step IDs to newly generated UUIDs
      const idMap: Record<string, string> = {}
      template.steps.forEach(s => {
        if (s.id) {
          idMap[s.id] = uuidv4()
        }
      })

      const workflow = await prisma.workflow.create({
        data: {
          name: name || template.name,
          description: template.description,
          steps: {
            create: template.steps.map(s => ({
              id: s.id ? idMap[s.id] : undefined,
              order: s.order,
              type: s.type,
              name: s.name,
              prompt: s.prompt,
              model: s.model || null,
              outputKey: s.outputKey || null,
              config: JSON.stringify(s.config || {}),
              description: s.description || null,
            }))
          },
          edges: {
            create: template.edges.map(e => ({
              sourceStepId: idMap[e.sourceStepId] || e.sourceStepId,
              targetStepId: idMap[e.targetStepId] || e.targetStepId,
              sourceHandle: e.sourceHandle || null,
              label: e.label || null,
            }))
          }
        },
        include: {
          steps: { orderBy: { order: 'asc' } },
          edges: { orderBy: { createdAt: 'asc' } },
        }
      })

      return NextResponse.json(workflow)
    }

    // Create a new workflow
    const body = await req.json()
    const { name, description, trigger, steps, edges } = body as {
      name: string
      description?: string
      trigger?: string
      steps?: Array<{
        order: number; type: string; name?: string; prompt?: string;
        model?: string; outputKey?: string; config?: Record<string, unknown>; description?: string
      }>
      edges?: Array<{
        sourceStepId: string; targetStepId: string; sourceHandle?: string; label?: string
      }>
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (steps) {
      const err = validateSteps(steps)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }
    if (edges) {
      const err = validateEdges(edges)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    const workflow = await prisma.workflow.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        trigger: trigger || 'manual',
        steps: steps ? {
          create: steps.map(s => ({
            order: s.order,
            type: s.type,
            name: s.name || s.type,
            prompt: s.prompt || '',
            model: s.model || null,
            outputKey: s.outputKey || null,
            config: JSON.stringify(s.config || {}),
            description: s.description || null,
          }))
        } : undefined,
        edges: edges ? {
          create: edges.map(e => ({
            sourceStepId: e.sourceStepId,
            targetStepId: e.targetStepId,
            sourceHandle: e.sourceHandle || null,
            label: e.label || null,
          }))
        } : undefined,
      },
      include: {
        steps: { orderBy: { order: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
      }
    })

    return NextResponse.json(workflow)
  } catch (error) {
    console.error('Workflow POST error:', error)
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 })
  }
}

// ============================================================
// PUT
// ============================================================

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, description, trigger, status, steps, edges } = body as {
      id: string
      name?: string
      description?: string
      trigger?: string
      status?: string
      steps?: Array<{
        id?: string; order: number; type: string; name?: string; prompt?: string;
        model?: string; outputKey?: string; config?: Record<string, unknown>; description?: string
      }>
      edges?: Array<{
        id?: string; sourceStepId: string; targetStepId: string; sourceHandle?: string; label?: string
      }>
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (steps) {
      const err = validateSteps(steps)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }
    if (edges) {
      const err = validateEdges(edges)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // Incremental step update
    if (steps) {
      const existingSteps = await prisma.workflowStep.findMany({ where: { workflowId: id } })
      const existingIds = new Set(existingSteps.map(s => s.id))
      const newIds = new Set(steps.filter(s => s.id).map(s => s.id!))

      const toDelete = existingSteps.filter(s => !newIds.has(s.id)).map(s => s.id)
      const toUpdate = steps.filter(s => s.id && existingIds.has(s.id))
      const toCreate = steps.filter(s => !s.id || !existingIds.has(s.id!))

      if (toDelete.length > 0) {
        await prisma.workflowStep.deleteMany({ where: { id: { in: toDelete } } })
      }

      for (const step of toUpdate) {
        await prisma.workflowStep.update({
          where: { id: step.id! },
          data: {
            order: step.order,
            type: step.type,
            name: step.name || step.type,
            prompt: step.prompt ?? '',
            model: step.model || null,
            outputKey: step.outputKey || null,
            config: JSON.stringify(step.config || {}),
            description: step.description || null,
          }
        })
      }

      if (toCreate.length > 0) {
        await prisma.workflowStep.createMany({
          data: toCreate.map(s => ({
            workflowId: id,
            order: s.order,
            type: s.type,
            name: s.name || s.type,
            prompt: s.prompt ?? '',
            model: s.model || null,
            outputKey: s.outputKey || null,
            config: JSON.stringify(s.config || {}),
            description: s.description || null,
          }))
        })
      }
    }

    // Full edge replacement (edges are lightweight, just replace all)
    if (edges) {
      await prisma.workflowEdge.deleteMany({ where: { workflowId: id } })
      if (edges.length > 0) {
        await prisma.workflowEdge.createMany({
          data: edges.map(e => ({
            workflowId: id,
            sourceStepId: e.sourceStepId,
            targetStepId: e.targetStepId,
            sourceHandle: e.sourceHandle || null,
            label: e.label || null,
          }))
        })
      }
    }

    // Update workflow metadata
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (trigger !== undefined) updateData.trigger = trigger
    if (status !== undefined) updateData.status = status

    if (Object.keys(updateData).length > 0) {
      await prisma.workflow.update({ where: { id }, data: updateData })
    }

    const workflow = await getWorkflowWithSteps(id)
    return NextResponse.json(workflow)
  } catch (error) {
    console.error('Workflow PUT error:', error)
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workflowId = searchParams.get('workflowId')

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
    }

    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    await prisma.workflow.delete({ where: { id: workflowId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Workflow DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 })
  }
}
