# 归元弈-五行游戏

基于中国传统五行文化的游戏化可视化项目，包含玩家对战、AI对战模式，使用太极曲线和五行色彩系统的美学游戏

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

## 📋 技术栈

- **语言**: 原生 JavaScript (ES6+)
- **框架**: Vite 5.x
- **构建工具**: Vite + Terser
- **后端**: Supabase (PostgreSQL + 实时订阅)
- **部署**: Vercel

## ✨ 特性

- 五行相生相克游戏机制
- 玩家对战 (PvP) - 通过 Supabase 实时同步
- 玩家 vs AI 天道模式
- 天道运转演示 (AIvAI)
- 五行视觉系统与太极动画效果
- 排行榜系统
- 断线重连支持

## 📁 项目结构

```
归元弈-五行游戏/
├── src/                     # 源代码
│   ├── main.js              # 应用入口
│   ├── style.css            # 全局样式
│   ├── css/                 # 样式模块
│   ├── js/                  # JavaScript 模块
│   │   ├── bus/             # 事件总线
│   │   ├── config/          # 游戏配置
│   │   ├── logic/           # 游戏逻辑
│   │   ├── state/           # 状态管理
│   │   ├── ui/              # UI 渲染
│   │   ├── interaction/     # 用户交互
│   │   ├── network/         # 网络同步
│   │   ├── types/           # 类型定义
│   │   └── utils/           # 工具函数
│   └── types/               # 类型定义
├── public/                  # 静态资源
├── supabase/                # Supabase 配置
│   └── migrations/          # 数据库迁移
├── RULES/                   # 项目治理文档
│   ├── PROJECT_BRAIN.md     # 项目大脑导航
│   ├── REQUIREMENTS.md      # 需求文档
│   ├── DESIGN.md            # 设计文档
│   ├── ARCHITECTURE.md      # 架构文档
│   ├── ROADMAP.md           # 任务规划
│   ├── TEST_PLAN.md         # 测试计划
│   └── CHANGELOG.md         # 变更日志
├── .keeper/                 # Project-Brain 数据
├── .claude/                 # Claude Code 配置
├── CLAUDE.md                # 项目开发指南
├── package.json             # 项目配置
├── vite.config.js           # Vite 配置
└── vercel.json              # 部署配置
```

## 🧠 Project-Brain 治理框架

本项目使用 Project-Brain 治理框架进行项目管理。详细信息请查看 `RULES/` 目录下的文档。

## 📄 许可证

MIT

---

**创建日期**: 2026-01-30
**Project-Brain 版本**: V1.1.2
