import { categoryForTech } from './presets';

export interface CategoryMeta {
  icon: string;
  color: string;
  label: string;
}

const META: Record<string, CategoryMeta> = {
  database: { icon: '🗄', color: '#0ea5e9', label: '数据库' },
  cache: { icon: '⚡', color: '#f59e0b', label: '缓存' },
  queue: { icon: '📨', color: '#8b5cf6', label: '消息队列' },
  frontend: { icon: '🌐', color: '#10b981', label: '前端' },
  backend: { icon: '⚙', color: '#2563eb', label: '后端' },
  component: { icon: '🧩', color: '#d97706', label: '组件' },
  external: { icon: '🌍', color: '#475569', label: '外部' },
  user: { icon: '👤', color: '#9333ea', label: '用户' },
  mobile: { icon: '📱', color: '#06b6d4', label: '移动端' },
  container: { icon: '📦', color: '#1d4ed8', label: '容器' },
};

// 依据元素的 category（其次按 type/技术栈）返回图标与配色
export function metaFor(e: { category?: string; type?: string; technology?: string }): CategoryMeta {
  const cat = inferCategory(e.category, e.technology);
  if (cat && META[cat]) return META[cat];
  if (e.type === 'person') return META.user;
  if (e.type === 'container') return META.container;
  return { icon: '🏢', color: '#0f766e', label: '系统' };
}

// category 为空时按技术栈推断；still empty 返回 ''
export function inferCategory(category: string | undefined, tech: string): string {
  if (category) return category;
  const c = categoryForTech(tech);
  if (c) return c;
  return '';
}

// 供图例使用：所有类别
export const CATEGORY_LIST: Array<{ key: string; icon: string; color: string; label: string }> = Object.entries(META).map(([key, v]) => ({ key, ...v }));

// 按协议给关系着色（未命中返回 ''）
export function protocolColor(protocol: string | undefined): string {
  const p = (protocol || '').toLowerCase();
  if (!p) return '';
  if (p.includes('grpc')) return '#8b5cf6';
  if (p.includes('kafka') || p.includes('mq') || p.includes('amqp') || p.includes('rabbit')) return '#f59e0b';
  if (p.includes('sql')) return '#0d9488';
  if (p.includes('redis')) return '#dc2626';
  if (p.includes('rest') || p.includes('http') || p.includes('graphql') || p.includes('websocket')) return '#2563eb';
  return '';
}

// 交互/协议是否异步（异步用虚线 + 空心箭头）
export function isAsync(interaction: string | undefined, protocol: string | undefined): boolean {
  const t = `${interaction || ''} ${protocol || ''}`;
  return /async|异步|event|事件|publish|发布|subscribe|订阅|通知|notify|推送/i.test(t);
}
