import type { CoreRole } from '@/lib/csmju/session';

/// ผู้เปิดแผงผู้ดูแลได้ — ตรงกับ ADMIN_CORE_ROLES ของ backend (common/auth/core-roles.decorator.ts)
export const ADMIN_CORE_ROLES: CoreRole[] = ['staff', 'admin'];

export const isAdminRole = (role: CoreRole) => ADMIN_CORE_ROLES.includes(role);
