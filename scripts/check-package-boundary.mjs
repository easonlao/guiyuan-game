// 包边界的自检：断言「没声明就解析不到」这条**机制**本身还成立。
//
// 为什么不靠 depcruise 枚举边：depcruise 是枚举式（先想到「A 不许依赖 B」才拦得住）。这里的
// 声明式边界靠 `.npmrc` 的 `install-strategy=linked` 在解析期成立——一旦 npm 默认布局变回
// hoisted（或有人手写 `--install-strategy=hoisted`），`src/` 就能解析到 `@guiyuan/devtools`，
// 而现有任何门禁都不会红。本脚本用 TypeScript 的解析器直接问两句：
//   - 从 `src/` 解析 `@guiyuan/devtools` —— 必须**失败**（没声明就不能用）；
//   - 从 `tools/` 解析 `@guiyuan/game/…` —— 必须**成功**（声明过的边照常可用）。
// 它不枚举任何具体边，只钉住机制；机制一旦被安装布局改动破坏，这条就红。
//
// 工程方案见 `docs/HLD.md` §4.2，安装布局的工具链适配与自检见 `docs/MUTATION-TESTING.md` §9。
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const options = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};

function resolveFrom(importer, specifier) {
  const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule;
  return resolved?.resolvedFileName;
}

// 探针文件不需要真实存在：`resolveModuleName` 只用它所在目录的包边界做解析。
const undeclaredCrossRegion = resolveFrom(`${root}src/__boundary_probe__.ts`, '@guiyuan/devtools');
const declaredCrossRegion = resolveFrom(
  `${root}tools/__boundary_probe__.ts`,
  '@guiyuan/game/core/types/domain.js',
);

const failures = [];
if (undeclaredCrossRegion !== undefined) {
  failures.push(
    `src/ 解析到了未声明的 @guiyuan/devtools（${undeclaredCrossRegion}）——` +
      '声明式包边界失效，检查 .npmrc 的 install-strategy=linked 是否仍生效。',
  );
}
if (declaredCrossRegion === undefined) {
  failures.push('tools/ 解析不到已声明的 @guiyuan/game/core/types/domain.js——包链接坏了。');
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:boundary: ${failure}\n`);
  process.exit(1);
}
process.stdout.write('check:boundary: 包边界成立（src/ 到 @guiyuan/devtools 解析不到）。\n');
