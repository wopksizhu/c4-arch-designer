import type {
  AiDraft,
  Element,
  ImpactResult,
  Project,
  Prototype,
  Relationship,
  Requirement,
  TraceLink,
  TraceMatrixRow,
} from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (res.status >= 400 || (body && body.code !== undefined && body.code !== 0)) {
    throw new Error(body?.message || ('HTTP ' + res.status));
  }
  return (body?.data !== undefined ? body.data : body) as T;
}

// ---- projects ----
export const listProjects = () => request<Project[]>('/projects');
export const createProject = (p: { name: string; description?: string }) =>
  request<Project>('/projects', { method: 'POST', body: JSON.stringify(p) });
export const updateProject = (id: number, p: Partial<Project>) =>
  request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(p) });
export const deleteProject = (id: number) =>
  request<unknown>(`/projects/${id}`, { method: 'DELETE' });

// ---- elements ----
export const listElements = (pid: number) => request<Element[]>(`/projects/${pid}/elements`);
export const createElement = (pid: number, e: Partial<Element>) =>
  request<Element>(`/projects/${pid}/elements`, { method: 'POST', body: JSON.stringify(e) });
export const updateElement = (id: number, e: Partial<Element>) =>
  request<Element>(`/elements/${id}`, { method: 'PUT', body: JSON.stringify(e) });
export const deleteElement = (id: number) => request<unknown>(`/elements/${id}`, { method: 'DELETE' });

// ---- relationships ----
export const listRelationships = (pid: number) => request<Relationship[]>(`/projects/${pid}/relationships`);
export const createRelationship = (pid: number, r: Partial<Relationship>) =>
  request<Relationship>(`/projects/${pid}/relationships`, { method: 'POST', body: JSON.stringify(r) });
export const deleteRelationship = (id: number) => request<unknown>(`/relationships/${id}`, { method: 'DELETE' });

// ---- requirements ----
export const listRequirements = (pid: number) => request<Requirement[]>(`/projects/${pid}/requirements`);
export const createRequirement = (pid: number, r: Partial<Requirement>) =>
  request<Requirement>(`/projects/${pid}/requirements`, { method: 'POST', body: JSON.stringify(r) });
export const updateRequirement = (id: number, r: Partial<Requirement>) =>
  request<Requirement>(`/requirements/${id}`, { method: 'PUT', body: JSON.stringify(r) });
export const deleteRequirement = (id: number) => request<unknown>(`/requirements/${id}`, { method: 'DELETE' });

// ---- prototypes ----
export const listPrototypes = (pid: number) => request<Prototype[]>(`/projects/${pid}/prototypes`);

export async function uploadPrototype(pid: number, form: FormData): Promise<Prototype> {
  const res = await fetch(`${BASE}/projects/${pid}/prototypes`, { method: 'POST', body: form });
  const body = await res.json();
  if (res.status >= 400 || (body && body.code !== 0)) throw new Error(body?.message || 'upload failed');
  return body.data as Prototype;
}
export const createPrototypeLink = (pid: number, p: Partial<Prototype>) =>
  request<Prototype>(`/projects/${pid}/prototypes`, { method: 'POST', body: JSON.stringify(p) });
export const deletePrototype = (id: number) => request<unknown>(`/prototypes/${id}`, { method: 'DELETE' });

// ---- trace links ----
export const listTraceLinks = (pid: number) => request<TraceLink[]>(`/projects/${pid}/tracelinks`);
export const createTraceLink = (pid: number, t: Partial<TraceLink>) =>
  request<number>(`/projects/${pid}/tracelinks`, { method: 'POST', body: JSON.stringify(t) });
export const deleteTraceLink = (id: number) => request<unknown>(`/tracelinks/${id}`, { method: 'DELETE' });

// ---- analysis ----
export const getMatrix = (pid: number) => request<TraceMatrixRow[]>(`/projects/${pid}/matrix`);
export const getImpact = (pid: number, type: string, oid: number) =>
  request<ImpactResult>(`/projects/${pid}/impact?type=${type}&oid=${oid}`);
export const exportProject = (pid: number, format: string) =>
  fetch(`${BASE}/projects/${pid}/export?format=${format}`).then((r) => r.text());

// ---- ai ----
export const aiGenerate = (pid: number, text: string) =>
  request<{ text: string; draft: AiDraft | null }>(`/projects/${pid}/ai/generate`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
export const aiApply = (pid: number, draft: AiDraft) =>
  request<{ elements: number; relationships: number }>(`/projects/${pid}/ai/apply`, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
export const aiValidate = (pid: number, mode = 'all') =>
  request<{ text: string; issues: string[] }>(`/projects/${pid}/ai/validate`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
export const aiCode = (pid: number, dir: string) =>
  request<{ text: string; draft: AiDraft | null; summary: string }>(`/projects/${pid}/ai/code`, {
    method: 'POST',
    body: JSON.stringify({ dir }),
  });
export const aiEnrich = (pid: number, payload: { name: string; description: string; type: string }) =>
  request<{ text: string }>(`/projects/${pid}/ai/enrich`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ---- requirements import ----
export const importRequirements = (pid: number, content: string) =>
  request<{ created: number }>(`/projects/${pid}/requirements/import`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

// ---- dsl / csv / rules ----
export const importDSL = (pid: number, content: string) =>
  request<{ elements: number; relationships: number }>(`/projects/${pid}/import/dsl`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
export const importRequirementsCsv = (pid: number, content: string) =>
  request<{ created: number }>(`/projects/${pid}/requirements/import/csv`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
export const rulesValidate = (pid: number) =>
  request<{ type: string; message: string }[]>(`/projects/${pid}/validate/rules`);

export async function importRequirementsExcel(pid: number, file: File): Promise<{ created: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/projects/${pid}/requirements/import/excel`, { method: 'POST', body: fd });
  const body = await res.json();
  if (res.status >= 400 || (body && body.code !== 0)) throw new Error(body?.message || '导入失败');
  return body.data as { created: number };
}
