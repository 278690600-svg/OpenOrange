export interface PluginSettingField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'textarea'
  description?: string
  defaultValue?: any
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

export interface MarketplacePlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon: string
  category: 'productivity' | 'devtools' | 'data' | 'workflow' | 'creative' | 'theme'
  downloads: number
  rating: number
  featured?: boolean
  tags: string[]
  permissions: string[]
  homepage?: string
  repository?: string
  settingsFields: PluginSettingField[]
  defaultConfig: Record<string, any>
  contributes?: {
    tools?: Array<{ name: string; description: string }>
    workflowNodes?: Array<{ type: string; label: string; description: string }>
    sidebar?: Array<{ id: string; title: string; route: string; icon: string }>
    templates?: Array<{ name: string; type: string }>
  }
  readme: string
}

export const MARKETPLACE_PLUGINS: MarketplacePlugin[] = [
  {
    id: "feishu-notifier",
    name: "飞书 / Lark 协同机器人",
    version: "1.2.0",
    description: "在对话与工作流中一键推送富文本消息、卡片通知到飞书群组或个人。",
    author: "OpenOrange Team",
    icon: "Send",
    category: "productivity",
    downloads: 3420,
    rating: 4.9,
    featured: true,
    tags: ["飞书", "通知", "工作流", "机器人"],
    permissions: ["network:https://open.feishu.cn/*", "workflow:node"],
    homepage: "https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN",
    repository: "https://github.com/closedui-plugins/feishu-notifier",
    settingsFields: [
      {
        key: "webhookUrl",
        label: "飞书自定义机器人 Webhook",
        type: "password",
        description: "飞书群机器人设置中获取的 Webhook URL",
        placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
        required: true
      },
      {
        key: "secret",
        label: "安全密钥 (Secret)",
        type: "password",
        description: "机器人安全设置中的签名校验密钥 (可选)",
        placeholder: "可选签名密钥..."
      },
      {
        key: "defaultTitle",
        label: "默认消息卡片标题",
        type: "string",
        defaultValue: "OpenOrangeAI 自动化通知",
        placeholder: "输入默认卡片标题"
      }
    ],
    defaultConfig: {
      webhookUrl: "",
      secret: "",
      defaultTitle: "OpenOrangeAI 自动化通知"
    },
    contributes: {
      tools: [
        { name: "send_feishu_message", description: "向飞书群机器人发送富文本卡片通知" },
        { name: "send_feishu_card", description: "向飞书群组发送带按钮的交互式卡片" }
      ],
      workflowNodes: [
        { type: "feishu_notify", label: "飞书通知节点", description: "工作流执行到此处触发飞书消息" }
      ]
    },
    readme: `### 飞书协同通知插件

支持通过飞书群自定义机器人向群聊或指定成员发送实时通知。

#### 核心特性
- **AI 智能工具调用**：在聊天中直接让 AI “帮我把这段总结发到飞书群”；
- **工作流节点集成**：可在可视化工作流最后一步挂载飞书推送；
- **签名校验支持**：支持飞书加签安全校验机制。
`
  },
  {
    id: "github-assistant",
    name: "GitHub 开发者助手",
    version: "2.0.1",
    description: "实时检索 GitHub 仓库 Issue、PR、提交记录，支持代码审查与一键创建 Issue。",
    author: "DevEcosystem",
    icon: "GitBranch",
    category: "devtools",
    downloads: 5120,
    rating: 4.8,
    featured: true,
    tags: ["GitHub", "Git", "DevOps", "代码审查"],
    permissions: ["network:https://api.github.com/*", "chat:tools"],
    homepage: "https://github.com",
    repository: "https://github.com/closedui-plugins/github-assistant",
    settingsFields: [
      {
        key: "personalAccessToken",
        label: "GitHub Personal Access Token",
        type: "password",
        description: "需包含 repo、issues 权限的 GitHub Token",
        placeholder: "ghp_xxxxxxxxxxxx",
        required: true
      },
      {
        key: "defaultOwner",
        label: "默认仓库所有者 (Owner)",
        type: "string",
        placeholder: "例如: facebook / microsoft"
      },
      {
        key: "defaultRepo",
        label: "默认仓库名称 (Repo)",
        type: "string",
        placeholder: "例如: react"
      }
    ],
    defaultConfig: {
      personalAccessToken: "",
      defaultOwner: "",
      defaultRepo: ""
    },
    contributes: {
      tools: [
        { name: "github_search_issues", description: "搜索指定仓库的 Issue 和 Pull Request" },
        { name: "github_create_issue", description: "在指定仓库自动创建 Issue" },
        { name: "github_get_file_content", description: "读取 GitHub 仓库中任意文件的最新内容" }
      ]
    },
    readme: `### GitHub 开发者助手

为大语言模型连接 GitHub API，实现一键查询代码库动态与缺陷跟踪。`
  },
  {
    id: "python-sandbox-runner",
    name: "Python 代码沙箱执行器",
    version: "1.0.4",
    description: "为 AI 赋予安全的 Python 代码解释与本地数据科学计算分析能力（绘图、统计、矩阵）。",
    author: "DataLab",
    icon: "Terminal",
    category: "data",
    downloads: 4890,
    rating: 4.9,
    featured: true,
    tags: ["Python", "代码解释器", "数据分析", "Matplotlib"],
    permissions: ["process:exec", "storage:tmp"],
    repository: "https://github.com/closedui-plugins/python-sandbox",
    settingsFields: [
      {
        key: "pythonPath",
        label: "Python 可执行文件路径",
        type: "string",
        defaultValue: "python",
        description: "本地已安装的 Python 环境路径 (需安装 numpy, pandas, matplotlib)",
        placeholder: "python 或 C:/Python311/python.exe"
      },
      {
        key: "timeoutSeconds",
        label: "代码最长超时时间 (秒)",
        type: "number",
        defaultValue: 30,
        description: "单次脚本运行的最大超时时间"
      }
    ],
    defaultConfig: {
      pythonPath: "python",
      timeoutSeconds: 30
    },
    contributes: {
      tools: [
        { name: "execute_python_code", description: "在隔离沙箱环境中执行 Python 代码并返回 stdout、stderr 及图表" }
      ]
    },
    readme: `### Python 数据分析沙箱

允许 AI 直接编写并执行 Python 脚本，进行复杂数学公式运算、数据转换与图表绘制。`
  },
  {
    id: "web-deep-scraper",
    name: "网页深度解析与正文提取器",
    version: "1.3.0",
    description: "智能抓取任意网页、自动过滤广告与杂质，并转为纯净清晰的 Markdown 文档注入上下文。",
    author: "CrawlTech",
    icon: "Globe",
    category: "productivity",
    downloads: 2980,
    rating: 4.7,
    tags: ["爬虫", "网页提取", "Markdown", "RAG"],
    permissions: ["network:*"],
    repository: "https://github.com/closedui-plugins/web-scraper",
    settingsFields: [
      {
        key: "userAgent",
        label: "自定义 HTTP 请求 User-Agent",
        type: "string",
        defaultValue: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        placeholder: "自定义请求头"
      },
      {
        key: "enableJavascript",
        label: "渲染动态 JavaScript (Headless)",
        type: "boolean",
        defaultValue: false,
        description: "针对 SPA 单页应用启用无头浏览器渲染 (耗时稍长)"
      }
    ],
    defaultConfig: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      enableJavascript: false
    },
    contributes: {
      tools: [
        { name: "scrape_web_article", description: "抓取指定 URL 网页的纯净正文并转为 Markdown 格式" }
      ]
    },
    readme: `### 网页深度解析与正文提取器

通过高级正文抽取算法，快速将长篇网页新闻、技术文档抓取为高质量 Markdown。`
  },
  {
    id: "mindmap-generator",
    name: "思维导图与 Markmap 脑图生成器",
    version: "1.1.0",
    description: "根据对话内容自动生成交互式思维导图与层级组织架构图，支持 SVG/PNG 导出与缩放。",
    author: "VisualThink",
    icon: "Network",
    category: "creative",
    downloads: 2150,
    rating: 4.8,
    tags: ["思维导图", "脑图", "Markmap", "可视化"],
    permissions: ["chat:renderer"],
    repository: "https://github.com/closedui-plugins/mindmap-generator",
    settingsFields: [
      {
        key: "defaultColorDepth",
        label: "分支颜色饱和度",
        type: "select",
        defaultValue: "vibrant",
        options: [
          { label: "活力明亮 (Vibrant)", value: "vibrant" },
          { label: "极简黑白 (Monochrome)", value: "mono" },
          { label: "科技冷蓝 (Tech Blue)", value: "blue" }
        ]
      }
    ],
    defaultConfig: {
      defaultColorDepth: "vibrant"
    },
    readme: `### 交互式思维导图生成器

支持在聊天回答中直接渲染支持无限拖拽缩放的层级脑图，结构清晰。`
  },
  {
    id: "sql-query-optimizer",
    name: "SQL 复杂查询优化与索引建议器",
    version: "1.0.2",
    description: "智能分析 SQL 慢查询执行计划 (EXPLAIN)，诊断性能瓶颈并自动给出索引与重构建议。",
    author: "DBMaster",
    icon: "Database",
    category: "data",
    downloads: 1870,
    rating: 4.9,
    tags: ["SQL", "数据库优化", "EXPLAIN", "索引"],
    permissions: ["database:query"],
    repository: "https://github.com/closedui-plugins/sql-optimizer",
    settingsFields: [
      {
        key: "databaseDialect",
        label: "目标数据库方言",
        type: "select",
        defaultValue: "mysql",
        options: [
          { label: "MySQL 8.0+", value: "mysql" },
          { label: "PostgreSQL 14+", value: "postgres" },
          { label: "SQLite 3", value: "sqlite" },
          { label: "Oracle / SQL Server", value: "general" }
        ]
      }
    ],
    defaultConfig: {
      databaseDialect: "mysql"
    },
    contributes: {
      tools: [
        { name: "optimize_sql_query", description: "诊断并优化复杂的 SQL 查询语句" }
      ]
    },
    readme: `### SQL 复杂查询优化器

针对数据库慢查询进行结构化诊断，输出符合生产环境规范的索引和优化方案。`
  },
  {
    id: "latex-formula-studio",
    name: "LaTeX 公式与学术排版工作室",
    version: "1.1.5",
    description: "提供专业级数学物理公式实时预览、矩阵编辑器与 OCR 公式手写识别辅助。",
    author: "AcademicTools",
    icon: "Sparkles",
    category: "creative",
    downloads: 1650,
    rating: 4.7,
    tags: ["LaTeX", "数学公式", "KaTeX", "学术论文"],
    permissions: ["chat:renderer"],
    repository: "https://github.com/closedui-plugins/latex-studio",
    settingsFields: [
      {
        key: "fontSize",
        label: "公式默认渲染字号",
        type: "select",
        defaultValue: "medium",
        options: [
          { label: "标准 (Medium - 16px)", value: "medium" },
          { label: "大号 (Large - 18px)", value: "large" },
          { label: "紧凑 (Small - 14px)", value: "small" }
        ]
      }
    ],
    defaultConfig: {
      fontSize: "medium"
    },
    readme: `### LaTeX 学术公式工作室

增强对话中 KaTeX / MathJax 数学与物理公式渲染精度，支持一键复制 LaTeX 源码。`
  },
  {
    id: "cyberpunk-neon-theme",
    name: "赛博朋克霓虹主题包",
    version: "1.0.0",
    description: "为应用换上高对比度赛博霓虹流光质感，搭配细腻的发光阴影与动效。",
    author: "NeonCraft",
    icon: "Palette",
    category: "theme",
    downloads: 2780,
    rating: 4.8,
    tags: ["主题", "赛博朋克", "暗黑模式", "霓虹"],
    permissions: ["ui:theme"],
    repository: "https://github.com/closedui-plugins/cyberpunk-theme",
    settingsFields: [
      {
        key: "glowIntensity",
        label: "发光光晕强度",
        type: "select",
        defaultValue: "medium",
        options: [
          { label: "柔和光晕", value: "soft" },
          { label: "标准霓虹", value: "medium" },
          { label: "极度耀眼", value: "high" }
        ]
      }
    ],
    defaultConfig: {
      glowIntensity: "medium"
    },
    readme: `### 赛博朋克霓虹主题

专为极客打造的高对比度发光色彩主题包。`
  }
]
