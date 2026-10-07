import { SetMetadata } from '@nestjs/common';
import type { CoreRole } from './core-user.js';

export const CORE_ROLES_KEY = 'csmju:coreRoles';

/// จำกัด route ตาม core role ใน token (แบบ csmju-nexus) — ใช้กับงานผู้ดูแลระบบ
/// เช่น @CoreRoles(...ADMIN_CORE_ROLES) · ตรวจโดย RolesGuard ตัวเดียวกับ @Layer2Roles
export const CoreRoles = (...roles: CoreRole[]) => SetMetadata(CORE_ROLES_KEY, roles);

/// ผู้เปิดแผงผู้ดูแลได้: เจ้าหน้าที่ (บัญชีเจ้าของระบบของทีมเป็น staff) และผู้ดูแลองค์กร · อาจารย์ไม่รวม
export const ADMIN_CORE_ROLES: CoreRole[] = ['staff', 'admin'];
