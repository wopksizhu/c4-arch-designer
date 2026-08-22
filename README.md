# ArchLens · C4 软件架构设计应用

> 一款 **Web 应用（B/S，对标 IcePanel）** 形式的 C4 架构设计工具：
> 用 C4 模型建模，把**需求**与**界面原型**关联到架构元素，提供**追溯矩阵**与**影响分析**，
> 并支持 **AI 辅助**（DeepSeek 云端 + 可选本地 Ollama）。**单二进制自托管**。

- README 概览
- `docs/PRD-需求说明书.md` — 需求说明书
- `docs/Tech-Stack-技术选型.md` — 技术选型与依据
- `models/c4-domain.md` — 领域模型（数据表 / 实体关系 / API 约定）

## 技术栈
- 前端：React 18 + TypeScript + Vite + React Flow（@xyflow/react）+ Zustand
- 后端：Go + GoFrame（gf）+ SQLite（纯 Go 驱动，免 CGO）
- AI：OpenAI-compatible（DeepSeek）+ 可选 Ollama；密钥仅存服务端
- 部署：单二进制（前端静态资源用 `//go:embed` 内置）

## 快速开始
```bash
# 1) 一键构建单二进制（自动 前端构建 → 拷贝嵌入 → Go 编译）
powershell -ExecutionPolicy Bypass -File build.ps1

# 2) 启动（首次运行自动生成 manifest/config/config.yaml 与 ./data 目录）
.\archlens.exe

# 3) 浏览器访问
open http://127.0.0.1:8080
```

## 功能编排（MVP）
1. **项目**：新建/打开/删除。
2. **C4 建模**：切换 Context / Container / Component 三层；拖拽、连线、编辑属性。
3. **需求**：录入或后续导入；把需求挂接到容器元素（需求 → 容器）。
4. **原型**：上传截图或粘贴 URL/Figma，挂接到容器元素（容器 → 界面原型）。
5. **追溯矩阵**：每个元素汇总其关联需求与原型。
6. **影响分析**：改一条需求/元素，自动展开受影响对象。
7. **AI**：从文字生成 C4 初稿、一致性校验（配置 `archlens.ai.*` 后生效）。
8. **导出**：Structurizr DSL / JSON / Markdown（git 友好）。

## 使用指导（快速上手）

> 应用内顶栏有「使用说明」按钮，打开即可看同样内容。

1. **新建项目**：首页输入项目名称 →「新建」→ 自动进入项目。
2. **C4 建模（分三层）**：顶栏切换 `Context(1)` / `Container(2)` / `Component(3)`。
   点 `+ Person / + 软件系统 / + 容器 / + 组件` 添加元素（元素会加到当前层级）。
3. **连线**：从一个元素**右侧的绿色圆点**按住拖到另一个元素即建关系。
4. **编辑 / 删除元素**：点击画布中的元素 → 右侧属性栏改名称/描述/技术栈/标签/层级 →「保存」；
   「删除」删除该元素（会连带清理相关关系与追溯）。
5. **需求**：底部「需求」页签 → 手动输入，或「导入 Markdown / CSV / Excel」。
   在需求卡片的下拉「选择元素」把该需求挂接到某个容器（需求 → 容器）。
6. **界面原型**：底部「原型」页签 → 上传截图或粘贴 URL/Figma 链接 →「选择容器」挂接（容器 → 界面原型）。
7. **追溯矩阵**：「追溯矩阵」页签查看每个元素关联的需求与原型，缺口一目了然。
8. **影响分析**：「影响分析」页签 → 选一个元素/需求 →「分析影响」，列出受影响对象，用于需求变更评估。
9. **AI 辅助**：「AI 与导出」页签 → 粘贴需求「生成 C4 初稿」，识别出草稿后「应用到画布」；
   「代码仓库推断」输入本地代码目录（如 `D:\myapp`）可推断组件与依赖；
   「AI 一致性校验」检查一致性问题。
10. **导入/导出**：同一页签，可「导入 Structurizr DSL」，或导出 Structurizr DSL / JSON / Markdown /
    单文件 HTML 报告 / SVG 图 / PNG。
11. **静态校验**：「静态校验（规则引擎）」检查命名、追溯缺口、层级、孤立元素等，无需联网/AI。

> **AI 配置**：在 `manifest/config/config.yaml` 的 `archlens.ai` 下填 `baseUrl`（如 `https://api.deepseek.com`）、
> `apiKey`、`model`（如 `deepseek-chat`）。未配置时 AI 相关按钮返回「离线 stub」说明。
> 配置后重启进程生效；密钥只存服务端，不进浏览器。

## 系统性测试

用**可重复运行的 API 集成测试**覆盖全部已实现功能，输出 PASS/FAIL 报告，代替手工逐个点。

```bash
# 1) 启动服务（单独终端）
.\archlens.exe

# 2) 运行测试（覆盖 项目/建模/关系/需求/原型/追溯/影响分析/导出/导入/规则校验/部分更新/重复追溯去重）
powershell -ExecutionPolicy Bypass -File run-tests.ps1

# 可选：加 -AI 跑 AI 生成/校验（走 DeepSeek，较慢）
powershell -ExecutionPolicy Bypass -File run-tests.ps1 -AI

# 或直接：cd server && go run ./scripts/apitest -base http://127.0.0.1:8080
```

**前端 UI E2E（Playwright，用系统 Edge）**：
```bash
# 需先启动 .\archlens.exe
cd web
pnpm test:e2e
# 首次或需指定浏览器：npx playwright install msedge（Windows 一般已内置 Edge，自动使用）
```

测试清单见 `docs/TESTING.md`（覆盖标记 + 新增功能的同步约定；**每加一个功能都需同步更新该清单与自动化测试**）。

测试项（`server/scripts/apitest/main.go`）：创建项目、添加软件系统/子容器（嵌套）、带交互/协议的关系、手工+CSV 需求、原型、追溯链接（需求→元素、元素→原型）、**重复追溯被阻止**、追溯矩阵、影响分析、导出 json/dsl/markdown/html、DSL 导入、静态校验规则、元素/关系**部分更新**（验证不会被零值清空）。

## 目录
```
c4-arch-designer/
├── docs/                 # PRD / 技术选型
├── models/               # c4-domain.md 领域模型
├── server/               # Go + GoFrame 后端
│   ├── main.go           # 入口 + 配置自举
│   └── internal/
│       ├── api/          # 路由 + handlers + 静态服务
│       ├── db/           # SQLite 建表
│       ├── store/        # 数据访问
│       ├── dsl/          # Structurizr DSL/JSON/Markdown 导出
│       ├── ai/           # DeepSeek/Ollama 调用
│       ├── model/        # 领域结构体
│       └── web/          # //go:embed 前端产物
├── web/                  # React + Vite 前端
│   └── src/
│       ├── components/C4Canvas.tsx
│       └── pages/       # ProjectsPage / ModelPage
├── build.ps1             # 单二进制构建脚本
└── archlens.exe          # 构建产物
```

## 配置（首次运行自动生成的 manifest/config/config.yaml）
| 项 | 说明 |
|---|---|
| server.address | 监听地址，默认 `:8080` |
| database.default.link | SQLite 连接串 |
| archlens.uploadDir | 原型上传目录 |
| archlens.ai.baseUrl / apiKey / model / budget | AI 配置；留空 key 走离线 stub |

## 说明
- 单实例、无登录（小团队/个人自托管）。
- 数据文件 `./data/archlens.db`；上传 `./data/uploads/`。
- 删除 `manifest/` 与 `data/` 可在下次启动时重建/自举。
