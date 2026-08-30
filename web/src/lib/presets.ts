// 交互内容 / 协议 / 技术栈 预设 + 技术栈→类别 自动推断

export const INTERACTION_PRESETS = [
  '下单', '查询', '调用', '写入', '读取', '创建', '删除', '更新', '发布', '订阅',
  '通知', '同步', '异步', '请求', '响应', '推送', '拉取', '验证', '授权', '登录',
];

export const PROTOCOL_PRESETS = [
  'REST/HTTP', 'HTTPS', 'gRPC', 'GraphQL', 'WebSocket', 'MQ(AMQP)', 'Kafka',
  'RabbitMQ', 'SQL', 'Redis', 'SFTP', 'FTP', 'SMTP', 'Webhook', 'TCP',
];

export const TECH_PRESETS = [
  'Spring Boot', 'Node.js', 'React', 'Vue', 'Angular', 'Go', 'Java', 'Python',
  'MySQL', 'PostgreSQL', 'Redis', 'MongoDB', 'Kafka', 'RabbitMQ', 'Elasticsearch',
  'Docker', 'Kubernetes', 'Nginx', 'Flutter', 'Swift', 'Gin', 'Next.js', 'NestJS', 'Laravel',
];

const CAT_MAP: Array<{ cat: string; keys: string[] }> = [
  { cat: 'database', keys: ['mysql', 'postgres', 'mongo', 'elasticsearch', 'oracle', 'sqlite', 'sql'] },
  { cat: 'cache', keys: ['redis', 'memcached', 'cdn'] },
  { cat: 'queue', keys: ['kafka', 'rabbitmq', 'activemq', 'amqp', 'mq'] },
  { cat: 'frontend', keys: ['react', 'vue', 'angular', 'next', 'flutter', 'swift', 'frontend'] },
  { cat: 'backend', keys: ['spring', 'node', 'go', 'java', 'python', 'gin', 'nest', 'laravel', 'docker', 'kubernetes', 'k8s', 'nginx', 'backend', 'worker'] },
];

// 依据技术栈推断元素「类别」（可选类别前端已选时忽略）
export function categoryForTech(tech: string): string {
  const t = (tech || '').toLowerCase();
  if (!t) return '';
  for (const entry of CAT_MAP) {
    if (entry.keys.some((k) => t.includes(k))) return entry.cat;
  }
  return '';
}
