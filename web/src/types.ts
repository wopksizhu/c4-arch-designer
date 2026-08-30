export type ElementType = 'person' | 'softwareSystem' | 'container' | 'component';

export interface Project {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Element {
  id: number;
  projectId: number;
  level: number; // 1 context, 2 container, 3 component
  type: ElementType;
  name: string;
  description: string;
  technology: string;
  tags: string;
  category?: string; // 细分类别：database/queue/cache/frontend/backend/mobile/external/user...
  parentId: number | null;
  posX: number;
  posY: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipMessage {
  name: string;
  protocol: string;
  senderId?: number | null;
  receiverId?: number | null;
}

export interface Relationship {
  id: number;
  projectId: number;
  sourceId: number;
  targetId: number;
  label: string;
  interaction: string;
  protocol: string;
  description: string;
  technology: string;
  level: number;
  sourceContainerId?: number | null;
  targetContainerId?: number | null;
  messages?: string; // JSON 数组字符串
  createdAt: string;
  updatedAt: string;
}

export interface Requirement {
  id: number;
  projectId: number;
  code: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  source: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prototype {
  id: number;
  projectId: number;
  name: string;
  type: 'image' | 'url';
  uri: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TraceLink {
  id: number;
  projectId: number;
  fromType: 'requirement' | 'element' | 'prototype';
  fromId: number;
  toType: 'requirement' | 'element' | 'prototype';
  toId: number;
  linkType: string;
  createdAt: string;
}

export interface View {
  id: number;
  projectId: number;
  name: string;
  payload: string; // JSON: [{"elemId":1,"x":0,"y":0}, ...]
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TraceMatrixRow {
  elementId: number;
  elementName: string;
  elementType: string;
  level: number;
  requirementIds: number[];
  requirementText: string;
  prototypeIds: number[];
  prototypeText: string;
}

export interface ImpactNode {
  type: string;
  id: number;
  name: string;
}

export interface ImpactResult {
  root: ImpactNode;
  affected: ImpactNode[];
  chains: ImpactNode[][];
}

export interface AiDraftElement {
  type: string;
  name: string;
  description: string;
  technology: string;
  level: number;
  parent: string;
}

export interface AiDraftRel {
  source: string;
  target: string;
  label: string;
}

export interface AiDraft {
  elements: AiDraftElement[];
  relationships: AiDraftRel[];
}
