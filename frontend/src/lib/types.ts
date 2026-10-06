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
  linkAccess: 'NONE' | 'VIEW' | 'COMMENT' | 'EDIT';
  access: 'OWNER' | 'EDIT' | 'COMMENT' | 'VIEW';
  /// เจ้าของติดดาวไว้
  starred?: boolean;
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

/// ชุดแบรนด์ (GET /api/v1/brand-kits)
export interface BrandKit {
  id: string;
  name: string;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  logos: { id: string; fileName: string; mimeType: string; contentUrl: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentUrl: string;
  /// โฟลเดอร์รูป (แผงอัปโหลด) · null = ไม่อยู่ในโฟลเดอร์
  folderId: string | null;
  trashedAt: string | null;
  /// ภาพที่นำเข้าจากเว็บอื่น: หน้า/ลิงก์ต้นฉบับ และแหล่ง (unsplash pexels … other) · null = ไฟล์จากเครื่อง
  sourceUrl?: string | null;
  sourceSite?: string | null;
  createdAt: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
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
  kind: 'DESIGN_TRASHED' | 'TEMPLATE_USED' | 'COMMENT_ADDED' | 'REPORT_UPDATED' | 'CONTENT_MODERATED' | 'DESIGN_RESTORED';
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
