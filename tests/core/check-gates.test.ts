import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

function runSlices(eol: string, statuses: readonly string[], missingSlice = false) {
  const fixture = mkdtempSync(join(tmpdir(), 'guiyuan-slices-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    mkdirSync(join(fixture, '.scratch/example/issues'), { recursive: true });
    copyFileSync(join(root, 'scripts/check-slices.mjs'), join(fixture, 'scripts/check-slices.mjs'));
    writeFileSync(
      join(fixture, '.scratch/example/spec.md'),
      ['| 01 | S1 |', '| 02 | S2 |', '| 03 | S2 |', '| 04 | S2 |'].join(eol),
    );
    statuses.forEach((status, index) => {
      const number = String(index + 1).padStart(2, '0');
      writeFileSync(
        join(fixture, `.scratch/example/issues/${number}-ticket.md`),
        [
          `**Status:** ${status}`,
          `Blocked by: ${index === 0 ? 'None' : '01'}`,
          ...(missingSlice && index === 0 ? [] : [`Slice: S${index === 0 ? 1 : 2}`]),
          '',
        ].join(eol),
      );
    });
    return spawnSync(process.execPath, [join(fixture, 'scripts/check-slices.mjs')], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('check:slices CLI', () => {
  it.each(['\n', '\r\n'])('读取字段并排除已完成或已领取票，换行符 %j', (eol) => {
    const result = runSlices(eol, [
      'resolved（2026-10-25 完成）',
      'open',
      'claimed (处理中)',
      'resolved',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('可开工：02-ticket\n');
  });

  it('仍拦截缺失的 Slice 字段', () => {
    const result = runSlices('\r\n', ['resolved', 'open', 'claimed', 'open'], true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('01-ticket.md 缺 `Slice:` 行');
    expect(result.stderr).not.toContain('02-ticket.md 缺');
  });
});

function runFacts(cliSource: string) {
  const fixture = mkdtempSync(join(tmpdir(), 'guiyuan-npm-'));
  try {
    const cli = join(fixture, 'npm-cli.cjs');
    writeFileSync(cli, cliSource);
    return spawnSync(process.execPath, [join(root, 'scripts/check-facts.mjs')], {
      encoding: 'utf8',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_execpath'),
        ),
        npm_execpath: cli,
      },
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('check:facts CLI', () => {
  it('通过当前 npm CLI 核对精确版本', () => {
    const result = runFacts("process.stdout.write('11.13.0\\n');");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('12 条不变式成立');
  });

  it('仍拒绝不匹配的 npm 版本', () => {
    const result = runFacts("process.stdout.write('11.19.1\\n');");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('本机 npm 是 11.19.1');
    expect(result.stderr).toContain('npm@11.13.0');
  });

  it('启动失败只报告无法核对，不再报告空版本不匹配', () => {
    const result = runFacts('process.exit(1);');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('跑不了 `npm -v`');
    expect(result.stderr).not.toContain('本机 npm 是');
  });
});
