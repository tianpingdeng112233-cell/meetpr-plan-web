# 015 卡 B · 网页：多 block 选择（§2.0.5 + 屏幕稿 ㉓）

先读仓根 `CONTEXT.md`（Block）、本目录 `SPEC.md` §2.0.5 与文末屏幕稿 ⑯、㉓（2026-10-29 定稿）、后端契约 `MeetPR-backend-wt-052/specs/052-plan-import-ai/SPEC.md` §2.5（只读）。

## 目标

1. 第一步响应读 `blocks`（无 `blocks` 的旧后端 → 按今天的顶层 `sheet/weeks` 当作唯一 block，兼容）。
2. `blocks.length ≥ 2` 时在 ⑮ 与 ⑯ 之间插入 ㉓（结构、文案按 SPEC 屏幕稿转写，一比一）；默认选中日期最新的 block；`=1` 时跳过。
3. ⑯ 只列所选 block 的周；副行与「← 换一个 block」按 SPEC ㉓ 末条。
4. 第二步请求：每周 cells 按 `region.sheet` 从对应页截取；`header_cells` 取所选 block 的表头（按页）。计划名默认 = 文件名（单 block）或「文件名 · block 名」（多 block）。
5. 文件里的「没当成 block 的页」由后端给出（§2.5 `skipped_sheets`）；没有该字段时不显示那一行。
6. 粘贴来源只有一页，永远单 block。

## 测试 seam（先红后绿）

`import/ImportPlanDialog.test.tsx`（mock `src/api/planImports.ts`）：两个 block → 出现 ㉓、默认选最新、切换后 ⑯ 周列表变化、第二步请求的 cells 来自所选 block 的页；一个 block → 不出现 ㉓；旧响应（无 blocks）→ 行为同今天；跨页 block（两页拼成）→ cells 按页取。

## 验收

`npm test`、`npx tsc --noEmit`、`npm run build` 全绿；红→绿表；JOURNAL `docs/journal/2026-10-29-015-B.md`。不 commit / push / merge；不启停 5180。
