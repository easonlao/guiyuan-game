/**
 * 归元弈 (Guiyuan) - 动作价值普查报告格式化 (Action Value Census Report)
 *
 * 从 `ActionValueCensus.ts` 拆出的**报告格式化**关注点：只把普查结果渲染成
 * markdown，不测量、不编排。拆出的理由见 code-review finding「Divergent Change」：
 * 测量逻辑与排版格式是两类独立变化原因。
 *
 * 对外导出的 `formatActionSummaryTable` 同时被候选验证报告复用，
 * 保证两处「逐动作类型结论表」逐字节一致（消除重复表格渲染）。
 */

import { WuXing } from '../types/domain.js';
import type { BoardState } from '../types/domain.js';
import { TIAN_GAN_LIST } from '../types/domain.js';
import type {
  ActionTypeCensus,
  ActionValueCensusReport
} from './ActionValueCensus.js';

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function formatBoard(board: BoardState): string {
  return Object.values(WuXing)
    .map(element => `${element}(${board[element].yin},${board[element].yang})`)
    .join(' ');
}

function formatLevel(level: number): string {
  if (level === -1) return '道损 -1';
  if (level === 0) return '虚空 0';
  if (level === 1) return '点亮 1';
  return '加持 2';
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * 「逐动作类型结论」表格（唯一渲染处）。
 *
 * 动作价值普查报告与候选验证报告共用，避免同一张表在两处独立漂移。
 */
export function formatActionSummaryTable(actions: readonly ActionTypeCensus[]): string {
  const lines: string[] = [];
  lines.push('| 动作类型 | 可用 | 观测数 | 最优盘面数 | 被支配盘面数 | 全局被支配 |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const action of actions) {
    lines.push(
      `| ${action.actionType} | ${action.available ? '是' : '否'} | ${action.observationCount} | ${
        action.optimalBoardKeys.length
      } | ${action.dominatedBoardKeys.length} | ${action.globallyDominated ? '**是**' : '否'} |`
    );
  }
  return lines.join('\n');
}

/** 把普查结果格式化为 markdown 报告。 */
export function formatActionValueCensusReport(report: ActionValueCensusReport): string {
  const lines: string[] = [];
  const { valueFunction } = report;

  lines.push('## 动作价值普查');
  lines.push('');
  lines.push('### 价值函数（口径）');
  lines.push('');
  lines.push(`- 名称：\`${valueFunction.name}\``);
  lines.push(`- 定义：${valueFunction.description}`);
  lines.push(`- 输入：${valueFunction.inputs.join(' / ')}`);
  lines.push(`- 计分配置：${valueFunction.pointsConfigName}`);
  lines.push(`- board-only：${valueFunction.isBoardOnly ? '开启（忽略规则得分）' : '关闭'}`);
  lines.push(`- 并列容差 epsilon：${valueFunction.epsilon}`);
  lines.push('');
  lines.push(
    '> 判定「被支配」用的是**动作价值**，不是胜率：同一盘面上某动作价值严格低于另一个可用动作即为该盘面下被支配；'
  );
  lines.push('> 若它在所有可用观测上都被支配，则为全局被支配。并列（价值差 <= epsilon）不算支配。');
  lines.push('');

  lines.push('### 全局被支配动作');
  lines.push('');
  if (report.globallyDominated.length === 0) {
    lines.push('**无**——每个可用动作都在某个被测盘面状态下成为（并列）最优选择。');
  } else {
    lines.push(`**${report.globallyDominated.join('、')}** 在所有可用观测上都被支配。`);
  }
  lines.push('');

  lines.push('### 逐动作类型结论');
  lines.push('');
  lines.push(formatActionSummaryTable(report.actions));
  lines.push('');

  lines.push('### 每个动作成为（并列）最优的盘面条件');
  lines.push('');
  for (const action of report.actions) {
    lines.push(`#### ${action.actionType}`);
    lines.push('');
    if (!action.available) {
      lines.push('- 未在任何被测盘面上观测到可用。');
      lines.push('');
      continue;
    }
    if (action.optimalBoardKeys.length === 0) {
      lines.push('- 未在任何被测盘面上成为最优（在所有可用观测上都被支配）。');
    } else {
      lines.push(`- 最优盘面：${action.optimalBoardKeys.join('、')}`);
      const sample = action.optimalObservations
        .slice(0, 12)
        .map(observation => `${observation.boardKey}@${observation.tianGan}`)
        .join('、');
      const suffix =
        action.optimalObservations.length > 12
          ? ` …（共 ${action.optimalObservations.length} 条）`
          : '';
      lines.push(`- 观测：${sample}${suffix}`);
    }
    if (action.dominatedBoardKeys.length > 0) {
      lines.push(`- 被支配盘面：${action.dominatedBoardKeys.join('、')}`);
    }
    lines.push('');
  }

  lines.push('### 被测盘面覆盖');
  lines.push('');
  lines.push(`阶段：${unique(report.boards.map(board => board.phaseKey)).join(' / ')}`);
  lines.push('');
  lines.push(
    `阶跃条件：${unique(report.boards.map(board => board.stepConditionKey)).join(' / ')}`
  );
  lines.push('');
  lines.push('| 盘面 | 阶段 | 阶跃条件 | 行动方盘面 | 对手盘面 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const board of report.boards) {
    lines.push(
      `| ${board.key} | ${board.phase} | ${board.stepCondition} | \`${formatBoard(
        board.ownBoard
      )}\` | \`${formatBoard(board.opponentBoard)}\` |`
    );
  }
  lines.push('');

  lines.push('### 逐盘面价值排序（按天干）');
  lines.push('');
  for (const board of report.boards) {
    lines.push(`#### ${board.key}（${board.description}）`);
    lines.push('');
    lines.push('| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const tianGan of TIAN_GAN_LIST) {
      const observations = report.observations
        .filter(
          observation =>
            observation.boardKey === board.key && observation.tianGan === tianGan.name
        )
        .sort((a, b) => b.value - a.value);
      for (const observation of observations) {
        lines.push(
          `| ${tianGan.name} | ${observation.actionType} | ${formatNumber(
            observation.value
          )} | ${formatNumber(observation.boardScore)} | ${formatNumber(
            observation.scoreDeltaPoints
          )} | ${formatLevel(observation.suppressionLevels)} | ${formatLevel(
            observation.constructionLevels
          )} | ${observation.isOptimal ? '是' : ''} |`
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
