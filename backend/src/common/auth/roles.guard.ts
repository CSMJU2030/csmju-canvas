import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Layer2Role } from '../../generated/prisma/enums.js';
import { subsystemRoleFor } from '../../auth/role-mapping.js';
import type { RequestWithCoreUser } from './core-user.js';
import { CORE_ROLES_KEY } from './core-roles.decorator.js';
import type { CoreRole } from './core-user.js';
import { LAYER2_ROLES_KEY } from './layer2-roles.decorator.js';

/// ด่านที่สอง "คุณทำสิ่งนี้ได้ไหม" — สิทธิ์ Layer 2 ของ CS Canvas
///
/// แปลงสดจาก core role ใน token ที่ผ่านการตรวจแล้วทุก request ไม่อ่านจากฐาน
/// เพราะ core role เปลี่ยนที่ Core Hub ได้ตลอดเวลา (role-mapping.ts เป็นตารางเดียว)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<Layer2Role[]>(
      LAYER2_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredCore = this.reflector.getAllAndOverride<CoreRole[]>(CORE_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!required?.length && !requiredCore?.length) return true;

    const user = context.switchToHttp().getRequest<RequestWithCoreUser>().coreUser;

    if (!user) throw new ForbiddenException('ไม่พบตัวตนของผู้เรียก');

    if (requiredCore?.length && !requiredCore.includes(user.coreRole)) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ');
    }

    if (!required?.length) return true;

    if (!required.includes(subsystemRoleFor(user.coreRole))) {
      throw new ForbiddenException('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
    }

    return true;
  }
}
