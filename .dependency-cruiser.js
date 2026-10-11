/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖 (AI-First 架构核心防线)',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '禁止不可解析的导入依赖',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'core-not-to-adapters',
      severity: 'error',
      comment:
        'Layer 1 核心逻辑层禁止反向依赖 Layer 2 适配层（Node 内建模块由 game-side-not-to-node-builtins 覆盖）',
      from: {
        path: '^src/core',
      },
      to: {
        path: '^src/adapters',
      },
    },
    {
      name: 'game-side-not-to-local-outside-src',
      severity: 'error',
      comment:
        '小游戏侧（src/）只允许依赖 src/ 内部与 npm 包。无头推演/开发工具（tools/）以及任何其他 src/ 之外的本地模块（scripts/、tests/…）都只在你电脑上跑，不得被反向依赖——否则可能把 Node 内建模块拖进 game.js。npm 依赖内部是否用 Node 内建模块，depcruise 因 doNotFollow 看不见，不在本规则覆盖范围。',
      from: {
        path: '^src/',
      },
      to: {
        pathNot: '^src/',
        dependencyTypesNot: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'core',
        ],
      },
    },
    {
      name: 'game-side-not-to-node-builtins',
      severity: 'error',
      comment:
        '小游戏侧（src/）运行在微信小游戏环境，没有 Node 内建模块；dependency-cruiser 会把 node:fs 记成 dependencyType core（剥掉 node: 前缀），因此按类型而非路径匹配',
      from: {
        path: '^src/',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg'],
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
