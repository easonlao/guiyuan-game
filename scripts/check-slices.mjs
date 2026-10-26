// 执行图门禁：`Slice:` 归属与依赖无环（`npm run check:slices`，`check:quick` 一段）。
//
// 为什么要有这道门禁：切片依赖一旦成环，交付整理阶段的重排就无解——而那时才发现，
// 代价是整个整理返工。`CONTRIBUTING.md` §6 把「切片依赖不得成环」写成了规则；规则
// 写在文档里拦不住（本仓库已有两次先例），所以这里把它变成断言。
//
// ── 切片依赖从票据依赖推导，不单独声明 ──
// 票 A 属于切片 S1、票 B 属于切片 S2，且 B 的 `Blocked by:` 里有 A，就得到 S1 → S2。
// 声明两遍就会漂移，所以这里只推导。
//
// ── 强制范围 ──
// 只校验 `spec.md` 票据表里列出的票。历史票面写法不一（`**Status:**` 与 `Status:` 并存、
// `reviews/` 子目录不带字段），**不要求它们补齐**——否则后来的人会去批量改历史文件。
//
// ── 解析口径 ──
// 行首匹配，不做全文正则：票面正文会大段引用规则文本，全文匹配会误判。字段允许被
// `**` 包裹（现有票面两种写法都有）。
//
// ── 附带输出：frontier ──
// 顺手报出「现在能开工的票」，语义见 `docs/agents/issue-tracker.md` 的 Frontier 一条：
// 票面 `Status:` 既不是 `resolved` 也不是 `claimed`，且 `Blocked by:` 里每张票都已
// `resolved`。这是信息输出，不改退出码。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratchDir = resolve(root, '.scratch');

const failures = [];

/** 取某一行的字段值：容忍 `Key:` 与 `**Key:**` 两种写法；不是该字段返回 undefined。 */
function fieldValue(line, key) {
  const match = line.match(new RegExp(`^\\s*\\**${key}:\\**\\s*(.*)$`, 'i'));
  return match ? match[1].trim() : undefined;
}

/** 把一段文本里的票据编号拆出来；`None` 一律当无依赖，不管后面是否跟着括号说明。 */
function parseBlockers(text) {
  if (text === undefined) return undefined;
  // 括号里常写「（01 已 resolved）」，那是说明不是依赖，先切掉。
  const head = text.split(/[（(]/)[0].trim();
  if (/^none$/i.test(head) || head === '') return [];
  return [...head.matchAll(/\d{1,3}/g)].map((match) => String(Number(match[0])).padStart(2, '0'));
}

/** 渲染 frontier 结果：单个 effort 一行；多个 effort 按组输出，每组前缀写 effort 名。 */
function renderFrontier(groups) {
  if (groups.length === 0) {
    return 'check:slices: 没有可开工的票（未完成但被阻塞，或全部已完成）\n';
  }
  if (groups.length === 1) {
    return `check:slices: 可开工：${groups[0].slugs.join('、')}\n`;
  }
  const lines = groups.map(
    (group) => `check:slices: ${group.effort} 可开工：${group.slugs.join('、')}`,
  );
  return `${lines.join('\n')}\n`;
}

/** 读一个 effort 目录：spec 票据表 + 各票面字段。 */
function readEffort(effort) {
  const specPath = join(scratchDir, effort, 'spec.md');
  const spec = readFileSync(specPath, 'utf8');

  // 票据表：表行里第一个单元格是数字编号。切片取该行里第一个 `S<n>` / `none`。
  const declared = new Map();
  for (const line of spec.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.replaceAll('*', '').replaceAll('`', '').trim());
    if (!/^\d{1,3}$/.test(cells[0] ?? '')) continue;
    const sliceCell = cells.find((cell) => /^(S\d+|none)$/i.test(cell));
    declared.set(String(Number(cells[0])).padStart(2, '0'), sliceCell ?? 'none');
  }

  const issuesDir = join(scratchDir, effort, 'issues');
  let files = [];
  if (statSync(issuesDir, { throwIfNoEntry: false })?.isDirectory()) {
    files = readdirSync(issuesDir).filter((name) => name.endsWith('.md'));
  }

  const tickets = new Map();
  for (const name of files) {
    const number = String(Number(name.slice(0, 2))).padStart(2, '0');
    const lines = readFileSync(join(issuesDir, name), 'utf8').split('\n');
    const slice = lines.map((line) => fieldValue(line, 'Slice')).find((v) => v !== undefined);
    const blockedBy = lines
      .map((line) => parseBlockers(fieldValue(line, 'Blocked by')))
      .find((v) => v !== undefined);
    const status = lines.map((line) => fieldValue(line, 'Status')).find((v) => v !== undefined);
    tickets.set(number, {
      file: `issues/${name}`,
      slug: name.replace(/\.md$/, ''),
      slice,
      blockedBy,
      status,
    });
  }

  return { declared, tickets };
}

