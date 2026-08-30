# ArchLens 改动日志

> 本文档记录每次对 ArchLens 的修改，用于**多台电脑同步**协作。每次改动请：
> 1. 在本文件顶部「最新」一行简要写明 日期 + 改了什么；
> 2. `git add -A && git commit -m "<说明>"`；
> 3. `git push`（多台电脑见文末「同步操作」）。

## 最新

### 2026-xx-xx 霓虹为唯一主题 + 固定宽度框体 + 图标拖动/其余连线
- **只保留霓虹**：去掉浅色主题与「霓虹」切换按钮（`theme` 恒为 neon）。
- **框体固定宽度**（230px）：标题/类别/描述过长时用**省略号**截断。
- **交互更舒适**：只有**图标块可拖动框体**（grab 光标 + z-index 提升），框体其它任意处都能**拉出连线**（crosshair）；点击框体选中、按钮可点。
- **特殊边保持实心色**：缺失(红)/循环(橙)/选中(蓝)在霓虹下用**实心描边**（不加渐变），普通边才用源→目标渐变。
- 相关：`web/src/components/C4Canvas.tsx`、`web/src/pages/ModelPage.tsx`、`web/src/index.css`、`web/e2e/model.spec.ts`。
- **连线端点完全自适应**：每一条线按其「源→目标」相对方向，在源/目标框体边界上求出独立的进/出点（`computeExit` 求边界交点+比例），不再固定到 4 个点。
- **同一对框体的多条线各自独立、分散**：`pairFan` 给每条线 `fanIndex/count`，沿边错开锚点比例并交替曲率，多条线一上一下散开、不重叠。
- **压平曲率**：`getBezierPath` 传入自适应 `curvature`（普通 0.18 / 弧形 0.3 / 并行 0.22/0.42），消除线“翘起来”的问题。
- **框体自由连线**：抓住节点框体空白拖到另一个框体即建连（自定义连接系统 `elementFromPoint` 命中 + 临时连线预览）；标题=拖动节点、点框体=选中、按钮可点。
- **去固定端点**：节点不再显示 4 个固定连接点（句柄隐藏），连线直接从框体边界流出。
- 相关：`web/src/components/C4Canvas.tsx`、`web/src/index.css`。

### 2026-xx-xx 霓虹/暗色主题
- 顶栏「霓虹」开关（默认浅色）：暗色点阵画布 + 发光胶囊节点（图标块/名称/类别/描述 + 主色霓虹描边 + 发光句柄）+ 渐变发光连线（源→目标节点主色渐变）+ 暗色标签。
- 相关：`web/src/components/C4Canvas.tsx`、`web/src/pages/ModelPage.tsx`、`web/src/index.css`。

### 后端：多视图 + 视图数据
- 新增 `views` 表 + store/API（`listViews/createView/get/update/delete` + 项目自动建「主视图」）；「多视图」= 命名位置快照（新建/保存/切换视图）。
- `server/internal/db/db.go`、`model/model.go`、`store/store.go`、`api/handlers.go`、`api/api.go`；前端 `web/src/api.ts`、`ModelPage.tsx`。

### P3 进阶
- 循环依赖检测（Tarjan SCC + 校验面板「循环依赖(橙)」+ 环边橙色虚线高亮）。
- 未追溯需求提醒（顶栏「未追溯(N)」+ 面板 + 点击跳需求）。
- 常用系统模板（订单/支付/认证一键生成骨架）。
- 元素悬浮信息（hover 显示 kind/技术栈/描述/关系数）。

### 撤销/重做
- 新增/移动/删除/布局的撤销重做（历史栈上限 50 + Ctrl+Z/Y）；删除撤销（重建子树、重做再删）；属性面板与右键删除均接入。

### 画布搜索 / 复制粘贴 / 校验面板 / 面包屑 / 布局方向 / 导出
- 搜索框（Esc/✕ 清除、非匹配淡化）；复制/粘贴元素（含子元素与内部关系）；校验面板（缺失红线 + 循环依赖）；层级面包屑；布局方向切换（上下/左右）；画布导出 PNG/SVG。
- 图例面板（元素类别 + 关系线型 + 协议配色）。

### P0 基础
- 右键分类画板添加元素（数据库/Web前端/服务端/消息队列/缓存/基础容器/组件，带图标）；交互/协议/技术栈预设（ComboInput 可选可输入 + 自动推断类别）；元素 `category` 字段；技术栈预设自动推断（MySQL→database）。

---

## 同步操作（多台电脑）
1. **本机克隆**：`git clone https://github.com/<你的用户名>/<仓库名>.git`（如已在用：`git pull` 先同步）。
2. **改完**：`git add -A && git commit -m "说明" && git push`。
3. **换电脑**：`git pull`。
4. **每次改动**：在本文件顶部加一条「日期 + 改了什么」，随代码一起提交。

> 注意：`data/`（SQLite 数据）、`node_modules/`、`dist/`、`archlens.exe`、`web/playwright-report`、`web/test-results` 均不入库（见 `.gitignore`），各电脑各自生成。
