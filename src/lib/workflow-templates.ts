import type { WorkflowTemplate } from '@/types/workflow'

/**
 * Pre-built workflow templates for common use cases.
 * Users can start from a template and customize.
 * 
 * NOTE: Each step has an explicit ID that edges reference.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'research-summarize',
    name: 'Research & Summarize',
    description: 'Research a topic with an LLM, then summarize the findings into a concise report.',
    icon: '🔬',
    category: 'Productivity',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Workflow entry point' },
      { id: 'research', type: 'llm', name: 'Research', prompt: 'Research the following topic thoroughly and provide detailed findings:\n\n{{input}}', model: '', outputKey: 'research', order: 1, description: 'Deep research on the topic', config: { temperature: 0.7, maxTokens: 4096 } },
      { id: 'summarize', type: 'llm', name: 'Summarize', prompt: 'Based on the following research, write a concise summary with key takeaways:\n\n{{research}}', model: '', outputKey: 'summary', order: 2, description: 'Summarize the research' },
      { id: 'output', type: 'output', name: 'Result', prompt: '{{summary}}', order: 3, description: 'Final output' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'research' },
      { sourceStepId: 'research', targetStepId: 'summarize' },
      { sourceStepId: 'summarize', targetStepId: 'output' },
    ],
  },
  {
    id: 'translate-polish',
    name: 'Translate & Polish',
    description: 'Translate text to a target language, then polish the translation for natural flow.',
    icon: '🌐',
    category: 'Language',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Workflow entry point' },
      { id: 'translate', type: 'llm', name: 'Translate', prompt: 'Translate the following text to {{target_language}} (default: English if not specified):\n\n{{input}}', outputKey: 'translation', order: 1, description: 'Translate the input text' },
      { id: 'polish', type: 'llm', name: 'Polish', prompt: 'Polish the following translation to make it sound natural and fluent in the target language. Fix any awkward phrasing:\n\n{{translation}}', outputKey: 'polished', order: 2, description: 'Polish the translation' },
      { id: 'output', type: 'output', name: 'Result', prompt: '{{polished}}', order: 3, description: 'Final output' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'translate' },
      { sourceStepId: 'translate', targetStepId: 'polish' },
      { sourceStepId: 'polish', targetStepId: 'output' },
    ],
  },
  {
    id: 'sentiment-router',
    name: 'Sentiment Router',
    description: 'Analyze text sentiment and route to different handlers based on positive or negative result.',
    icon: '🔀',
    category: 'Logic',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Workflow entry point' },
      { id: 'analyze-sentiment', type: 'llm', name: 'Analyze Sentiment', prompt: 'Analyze the sentiment of the following text. Respond with ONLY "true" if the sentiment is positive/neutral, or "false" if it is negative:\n\n{{input}}', outputKey: 'sentiment', order: 1, description: 'Detect sentiment' },
      { id: 'is-positive', type: 'condition', name: 'Is Positive?', prompt: 'Based on the sentiment analysis result: {{sentiment}}. Is this positive?', order: 2, description: 'Route based on sentiment' },
      { id: 'positive-handler', type: 'llm', name: 'Positive Handler', prompt: 'The following text has positive sentiment. Write an encouraging response:\n\n{{input}}', outputKey: 'positive_response', order: 3, description: 'Handle positive sentiment' },
      { id: 'negative-handler', type: 'llm', name: 'Negative Handler', prompt: 'The following text has negative sentiment. Write a helpful and empathetic response addressing the concerns:\n\n{{input}}', outputKey: 'negative_response', order: 4, description: 'Handle negative sentiment' },
      { id: 'output', type: 'output', name: 'Result', prompt: '{{positive_response}}{{negative_response}}', order: 5, description: 'Final output' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'analyze-sentiment' },
      { sourceStepId: 'analyze-sentiment', targetStepId: 'is-positive' },
      { sourceStepId: 'is-positive', targetStepId: 'positive-handler', sourceHandle: 'true', label: 'Yes' },
      { sourceStepId: 'is-positive', targetStepId: 'negative-handler', sourceHandle: 'false', label: 'No' },
      { sourceStepId: 'positive-handler', targetStepId: 'output' },
      { sourceStepId: 'negative-handler', targetStepId: 'output' },
    ],
  },
  {
    id: 'content-review',
    name: 'Content Review Pipeline',
    description: 'Extract key points from content, evaluate quality, and generate a review report.',
    icon: '📝',
    category: 'Productivity',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Workflow entry point' },
      { id: 'extract-key-points', type: 'extract', name: 'Extract Key Points', prompt: 'Extract the main key points and arguments from the following content as a numbered list:\n\n{{input}}', outputKey: 'key_points', order: 1, description: 'Extract key points' },
      { id: 'evaluate-quality', type: 'llm', name: 'Evaluate Quality', prompt: 'Evaluate the quality of the following content based on its key points. Rate clarity, accuracy, and completeness (1-10 each):\n\nKey Points:\n{{key_points}}\n\nOriginal:\n{{input}}', outputKey: 'evaluation', order: 2, description: 'Evaluate content quality' },
      { id: 'generate-report', type: 'llm', name: 'Generate Report', prompt: 'Based on the evaluation below, generate a structured review report with strengths, weaknesses, and improvement suggestions:\n\n{{evaluation}}', outputKey: 'report', order: 3, description: 'Generate review report' },
      { id: 'output', type: 'output', name: 'Report', prompt: '{{report}}', order: 4, description: 'Final review report' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'extract-key-points' },
      { sourceStepId: 'extract-key-points', targetStepId: 'evaluate-quality' },
      { sourceStepId: 'evaluate-quality', targetStepId: 'generate-report' },
      { sourceStepId: 'generate-report', targetStepId: 'output' },
    ],
  },
  {
    id: 'data-extraction',
    name: 'Data Extraction Pipeline',
    description: 'Extract structured data from unstructured text, transform it, and output in a clean format.',
    icon: '📊',
    category: 'Data',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Workflow entry point' },
      { id: 'extract-entities', type: 'extract', name: 'Extract Entities', prompt: 'Extract all named entities (people, organizations, locations, dates) from the following text. Output as JSON:\n\n{{input}}', outputKey: 'entities', order: 1, description: 'Extract named entities' },
      { id: 'format-output', type: 'transform', name: 'Format Output', prompt: 'Transform the following extracted entities into a clean, well-formatted markdown table:\n\n{{entities}}', outputKey: 'formatted', order: 2, description: 'Format as table' },
      { id: 'output', type: 'output', name: 'Result', prompt: '{{formatted}}', order: 3, description: 'Final output' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'extract-entities' },
      { sourceStepId: 'extract-entities', targetStepId: 'format-output' },
      { sourceStepId: 'format-output', targetStepId: 'output' },
    ],
  },
  {
    id: 'db-report-ppt',
    name: '数据库分析与 PPT 自动大纲生成',
    description: '通过自然语言查询销售或财务数据库，AI 自动生成 SQL、执行分析，并输出包含图表与结构的大屏 PPT 大纲。',
    icon: '📊',
    category: '数据分析',
    steps: [
      { id: 'trigger', type: 'trigger', name: '输入分析主题', prompt: '', order: 0, description: '输入分析主题，例如：2025年第四季度华东区销售增长与毛利分析' },
      { id: 'nl2sql', type: 'llm', name: 'SQL 生成器', prompt: '你是一个专业的数据库专家。基于用户要分析的主题：\n"{{input}}"\n请自动生成一份符合 MySQL/Postgres 规范的查询 SQL，用于统计销量、毛利率及地区分布，并解释这些查询的目的。', outputKey: 'sql_query', order: 1, description: 'AI 根据销售分析主题生成数据统计 SQL' },
      { id: 'execute-query', type: 'code', name: '执行模拟查询', prompt: '', outputKey: 'raw_data', order: 2, description: '运行模拟查询并结构化输出销售数据', config: { code: 'return JSON.stringify([\n  { month: "10月", revenue: 420000, cost: 260000, region: "华东" },\n  { month: "11月", revenue: 480000, cost: 290000, region: "华东" },\n  { month: "12月", revenue: 650000, cost: 350000, region: "华东" }\n]);' } },
      { id: 'ai-insight', type: 'llm', name: 'AI 财务数据洞察', prompt: '你是一个资深的商业分析师。基于以下 SQL 查询出来的原始财务数据：\n{{raw_data}}\n请对2025年第四季度的销售增长、毛利率趋势、成本占比进行异常检测和宏观趋势分析，提取 3 个核心商业洞察。', outputKey: 'analysis_report', order: 3, description: 'AI 进行销售趋势与毛利率异常洞察分析' },
      { id: 'ppt-generator', type: 'llm', name: 'PPT 结构大纲生成', prompt: '你是一个资深的演示文稿设计总监。请基于以下数据洞察报告：\n{{analysis_report}}\n将其转化为一份包含 6 页幻灯片（PPT）的大纲。规定每页幻灯片的布局模板（Title, Bullet, TwoColumn 之一）以及建议的 ReCharts 推荐参数。以 JSON 结构输出。', outputKey: 'ppt_slides', order: 4, description: '将商业洞察自动转化为结构化的演示文稿大纲' },
      { id: 'output', type: 'output', name: '导出大纲结果', prompt: '### 📊 数据库销售分析与 PPT 自动生成结果\n\n#### 1. 模拟 SQL 查询语句\n```sql\n{{sql_query}}\n```\n\n#### 2. AI 商业洞察\n{{analysis_report}}\n\n#### 3. PPT 大纲数据 (已就绪可导出)\n{{ppt_slides}}', order: 5, description: '最终输出' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'nl2sql' },
      { sourceStepId: 'nl2sql', targetStepId: 'execute-query' },
      { sourceStepId: 'execute-query', targetStepId: 'ai-insight' },
      { sourceStepId: 'ai-insight', targetStepId: 'ppt-generator' },
      { sourceStepId: 'ppt-generator', targetStepId: 'output' },
    ],
  },
  {
    id: 'doc-audit-report',
    name: '知识库合规检索与 Word 审计报告',
    description: '结合本地知识库检索合规政策，对比文档差异，AI 自动生成标准 Markdown 格式的合规审计报告。',
    icon: '🔍',
    category: '企业办公',
    steps: [
      { id: 'trigger', type: 'trigger', name: '输入合规审计主题', prompt: '', order: 0, description: '输入审计主题，例如：数据安全合规性审查' },
      { id: 'kb-retrieval', type: 'llm', name: '知识库合规政策检索', prompt: '你是一个合规审计师。请在本地知识库中自动检索关于以下主题的所有合规要求与政策文件目录：\n"{{input}}"\n并生成核心审计标准要点列表。', outputKey: 'legal_rules', order: 1, description: '从本地知识库检索出历史规范及相关的法律条款' },
      { id: 'doc-comparison', type: 'llm', name: '文档条款差异对比', prompt: '你是一个法务专家。请对比上传的用户文档与历史基准版本在合规主题 "{{input}}" 下的具体差异，找出被删除、修改、或新增的敏感条款。', outputKey: 'diff_details', order: 2, description: 'AI 比对上传的文件和已有基准版本的具体条款差异' },
      { id: 'compliance-audit', type: 'llm', name: '合规风险评估', prompt: '你是一个高级法务合规审计专家。请结合检索到的政策法规：\n{{legal_rules}}\n以及条款差异细节：\n{{diff_details}}\n评估该文档存在的合规风险等级（高/中/低），列出具体的不合规条款和整改建议。', outputKey: 'audit_notes', order: 3, description: '结合规范和条款差异出具专业的合规风险审查报告' },
      { id: 'report-generator', type: 'llm', name: 'Word 报告格式化', prompt: '基于以下合规风险评估：\n{{audit_notes}}\n请按照标准的公文格式撰写一篇《企业数据安全合规审计报告》。要求使用 Markdown 格式，包含标题、前言、审计结论、风险点清单和整正方案，格式要对标可直接导出为 Word (.docx)。', outputKey: 'final_doc', order: 4, description: '按照标准公文格式生成可直接导出 Word 的审计报告' },
      { id: 'output', type: 'output', name: '生成审计报告', prompt: '{{final_doc}}', order: 5, description: '输出报告正文' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'kb-retrieval' },
      { sourceStepId: 'trigger', targetStepId: 'doc-comparison' },
      { sourceStepId: 'kb-retrieval', targetStepId: 'compliance-audit' },
      { sourceStepId: 'doc-comparison', targetStepId: 'compliance-audit' },
      { sourceStepId: 'compliance-audit', targetStepId: 'report-generator' },
      { sourceStepId: 'report-generator', targetStepId: 'output' },
    ],
  },
  {
    id: 'ocr-translate-review',
    name: '本地 OCR 提取与合同双语翻译校审',
    description: '利用本地 OCR 识别扫描件或截图文本，由 AI 清理乱码、进行专业的法律合同中英翻译，并自动进行条款纠错审计。',
    icon: '🌐',
    category: '语言翻译',
    steps: [
      { id: 'trigger', type: 'trigger', name: '输入待识别图像/文本', prompt: '', order: 0, description: '输入 OCR 提取出的粗文本' },
      { id: 'ocr-cleaner', type: 'llm', name: 'OCR 乱码清理与排版', prompt: '你是一个文本排版助手。以下是从图片扫描件通过本地 OCR 提取的原始文本，其中可能包含大量换行错乱、乱码和符号错误。请在不修改原文意思的前提下，重新进行段落重组、符号修正和排版美化：\n\n{{input}}', outputKey: 'cleaned_text', order: 1, description: '进行语法整理、段落重组和格式清洗' },
      { id: 'contract-translator', type: 'llm', name: '涉外法律合同翻译', prompt: '你是一个资深的涉外律师和翻译家。请将以下经过整理的合同文本翻译为符合英文法律规范的合同文本。确保法言法语的精准：\n\n{{cleaned_text}}', outputKey: 'translated_contract', order: 2, description: '专业中英双语翻译' },
      { id: 'clause-reviewer', type: 'llm', name: '条款风控审核', prompt: '你是一个合同风控专家。请审阅以下翻译后的合同内容：\n{{translated_contract}}\n检查是否存在潜在的违约风险、模糊定义（例如付款节点不清晰、管辖法院冲突等），并给出明确的修改建议。', outputKey: 'review_suggestions', order: 3, description: '审查翻译后合同中的潜在商业条款漏洞或风险' },
      { id: 'output', type: 'output', name: '双对照合同与风控报告', prompt: '### 📜 OCR 识别合同中英翻译与风控审查报告\n\n#### 1. 整理后的中文原文\n{{cleaned_text}}\n\n#### 2. 专业英文法律翻译\n{{translated_contract}}\n\n#### 3. 风险评估与条款整改建议\n{{review_suggestions}}', order: 4, description: '最终输出' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'ocr-cleaner' },
      { sourceStepId: 'ocr-cleaner', targetStepId: 'contract-translator' },
      { sourceStepId: 'contract-translator', targetStepId: 'clause-reviewer' },
      { sourceStepId: 'clause-reviewer', targetStepId: 'output' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Workflow',
    description: 'Start from scratch with an empty workflow.',
    icon: '📄',
    category: 'Starter',
    steps: [
      { id: 'trigger', type: 'trigger', name: 'Start', prompt: '', order: 0, description: 'Entry point' },
      { id: 'output', type: 'output', name: 'End', prompt: '{{input}}', order: 1, description: 'Final output' },
    ],
    edges: [
      { sourceStepId: 'trigger', targetStepId: 'output' },
    ],
  },
]

/** Get unique template categories */
export function getTemplateCategories(): string[] {
  return [...new Set(WORKFLOW_TEMPLATES.map(t => t.category))]
}