/** 找一条环路径；返回空数组表示无环。拓扑排序不递归，便于报出环在哪。 */
function findCycle(nodes, edges) {
  const inDegree = new Map(nodes.map((node) => [node, 0]));
  const out = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges) {
    if (!inDegree.has(from) || !inDegree.has(to)) continue;
    out.get(from).push(to);
    inDegree.set(to, inDegree.get(to) + 1);
  }

  const queue = nodes.filter((node) => inDegree.get(node) === 0);
  const settled = new Set(queue);
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of out.get(node)) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0 && !settled.has(next)) {
        settled.add(next);
        queue.push(next);
      }
    }
  }

  const leftover = nodes.filter((node) => !settled.has(node));
  if (leftover.length === 0) return [];

  // 沿环走一圈，把路径打出来。
  const path = [leftover[0]];
  let cursor = leftover[0];
  for (;;) {
    const next = out.get(cursor).find((candidate) => !settled.has(candidate));
    const seen = path.indexOf(next);
    if (seen !== -1) return [...path.slice(seen), next];
    path.push(next);
    cursor = next;
  }
}

const efforts = readdirSync(scratchDir).filter((name) =>
  statSync(join(scratchDir, name), { throwIfNoEntry: false })?.isDirectory(),
);

let ticketCount = 0;
let sliceCount = 0;
const frontierGroups = [];

for (const effort of efforts) {
  if (!statSync(join(scratchDir, effort, 'spec.md'), { throwIfNoEntry: false })?.isFile()) continue;
  const { declared, tickets } = readEffort(effort);
  if (declared.size === 0) continue;

  // ① 归属：spec 表里列了切片，票面必须写同一个值。
  for (const [number, slice] of declared) {
    const ticket = tickets.get(number);
    if (ticket === undefined) {
      failures.push(`[${effort}] 票 ${number} 在 spec 票据表里，但没有 issues/${number}-*.md`);
      continue;
    }
    if (ticket.slice === undefined) {
      failures.push(
        `[${effort}] ${ticket.file} 缺 \`Slice:\` 行——spec 票据表里它属于 ${slice}。\n` +
          `    加一行：Slice: ${slice}`,
      );
    } else if (ticket.slice.toLowerCase() !== slice.toLowerCase()) {
      failures.push(
        `[${effort}] ${ticket.file} 的 Slice 是 ${ticket.slice}，spec 票据表写的是 ${slice}——两处不一致。`,
      );
    }
  }

  // ② 票据依赖：目标必须是同一个 effort 里声明过的票。
  const ticketEdges = [];
  for (const [number, ticket] of tickets) {
    if (!declared.has(number)) continue;
    for (const blocker of ticket.blockedBy ?? []) {
      if (!declared.has(blocker)) {
        failures.push(
          `[${effort}] ${ticket.file} 的 Blocked by 指向票 ${blocker}，但 spec 票据表里没有这张票。`,
        );
        continue;
      }
      ticketEdges.push([blocker, number]);
    }
  }

  const ticketNodes = [...declared.keys()];
  const ticketCycle = findCycle(ticketNodes, ticketEdges);
  if (ticketCycle.length > 0) {
    failures.push(`[${effort}] 票据依赖成环：${ticketCycle.join(' → ')}`);
  }
  ticketCount += ticketNodes.length;

  // ③ 切片依赖：从票据依赖推导。同片内的依赖不算切片依赖。
  const sliceOf = (number) => declared.get(number) ?? 'none';
  const sliceEdges = [];
  for (const [blocker, number] of ticketEdges) {
    const from = sliceOf(blocker);
    const to = sliceOf(number);
    if (from !== to && from !== 'none' && to !== 'none') sliceEdges.push([from, to]);
  }

  const sliceNodes = [...new Set(declared.values())].filter((slice) => slice !== 'none');
  const sliceCycle = findCycle(sliceNodes, sliceEdges);
  if (sliceCycle.length > 0) {
    failures.push(
      `[${effort}] 切片依赖成环：${sliceCycle.join(' → ')}\n` +
        `    环来自票据依赖的推导结果。先调整切片边界或票据归属，再开始实施。`,
    );
  }
  sliceCount += sliceNodes.length;

  // ── frontier：现在能开工的票 ──
  // 判据取自 `docs/agents/issue-tracker.md` 的 Frontier 一条：票面 `Status:` 既不是
  // `resolved` 也不是 `claimed`，且它 `Blocked by:` 里列的每张票都是 `resolved`。
  // 只算 spec 票据表里声明的票（与上面的校验范围一致）。这是信息输出，不改退出码。
  const statusOf = (number) => (tickets.get(number)?.status ?? '').trim().toLowerCase();
  const ready = [];
  for (const number of [...declared.keys()].sort()) {
    const ticket = tickets.get(number);
    if (ticket === undefined) continue; // 缺票面文件已在①里报过，这里不重复报
    const status = statusOf(number);
    if (status === 'resolved' || status === 'claimed') continue;
    const blockers = ticket.blockedBy ?? [];
    if (blockers.every((blocker) => statusOf(blocker) === 'resolved')) ready.push(ticket.slug);
  }
  if (ready.length > 0) frontierGroups.push({ effort, slugs: ready });
}

for (const failure of failures) process.stderr.write(`check:slices: ${failure}\n`);
if (failures.length === 0) {
  process.stdout.write(
    `check:slices: ${ticketCount} 张票、${sliceCount} 个切片，票据与切片依赖均无环。\n`,
  );
}
process.stdout.write(renderFrontier(frontierGroups));
if (failures.length > 0) process.exit(1);
