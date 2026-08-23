export default function C4Guide({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 860, maxWidth: '94vw', maxHeight: '88vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>C4 建模指南</h2>
          <button className="ghost" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          用 4 个层次把架构从“远到近”画清楚：<b>上下文 → 容器 → 组件 → 代码</b>。下面是每一层“放什么”、以及常见对象“该放哪”的判定。
        </p>

        <h3 style={{ fontSize: 16 }}>1. 四层是什么、放什么</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>层</th><th>回答的问题</th><th>放什么</th><th>例子</th><th>判定准则</th></tr></thead>
            <tbody>
              <tr><td><b>L1 上下文</b></td><td>这个系统跟谁交互？</td><td>一个<b>软件系统 System</b> + 用户 / 外部系统</td><td>“电商平台”(System)、顾客(Person)、支付网关(外部 System)</td><td>能独立部署、对外提供完整价值 → <b>System</b></td></tr>
              <tr><td><b>L2 容器</b></td><td>系统由哪些可部署/运行的单元组成？</td><td><b>容器 Container</b> = 可独立部署/运行的单元</td><td>Web 前端、后端 API、MySQL、Redis、消息队列、移动 App</td><td>各自跑在独立进程/运行时、可单独部署 → <b>Container</b></td></tr>
              <tr><td><b>L3 组件</b></td><td>每个容器内部有哪些职责模块？</td><td><b>组件 Component</b> = 容器内实现某功能的逻辑模块</td><td>“订单 API”“支付网关”“库存扣减”组件（在订单服务里）</td><td>同一运行时内、逻辑内聚的功能模块 → <b>Component</b></td></tr>
              <tr><td><b>L4 代码</b></td><td>组件如何用代码实现？</td><td>类（可选）</td><td>订单组件下的 Controller/Service 类</td><td>仅更精细表示，可省略</td></tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 16, marginTop: 18 }}>2. 常见对象“该放哪”对照</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>你的对象</th><th>放到哪一层</th></tr></thead>
            <tbody>
              <tr><td>整个产品/系统（如“电商平台”）</td><td><b>System</b>（L1）</td></tr>
              <tr><td>用户、外部第三方服务</td><td>System 上下文里（Person / 外部 System）</td></tr>
              <tr><td>Web 前端、后端 API、移动 App、批处理任务</td><td><b>Container</b>（L2）</td></tr>
              <tr><td>MySQL/Postgres、Redis、Elasticsearch、Kafka / 消息队列</td><td><b>Container</b>（L2）</td></tr>
              <tr><td>程序里的功能模块（订单、支付、库存）</td><td><b>Component</b>（L3）</td></tr>
              <tr><td><b>程序加载的动态库(.so/.dll)、普通库</b></td><td><b>Component</b>（L3）——它属于某个容器的实现；若它作为可独立部署的插件/服务运行，则可能是 <b>Container</b></td></tr>
              <tr><td>组件内部的类</td><td>Code（L4，可选）</td></tr>
              <tr><td>一台服务器 / 虚拟机 / 云资源 / K8s 节点 / 用户设备</td><td><b>Deployment 视图里的 Node（基础设施）</b></td></tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 16, marginTop: 18 }}>3. Deployment 部署视图（对应 c4model.com/diagrams/deployment）</h3>
        <p style={{ fontSize: 13 }}>作用：展示<b>容器运行在哪些基础设施上</b>（物理/虚拟服务器、云端、Kubernetes、用户设备），以及部署环境（开发/预发/生产）。</p>
        <ul style={{ fontSize: 13 }}>
          <li><b>要素</b>：Node（基础设施，如 “AWS EC2”“Kubernetes 集群”“用户手机”）+ Container（落在这些 Node 上）。</li>
          <li>通常<b>不画组件（L3）</b>细节，只画“容器 → 基础设施”。</li>
          <li><b>怎么画</b>：①列出系统有哪些 Container → ②列出它们“跑在哪”（服务器/云/设备）→ ③把 Container 放进对应 Node → ④标注环境与实例数量。</li>
          <li>在本应用里：可把「服务器/云节点」建模为 <b>System</b>，把「容器」作为其内部的 <b>Container</b>，再通过「运行于」关系连接。</li>
        </ul>

        <h3 style={{ fontSize: 16, marginTop: 18 }}>4. 用 C4 做设计 + 追溯的工作流</h3>
        <ul style={{ fontSize: 13 }}>
          <li>先 <b>L1</b> 确定系统与边界 → 再 <b>L2</b> 拆容器 → 再 <b>L3</b> 拆组件。</li>
          <li>每条<b>需求</b>挂到对应 Container（或 Component）；每个<b>界面原型</b>挂到对应 Container，形成正/反向追溯。</li>
          <li>用「影响分析」评估变更影响；用「静态校验」检查追溯缺口、层级完整。</li>
        </ul>

        <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
          依据：C4 模型（Simon Brown）——software system / container / component / code，与 Deployment 图。详见 c4model.com。
        </p>
      </div>
    </div>
  );
}
