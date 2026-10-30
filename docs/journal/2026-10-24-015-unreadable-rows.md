# 015 §2.0.1 — 精确指出没读懂的动作

- 日期：2026-10-24；分支：`feat/015-sheet-import`；基点：`119298cc1f87f698e350f6866c89868526abc78c`。
- 依据：`CONTEXT.md`、`specs/015-sheet-import-any-template/SPEC.md` §2 / §2.0.1；David 选 A 与本卡给定的后端 wire contract。
- 状态：代码与本地自动验证已交付；浏览器亲验和后端联调未完成，不代表 Opus 验收放行。

## 改动

- `src/api/planImports.ts`：新增必填 `AIExercise.source_cells`；成功周可选 `unreadable`，reason/detail 使用区分联合类型，保留 `PARSE_FAILED`。
- `src/features/plan-editor/import/ImportPlanDialog.tsx`、`unreadable.ts`：逐周独立块、原文从本地 source_cells 取出；按 weekday 或 Day n 定位；中英文原因、已知强度种类或兜底强度/重量。按天与坐标排除不可读处方，避免创建对应自定义动作。
- `FailedWeekCells.tsx`、`import.css`：复用原格子编辑器，准确红色高亮（含空格坐标），首次定位；普通编辑不反复滚动。重新识别只发本周修改后的 cells，替换成功后清除旧跳过决定。
- `strings-import.ts`：新增中英文原因、操作和未处理提示。
- 跳过需确认，可在创建前撤销；任何选中周仍有未处理项时阻止创建。只有不可读动作的周仍保留动作级处理块，全部跳过后沿用空计划门禁。原有整周失败块不变。
- `ImportPlanDialog.test.tsx`：42 → 65 个组件用例；既有 `aiWeeks.test.ts`、`import-dates.test.ts`、`import.test.ts`（均在 `src/features/plan-editor/import/`）仅补 source_cells 夹具。

## 红 → 绿证据

均通过 `ImportPlanDialog.test.tsx` 公共组件 seam，mock API 边界：

1. 本地原文 + 组数不匹配中英文：新增 2 例先失败（未出现定位文案），实现后 2 例通过。
2. INVALID_NUMBER / MISSING_NAME / MISSING_SETS / OTHER 与 Day n：新增 8 例先失败，补原因文案后累计 10 例通过。
3. 精确高亮、自动定位、编辑后仅重发本周与创建门禁：新增 1 例先失败（没有高亮），实现后累计 11 例通过。
4. 跳过确认/取消/撤销、跳过项不进草稿及全不可读周：新增 3 例先失败，实装后组件全量 56 例通过。
5. 补充强度/重量命名和多周独立处理、重识别与换源清除旧决定，组件全量 65 例通过。

## 最终命令

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npx vitest run src/features/plan-editor/import/ImportPlanDialog.test.tsx` | 0 | 65 / 65 |
| `npm test` | 0 | 105 / 105 文件，1104 / 1104 测试 |
| `npx tsc --noEmit` | 0 | 类型检查通过 |
| `npm run build` | 0 | Vite 构建通过；保留现有大 chunk 提醒 |
| `git diff --check` | 0 | 无空白错误 |

原始运行输出：`/tmp/015-unreadable-tests.log`、`/tmp/015-unreadable-build.log`（本机临时证据，不入库）。前期类型检查发现既有测试夹具缺必填 source_cells，已补齐并重新通过。

## 审查与限制

- Standards：独立只读 reviewer，0 项硬规则违反，0 项需返修 smell。
- Spec：独立只读 reviewer，0 项已证实阻断问题。边界：同一天的动作与 unreadable 存在来源坐标交集时会被排除；后端合同未明确多个动作共享同一坐标的语义，当前用例没有这种返回，需要真实联调留意。
- 浏览器：访问已有 `http://localhost:5180/` 被浏览器权限门禁拒绝，未获取观察授权；未绕过限制。没有截图与浏览器亲验证据，后端正在并行实装，本次未声称完成真实联调。
- 未启动、停止或重启任何服务器；未操作 secrets、后端数据、正典台账、旧 `docs/CODEX-JOURNAL.md`。
- 本仓无 `docs/agents/issue-tracker.md`，已提示后续可运行 `/setup-matt-pocock-skills`；本次直接以指定 spec 和本卡为审查依据。

## Git 交付

`uncommitted`。`git add` 退出 128：无法创建 `/Users/david/Projects/apps/meetpr-plan-web/.git/worktrees/meetpr-plan-web-wt-015/index.lock`，报 `Operation not permitted`。Git metadata 在本 worktree 可写范围之外；依本卡条件保留未提交改动，未 commit/push，未修改权限或尝试绕过。

待可写环境提交时沿用本卡指定 message：

```text
feat(plan-web): point coaches at the exact unreadable rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

核心 diff 节选：

```diff
-  const goodWeeks = activeResults.filter((w): w is AIWeek => !('error' in w))
+  const recognizedWeeks = activeResults.filter((w): w is AIWeek => !('error' in w))
+  const goodWeeks = recognizedWeeks.map(readableWeek)
+  const unreadableWeeks = recognizedWeeks.filter(w => w.unreadable?.length)
+  const unresolvedWeeks = unreadableWeeks.filter(w => !skippedUnreadable.has(w.index))
```
