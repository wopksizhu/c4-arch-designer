const STEPS: { title: string; body: string }[] = [
  { title: '1. 新建 / 打开项目', body: '在首页输入项目名称并点“新建”，或点已有项目“打开”。' },
  { title: '2. 用 C4 建模（分三层）', body: '顶栏切换 Context(1)/Container(2)/Component(3)。点 “+ Person / + 软件系统 / + 容器 / + 组件” 添加元素。' },
  { title: '3. 连线与编辑属性', body: '从一个元素右侧的绿色圆点拖到另一个元素即可连线。点击元素，在右侧属性栏改名称/描述/技术栈/标签/层级，点“保存”；点“删除”可删除。' },
  { title: '4. 录入 / 导入需求', body: '底部“需求”页签 → 手动输入；或“导入 Markdown / CSV / Excel”。把每条需求通过下拉“选择元素”挂接到对应容器。' },
  { title: '5. 挂接界面原型', body: '底部“原型”页签 → 上传截图或粘贴 URL(如 Figma)，再“选择容器”把原型挂到对应容器。' },
  { title: '6. 看追溯与影响', body: '“追溯矩阵”页签看每个元素关联的需求/原型；“影响分析”页签选中一个对象即可列出受影响清单，用于需求变更评估。' },
  { title: '7. AI 辅助', body: '“AI 与导出”页签 → 粘贴需求点“生成 C4 初稿”，识别出草稿后点“应用到画布”；或“代码仓库推断”输入本地代码目录。' },
  { title: '8. 导出与互通', body: '同一页签可导出 Structurizr DSL / JSON / Markdown / 单文件 HTML 报告 / SVG 图 / PNG；也可“导入 Structurizr DSL”，与 Structurizr 生态互通。' },
  { title: '9. 一致性校验', body: '点“静态校验（规则引擎）”，检查命名、追溯缺口、层级、孤立元素等问题（无需联网/AI）。' },
];

export default function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 720, maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>ArchLens 使用说明</h2>
          <button onClick={onClose}>关闭</button>
        </div>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          {STEPS.map((s) => (
            <li key={s.title} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{s.body}</div>
            </li>
          ))}
        </ol>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          提示：AI 生成/校验/代码推断需在配置文件 <code>manifest/config/config.yaml</code> 的 <code>archlens.ai</code> 下填写
          baseUrl 与 apiKey；未配置时 AI 相关按钮会返回“离线 stub”说明。
        </div>
      </div>
    </div>
  );
}
