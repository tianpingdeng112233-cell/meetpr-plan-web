# 015 卡 1028b · 有组×次即可发布（spec §2.0.4，David 10/28 选 1C）

先读仓根 `CONTEXT.md`、`SPEC.md` §2.0.2–§2.0.4、本仓 `CLAUDE.md` ④「发布门禁」与「≠ 行」。

## 目标

编辑器的「完整处方」判定改为：**有组数 + 有次数（数字 / 区间 / AMRAP「8+」/ 力竭）即完整**，重量与强度都可为空。手动编辑与导入同一规则（不是只放开导入）。

- 保存（`reconcile.ts` 及批量保存路径）：这类行写真实的组：`target_reps`（力竭行沿用 `set_type:'failed'`、`target_reps:1`）、`target_reps_max` 按现状，重量 / RPE / RIR / % 字段为空；**不再**降级为零组占位、不再计入 `degradedRows`。
- 完整性 / 门禁：`findIssueRows` 的 `noSets`、状态栏「N 个动作待填全或需修正」、发布前 `cannotPublishIncomplete` 拦截，都不再把「只缺重量和强度」的行算进去。仍算不完整：没有组数、没有次数、未绑定（未绑定的现有提示不变）。
- 回读：库里只有组×次、无负荷无强度的组，映射回编辑器后行状态完整、显示「组×次」，不出现「—」占位，不触发「≠」行。
- 导入：`ImportPlanDialog` 的同类写法处理选了「不设强度 / 不设重量」或「力竭」后，生成的行按上面规则完整。
- 后端 `PLAN_PUBLISH_INCOMPLETE` 只拦空训练日与零组动作，本卡不动后端；若发现后端另有拦截，停下写进 JOURNAL 交回。

## 不做

- 不改学员端；不改 W3（导入后暂存被删，另案诊断）。
- 不改「未绑定行跳过」的行为。

## 测试 seam（先红后绿，复用已有）

1. `reconcile.test.ts`：只有组×次（含力竭、AMRAP、区间各一）、无负荷无强度的行 → 保存请求带 N 个组、负荷/强度为空；回读后行完整。
2. `block-grid-ui.test.tsx` / 现有 issue 测试：这类行不计入待填全、不出现在 ⚠ 循环；没有次数的行仍计入。
3. 发布 UI 测试：只有这类行时可直接发布（不弹 `cannotPublishIncomplete`）。
4. `import/ImportPlanDialog.test.tsx`：归组选「不设强度」后创建，保存请求里该动作有组。

## 验收

- `npm test`、`npx tsc --noEmit`、`npm run build` 全绿（`pinyin.test.ts` 计时偶发如上次注明）。
- JOURNAL：`docs/journal/2026-10-28-015-reps-only-complete.md`，含红→绿表。
- 不 commit / push / merge；不启停 5180 的 Vite。
