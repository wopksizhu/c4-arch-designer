export interface PaletteItem {
  id: string;
  label: string;
  icon: string;
  type: string; // container | component | person
  category: string;
  tech: string;
  name: string;
}
export interface PaletteGroup {
  title: string;
  items: PaletteItem[];
}

// 系统(level1) 的子元素：各类容器
const CONTAINER_GROUPS: PaletteGroup[] = [
  {
    title: '数据库',
    items: [
      { id: 'db-mysql', label: 'MySQL', icon: '🗄', type: 'container', category: 'database', tech: 'MySQL', name: 'MySQL' },
      { id: 'db-postgres', label: 'PostgreSQL', icon: '🗄', type: 'container', category: 'database', tech: 'PostgreSQL', name: 'PostgreSQL' },
      { id: 'db-redis', label: 'Redis', icon: '⚡', type: 'container', category: 'cache', tech: 'Redis', name: 'Redis' },
      { id: 'db-mongo', label: 'MongoDB', icon: '🍃', type: 'container', category: 'database', tech: 'MongoDB', name: 'MongoDB' },
      { id: 'db-es', label: 'Elasticsearch', icon: '🔎', type: 'container', category: 'database', tech: 'Elasticsearch', name: 'Elasticsearch' },
    ],
  },
  {
    title: 'Web 前端',
    items: [
      { id: 'fe-web', label: 'Web 前端', icon: '🌐', type: 'container', category: 'frontend', tech: 'React', name: 'Web 前端' },
      { id: 'fe-app', label: '移动端', icon: '📱', type: 'container', category: 'mobile', tech: 'Flutter', name: '移动端' },
    ],
  },
  {
    title: '服务端',
    items: [
      { id: 'be-api', label: 'API 服务', icon: '⚙', type: 'container', category: 'backend', tech: 'Spring Boot', name: 'API 服务' },
      { id: 'be-service', label: '后端服务', icon: '🛠', type: 'container', category: 'backend', tech: 'Node.js', name: '后端服务' },
      { id: 'be-worker', label: '异步任务', icon: '🔁', type: 'container', category: 'backend', tech: 'Worker', name: '异步任务' },
    ],
  },
  {
    title: '消息队列',
    items: [
      { id: 'mq-kafka', label: 'Kafka', icon: '📨', type: 'container', category: 'queue', tech: 'Kafka', name: 'Kafka' },
      { id: 'mq-rabbit', label: 'RabbitMQ', icon: '🐇', type: 'container', category: 'queue', tech: 'RabbitMQ', name: 'RabbitMQ' },
      { id: 'mq-topic', label: '消息队列', icon: '📨', type: 'container', category: 'queue', tech: 'MQ', name: '消息队列' },
    ],
  },
  {
    title: '缓存',
    items: [
      { id: 'cache-redis', label: 'Redis 缓存', icon: '⚡', type: 'container', category: 'cache', tech: 'Redis', name: 'Redis 缓存' },
      { id: 'cache-cdn', label: 'CDN', icon: '🚀', type: 'container', category: 'cache', tech: 'CDN', name: 'CDN' },
    ],
  },
  {
    title: '基础',
    items: [
      { id: 'container', label: '空容器', icon: '📦', type: 'container', category: 'container', tech: '', name: 'New Container' },
    ],
  },
];

// 容器(level>=2) 的子元素：技术组件
const COMPONENT_GROUPS: PaletteGroup[] = [
  {
    title: '组件',
    items: [
      { id: 'comp-module', label: '业务模块', icon: '🧩', type: 'component', category: 'component', tech: '', name: 'New Component' },
      { id: 'comp-adapter', label: '适配器', icon: '🔌', type: 'component', category: 'component', tech: '', name: '适配器' },
      { id: 'comp-data', label: '数据访问', icon: '🗄', type: 'component', category: 'component', tech: '', name: '数据访问' },
      { id: 'comp-third', label: '第三方 SDK', icon: '🧰', type: 'component', category: 'component', tech: '', name: '第三方 SDK' },
      { id: 'comp-util', label: '工具类', icon: '🛠', type: 'component', category: 'component', tech: '', name: '工具类' },
    ],
  },
];

export function paletteFor(parent: { level: number; type: string }): PaletteGroup[] {
  if (parent.level >= 2) return COMPONENT_GROUPS;
  return CONTAINER_GROUPS;
}
