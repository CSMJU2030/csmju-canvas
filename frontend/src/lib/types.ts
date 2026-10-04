/// รูปร่างของข้อมูลที่หลังบ้านส่งมา — ตรงกับ schema ใน backend/openapi.json
import type { DesignDocument } from './editor/types';

export interface DesignSummary {
  id: string;
  title: string;
  designType: string;
  width: number;
  height: number;
  thumbnail: string | null;
  folderId: string | null;
  sourceTemplateId: string | null;
  trashedAt: string | null;
  tags: string[];
  linkAccess: 'NONE' | 'VIEW' | 'EDIT';
  access: 'OWNER' | 'EDIT' | 'VIEW';
  createdAt: string;
  updatedAt: string;
}

export interface Design extends DesignSummary {
  document: DesignDocument;
}

export interface TemplateSummary {
  id: string;
  title: string;
  description: string;
  designType: string;
  category: string;
  width: number;
  height: number;
  thumbnail: string | null;
  usageCount: number;
  isBuiltIn: boolean;
  isMine: boolean;
  isStarred: boolean;
  /// จำนวนหน้า (มีในรายการเทมเพลต)
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Template extends TemplateSummary {
  document: DesignDocument;
}

export interface Asset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentUrl: string;
  trashedAt: string | null;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  designCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  kind: 'DESIGN_TRASHED' | 'TEMPLATE_USED';
  title: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Preference {
  aboutMe: string;
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  notifyTemplateUsed: boolean;
  notifyTrash: boolean;
  theme: 'LIGHT' | 'DARK' | 'SYSTEM';
  updatedAt: string;
}

export interface Quota {
  usedBytes: number;
  quotaBytes: number;
  assetCount: number;
  designCount: number;
  trashedDesignCount: number;
}

export interface DesignTypeUsage {
  designType: string;
  count: number;
  lastUsedAt: string;
}
