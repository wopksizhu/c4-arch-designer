# ArchLens 技术选型（已确定）

> 结论：**Web 应用（B/S）**，前端 **React + TypeScript + Vite + React Flow + Structurizr DSL**，
> 后端 **Go + Gin**，数据库 **SQLite**，AI 走云端 DeepSeek + 可选本地 Ollama。
> 产品形态与体验对标 **IcePanel**。

| 文档版本 | v1.0（已确定） |
|---|---|
| 状态 | 已拍板 |
| 关联文档 | `docs/PRD-需求说明书.md` §13.3 |

---

## 1. 决策摘要

| 层 | 选型 | 关键理由 |
|---|---|---|
| 产品形态 | Web 应用（B/S） | 与成熟 C4 工具一致；出原型最快；后续易做协作/分享 |
| 前端 | React 18 + TypeScript + Vite | C4 建模领域事实标准；生态最大 |
| 画布/图渲染 | React Flow（@xyflow/react）自定义 C4 节点 | 自定义编辑器、互动性最强，等同 IcePanel 体验 |
| C4 互操作模型 | Structurizr DSL / JSON | 文本、git 友好；官方 C4 标准；可导出 PNG/PlantUML/Mermaid |
| 后端框架 | **GoFrame（gf）** | 国产主流全栈 Go 框架：HTTP/ORM/配置/校验/命令一体化；易于产出单二进制 |
| AI | OpenAI-compatible（DeepSeek）+ 可选 Ollama | 复用现有配置；由后端发起，密钥不进前端 |
| 数据库 | SQLite（GoFrame 的 gdb 驱动） | 嵌入式零配置；可平滑迁移 PostgreSQL |
| 文件/图片 | 服务端磁盘目录 | 存储上传原型 |
| 部署形态 | 单机/小团队**自托管单二进制** | 前端静态资源用 `//go:embed` 打进二进制，零额外依赖 |
| 工程化 | pnpm + Vite + ESLint/Prettier + Vitest + Playwright；Go: golangci-lint + go test | 现代、可测试 |

---

## 2. 调研依据（为什么大多 C4 工具用 Web/React）

- **Structurizr**（官方，Simon Brown）：服务端 (JVM) + JS/SVG 浏览器端渲染；核心理念为「diagrams as code」（DSL 纯文本）。参考 [Scripting API](https://www.structurizr.com/help/scripting)、[Features](https://docs.structurizr.com/features)。
- **IcePanel**：商业 C4 SaaS（YC 公司），Web 单页应用，主打交互式缩放图。我们**对标其形态**。参考 [Modelling docs](https://docs.icepanel.io/core-features/modelling)。
- **@c4mjs/c4-react**（C4ModelJS）：React 的 C4 图渲染库，[npm](https://www.npmjs.com/package/@c4mjs/c4-react)。
- **c4_modelizer** / **ArchVault**：开源 C4 可视化编辑器，均用 React。参考 [c4_modelizer](https://github.com/archivisio/c4_modelizer)、[ArchVault](https://github.com/rubentalstra/ArchVault)。
- **C4-PlantUML**：文本→图（PlantUML）。

> 结论：C4 建模领域已收敛到「Web + SVG/Canvas + React + 文本 DSL」这条主干。**没有主流 C4 工具用游戏引擎（Godot）做界面**。

---

## 3. 关键权衡说明

### 3.1 为什么 Web-first 而不是 Godot / Electron
- **Godot**：渲染/动效最佳、自带 `[GraphEdit](https://docs.godotengine.org/en/stable/classes/class_graphedit.html)` 节点编辑器。但需求表格、追溯矩阵、Figma/URL 嵌入、文件对话框、与 Structurizr DSL 生态互通等**生产力 UI 需全手写**（Control 节点“游戏化”），开发量大、生态孤立。本产品核心价值是**追溯**而非画面，故不用于 MVP。
- **Electron/Tauri**：把 Web 前端套壳成桌面安装，作为**免费后手**保留；MVP 先以 Web 形态开发，后续可一键打包。

### 3.2 存储：服务端 SQLite + git 友好的导出/导入
- 主库用 SQLite（嵌入式、零配置、易备份），满足 Web 端快速追溯查询。
- 同时提供 **Structurizr DSL / JSON / Markdown 导出与导入**，让“架构资产仍可 git 版本管理”，兼顾之前「本地优先 + git 友好」的诉求。

### 3.3 单二进制部署
- 前端静态资源用 Go 标准库 `//go:embed` 打进二进制，GoFrame 的 HTTP server 直接提供；SQLite 数据文件与上传目录落在用户指定路径（默认 `./data`）。
- **一键启动**：`./archlens` 即启动，无独立前端服务器、无外部依赖，适合单机/小团队自托管。

### 3.4 AI 密钥安全
- API Key 只存服务端（加密），AI 调用由 Go 后端发起，**不进浏览器**；无 key 时降级为离线 stub。

---

## 4. 建议的项目结构（骨架）
```
archlens/
├── server/                 # Go 后端 (GoFrame/gf)
│   ├── main.go             # 入口；//go:embed web/dist 静态资源
│   ├── internal/
│   │   ├── api/            # http handlers（路由器/中间件/鉴权）
│   │   ├── domain/         # C4/需求/原型/追溯 领域模型
│   │   ├── model/          # 数据结构定义（entity + 请求/响应）
│   │   ├── store/          # 数据访问（gdb）
│   │   ├── dsl/            # Structurizr DSL 解析/生成
│   │   ├── ai/             # DeepSeek/Ollama 调用
│   │   └── storage/        # 图片上传
│   ├── data/               # archlens.db + uploads
│   ├── manifest/           # GoFrame 配置（config.yaml 等）
│   └── go.mod
├── web/                    # 前端 (React+TS+Vite)
│   ├── src/
│   │   ├── canvas/         # React Flow C4 节点/连线/自动布局
│   │   ├── features/       # 需求/原型/追溯/影响分析
│   │   ├── api/            # 对接 Go 后端
│   │   └── components/
│   └── package.json
├── docs/                   # PRD / 技术选型 / 领域模型
└── README.md
```

---

## 5. 已敲定 / 待后续确认
**已敲定：**
1. 部署形态：**单机/小团队自托管单二进制**（不做多租户/帐号体系，MVP 单实例）。
2. **本期不接入 lens-agent**（读屏/读图识别界面能力，MVP 不做）。
3. Code(Level 4) 层 **MVP 仅占位**（不支持代码级建模）。

**待后续确认：**
1. Jira/Confluence 只读同步是否列入 V2。
