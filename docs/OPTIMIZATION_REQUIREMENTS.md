# OpenOrangeAI 项目优化与功能增强需求文档

**版本**: v1.0  
**创建日期**: 2026-06-25  
**文档状态**: Draft  
**项目版本**: v0.5.0-beta  
**技术栈**: Next.js 16.1.6 + React 19.2.3 + TypeScript + Tailwind CSS + Prisma + SQLite

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [现有系统评估](#2-现有系统评估)
3. [优化需求](#3-优化需求)
4. [新功能需求](#4-新功能需求)
5. [非功能性需求](#5-非功能性需求)
6. [实施优先级与资源估算](#6-实施优先级与资源估算)
7. [验收标准与测试要求](#7-验收标准与测试要求)
8. [风险管理](#8-风险管理)
9. [附录](#9-附录)

---

## 1. 执行摘要

### 1.1 文档目的

本文档旨在基于 OpenOrangeAI 项目当前功能状态、技术架构和审计报告，制定系统性的优化与功能增强计划。通过识别性能瓶颈、安全漏洞、用户体验痛点和技术债务，明确优化目标和实施路径，为产品迭代提供可执行的指导方案。

### 1.2 项目现状概述

OpenOrangeAI 是一个功能丰富的本地优先 AI 办公助手，已实现核心功能包括：
- ✅ 多模型对话系统（支持 14+ AI 提供商）
- ✅ 文档/表格/演示编辑器（Office 套件核心能力）
- ✅ 知识库系统（RAG + 数据库分析）
- ✅ MCP 插件系统
- ✅ 工作流自动化
- ✅ 格式转换中心
- ✅ OCR 文字识别
- ✅ 文档对比工具

**当前问题统计**（基于审计报告）：
- 严重问题：3 项
- 高级别问题：23 项
- 中级别问题：17 项
- 低级别问题：16 项
- **总计：59 项待解决问题**

### 1.3 优化目标

| 维度 | 当前状态 | 目标状态 | 时间范围 |
|------|---------|---------|---------|
| **安全性** | 存在多个高危漏洞 | 零严重/高危安全漏洞 | 1-2 个月 |
| **性能** | 部分场景响应慢 | 首屏 <2s，API <500ms | 2-3 个月 |
| **稳定性** | SSE 连接不稳定 | 99.9% 可用性 | 2-3 个月 |
| **用户体验** | 移动端适配差 | 全端流畅体验 | 2-4 个月 |
| **代码质量** | 测试覆盖率 <10% | 测试覆盖率 >80% | 3-6 个月 |
| **功能完整度** | 核心功能 80% | 核心功能 100% | 3-6 个月 |

---

## 2. 现有系统评估

### 2.1 功能模块分析

#### 2.1.1 核心功能完成度矩阵

| 功能模块 | 完成度 | 关键缺失 | 优先级 |
|---------|-------|---------|--------|
| **对话系统** | 85% | 对话分组/标签、消息编辑、会话摘要 | P0 |
| **文档编辑器** | 90% | 批注系统、修订模式、页眉页脚 UI | P0 |
| **表格编辑器** | 85% | 冻结窗格、自动填充、条件格式完善 | P0 |
| **演示编辑器** | 80% | 演示模式、动画/转场、AI 生成完善 | P1 |
| **知识库系统** | 75% | 多知识库混合检索、自动更新、权限管理 | P1 |
| **MCP 插件** | 80% | 工具调用日志、权限控制、性能监控 | P1 |
| **工作流引擎** | 70% | 可视化编辑器完善、错误处理、执行日志 | P1 |
| **搜索系统** | 80% | 搜索结果缓存、自定义引擎、网页抓取 | P2 |
| **提示词系统** | 75% | 导入导出、版本历史、效果评估 | P2 |
| **文件处理** | 70% | 在线编辑、批量处理、版本管理 | P2 |

#### 2.1.2 功能使用频率分析

基于代码结构和功能重要性评估：

```
高频使用（核心）:
├─ 对话系统 (每日使用)
├─ 文档编辑器 (每日使用)
├─ 模型切换 (频繁)
└─ 设置管理 (每周)

中频使用（重要）:
├─ 知识库 (每周)
├─ 表格编辑器 (每周)
├─ 演示编辑器 (每周)
└─ 搜索功能 (每周)

低频使用（辅助）:
├─ 工作流 (偶尔)
├─ 格式转换 (偶尔)
├─ OCR (偶尔)
└─ MCP 插件 (偶尔)
```

### 2.2 性能瓶颈识别

#### 2.2.1 前端性能瓶颈

| 瓶颈点 | 位置 | 影响 | 严重程度 |
|--------|------|------|---------|
| **首屏加载慢** | 全局 | Bundle 过大，未充分代码分割 | 高 |
| **长列表渲染卡顿** | 聊天消息、日志列表 | 无虚拟滚动，DOM 节点过多 | 高 |
| **知识图谱内存泄漏** | `knowledge-graph.tsx` | `requestAnimationFrame` 未清理 | 中 |
| **SSE 流式渲染** | 聊天页面 | 大消息渲染性能差 | 中 |
| **图片未优化** | 全局 | 未使用 `next/image`，无懒加载 | 中 |

**性能指标现状**（估算）：
- 首屏加载时间：~4-6 秒（目标 <2 秒）
- Bundle 大小：~2-3 MB（目标 <500KB gzip）
- 长列表渲染：1000 条消息时卡顿（目标流畅 60fps）
- 内存占用：空闲 ~400MB，使用中 ~1.2GB（目标 <800MB）

#### 2.2.2 后端性能瓶颈

| 瓶颈点 | 位置 | 影响 | 严重程度 |
|--------|------|------|---------|
| **向量搜索效率低** | 知识库搜索 | JSON 存储 embedding，全表扫描 | 严重 |
| **数据库查询无限制** | 数据源 API | 大表查询可能 OOM | 高 |
| **归档导出无分页** | 归档导出 | 一次性加载所有聊天，内存溢出风险 | 高 |
| **SSE 连接管理** | 聊天流 | 竞态条件、内存泄漏、静默断连 | 高 |
| **文件上传临时文件** | 上传 API | 临时文件未清理，磁盘空间持续增长 | 中 |
| **MCP 日志无清理** | MCP 日志 | 日志无限增长，数据库膨胀 | 中 |

**关键性能问题详解**：

1. **向量搜索性能问题**
   ```typescript
   // 当前实现：JSON 字符串存储，全表扫描
   KnowledgeChunk.embedding: String? // JSON array of floats
   
   // 问题：每次搜索需反序列化所有 embedding
   // 规模：10000 条 chunk 时搜索延迟 >5 秒
   ```

2. **SSE 连接稳定性问题**
   ```typescript
   // 问题点：
   // 1. 5 分钟硬超时，无客户端通知
   // 2. 重试逻辑无指数退避上限
   // 3. 90 秒陈旧连接清理可能误杀正常长对话
   // 4. sendingRef 存在竞态条件（多次修复注释 BUG-001 至 BUG-007）
   ```

3. **数据库索引缺失**
   ```prisma
   // 缺失索引：
   model Chat {
     updatedAt DateTime @updatedAt // 用于排序但无索引
   }
   
   model McpToolLog {
     // 无 TTL/自动清理机制
   }
   ```

### 2.3 用户体验痛点总结

#### 2.3.1 交互体验问题

| 痛点 | 描述 | 影响范围 | 严重程度 |
|------|------|---------|---------|
| **移动端适配差** | 侧边栏占据全屏，主内容不可见 | 移动端用户 | 严重 |
| **设置保存无反馈** | 点击保存后无成功提示 | 所有用户 | 高 |
| **演示文稿编辑失效** | 添加幻灯片后无法进入编辑状态 | 演示功能用户 | 高 |
| **知识库对话框关闭异常** | 点击 X 按钮无法关闭 | 知识库用户 | 高 |
| **新建文档按钮无响应** | 点击后页面无反应 | 文档用户 | 中 |
| **工作流页面空白** | 无工作流列表或创建入口 | 工作流用户 | 中 |
| **记忆管理无入口** | 页面空白，无添加记忆功能 | 记忆功能用户 | 中 |
| **笔记页面无新建功能** | 缺少新建笔记按钮 | 笔记用户 | 中 |

#### 2.3.2 视觉与反馈问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **Hydration 错误** | 服务端/客户端渲染不一致 | 控制台错误，性能下降 |
| **模板重复渲染** | 同一模板显示多次 | 用户困惑 |
| **disabled 状态不明显** | 按钮禁用状态视觉差异小 | 用户误操作 |
| **模型名截断** | 输入框占位符显示不完整 | 用户体验差 |
| **工具计数不准确** | 侧边栏显示数字与实际不符 | 信息不一致 |

#### 2.3.3 功能完整性问题

| 功能 | 缺失点 | 用户影响 |
|------|--------|---------|
| **对话管理** | 无分组/标签/置顶 | 大量对话难以管理 |
| **消息操作** | 无编辑/重新发送/书签 | 消息管理不便 |
| **文档批注** | 无批注/修订系统 | 协作编辑受限 |
| **表格高级功能** | 无冻结窗格/自动填充 | 大表格操作不便 |
| **演示模式** | 无全屏演示/动画 | 演示体验差 |
| **快捷键** | 所有快捷键为空函数 | 效率用户失望 |
| **i18n** | 5 种语言翻译缺失 >80% | 国际化用户流失 |

### 2.4 安全漏洞评估

#### 2.4.1 严重安全漏洞

| 漏洞 | 位置 | 风险 | 紧急度 |
|------|------|------|--------|
| **沙箱代码执行** | `/api/sandbox` | `new Function()` 可执行任意代码，窃取 API Key | 🔴 立即修复 |
| **SQL 注入** | `data-sources.ts` | 表名直接拼接，黑名单可绕过 | 🔴 立即修复 |
| **SSRF** | `data-sources.ts` | 可发起任意 HTTP 请求访问内网 | 🔴 立即修复 |
| **API Key 明文存储** | `schema.prisma` | 数据库中所有密钥明文可读 | 🔴 立即修复 |

#### 2.4.2 高危安全漏洞

| 漏洞 | 位置 | 风险 |
|------|------|------|
| **API 无认证** | 全局 API | 任何网络可达者可调用所有接口 |
| **API 无速率限制** | 全局 API | 可被滥用产生高额账单或 DoS |
| **存储型 XSS** | 归档导入 | 恶意脚本可在用户浏览器执行 |
| **文件上传路径遍历** | `/api/upload` | 临时文件命名不安全 |
| **OpenAI Key 泄露** | `/api/voice` | 错误消息可能暴露 API Key |

#### 2.4.3 安全加固需求

```
必须实现：
├─ API 认证中间件（Bearer Token）
├─ 速率限制中间件
├─ 输入验证与清理
├─ API Key 加密存储（AES-256）
├─ CSP（内容安全策略）
├─ CORS 严格配置
└─ 安全审计日志

建议实现：
├─ CSRF 防护
├─ 文件上传病毒扫描
├─ SQL 注入防护（参数化查询）
├─ XSS 防护（HTML 转义）
└─ 敏感数据脱敏
```

### 2.5 技术债务清单

#### 2.5.1 代码质量问题

| 问题类型 | 数量 | 示例 | 影响 |
|---------|------|------|------|
| **类型安全不足** | ~50 处 | 使用 `any` 类型 | 运行时错误风险 |
| **错误处理缺失** | ~30 处 | 无 try-catch 或空 catch | 崩溃风险 |
| **代码重复** | ~20 处 | 相似逻辑多处实现 | 维护成本高 |
| **硬编码字符串** | ~100 处 | 未接入 i18n | 国际化困难 |
| **魔法数字** | ~40 处 | 未定义为常量 | 可读性差 |

#### 2.5.2 架构设计问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **状态管理脆弱** | `chatsRef` 模式依赖 ref 与 state 同步 | 状态不一致 |
| **组件职责不清** | 部分组件过大（>1000 行） | 难以维护 |
| **依赖注入缺失** | 直接导入数据库/服务 | 测试困难 |
| **错误边界不足** | 全局错误边界，无细粒度处理 | 用户体验差 |
| **日志系统不完善** | 无结构化日志，无日志轮转 | 调试困难 |

#### 2.5.3 测试覆盖不足

```
当前测试覆盖率（估算）：
├─ 单元测试：<10%
├─ 集成测试：<5%
├─ E2E 测试：0%
└─ 性能测试：0%

目标测试覆盖率：
├─ 单元测试：>80%
├─ 集成测试：>60%
├─ E2E 测试：关键路径 100%
└─ 性能测试：核心场景覆盖
```

---

## 3. 优化需求

### 3.1 性能优化目标

#### 3.1.1 前端性能优化

| 指标 | 当前值 | 目标值 | 优化策略 | 时限 |
|------|--------|--------|---------|------|
| **首屏加载时间** | 4-6s | <2s | 代码分割、路由懒加载、预加载关键资源 | 1 个月 |
| **Bundle 大小** | 2-3MB | <500KB (gzip) | Tree-shaking、动态导入、移除未使用依赖 | 1 个月 |
| **FCP (First Contentful Paint)** | ~3s | <1.5s | 关键 CSS 内联、字体优化、图片懒加载 | 1 个月 |
| **LCP (Largest Contentful Paint)** | ~5s | <2.5s | 优化资源加载、使用 CDN | 2 个月 |
| **TTI (Time to Interactive)** | ~6s | <3s | 减少主线程阻塞、代码分割 | 2 个月 |
| **长列表渲染** | 卡顿 | 60fps | 虚拟滚动（react-window） | 1 个月 |
| **内存占用（空闲）** | ~400MB | <300MB | 及时清理、对象池、事件监听器清理 | 2 个月 |
| **内存占用（使用中）** | ~1.2GB | <800MB | 大文档分页、图片压缩、缓存策略 | 2 个月 |

**具体优化措施**：

```javascript
// 1. 代码分割示例
const DocumentEditor = dynamic(() => import('@/components/document-editor'), {
  loading: () => <Spinner />,
  ssr: false
})

// 2. 虚拟滚动示例
import { FixedSizeList } from 'react-window'
<FixedSizeList
  height={600}
  itemCount={messages.length}
  itemSize={50}
>
  {MessageRow}
</FixedSizeList>

// 3. 图片优化
import Image from 'next/image'
<Image src={url} alt="..." width={800} height={600} loading="lazy" />
```

#### 3.1.2 后端性能优化

| 指标 | 当前值 | 目标值 | 优化策略 | 时限 |
|------|--------|--------|---------|------|
| **API 响应时间（P50）** | ~500ms | <200ms | 数据库索引、查询优化、缓存 | 1 个月 |
| **API 响应时间（P95）** | ~2s | <500ms | 异步处理、连接池、限流 | 2 个月 |
| **向量搜索延迟** | >5s (10k chunks) | <500ms | 迁移到专用向量数据库 | 2 个月 |
| **数据库查询** | 无限制 | LIMIT 1000 | 分页查询、结果大小限制 | 1 周 |
| **SSE 连接稳定性** | 静默断连 | 99.9% 可用 | 心跳检测、自动重连、错误通知 | 1 个月 |
| **文件上传处理** | 临时文件累积 | 自动清理 | 恢复清理逻辑、定时任务 | 1 周 |
| **并发处理能力** | ~10 请求/s | ~100 请求/s | 连接池、异步 I/O、缓存 | 3 个月 |

**关键优化项目**：

1. **向量数据库迁移**
   ```typescript
   // 当前：SQLite + JSON 存储
   KnowledgeChunk.embedding: String? // JSON array
   
   // 目标：专用向量数据库
   // 方案 A：ChromaDB（本地部署）
   // 方案 B：Pinecone（云端服务）
   // 方案 C：pgvector（PostgreSQL 扩展）
   
   // 预期效果：
   // - 搜索延迟：<500ms（10k chunks）
   // - 支持 HNSW 索引
   // - 混合检索（BM25 + 向量）
   ```

2. **数据库索引优化**
   ```prisma
   // 添加索引
   model Chat {
     updatedAt DateTime @updatedAt
     @@index([updatedAt]) // 新增
   }
   
   model Message {
     chatId String
     createdAt DateTime @default(now())
     @@index([chatId, createdAt]) // 新增
   }
   
   model KnowledgeChunk {
     knowledgeBaseId String
     @@index([knowledgeBaseId]) // 新增
   }
   ```

3. **SSE 连接稳定性**
   ```typescript
   // 修复措施：
   // 1. 添加心跳机制（每 30 秒）
   // 2. 客户端断连检测与自动重连
   // 3. 指数退避重试（1s, 2s, 4s, 8s, max 30s）
   // 4. 连接超时通知用户
   // 5. 修复竞态条件（使用状态机）
   ```

### 3.2 代码质量提升标准

#### 3.2.1 重构范围

| 模块 | 重构类型 | 优先级 | 工作量 |
|------|---------|--------|--------|
| **聊天上下文** | 状态管理重构 | P0 | 大 |
| **SSE 流式处理** | 稳定性重构 | P0 | 大 |
| **知识库搜索** | 向量数据库迁移 | P1 | 大 |
| **工作流编辑器** | 功能完善重构 | P1 | 中 |
| **文件上传** | 安全重构 | P0 | 中 |
| **错误边界** | 细粒度错误处理 | P1 | 中 |
| **i18n 系统** | 翻译补全 | P1 | 大 |

#### 3.2.2 技术债务清理计划

**Phase 1（1-2 个月）：安全债务**
- [ ] 修复所有严重/高危安全漏洞
- [ ] API Key 加密存储
- [ ] 添加认证/授权中间件
- [ ] 输入验证与清理
- [ ] 安全审计日志

**Phase 2（2-3 个月）：性能债务**
- [ ] 向量数据库迁移
- [ ] 数据库索引优化
- [ ] 长列表虚拟滚动
- [ ] 代码分割优化
- [ ] 内存泄漏修复

**Phase 3（3-4 个月）：质量债务**
- [ ] 类型安全提升（消除 `any`）
- [ ] 错误处理完善
- [ ] 代码重复消除
- [ ] 组件职责拆分
- [ ] 依赖注入重构

**Phase 4（4-6 个月）：测试债务**
- [ ] 单元测试覆盖率 >80%
- [ ] 集成测试覆盖率 >60%
- [ ] E2E 测试关键路径 100%
- [ ] 性能测试自动化
- [ ] 安全测试自动化

#### 3.2.3 代码规范提升

```typescript
// 1. 类型安全规范
// ❌ 禁止
function processData(data: any) { ... }

// ✅ 要求
function processData(data: ChatMessage) { ... }

// 2. 错误处理规范
// ❌ 禁止
try { ... } catch (e) { console.error(e) }

// ✅ 要求
try { ... } catch (e) {
  logger.error('Failed to process data', { error: e, context: {...} })
  throw new AppError('PROCESS_FAILED', e)
}

// 3. 常量定义规范
// ❌ 禁止
if (status === 'active') { ... }

// ✅ 要求
const CHAT_STATUS = { ACTIVE: 'active', ARCHIVED: 'archived' } as const
if (status === CHAT_STATUS.ACTIVE) { ... }

// 4. 组件拆分规范
// ❌ 禁止：组件 >1000 行
function LargeComponent() { ... }

// ✅ 要求：拆分为小组件
function ParentComponent() {
  return (
    <div>
      <HeaderSection />
      <ContentSection />
      <FooterSection />
    </div>
  )
}
```

#### 3.2.4 ESLint 规则增强

```javascript
// eslint.config.mjs
export default [
  {
    rules: {
      // 类型安全
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      
      // 错误处理
      'no-console': 'warn',
      'no-alert': 'error',
      
      // React 最佳实践
      'react-hooks/exhaustive-deps': 'error',
      'react/no-unescaped-entities': 'error',
      
      // 性能
      'react/jsx-no-bind': 'warn',
      
      // 安全
      'no-eval': 'error',
      'no-implied-eval': 'error',
    }
  }
]
```

### 3.3 安全性增强措施

#### 3.3.1 认证与授权

**需求描述**：
实现基于 Token 的认证系统，保护所有 API 端点。

**技术方案**：
```typescript
// 1. JWT Token 认证
interface AuthToken {
  userId: string
  role: 'admin' | 'user'
  exp: number // 过期时间
}

// 2. 认证中间件
export function withAuth(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthToken
      req.user = decoded
      return handler(req, res)
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

// 3. 角色权限控制
export function requireRole(role: 'admin' | 'user') {
  return (req: NextApiRequest, res: NextApiResponse, next: NextFunction) => {
    if (req.user?.role !== role && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
```

**验收标准**：
- [ ] 所有 API 端点需认证
- [ ] Token 过期时间：24 小时
- [ ] 支持 Token 刷新
- [ ] 未认证请求返回 401
- [ ] 权限不足返回 403

#### 3.3.2 速率限制

**需求描述**：
防止 API 滥用，保护系统资源。

**技术方案**：
```typescript
// 速率限制配置
const rateLimitConfig = {
  '/api/chat/stream': { window: '1m', max: 10 }, // 每分钟 10 次
  '/api/voice': { window: '1m', max: 5 }, // 每分钟 5 次
  '/api/upload': { window: '1h', max: 50 }, // 每小时 50 次
  default: { window: '1m', max: 60 }, // 默认每分钟 60 次
}

// 实现
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 60, // 最多 60 次请求
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})
```

**验收标准**：
- [ ] 超限请求返回 429
- [ ] 响应头包含速率限制信息
- [ ] 支持按 IP 和用户限制
- [ ] 支持自定义限制规则

#### 3.3.3 输入验证与清理

**需求描述**：
所有用户输入必须验证和清理，防止注入攻击。

**技术方案**：
```typescript
// 1. 使用 Zod 进行验证
import { z } from 'zod'

const ChatMessageSchema = z.object({
  content: z.string().max(10000),
  role: z.enum(['user', 'assistant']),
  chatId: z.string().cuid(),
})

// 2. 输入清理
import sanitizeHtml from 'sanitize-html'

function sanitizeInput(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [], // 不允许任何 HTML 标签
    allowedAttributes: {},
  })
}

// 3. SQL 注入防护
// ❌ 禁止
const query = `SELECT * FROM users WHERE name = '${name}'`

// ✅ 要求
const query = prisma.user.findMany({ where: { name } })
```

**验收标准**：
- [ ] 所有 API 输入使用 Zod 验证
- [ ] 用户内容 HTML 转义
- [ ] SQL 查询参数化
- [ ] 文件上传类型白名单
- [ ] 文件大小限制

#### 3.3.4 API Key 加密存储

**需求描述**：
所有 API Key 必须加密存储，不能明文保存在数据库。

**技术方案**：
```typescript
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY! // 从环境变量读取
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

// 使用
const encryptedKey = encrypt(settings.openaiKey)
// 保存到数据库
const decryptedKey = decrypt(encryptedKey)
// 使用时解密
```

**验收标准**：
- [ ] 数据库中无明文 API Key
- [ ] 加密使用 AES-256-CBC
- [ ] 密钥从环境变量读取
- [ ] 支持密钥轮转

#### 3.3.5 沙箱安全隔离

**需求描述**：
代码执行必须在安全沙箱中，不能访问宿主系统资源。

**技术方案**：
```typescript
// 方案 A：Docker 容器隔离
import Docker from 'dockerode'

async function executeInSandbox(code: string): Promise<string> {
  const docker = new Docker()
  const container = await docker.createContainer({
    Image: 'node:18-alpine',
    Cmd: ['node', '-e', code],
    HostConfig: {
      Memory: 256 * 1024 * 1024, // 256MB 内存限制
      NanoCpus: 1 * 1e9, // 1 CPU 核心
      NetworkMode: 'none', // 禁用网络
      PidsLimit: 100, // 进程数限制
    },
  })
  
  await container.start()
  const result = await container.wait()
  await container.remove()
  
  return result.StatusCode === 0 ? 'Success' : 'Failed'
}

// 方案 B：Worker 线程隔离（轻量级）
import { Worker } from 'worker_threads'

function executeInWorker(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true })
    worker.on('message', resolve)
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
    })
  })
}
```

**验收标准**：
- [ ] 无法访问 `process.env`
- [ ] 无法执行系统命令
- [ ] 内存限制 256MB
- [ ] CPU 限制 1 核心
- [ ] 禁用网络访问
- [ ] 执行超时 30 秒

#### 3.3.6 安全审计清单

```
必须实现的安全措施：
├─ ✅ API 认证（Bearer Token）
├─ ✅ 速率限制
├─ ✅ 输入验证（Zod）
├─ ✅ API Key 加密（AES-256）
├─ ✅ 沙箱隔离（Docker/Worker）
├─ ✅ SQL 注入防护（参数化查询）
├─ ✅ XSS 防护（HTML 转义）
├─ ✅ CSRF 防护（Token 验证）
├─ ✅ CORS 严格配置
├─ ✅ CSP（内容安全策略）
├─ ✅ 安全审计日志
└─ ✅ 敏感数据脱敏

建议实现的安全措施：
├─ 文件上传病毒扫描
├─ 双因素认证（2FA）
├─ IP 白名单
├─ 请求签名验证
└─ 安全头配置（Helmet.js）
```

---

## 4. 新功能需求

### 4.1 对话系统增强

#### 4.1.1 对话分组与标签

**功能描述**：
支持按项目/主题对对话进行分组管理，支持多标签分类。

**核心功能点**：
1. **对话分组**
   - 创建/编辑/删除分组
   - 拖拽对话到分组
   - 分组嵌套（最多 2 层）
   - 分组颜色标记

2. **对话标签**
   - 创建/编辑/删除标签
   - 为对话添加多个标签
   - 按标签筛选对话
   - 标签颜色自定义

3. **对话置顶**
   - 置顶重要对话
   - 置顶对话显示在顶部
   - 最多置顶 10 个对话

**用户交互流程**：
```
1. 创建分组：
   侧边栏 → 右键 → "新建分组" → 输入名称 → 创建

2. 移动对话到分组：
   拖拽对话 → 到分组 → 释放

3. 添加标签：
   对话列表 → 右键 → "添加标签" → 选择/创建标签 → 确认

4. 按标签筛选：
   侧边栏 → 标签区域 → 点击标签 → 显示该标签下所有对话
```

**业务逻辑规则**：
- 分组可嵌套，但最多 2 层
- 每个对话最多 5 个标签
- 置顶对话最多 10 个
- 删除分组时，对话移动到"未分组"
- 标签删除时，自动从对话中移除

**数据模型**：
```prisma
model ChatGroup {
  id        String   @id @default(cuid())
  name      String
  parentId  String?
  parent    ChatGroup? @relation("GroupHierarchy", fields: [parentId], references: [id])
  children  ChatGroup[] @relation("GroupHierarchy")
  chats     Chat[]
  color     String?
  order     Int      @default(0)
  createdAt DateTime @default(now())
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  color String @default("#6366f1")
  chats Chat[]
}

model Chat {
  // 现有字段...
  groupId String?
  group   ChatGroup? @relation(fields: [groupId], references: [id])
  tags    Tag[]
  pinned  Boolean @default(false)
}
```

**验收标准**：
- [ ] 可创建/编辑/删除分组
- [ ] 可拖拽对话到分组
- [ ] 可添加/删除标签
- [ ] 可按标签筛选对话
- [ ] 可置顶对话
- [ ] 分组/标签数据持久化

#### 4.1.2 消息编辑与重新生成

**功能描述**：
支持编辑已发送的用户消息并重新生成 AI 回复。

**核心功能点**：
1. **消息编辑**
   - 点击用户消息的编辑按钮
   - 进入编辑模式
   - 保存修改
   - 取消编辑

2. **重新生成**
   - 编辑后自动重新生成 AI 回复
   - 删除旧的 AI 回复
   - 生成新的 AI 回复
   - 保留历史记录（可选）

3. **版本历史**
   - 记录消息编辑历史
   - 可查看历史版本
   - 可恢复到历史版本

**用户交互流程**：
```
1. 编辑消息：
   用户消息 → 悬停 → 显示编辑按钮 → 点击 → 进入编辑模式 → 修改内容 → 保存

2. 重新生成：
   编辑保存后 → 自动删除旧 AI 回复 → 发送新消息 → 生成新回复

3. 查看历史：
   消息 → 右键 → "查看历史" → 显示版本列表 → 选择版本 → 恢复
```

**业务逻辑规则**：
- 只能编辑用户消息，不能编辑 AI 回复
- 编辑后自动重新生成 AI 回复
- 历史版本保留最近 10 个
- 重新生成使用相同的模型和参数

**验收标准**：
- [ ] 可编辑用户消息
- [ ] 编辑后自动重新生成
- [ ] 可查看消息历史
- [ ] 可恢复到历史版本
- [ ] 历史记录持久化

### 4.2 文档编辑器增强

#### 4.2.1 批注系统

**功能描述**：
支持在文档中添加批注，用于协作审阅。

**核心功能点**：
1. **添加批注**
   - 选中文本 → 添加批注
   - 输入批注内容
   - 保存批注

2. **批注管理**
   - 查看批注列表
   - 编辑/删除批注
   - 标记批注为已解决

3. **批注导航**
   - 跳转到下一个/上一个批注
   - 批注侧边栏显示

**用户交互流程**：
```
1. 添加批注：
   选中文本 → 工具栏 → "添加批注" → 输入内容 → 保存

2. 查看批注：
   点击批注标记 → 显示批注内容

3. 解决批注：
   批注面板 → 点击"解决" → 批注标记为已解决
```

**技术实现**：
```typescript
// TipTap 扩展
import { Extension } from '@tiptap/core'

const Comment = Extension.create({
  name: 'comment',
  addAttributes() {
    return {
      commentId: { default: null },
      commentText: { default: '' },
      resolved: { default: false },
    }
  },
  addCommands() {
    return {
      addComment: (text) => ({ commands }) => {
        return commands.setMark('comment', { commentText: text })
      },
    }
  },
})
```

**验收标准**：
- [ ] 可添加批注
- [ ] 可查看/编辑/删除批注
- [ ] 可标记批注为已解决
- [ ] 批注数据持久化

#### 4.2.2 修订模式

**功能描述**：
支持追踪文档修改历史，可接受/拒绝修改。

**核心功能点**：
1. **启用修订模式**
   - 切换修订模式开关
   - 修订模式下所有修改被追踪

2. **修改追踪**
   - 插入内容标记为"新增"
   - 删除内容标记为"删除"
   - 修改内容标记为"修改"

3. **审阅修改**
   - 查看修改列表
   - 接受/拒绝单个修改
   - 批量接受/拒绝

**验收标准**：
- [ ] 可启用/禁用修订模式
- [ ] 修改被正确追踪
- [ ] 可接受/拒绝修改
- [ ] 修订历史持久化

### 4.3 表格编辑器增强

#### 4.3.1 冻结窗格

**功能描述**：
支持冻结行/列，方便查看大表格。

**核心功能点**：
1. **冻结行**
   - 选择行 → 右键 → "冻结到此行"
   - 冻结行始终显示在顶部

2. **冻结列**
   - 选择列 → 右键 → "冻结到此列"
   - 冻结列始终显示在左侧

3. **取消冻结**
   - 右键 → "取消冻结"

**技术实现**：
```typescript
// AG-Grid 配置
const gridOptions = {
  pinnedTopRowData: [/* 冻结行数据 */],
  pinnedBottomRowData: [/* 冻结行数据 */],
  pinnedColumns: ['column1', 'column2'], // 冻结列
}
```

**验收标准**：
- [ ] 可冻结行/列
- [ ] 冻结行/列始终可见
- [ ] 可取消冻结
- [ ] 冻结状态持久化

#### 4.3.2 自动填充

**功能描述**：
支持拖拽自动填充序列（数字、日期等）。

**核心功能点**：
1. **序列填充**
   - 选择单元格 → 拖拽右下角 → 自动填充
   - 支持数字序列（1, 2, 3...）
   - 支持日期序列（2026-01-01, 2026-01-02...）

2. **自定义序列**
   - 定义自定义序列（周一、周二、周三...）
   - 使用自定义序列填充

**验收标准**：
- [ ] 可拖拽填充
- [ ] 支持数字/日期序列
- [ ] 支持自定义序列
- [ ] 填充结果正确

### 4.4 演示编辑器增强

#### 4.4.1 演示模式

**功能描述**：
支持全屏演示，类似 PowerPoint 演示模式。

**核心功能点**：
1. **全屏演示**
   - 点击"演示"按钮 → 进入全屏
   - 键盘导航（←/→ 切换幻灯片）
   - ESC 退出演示

2. **幻灯片切换动画**
   - 淡入淡出
   - 滑动切换
   - 缩放切换

3. **演讲者视图**
   - 显示当前幻灯片
   - 显示下一张幻灯片预览
   - 显示演讲者备注
   - 显示计时器

**用户交互流程**：
```
1. 开始演示：
   演示文稿页面 → "演示"按钮 → 进入全屏

2. 导航：
   ←/→ 键：切换幻灯片
   ESC 键：退出演示
   数字键：跳转到指定幻灯片

3. 演讲者视图：
   双屏显示 → 主屏显示幻灯片 → 副屏显示演讲者视图
```

**技术实现**：
```typescript
// 全屏 API
function startPresentation() {
  document.documentElement.requestFullscreen()
  setCurrentSlide(0)
}

// 键盘导航
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide()
    if (e.key === 'ArrowLeft') prevSlide()
    if (e.key === 'Escape') exitPresentation()
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

**验收标准**：
- [ ] 可进入全屏演示
- [ ] 键盘导航正常
- [ ] 切换动画流畅
- [ ] 演讲者视图正常
- [ ] 可退出演示

### 4.5 知识库系统增强

#### 4.5.1 多知识库混合检索

**功能描述**：
支持跨多个知识库联合搜索。

**核心功能点**：
1. **选择知识库**
   - 搜索时可选择多个知识库
   - 全选/取消全选

2. **联合搜索**
   - 在选中的知识库中搜索
   - 结果按相关性排序
   - 显示结果来源知识库

3. **结果聚合**
   - 合并多个知识库的结果
   - 去重
   - 按相关性排序

**业务逻辑规则**：
- 默认搜索所有知识库
- 可选择特定知识库
- 结果按相关性排序，不按知识库分组
- 显示结果来源

**验收标准**：
- [ ] 可选择多个知识库
- [ ] 联合搜索正常
- [ ] 结果正确聚合
- [ ] 显示来源知识库

#### 4.5.2 知识库自动更新

**功能描述**：
监控文件变化，自动更新知识库索引。

**核心功能点**：
1. **文件监控**
   - 监控知识库目录
   - 检测文件新增/修改/删除

2. **增量索引**
   - 只索引变化的文件
   - 更新向量索引
   - 删除已移除文件的索引

3. **同步状态**
   - 显示同步状态
   - 显示最后同步时间
   - 手动触发同步

**技术实现**：
```typescript
// 文件监控（使用 chokidar）
import chokidar from 'chokidar'

const watcher = chokidar.watch(knowledgeBasePath, {
  persistent: true,
  ignoreInitial: false,
})

watcher
  .on('add', (path) => indexFile(path))
  .on('change', (path) => reindexFile(path))
  .on('unlink', (path) => removeIndex(path))
```

**验收标准**：
- [ ] 可监控文件变化
- [ ] 增量索引正常
- [ ] 同步状态正确
- [ ] 可手动触发同步

### 4.6 工作流引擎增强

#### 4.6.1 可视化编辑器完善

**功能描述**：
完善工作流可视化编辑器，支持高级功能。

**核心功能点**：
1. **撤销/重做**
   - Ctrl+Z 撤销
   - Ctrl+Y 重做
   - 历史记录面板

2. **节点复制/粘贴**
   - Ctrl+C 复制节点
   - Ctrl+V 粘贴节点
   - 批量复制

3. **自动保存**
   - 每 30 秒自动保存
   - 保存状态指示
   - 手动保存

4. **工作流校验**
   - 保存前校验
   - 检查孤立节点
   - 检查循环依赖
   - 提示错误

**验收标准**：
- [ ] 撤销/重做正常
- [ ] 复制/粘贴正常
- [ ] 自动保存正常
- [ ] 校验功能正常

#### 4.6.2 执行日志与监控

**功能描述**：
记录工作流执行日志，提供监控面板。

**核心功能点**：
1. **执行日志**
   - 记录每次执行
   - 记录每个步骤的输入/输出
   - 记录执行时间
   - 记录错误信息

2. **监控面板**
   - 显示执行历史
   - 显示成功率
   - 显示平均执行时间
   - 显示错误统计

3. **日志查看**
   - 查看执行详情
   - 查看步骤日志
   - 下载日志

**验收标准**：
- [ ] 执行日志正常记录
- [ ] 监控面板数据正确
- [ ] 可查看执行详情
- [ ] 可下载日志

### 4.7 移动端优化

#### 4.7.1 响应式布局

**功能描述**：
优化移动端布局，提升移动端体验。

**核心功能点**：
1. **侧边栏优化**
   - 移动端默认收起
   - 点击汉堡菜单展开
   - 展开时显示遮罩层
   - 滑动关闭手势

2. **聊天界面优化**
   - 消息气泡适配小屏
   - 输入框适配虚拟键盘
   - 工具栏适配小屏

3. **编辑器优化**
   - 工具栏折叠
   - 全屏编辑模式
   - 手势操作（缩放、滚动）

**技术实现**：
```typescript
// 移动端检测
import { useMobile } from '@/hooks/use-mobile'

function Layout() {
  const isMobile = useMobile()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <main>
        {isMobile && sidebarOpen && <Overlay onClick={() => setSidebarOpen(false)} />}
        {children}
      </main>
    </SidebarProvider>
  )
}
```

**验收标准**：
- [ ] 移动端侧边栏正常
- [ ] 聊天界面正常
- [ ] 编辑器正常
- [ ] 手势操作正常

### 4.8 国际化完善

#### 4.8.1 翻译补全

**功能描述**：
补全 5 种语言的翻译（es/fr/de/ja/ko）。

**核心功能点**：
1. **翻译补全**
   - 补全所有 UI 文本翻译
   - 翻译覆盖率 >95%
   - 专业术语准确翻译

2. **翻译管理**
   - 翻译键值管理
   - 翻译缺失检测
   - 翻译质量检查

3. **RTL 支持**
   - 支持阿拉伯语等 RTL 语言
   - 布局自动翻转

**验收标准**：
- [ ] 所有语言翻译完整
- [ ] 翻译准确
- [ ] 无缺失翻译
- [ ] RTL 语言正常

---

## 5. 非功能性需求

### 5.1 兼容性要求

#### 5.1.1 浏览器兼容性

| 浏览器 | 最低版本 | 优先级 |
|--------|---------|--------|
| Chrome | 最近 2 个主版本 | P0 |
| Edge | 最近 2 个主版本 | P0 |
| Firefox | 最近 2 个主版本 | P0 |
| Safari | 最近 2 个主版本 | P0 |
| Opera | 最近 2 个主版本 | P1 |
| Brave | 最近 2 个主版本 | P1 |

**测试要求**：
- [ ] 所有功能在目标浏览器正常运行
- [ ] UI 在目标浏览器正常渲染
- [ ] 性能在目标浏览器达标

#### 5.1.2 操作系统兼容性

| 操作系统 | 最低版本 | 优先级 |
|---------|---------|--------|
| Windows | 10+ | P0 |
| macOS | 12+ | P0 |
| Linux (Ubuntu) | 20.04+ | P1 |
| iOS | 15+ | P1 |
| Android | 12+ | P1 |

**测试要求**：
- [ ] 在目标操作系统正常运行
- [ ] 文件路径处理正确
- [ ] 系统 API 调用正确

#### 5.1.3 设备兼容性

| 设备类型 | 屏幕尺寸 | 优先级 |
|---------|---------|--------|
| 桌面 | 1920x1080+ | P0 |
| 笔记本 | 1366x768+ | P0 |
| 平板 | 768x1024+ | P1 |
| 手机 | 375x667+ | P1 |

**测试要求**：
- [ ] 响应式布局正常
- [ ] 触控操作正常
- [ ] 性能达标

### 5.2 可扩展性设计

#### 5.2.1 插件系统扩展

**需求描述**：
MCP 插件系统支持更多协议和扩展点。

**扩展点**：
1. **新协议支持**
   - WebSocket 协议
   - gRPC 协议
   - 自定义协议

2. **扩展点**
   - UI 扩展（自定义组件）
   - 数据扩展（自定义数据源）
   - 工具扩展（自定义工具）

3. **插件市场**
   - 插件发布
   - 插件安装
   - 插件更新

**技术方案**：
```typescript
// 插件接口
interface Plugin {
  name: string
  version: string
  protocol: 'stdio' | 'sse' | 'websocket' | 'grpc'
  
  // 生命周期钩子
  onInstall(): Promise<void>
  onUninstall(): Promise<void>
  onEnable(): Promise<void>
  onDisable(): Promise<void>
  
  // 工具定义
  tools: Tool[]
  
  // UI 扩展
  uiExtensions?: UIExtension[]
}

// 插件注册
pluginManager.register(plugin)
```

#### 5.2.2 模型提供商扩展

**需求描述**：
支持轻松添加新的 AI 模型提供商。

**扩展点**：
1. **提供商接口**
   ```typescript
   interface ModelProvider {
     name: string
     baseUrl: string
     apiKey?: string
     
     // 模型列表
     listModels(): Promise<Model[]>
     
     // 聊天完成
     chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk>
     
     // 嵌入
     embed?(texts: string[]): Promise<number[][]>
   }
   ```

2. **提供商注册**
   ```typescript
   // 注册新提供商
   modelManager.registerProvider({
     name: 'custom-provider',
     baseUrl: 'https://api.custom.com',
     // ...
   })
   ```

3. **适配器模式**
   ```typescript
   // 适配不同提供商的 API 格式
   class CustomAdapter implements ModelProvider {
     // 转换为统一格式
   }
   ```

#### 5.2.3 数据源扩展

**需求描述**：
支持更多数据源类型。

**扩展点**：
1. **数据源接口**
   ```typescript
   interface DataSource {
     type: string
     
     // 连接测试
     testConnection(): Promise<boolean>
     
     // 查询
     query(sql: string): Promise<any[]>
     
     // 表结构
     getSchema(): Promise<Table[]>
   }
   ```

2. **数据源注册**
   ```typescript
   dataSourceManager.register({
     type: 'clickhouse',
     // ...
   })
   ```

### 5.3 维护性规范

#### 5.3.1 日志规范

**日志级别**：
```typescript
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// 日志格式
interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: any
  error?: Error
}
```

**日志规范**：
- [ ] 使用结构化日志
- [ ] 日志包含上下文信息
- [ ] 错误日志包含堆栈
- [ ] 敏感信息脱敏
- [ ] 日志轮转（保留 30 天）

#### 5.3.2 监控规范

**监控指标**：
1. **应用指标**
   - 请求量
   - 响应时间
   - 错误率
   - 内存使用
   - CPU 使用

2. **业务指标**
   - 活跃用户数
   - 对话数
   - API 调用数
   - 模型使用分布

3. **告警规则**
   - 错误率 >5%
   - 响应时间 P95 >2s
   - 内存使用 >80%
   - CPU 使用 >80%

**技术方案**：
```typescript
// Prometheus 指标
import { collectDefaultMetrics, register } from 'prom-client'

collectDefaultMetrics()

// 自定义指标
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
})

// 暴露指标
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

#### 5.3.3 文档规范

**文档要求**：
1. **代码文档**
   - 所有公共函数/类有 JSDoc
   - 复杂逻辑有注释
   - 示例代码

2. **API 文档**
   - 所有 API 端点有文档
   - 请求/响应示例
   - 错误码说明

3. **用户文档**
   - 功能使用指南
   - 常见问题解答
   - 视频教程

**技术方案**：
```typescript
/**
 * 创建新对话
 * 
 * @param title - 对话标题
 * @param promptId - 提示词 ID（可选）
 * @returns 新创建的对话
 * 
 * @example
 * ```typescript
 * const chat = await createChat('My Chat', 'prompt-123')
 * ```
 */
async function createChat(title: string, promptId?: string): Promise<Chat> {
  // ...
}
```

---

## 6. 实施优先级与资源估算

### 6.1 实施阶段划分

#### Phase 1：安全加固（1-2 个月）

**目标**：修复所有严重/高危安全漏洞，确保系统安全。

| 任务 | 优先级 | 工作量 | 负责角色 |
|------|--------|--------|---------|
| 沙箱代码执行隔离 | P0 | 1 周 | 后端开发 |
| SQL 注入防护 | P0 | 3 天 | 后端开发 |
| SSRF 防护 | P0 | 3 天 | 后端开发 |
| API Key 加密存储 | P0 | 3 天 | 后端开发 |
| API 认证中间件 | P0 | 1 周 | 后端开发 |
| 速率限制中间件 | P0 | 3 天 | 后端开发 |
| 输入验证与清理 | P0 | 1 周 | 后端开发 |
| 安全审计日志 | P1 | 3 天 | 后端开发 |

**资源估算**：
- 后端开发：1-2 人
- 安全专家：0.5 人（顾问）
- 测试工程师：0.5 人

**交付物**：
- [ ] 所有安全漏洞修复
- [ ] 安全测试报告
- [ ] 安全加固文档

#### Phase 2：性能优化（2-3 个月）

**目标**：提升系统性能，达到目标指标。

| 任务 | 优先级 | 工作量 | 负责角色 |
|------|--------|--------|---------|
| 向量数据库迁移 | P0 | 2 周 | 后端开发 |
| 数据库索引优化 | P0 | 3 天 | 后端开发 |
| 前端代码分割 | P0 | 1 周 | 前端开发 |
| 长列表虚拟滚动 | P0 | 1 周 | 前端开发 |
| SSE 连接稳定性 | P0 | 1 周 | 前端/后端 |
| 内存泄漏修复 | P1 | 3 天 | 前端开发 |
| 图片优化 | P1 | 3 天 | 前端开发 |
| 缓存策略优化 | P1 | 1 周 | 前端/后端 |

**资源估算**：
- 前端开发：1-2 人
- 后端开发：1 人
- DBA：0.5 人（顾问）
- 测试工程师：0.5 人

**交付物**：
- [ ] 性能优化报告
- [ ] 性能测试报告
- [ ] 性能监控面板

#### Phase 3：功能完善（3-4 个月）

**目标**：完善核心功能，提升用户体验。

| 任务 | 优先级 | 工作量 | 负责角色 |
|------|--------|--------|---------|
| 对话分组/标签 | P1 | 1 周 | 前端/后端 |
| 消息编辑/重新生成 | P1 | 1 周 | 前端/后端 |
| 文档批注系统 | P1 | 1 周 | 前端开发 |
| 表格冻结窗格 | P1 | 3 天 | 前端开发 |
| 演示模式 | P1 | 1 周 | 前端开发 |
| 工作流编辑器完善 | P1 | 2 周 | 前端开发 |
| 移动端优化 | P1 | 2 周 | 前端开发 |
| i18n 翻译补全 | P1 | 2 周 | 前端开发 |

**资源估算**：
- 前端开发：2-3 人
- 后端开发：1 人
- UI/UX 设计师：0.5 人
-