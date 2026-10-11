// Stryker 插件加载器在 `.npmrc` 的 `install-strategy=linked` 布局下找不到 vitest runner。
//
// 原因：`@stryker-mutator/core` 默认按 `@stryker-mutator/*` 从**自己所在的目录**（linked 布局下是
// `node_modules/.store/…/core/node_modules/@stryker-mutator`）枚举插件，那里只有 core 自己的依赖，
// 没有作为根 devDependency 安装的 vitest-runner（hoisted 布局下两者平铺在一起，所以以前没事）。
// 本文件从仓库根解析一次裸包名，把插件的两个导出原样再导出，供 `stryker.config.json` 的
// `appendPlugins` 以**稳定路径**加载——不写死 vitest-runner 内部的 `dist/src/index.js`。
export * from '@stryker-mutator/vitest-runner';
