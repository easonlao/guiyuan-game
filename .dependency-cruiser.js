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
      comment: 'Layer 1 核心逻辑层禁止反向依赖 Layer 2 适配层或外部运行时',
      from: {
        path: '^src/core'
      },
      to: {
        path: '^src/adapters'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg']
    },
    tsConfig: {
      fileName: 'tsconfig.json'
    }
  }
};
