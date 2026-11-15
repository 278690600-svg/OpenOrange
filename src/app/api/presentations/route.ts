import { NextRequest, NextResponse } from 'next/server'
import pptxgen from 'pptxgenjs'
import fs from 'fs'
import path from 'path'

interface SlideData {
  title: string
  subtitle?: string
  bullets?: string[]
  image?: string
  layout: 'title' | 'content' | 'image' | 'comparison' | 'quote' | 'closing'
}

interface PPTTemplate {
  id: string
  name: string
  description: string
  category: 'presentation'
  isSystem: boolean
  usageCount: number
  slides: SlideData[]
  createdAt: string
}

const TEMPLATES_FILE = path.join(process.cwd(), 'uploads', 'ppt-templates.json')

// Helper to ensure uploads folder exists and return templates
function getTemplates(): PPTTemplate[] {
  const defaultTemplates: PPTTemplate[] = [
    {
      id: 'business-pitch',
      name: 'Business Pitch Deck',
      description: 'A high-impact template for business ideas, pitches, and funding requests.',
      category: 'presentation',
      isSystem: true,
      usageCount: 12,
      createdAt: new Date().toISOString(),
      slides: [
        { title: 'Company Name', subtitle: 'Tagline', layout: 'title' },
        { title: 'Problem Statement', bullets: ['Describe the problem', 'Show market need', 'Quantify impact'], layout: 'content' },
        { title: 'Our Solution', bullets: ['Key feature 1', 'Key feature 2', 'Key feature 3'], layout: 'content' },
        { title: '"Changing the future of technology"', layout: 'quote' },
        { title: 'Thank You', subtitle: 'Contact: hello@company.com', layout: 'title' }
      ]
    },
    {
      id: 'project-report',
      name: 'Project Report',
      description: 'A professional template for weekly, monthly, or quarterly business updates.',
      category: 'presentation',
      isSystem: true,
      usageCount: 8,
      createdAt: new Date().toISOString(),
      slides: [
        { title: 'Project Report', subtitle: 'Q4 2024', layout: 'title' },
        { title: 'Executive Summary', bullets: ['Key achievement 1', 'Key achievement 2', 'Key metric improved'], layout: 'content' },
        { title: 'Next Steps', bullets: ['Action item 1', 'Action item 2', 'Action item 3'], layout: 'content' }
      ]
    },
    {
      id: 'tech-presentation',
      name: 'Technical Presentation',
      description: 'A clean, modern layout tailored for engineering and developer audiences.',
      category: 'presentation',
      isSystem: true,
      usageCount: 5,
      createdAt: new Date().toISOString(),
      slides: [
        { title: 'Technical Overview', subtitle: 'Architecture & Design', layout: 'title' },
        { title: 'System Architecture', bullets: ['Component A', 'Component B', 'Integration layer'], layout: 'content' }
      ]
    }
  ]

  try {
    const dir = path.dirname(TEMPLATES_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    if (!fs.existsSync(TEMPLATES_FILE)) {
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(defaultTemplates, null, 2), 'utf-8')
      return defaultTemplates
    }

    const content = fs.readFileSync(TEMPLATES_FILE, 'utf-8')
    return JSON.parse(content) as PPTTemplate[]
  } catch (err) {
    console.error('Error reading PPT templates file:', err)
    return defaultTemplates
  }
}

