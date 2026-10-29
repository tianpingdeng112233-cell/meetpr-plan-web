# 卡 · 网页：自选重量 / 自重成为正式负荷类型（backend spec 056）

先读仓根 `CONTEXT.md`（自选重量、自重两词若缺，以 backend spec 为准）、契约正典 `/Users/david/Projects/apps/MeetPR-backend-wt-056-spec/specs/056-load-types/SPEC.md`（只读，§2–§3、§6 屏幕稿 ①）、本仓 `CLAUDE.md` ④。

## 目标

1. 重量模式下拉新增「自选重量」（小字「学员自己挑重量，记录时填」）；「自重」改为写 `load_mode='bodyweight'`，不再写 RPE 10 与备注「自重」；「自选重量」写 `load_mode='free_weight'`，可再带一个强度（RPE / RIR / %）。
2. **门控（spec Q10）**：前端常量 / env 开关 `VITE_FREE_WEIGHT_ENABLED`（默认关）。关时下拉不出现「自选重量」，只填组×次的行维持今天的「待填全」规则；开时按下一条自动归类且视为完整。
3. 只填组×次、未选重量模式也无强度的行（开关开时）：动作库 `equipment` 含 `bodyweight` → 自重，否则 → 自选重量；教练可改。
4. 回读：`load_mode` 优先；旧备注标记（`STABLE_ZH.patterns.bodyweight`）仍识别为自重（未回填数据）。
5. 收起态速记：自重「3×力竭 · 自重」，自选重量「3×15 @8 · 自选」（§6 ①）。
6. 后端 PR MeetPR-backend#341 提供新模式与旧形状投影；本地联调用该分支（`MeetPR-backend-wt-056`）。

## 不做

导入（spec 015）对新模式的接入另卡；不碰 `wip/015-reps-only-complete`。

## 测试 seam（先红后绿）

`reconcile.test.ts`（两种模式写入形状；自重不再带 RPE 10 / 备注）、`mapping` 回读（新模式 + 旧备注标记）、编辑器 UI 测试（下拉选项与门控、自动归类、速记文案）。

## 验收

`npm test`、`npx tsc --noEmit`、`npm run build` 全绿；红→绿表；JOURNAL `docs/journal/2026-10-29-056-web.md`。不 commit / push / merge；不启停 5180。
