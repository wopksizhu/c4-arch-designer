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
