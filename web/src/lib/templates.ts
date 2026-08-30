export interface Template {
  id: string;
  name: string;
  desc: string;
  category: string;
  tech: string;
  containers: Array<{ name: string; category: string; tech: string }>;
}

export const TEMPLATES: Template[] = [
  {
    id: 'order',
    name: '订单系统',
    desc: 'Web 前端 + API 服务 + 消息队列 + 订单库',
    category: 'backend',
    tech: 'Spring Boot',
    containers: [
      { name: 'Web 前端', category: 'frontend', tech: 'React' },
      { name: 'API 服务', category: 'backend', tech: 'Spring Boot' },
      { name: '消息队列', category: 'queue', tech: 'Kafka' },
      { name: '订单库', category: 'database', tech: 'MySQL' },
    ],
  },
  {
    id: 'pay',
    name: '支付系统',
    desc: '支付网关 + 风控服务 + 账户库 + 对账任务',
    category: 'backend',
    tech: 'Go',
    containers: [
      { name: '支付网关', category: 'backend', tech: 'Go' },
      { name: '风控服务', category: 'backend', tech: 'Node.js' },
      { name: '账户库', category: 'database', tech: 'PostgreSQL' },
      { name: '对账任务', category: 'backend', tech: 'Worker' },
    ],
  },
  {
    id: 'auth',
    name: '用户认证',
    desc: '认证服务 + 会话缓存 + 用户库',
    category: 'backend',
    tech: 'Node.js',
    containers: [
      { name: '认证服务', category: 'backend', tech: 'Node.js' },
      { name: '会话缓存', category: 'cache', tech: 'Redis' },
      { name: '用户库', category: 'database', tech: 'MySQL' },
    ],
  },
];
