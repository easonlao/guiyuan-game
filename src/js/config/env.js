/**
 * 环境配置加载工具
 * 支持开发环境（window对象）和生产环境（环境变量）
 */
export const loadEnvConfig = () => {
  // Vite生产环境
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

    if (url && key) {
      return {
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: key
      };
    }
  }

  // 开发环境（从全局对象获取）
  if (window.SUPABASE_CONFIG) {
    return window.SUPABASE_CONFIG;
  }

  // Fallback（用于向后兼容，生产环境应移除）
  console.warn('[Config] Using fallback Supabase credentials. Please set environment variables.');
  return {
    SUPABASE_URL: 'https://solyclwajueobffjucjb.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbHljbHdhanVlb2JmZmp1Y2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MDg0NjgsImV4cCI6MjA4NDk4NDQ2OH0.-DhJrL0nttPnkRxvuHHlURFl2lxyiFQb4POCJezpZrE'
  };
};
