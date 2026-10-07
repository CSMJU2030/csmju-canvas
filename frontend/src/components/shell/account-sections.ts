import { Accessibility, AppWindow, HardDrive, KeyRound, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';

/// หัวข้อของหน้าบัญชี — ตรงกับแท็บในภาพบรีฟ (เมนูบัญชีของ Canva)
export const ACCOUNT_SECTIONS = [
  { key: 'profile', label: 'ประวัติของคุณ', icon: UserRound },
  { key: 'security', label: 'บัญชีและความปลอดภัย', icon: KeyRound },
  { key: 'accessibility', label: 'การเข้าถึง', icon: Accessibility },
  { key: 'messages', label: 'การตั้งค่าข้อความ', icon: Mail },
  { key: 'privacy', label: 'การควบคุมความเป็นส่วนตัว', icon: ShieldCheck },
  { key: 'storage', label: 'ข้อมูลและพื้นที่จัดเก็บ', icon: HardDrive },
  { key: 'team', label: 'ทีมของคุณ', icon: UsersRound },
  { key: 'apps', label: 'แอปของคุณ', icon: AppWindow },
] as const;

export type AccountSectionKey = (typeof ACCOUNT_SECTIONS)[number]['key'];
