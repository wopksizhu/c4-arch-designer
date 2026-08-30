# ArchLens 测试清单

> 本文是 ArchLens 的**主测试清单**，所有已实现功能都登记在案，并标明其自动化覆盖情况。
> **约定：每新增/修改一个功能，必须在此清单新增/更新对应条目，并同步补齐「后端 API」与「前端 UI」自动化测试。**

## 测试层次

| 层次 | 工具 | 入口 | 说明 |
|---|---|---|---|
| L1 后端 API 集成 | Go（`server/scripts/apitest`） | `run-tests.ps1` | 直接打 API，逐项断言，输出 PASS/FAIL |
| L2 前端 UI E2E | Playwright（`web/e2e`） | `web` 下 `pnpm test:e2e` | 真实浏览器驱动 UI，覆盖用户操作流 |
| L3 手动体验 | 浏览器 | — | 视觉/交互/边界情况，需人手 |

## 功能清单（Feature × 自动化覆盖）

覆盖标记：✅ 已自动化 / ⬜ 待补 / ➖ 不适用（需人工/外部）

| 编号 | 功能 | L1 后端 | L2 前端 | L3 手动 | 状态 |
|---|---|---|---|---|---|
| F01 | 项目管理：创建/列表/详情/更新/删除 | ✅ | ✅ | ➖ | 通过 |
| F02 | C4 建模：添加软件系统/子容器（嵌套 parentId） | ✅ | ✅ | ➖ | 通过 |
| F03 | C4 建模：添加组件/Person | ⬜ | ⬜ | ⬜ | 待补 |
| F04 | 关系：带交互内容/通信协议 | ✅ | ⬜ | ⬜ | 后端通过，前端待补 |
| F05 | 元素/关系**部分更新**（不移除未传字段） | ✅ | ✅ | ➖ | 通过（本次回归重点） |
| F06 | 需求：手工新增 | ✅ | ✅ | ➖ | 通过 |
| F07 | 需求：Markdown 导入 | ⬜ | ⬜ | ⬜ | 待补 |
| F08 | 需求：CSV 导入 | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F09 | 需求：Excel 导入 | ⬜ | ⬜ | ⬜ | 待补 |
| F10 | 原型：URL/上传 | ✅ | ⬜ | ⬜ | 后端通过，前端待补 |
| F11 | 追溯链接：需求→元素、元素→原型 | ✅ | ✅ | ➖ | 通过 |
| F12 | **重复追溯去重**（同目标二次挂接被阻止） | ✅ | ✅ | ➖ | 通过（本次新增） |
| F13 | 追溯矩阵 | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F14 | 影响分析 | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F15 | 导出：Structurizr DSL / JSON / Markdown / HTML | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F16 | 导出：SVG / PNG（前端画布） | ⬜ | ⬜ | ⬜ | 待补 |
| F17 | DSL 导入（单行/多行/嵌套/关系/协议） | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F18 | 静态校验规则引擎（命名/追溯缺口/层级/孤立/完整性） | ✅ | ⬜ | ➖ | 后端通过，前端待补 |
| F19 | AI：文字→结构化 C4 草稿 + 采纳到画布 | ✅(-ai) | ⬜ | ⬜ | 后端通过，前端待补 |
| F20 | AI：选中某块 → 生成其内部详细结构 | ⬜ | ⬜ | ⬜ | 待补 |
| F21 | AI：一致性校验（问题列表） | ✅(-ai) | ⬜ | ⬜ | 后端通过 |
| F22 | AI：代码仓库推断 | ⬜ | ⬜ | ⬜ | 待补 |
| F23 | C4 层层钻取导航（Context→系统→容器→组件，面包屑） | ⬜ | ✅ | ➖ | 前端通过 |
| F24 | 左侧导航布局（画布/需求/原型/追溯/影响/AI 作为页面） | ➖ | ⬜ | ⬜ | 待补 |
| F25 | 「未追溯需求」汇总 | ⬜ | ⬜ | ⬜ | 待补 |
| F26 | AI 密钥配置（manifest/config archlens.ai.*） | ➖ | ➖ | ✅ | 已配置 |
| F27 | C4 设计指南（系统/容器/组件判定、Deployment 部署视图、常见对象映射） | ➖ | ⬜ | ✅ | 已实现（顶栏「C4 指南」+ 画布空态引导） |
| F28 | 元素删除**级联**（删父级后代一并删除）+ 各类删除二次确认 | ✅ | ⬜ | ✅ | 后端已测（删父删子），前端确认提示 |
| F29 | 钻取时保留父级与外部关联元素（上下文/外部节点，便于查看交互） | ➖ | ⬜ | ✅ | 已实现 |
| F30 | 画布「元素结构树」（System→Container→Component 层级列表，可点选/进入） | ➖ | ⬜ | ✅ | 已实现 |
| F31 | 连接线**贝塞尔弧线** + 接触点按两节点相对方向动态选边（上/下/左/右，不再固定在单点） | ➖ | ✅ | ✅ | 前端通过（边渲染 `type:'bezier'` + `sourceHandle/targetHandle`，节点四周 Handles），视觉需人手 |
| F32 | 子元素**拖拽约束在父框内**：向左/上不可越界，向右/下时父框自适应放大；**父元素拖动时其后代子元素整体跟随平移**（收起父级→拖动→展开，子元素仍在框内） | ➖ | ✅ | ✅ | 前端通过（`clampChildPos` + `computeExtent` + `collectDescendants`/`commitElement` 子树平移），新增 E2E 包含性用例与父拖子随用例 |
| F33 | 展开/收起**最小化布局**（仅消除重叠、不全盘重排）；布局为**展示层、不写库**，收起即还原到元素基准位置 | ➖ | ✅ | ✅ | 前端通过（`minimalLayout` + `overridePositions`），新增 E2E 包含性用例；基准坐标经多次展开/收起保持不变 |
| F34 | **关系感知的分层自动布局**（Sugiyama）：按连线关系排层、层内重心排序减少交叉、处理父子包含、子元素仍落在父框内 | ➖ | ✅ | ✅ | 前端通过（`lib/layout.ts` `graphLayout`，用于「自动布局」按钮并落库），新增 E2E：自动布局后子元素仍在框内、同层节点不重叠 |
| F35 | **连接线多消息 + 层级关联 + 方向**：一条线可承载多条消息（`messages` JSON，每条含 name/protocol/发送/接收）；折叠时逐条**堆叠标签**显示并带箭头(markerEnd)，展开后按 sender/receiver 落到叶子；**标红只在「系统级」端点生效**（system 有子级且消息未映射到其叶子后代才红，**容器↔容器等同类关系保持灰色**）；**折叠聚合**：连了容器/组件的关系在端点折叠时聚合到最近可见父级(系统)，路由端点(sender/receiver)也取**最近可见祖先**（避免连到被折叠隐藏的节点），两端聚合到同一父级(内部交互)时跳过不画自环；表单为层级选择器可选到叶子；源句柄(右/下)+目标句柄(左/上)不重叠保证拖拽方向=起点→终点；双向/并行边弧形分开 | ➖ | ✅ | ✅ | 前端（`lib/edges.ts` `buildEdges/parseMessages` + 自定义边 `messageEdge` 堆叠标签 + EdgeInspector 层级选择 + `C4Canvas` 箭头/双向弧/句柄）、后端 `messages` 列；E2E：未落到叶子的系统消息显示为红、拖拽方向 起点→终点、折叠聚合容器级关系+递归标红；后端 API 21 项通过 |
| F36 | **元素分类画板 + category 字段**：右键「添加子元素」弹出分类面板（数据库/Web前端/服务端/消息队列/缓存/基础容器/组件等，带图标），按「类别+技术栈+名称」创建，**新元素位置跟随右键处画布坐标**（钳制在父框内）；元素新增 `category` 字段 | ✅ | ✅ | ✅ | 后端 `elements.category` 列（`db.go` 迁移+部分更新）、前端 `lib/palette.ts` + `C4Canvas` 右键画板（`screenToFlowPosition` 取位置）+ `addElementCategorized`；E2E：右键画板添加 MySQL |
| F37 | **交互/协议/技术栈预设 + 自动推断类别**：交互内容、协议、技术栈改为 **ComboInput（可选可输入 + 输入过滤）**，预设如 下单/调用/发事件、REST/HTTP/gRPC/Kafka、Spring Boot/MySQL/Redis/Kafka…，可自定义；选 MySQL 自动推断 category=database；右键菜单**钳制在视口不超屏 + 点空白关闭**，下拉统一风格 | ➖ | ✅ | ✅ | 前端 `lib/presets.ts` + 组件 `ComboInput.tsx` + `C4Canvas` 菜单钳制/关闭 + `index.css` select 统一样式；E2E：技术栈输入 MySQL → 类别自动 database 且落库 |
| F38 | **节点图标/配色 + 关系线型/配色 + 图例**：元素按 category/技术显示图标与强调色（数据库/缓存/队列/前端/后端/组件/外部/用户/移动端）；关系**异步=虚线**、按协议着色（SQL→青/gRPC→紫/Kafka→橙/REST→蓝/Redis→红）；顶栏「图例」面板展示类别与线型 | ➖ | ✅ | ✅ | 前端 `lib/visual.ts`（`metaFor/protocolColor/isAsync/CATEGORY_LIST`）+ `C4Canvas` 节点/边渲染 + `ModelPage` 图例；视觉经演示项目验证（⚙后端/👤用户/青色SQL实线/橙色Kafka虚线） |
| F39 | **画布导出 PNG/SVG + 元素搜索**：画布左上角「导出 PNG/SVG」（html-to-image 按全部节点边界临时 fit 后捕获）；顶栏搜索框，按名称/技术栈/类别匹配并**淡化非匹配**节点 | ➖ | ✅ | ✅ | 前端 `C4Canvas`(ExportControls+searchTerm)、`ModelPage`(搜索框)、`html-to-image`；E2E：导出 PNG/SVG 触发下载、搜索 Order 后 PaySys 淡化 |
| F40 | **复制/粘贴元素（含子元素与内部关系） + 布局方向切换**：右键节点「复制元素」→ 顶栏「粘贴」或右键「粘贴为子元素/粘贴元素」生成副本（保持父子层级与内部关系，整体偏移）；自动布局支持**上下/左右方向切换** | ➖ | ✅ | ✅ | 前端 `ModelPage`(clipboard/copySubtree/pasteSubtree + layoutDir) + `C4Canvas`(复制/粘贴菜单项) + `lib/layout.ts`(direction)；E2E：复制粘贴生成 Sys+Web 副本、布局方向切换正常 |
| F40b | **框体自由连线**：自定义连接系统——抓住节点框体空白/边缘拖到另一框体即建连（`c4-connect` 热区 + `elementFromPoint` 命中 + 临时连线预览）；**标题文本=拖动节点、点框体=选中、按钮=操作**，互不冲突 | ➖ | ✅ | ✅ | 前端 `C4Canvas`(conn 状态/onConnMove/onConnUp/startConn + 临时连线) + `C4Node`(`.c4-connect` onMouseDown) + `index.css`(z-index 分层)；E2E：抓框体空白连 A→B |
| F41 | **校验汇总面板 + 层级导航面包屑**：顶栏「校验(N)」列出缺失(红)的消息（源→目标 + 消息名），点击定位；选中元素显示「根→…→当前」面包屑，点击祖先可导航 | ➖ | ✅ | ✅ | 前端 `ModelPage`(validation memo + breadcrumb)；E2E：缺失消息在面板列出、面包屑点击祖先导航 |
| F42 | **撤销/重做**：顶栏「↶撤销/↷重做」+ Ctrl+Z / Ctrl+Y（Shift+Z）；覆盖**新增元素/关系**（撤销删除、重做重建）、**移动/自动布局**（位置快照恢复）与**删除元素**（撤销重建子树、重做再删，**右键菜单与属性面板删除均接入**），历史栈上限 50 | ➖ | ✅ | ✅ | 前端 `ModelPage`(history/buildBundle/materializeBundle/doUndo/doRedo + keydown + deleteElementWithHistory) + `C4Canvas`(onNodeDragStart)；E2E：新增容器撤销重建、删除元素撤销重建重做再删 |
| F43 | **自定义分组（替代泳道）**：泳道分组因意义不明已**移除**，待后期实现自定义分组功能 | ➖ | ⬜ | ⬜ | 已移除（`lib/lanes.ts`/泳道节点/按钮删除），后期做自定义分组 |
| F44 | **P3-1/2/3/4：循环检测 + 未追溯提醒 + 常用系统模板 + 元素悬浮信息**：校验面板新增**循环依赖(橙)**区（Tarjan SCC 找出强连通分量并高亮环边为橙色虚线）；顶栏「未追溯(N)」列出未关联元素的需求、点击跳需求页；「模板」下拉一键生成订单/支付/认证系统骨架；hover 元素显示 kind/技术栈/描述/关系数 | ➖ | ✅ | ✅ | 前端 `lib/cycles.ts`(Tarjan) + `lib/templates.ts` + `ModelPage`(cycleInfo/applyTemplate/untracedReqs) + `C4Canvas`(cycleEdges 高亮 + relCount + `.c4-tip`)；E2E：模板生成、未追溯列出、悬浮显示、A→B→C→A 检出环 |
| F45 | **P3-1/5 多视图 + 循环检测**：画布「多视图」= 命名位置快照（同模型不同布局）：新建/切换/存为视图（`views` 表 + payload JSON），默认「主视图」向后兼容；循环依赖高亮环边 | ✅ | ✅ | ✅ | 后端 `views` 表 + store/API(listViews/createView/get/update/delete + 项目默认主视图)；前端 `api.ts`(views) + `ModelPage`(视图选择器/保存/新建/切换)；E2E：新建视图后 views=2、保存 payload 含 elemId |
| F46 | **霓虹/暗色主题**：顶栏「霓虹」开关（默认浅色）→ 暗色点阵画布 + 发光胶囊节点（图标块 + 名称/类别/描述三行 + 主色霓虹描边 + 发光圆形句柄）+ 渐变发光连线（源→目标节点主色渐变，无箭头）+ 暗色标签 | ➖ | ✅ | ✅ | 前端 `C4Canvas`(theme 传节点/边 + MessageEdge 渐变/发光 + NodeHandles 着色 + `.rf-neon`) + `ModelPage`(theme 状态/切换) + `index.css`(.c4-neon/.rf-neon)；视觉经演示验证（Anthropic↔PostgreSQL 发光连线） |

## 新增功能时的同步流程（必做）
1. 在本清单加一行：编号、功能、三层覆盖标记。
2. **后端功能** → 在 `server/scripts/apitest/main.go` 加对应断言。
3. **前端功能** → 在 `web/e2e/` 加对应 Playwright 用例。
4. 跑 `run-tests.ps1`（后端）+ `web` 下 `pnpm test:e2e`（前端），确认通过。

## 运行命令
```powershell
# 后端 API 集成测试
powershell -ExecutionPolicy Bypass -File run-tests.ps1
# 前端 UI E2E（需先启动 .\archlens.exe，且已 npx playwright install chromium）
cd web; pnpm test:e2e
```
