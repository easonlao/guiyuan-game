/**
 * 开发环境配置
 * 此文件仅用于本地开发，不应在生产环境使用
 *
 * 使用方法：
 * 1. 复制此文件为 dev-config.local.js
 * 2. 在 dev-config.local.js 中填入你的开发环境凭据
 * 3. 在 index.html 中引入 dev-config.local.js（已在 .gitignore 中）
 */

// 开发环境配置示例（请在 local 文件中设置实际值）
const DEV_CONFIG = {
  // 从环境变量获取（推荐）
  SUPABASE_URL: window.SUPABASE_URL || window.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: window.SUPABASE_KEY || window.VITE_SUPABASE_ANON_KEY
};

// 仅在开发环境且未配置时使用 fallback
if (typeof window !== 'undefined' && !window.SUPABASE_CONFIG) {
  // 检查是否有有效的开发配置
  if (DEV_CONFIG.SUPABASE_URL && DEV_CONFIG.SUPABASE_ANON_KEY) {
    window.SUPABASE_CONFIG = {
      SUPABASE_URL: DEV_CONFIG.SUPABASE_URL,
      SUPABASE_ANON_KEY: DEV_CONFIG.SUPABASE_ANON_KEY
    };
    console.log('[DevConfig] Loaded from window globals');
  } else {
    console.warn('[DevConfig] No valid configuration found. Please set environment variables or window globals.');
  }
}
