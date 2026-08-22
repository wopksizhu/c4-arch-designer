# ArchLens 领域模型与接口约定

> 本文定义 ArchLens 的核心数据模型（数据库表字段）、实体关系，以及 REST API 约定。
> 与 `docs/PRD-需求说明书.md`、`docs/Tech-Stack-技术选型.md` 配套。

## 1. 数据库表（SQLite）

### projects
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| name | TEXT | 项目名称 |
| description | TEXT | 简介 |
| created_at / updated_at | DATETIME | 时间戳 |

### elements（C4 元素）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| level | INTEGER | 1=Context, 2=Container, 3=Component |
| type | TEXT | person / softwareSystem / container / component |
| name | TEXT | 名称 |
| description | TEXT | 描述 |
| technology | TEXT | 技术栈 |
| tags | TEXT | 逗号分隔标签 |
| parent_id | INTEGER NULL | 父元素（用于嵌套层级） |
| pos_x / pos_y | REAL | 画布坐标 |

### relationships（元素关系）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| source_id / target_id | INTEGER | 源/目标元素 |
| label | TEXT | 关系说明 |
| description / technology | TEXT | 详情 |
| level | INTEGER | 属于哪个视图层级 |

### requirements（需求）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| code | TEXT | 编号 |
| title | TEXT | 标题 |
| description | TEXT | 描述 |
| priority | TEXT | high/medium/low |
| status | TEXT | draft/active/done |
| source | TEXT | manual/markdown/excel |
| tags | TEXT | 标签 |

### prototypes（界面原型）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| name | TEXT | 名称 |
| type | TEXT | image / url |
| uri | TEXT | 图片路径或 URL |
| notes | TEXT | 备注 |

### trace_links（追溯链接，核心）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| from_type / from_id | TEXT/INTEGER | 来源（requirement/element/prototype） |
| to_type / to_id | TEXT/INTEGER | 目标 |
| link_type | TEXT | satisfies / shows 等 |
| created_at | DATETIME | 时间戳 |

### ai_suggestions
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 主键 |
| project_id | INTEGER | 所属项目 |
| type | TEXT | generate / validate |
| payload | TEXT | JSON 内容 |
| status | TEXT | pending/accepted/rejected |

## 2. 实体关系
```
Project 1 ── N  Element (level/type/parent)
Project 1 ── N  Relationship (element→element)
Project 1 ── N  Requirement
Project 1 ── N  Prototype
Project 1 ── N  TraceLink (关于某种节点类型)

追溯语义：
  Requirement ──satisfies──> Element（需求实现了某个容器/组件）
  Element ──shows──> Prototype（某个容器/组件对应界面原型）
```
追溯矩阵 = 对每个 Element 汇总它关联的需求与原型。
影响分析 = 从任意节点沿 trace_links 与 element 关系做 BFS 扩散。

## 3. REST API 约定
- 基址：`/api`
- 响应信封：`{ "code": 0, "message": "", "data": ... }`（成功 code=0；`export` 接口直接返回文本）
- 认证：MVP 单实例，无登录。

### 项目
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /projects | 项目列表 |
| POST | /projects | 新建 |
| GET | /projects/{id} | 详情 |
| PUT | /projects/{id} | 更新 |
| DELETE | /projects/{id} | 删除（级联） |

### 元素 / 关系
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /projects/{id}/elements | 元素列表/新建 |
| GET/POST | /projects/{id}/relationships | 关系列表/新建 |
| PUT/DELETE | /elements/{id} | 元素更新/删除 |
| PUT/DELETE | /relationships/{id} | 关系更新/删除 |

### 需求 / 原型
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /projects/{id}/requirements | 需求列表/新建 |
| PUT/DELETE | /requirements/{id} | 需求更新/删除 |
| GET/POST | /projects/{id}/prototypes | 原型列表/新建（multipart 上传图片） |
| PUT/DELETE | /prototypes/{id} | 原型更新/删除 |

### 追溯 / 分析
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /projects/{id}/tracelinks | 追溯链接列表/新建 |
| DELETE | /tracelinks/{id} | 删除链接 |
| GET | /projects/{id}/matrix | 追溯矩阵 |
| GET | /projects/{id}/impact?type=&oid= | 影响分析 |

### 导出 / AI
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /projects/{id}/export?format=dsl\|json\|markdown | 导出（文本） |
| POST | /projects/{id}/ai/generate | 文字→C4 初稿 |
| POST | /projects/{id}/ai/validate | 一致性校验 |

## 4. 数据存储
- 主库：`data/archlens.db`（SQLite，纯 Go 驱动，免 CGO）。
- 上传：`data/uploads/`，通过 `/uploads/{file}` 对外提供。
- 前端静态资源：构建产物 `web/dist` → `server/internal/web/dist`，Go `//go:embed` 打进单二进制。

## 5. 交互流程
```
新建项目 → 建模(画 C4, L1/L2/L3) → 录入/导入需求 → 需求挂接到容器
→ 上传/链接原型 → 原型挂接到容器 → 追溯矩阵核对 → 需求变更 → 影响分析 → 导出(DSL/JSON/MD)
```