// Helper to save templates
function saveTemplates(templates: PPTTemplate[]) {
  try {
    const dir = path.dirname(TEMPLATES_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8')
  } catch (err) {
    console.error('Error saving PPT templates file:', err)
  }
}

// Helper to parse Flat OPC XML PowerPoint file text into standard structured SlideData array
function parseFlatOpcXml(xmlContent: string): SlideData[] {
  const partRegex = /<pkg:part\s+pkg:name="\/ppt\/slides\/slide(\d+)\.xml"[^>]*>([\s\S]*?)<\/pkg:part>/g
  let match
  const tempSlides: { slideNum: number; texts: string[] }[] = []

  while ((match = partRegex.exec(xmlContent)) !== null) {
    const slideNum = parseInt(match[1], 10)
    const partContent = match[2]
    
    const textRegex = /<a:t>([^<]+)<\/a:t>/g
    let textMatch
    const texts: string[] = []
    
    while ((textMatch = textRegex.exec(partContent)) !== null) {
      const rawText = textMatch[1].trim()
      if (
        rawText && 
        rawText !== '&#10;' && 
        !/^\d+$/.test(rawText) && 
        rawText.toLowerCase() !== 'undefined'
      ) {
        texts.push(rawText)
      }
    }
    
    if (texts.length > 0) {
      tempSlides.push({ slideNum, texts })
    }
  }

  tempSlides.sort((a, b) => a.slideNum - b.slideNum)

  return tempSlides.map((s, index) => {
    const isFirst = index === 0
    const isLast = index === tempSlides.length - 1
    const texts = s.texts

    let layout: SlideData['layout'] = 'content'
    let title = ''
    let subtitle = ''
    let bullets: string[] = []

    const hasThanks = texts.some(t => /谢谢|致谢|问答|Q&A|Thank/i.test(t))

    if (isFirst || (isLast && hasThanks) || texts.length <= 2) {
      layout = 'title'
      title = texts[0] || '未命名幻灯片'
      subtitle = texts.slice(1).join(' / ')
    } else if (texts.length === 3) {
      const longestText = [...texts].sort((a, b) => b.length - a.length)[0]
      if (longestText.length > 20) {
        layout = 'quote'
        title = longestText
        subtitle = texts.filter(t => t !== longestText).join(' / ')
      } else {
        layout = 'content'
        title = texts[0]
        bullets = texts.slice(1)
      }
    } else {
      layout = 'content'
      const firstShort = texts.find(t => t.length > 1 && t.length < 15)
      title = firstShort || texts[0] || '章节要点'
      bullets = texts.filter(t => t !== title)
      
      if (bullets.length === 0) {
        layout = 'title'
      }
    }

    return {
      title: title.slice(0, 80),
      subtitle: subtitle ? subtitle.slice(0, 100) : undefined,
      bullets: bullets.length > 0 ? bullets.map(b => b.slice(0, 150)) : undefined,
      layout
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const isJson = req.headers.get('content-type')?.includes('json')
    let action = ''
    let formData: FormData | null = null
    let jsonBody: any = {}

    if (isJson) {
      jsonBody = await req.json()
      action = jsonBody.action
    } else {
      formData = await req.formData()
      action = formData.get('action') as string
    }

    if (action === 'upload-xml-file' && formData) {
      const xmlFile = formData.get('file') as File
      const name = formData.get('name') as string
      const description = formData.get('description') as string

      if (!xmlFile) {
        return NextResponse.json({ error: 'XML file is required' }, { status: 400 })
      }

      const xmlText = await xmlFile.text()
      let parsedSlides: SlideData[] = []
      
      try {
        parsedSlides = parseFlatOpcXml(xmlText)
      } catch (err: any) {
        return NextResponse.json({ error: 'Failed to parse XML: ' + err.message }, { status: 400 })
      }

      if (parsedSlides.length === 0) {
        return NextResponse.json({ error: 'No slide data found in XML file' }, { status: 400 })
      }

      const templates = getTemplates()
      const newTemplate: PPTTemplate = {
        id: 'ppt-tpl-' + Date.now(),
        name: name || xmlFile.name.replace('.xml', '') + ' 导入模板',
        description: description || '从本地 XML 演示文稿一键智能提取导入',
        category: 'presentation',
        isSystem: false,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        slides: parsedSlides
      }

      templates.push(newTemplate)
      saveTemplates(templates)

      return NextResponse.json({ success: true, template: newTemplate })
    }

    if (action === 'upload-template' && formData) {
      const name = formData.get('name') as string
      const description = formData.get('description') as string
      const slidesJson = formData.get('slides') as string

      if (!name || !slidesJson) {
        return NextResponse.json({ error: 'Name and slides data are required' }, { status: 400 })
      }

      let parsedSlides: SlideData[] = []
      try {
        parsedSlides = JSON.parse(slidesJson)
      } catch {
        return NextResponse.json({ error: 'Invalid slides JSON format' }, { status: 400 })
      }

      const templates = getTemplates()
      const newTemplate: PPTTemplate = {
        id: 'ppt-tpl-' + Date.now(),
        name,
        description: description || 'User uploaded template',
        category: 'presentation',
        isSystem: false,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        slides: parsedSlides
      }

      templates.push(newTemplate)
      saveTemplates(templates)

      return NextResponse.json({ success: true, template: newTemplate })
    }

    if (action === 'delete-template' && formData) {
      const templateId = formData.get('templateId') as string
      if (!templateId) {
        return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
      }

      const templates = getTemplates()
      const index = templates.findIndex(t => t.id === templateId)

      if (index === -1) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      if (templates[index].isSystem) {
        return NextResponse.json({ error: 'Cannot delete system templates' }, { status: 403 })
      }

      templates.splice(index, 1)
      saveTemplates(templates)

      return NextResponse.json({ success: true })
    }

    if (action === 'use-template') {
      const templateId = (formData?.get('templateId') || jsonBody.templateId) as string
      if (!templateId) {
        return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
      }
      return NextResponse.json({ success: true, redirect: `/chat/new?templateId=${templateId}&type=presentation` })
    }

    if (action === 'import' && formData) {
      const file = formData.get('file') as File
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'pptx') {
        return NextResponse.json({ error: 'Only PPTX files supported' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const text = buffer.toString('utf-8')

      return NextResponse.json({
        slides: [{
          title: file.name.replace('.pptx', ''),
          layout: 'title',
          bullets: ['PPTX import requires server-side processing', 'Use AI to generate slide content']
        }]
      })
    }

    if (action === 'export' && formData) {
      const body = JSON.parse(formData.get('data') as string)
      const { slides, title } = body as { slides: SlideData[]; title: string }

      const pptx = new pptxgen()
      pptx.defineLayout({ name: 'CUSTOM', width: 13.33, height: 7.5 })
      pptx.layout = 'CUSTOM'

      slides.forEach((slide, i) => {
        const pptSlide = pptx.addSlide()

        pptSlide.background = { color: i % 2 === 0 ? 'F8FAFC' : 'FFFFFF' }

        if (slide.layout === 'title') {
          pptSlide.addText(slide.title, {
            x: 1, y: 2, w: 11.33, h: 1.5,
            fontSize: 36, bold: true, color: '1E293B', align: 'center'
          })
          if (slide.subtitle) {
            pptSlide.addText(slide.subtitle, {
              x: 1, y: 3.5, w: 11.33, h: 1,
              fontSize: 18, color: '64748B', align: 'center'
            })
          }
        } else if (slide.layout === 'content' && slide.bullets) {
          pptSlide.addText(slide.title, {
            x: 0.5, y: 0.3, w: 12.33, h: 0.8,
            fontSize: 28, bold: true, color: '1E293B'
          })
          const bulletText = slide.bullets.map(b => `• ${b}`).join('\n')
          pptSlide.addText(bulletText, {
            x: 0.5, y: 1.2, w: 12.33, h: 5.5,
            fontSize: 16, color: '334155', lineSpacingMultiple: 1.5
          })
        } else if (slide.layout === 'quote') {
          pptSlide.addText('"', {
            x: 1, y: 1.5, w: 1, h: 1,
            fontSize: 60, color: 'CBD5E1'
          })
          pptSlide.addText(slide.title, {
            x: 2, y: 2, w: 9.33, h: 3,
            fontSize: 24, italic: true, color: '1E293B', align: 'center'
          })
        } else {
          pptSlide.addText(slide.title, {
            x: 0.5, y: 0.3, w: 12.33, h: 0.8,
            fontSize: 28, bold: true, color: '1E293B'
          })
          if (slide.bullets) {
            const bulletText = slide.bullets.map(b => `• ${b}`).join('\n')
            pptSlide.addText(bulletText, {
              x: 0.5, y: 1.2, w: 12.33, h: 5.5,
              fontSize: 16, color: '334155', lineSpacingMultiple: 1.5
            })
          }
        }

        pptSlide.addText(`${i + 1}/${slides.length}`, {
          x: 0.5, y: 7, w: 12.33, h: 0.3,
          fontSize: 10, color: '94A3B8', align: 'right'
        })
      })

      const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' })
      return new NextResponse(Buffer.from(pptxBuffer as ArrayBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${title}.pptx"`
        }
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: 'PPT processing failed', details: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'templates') {
    const templates = getTemplates()
    return NextResponse.json({ templates })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
