import { join } from "node:path";
import type { NextConfig } from "next";

/// รากของ workspace — ใช้ทั้งกับ Turbopack และการตามรอยไฟล์ตอน build
const WORKSPACE_ROOT = join(__dirname, "..");

/// หน้าบ้านเป็นประตูเดียวของระบบ (connect-core-hub.md ข้อ 1):
/// `/api/*` และ `/auth/login` `/auth/callback` `/auth/logout` ถูก rewrite ไปที่หลังบ้าน
/// Callback URL ในทะเบียน Core Hub จึงเป็น http://localhost:3207/auth/callback
///
/// rewrite ถูกคำนวณตอน `next build` — build สำหรับ deploy ต้องตั้ง BACKEND_URL ตอน build
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:4207").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  devIndicators: { position: "top-right" },

  /// คืนเป็น array = afterFiles · ห้ามมี proxy.ts มาดัก /auth/* เพราะ proxy ทำงานก่อน rewrite
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/auth/login", destination: `${BACKEND_URL}/auth/login` },
      { source: "/auth/callback", destination: `${BACKEND_URL}/auth/callback` },
      { source: "/auth/logout", destination: `${BACKEND_URL}/auth/logout` },
    ];
  },

  turbopack: { root: WORKSPACE_ROOT },

  // ไม่ให้ next dev เขียน AGENTS.md/CLAUDE.md ลงใน frontend/
  agentRules: false,
};

export default nextConfig;
