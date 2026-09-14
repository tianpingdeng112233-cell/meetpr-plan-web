# SPEC 045 — 教练后移计划（从选中日起整体延后 N 天）

- **Status: InReview**（2026-09-14 实装及定向返修完成，本地 790 测试与构建通过；Standards/Spec 均 CLEAN；backend 部署门禁见 [验证记录](../verification-045-2026-09-14.md)。原批准：David 2026-09-02 grill 拍板：1A 2不做 3A 4赞同 5同意 6进；入口稿拍板 **A 日头入口**）
- **级别**: T2（跨仓：backend spec 045 出契约与迁移，本仓出入口；iOS 080 消费）
- **优先级**: P1（随 backend 045 部署 staging 后走 web swap）
- **前置**: backend 045 合 staging 并部署（真 gate：网页入口不得先于后端上线）；`feat/update-visible` 合 main 后再切分支。
- **先读**: 仓根 `CONTEXT.md`（推荐日期 / 后移）。

## 1. 目标

1. 教练在**已发布**计划的编辑器里选中某一天，一步把「那天及之后尚未完成的训练日」的推荐日期整体后移 N 天。
2. 网格即时按新推荐日期重排日头日期与「已后移」徽标；顶栏显示「已后移 N 天 · M/D 起 · 撤销」。
3. 学员手机端自动更新（backend 推送 + iOS 前台重拉），网页端不需要额外动作。

非目标：草稿计划（改 `start_date` 即可，入口隐藏）；学员端入口；提前（负偏移）；逐天改期。

## 2. 契约（backend 045，以其为准）

- `POST /plans/:id/shift` body `{ anchor_date: 'YYYY-MM-DD', offset_days: 1..30 }` → 201 `{ batch_id, anchor_date, offset_days, shifted_days[], skipped_completed_day_ids[], total_shift_days }`；409 `PLAN_NOT_ACTIVE` / `SHIFT_NO_TARGET_DAYS`；400 校验。
- `DELETE /plans/:id/shift` → 204；409 `NO_ACTIVE_SHIFT`。
- `GET /plans/:id`：day 级 `shifted_to_date`（已消费）；计划级 `total_shift_days`（口径=最大后移天数）+ 新增 `latest_shift { batch_id, actor_role, anchor_date, offset_days, created_at } | null`。
- `src/api/plans.ts` 新增 `shiftPlan(planId, body)` / `undoPlanShift(planId)`；`src/api/types.ts` 补 `latest_shift`。

## 3. 行为细则

### 3.1 入口（形态待设计稿拍板；两案见 canvas）

- **A（已拍板）日头入口**：选中天（`sel`）的 `.dayhead` 悬停/选中时出现「后移…」小按钮；点击弹出锚定在该列下方的弹层。锚定日 = 该天当前推荐日期（含既有后移）。
- ~~B 顶栏入口~~（未采）：`TopBar` 在 `StartDateControl` 右侧加「后移…」按钮，弹层内自带日期选择（默认 = 选中天的推荐日期，未选中则 = 今天）。
- 两案弹层内容相同：标题「从 M/D（W#D#）起后移」；步进器 `− N +`（默认 1，范围 1–30，可直接输入）；预览行「W#D# → M/D 周X · 影响 K 个训练日，已完成的 J 天不动」（K/J 由本地计算：推荐日期 ≥ 锚定日的天中，`completed_at` 非空者为 J）；第三行「周期结束日 M/D → M/D」（= 全部训练日在后移后的最大推荐日期；已完成天不动，所以最后一天已完成时结束日不变；⚖️2026-09-02 review 补：设计稿已含此行）；提示行「学员端会自动更新并收到通知」；按钮「取消」/「后移 N 天」（主按钮沿 `apply` 样式）。
- 仅 `planStatus === 'published'` 显示入口；草稿隐藏（不置灰，避免与日历锁提示混淆）。K = 0（锚定日之后没有未完成的天）时主按钮禁用并提示「该日期之后没有可后移的训练日」。

### 3.2 成功后

- 用响应 `shifted_days` 就地更新各天 `shifted_to_date`（不等重拉），随后 `getPlan` 重拉一次校正 `total_shift_days`/`latest_shift`。
- 日头日期、周头日期区间、`ShiftBadge` 按 `mapping.ts` 既有逻辑重算（`shiftedToDate ≠ originalDate` 即出徽标）。
- 状态栏「已后移 N 天 · 学员端将自动更新」（沿 `startDateUpdated` 的 status 拼接风格）。

### 3.3 顶栏芯片与撤销

- 现有「学员已整体顺延 N 天」芯片改为通用：`latest_shift.actor_role === 'coach'` → 「已后移 N 天 · M/D 起 · 撤销」；`coached_student`（存量数据）→ 「学员曾顺延 N 天 · 撤销」。`total_shift_days === 0` 不显示。
- 「撤销」= `undoPlanShift` → 重拉计划；确认弹窗「撤销最近一次后移（M/D 起 N 天）？学员端会同步恢复。」；409 `NO_ACTIVE_SHIFT` 静默重拉收口。
- 多次后移可叠加，每次撤销只退最近一批（文案里带这批的 M/D 与 N，教练能看懂退的是哪次）。

### 3.4 徽标与文案

- `ShiftBadge` 文案「顺延」→「已后移」；tooltip「原定 M/D · 已后移 N 天」——**不标作者**：计划级 `latest_shift` 无法还原每一天的历史作者，作者只在顶栏芯片按最近一批显示（⚖️2026-09-02 review 修订，原文误写带作者）。i18n zh/en 同步（`shift` 词根，勿用 `postpone`）。
- 搬天/删天涉及带后移的天：沿用 `shiftedDayMoveConfirm`（文案把「顺延」改「后移」）。

### 3.5 边界

- 日历锁（`calendarLocked`）**不**约束后移：它是覆盖层，不改 `start_date`。
- 快照（pending revision）与后移无关：后移不进快照、不影响「更新计划」的 diff。
- 后移后推荐日期可越过 `end_date`，周头日期区间照实显示，不报警。

## 4. 测试 seam

- **映射层** `src/features/plan-editor/mapping-shift.test.ts`：多批叠加后的日头日期 / 徽标天数 / 周区间；`latest_shift` → 芯片文案分支。
- **交互层** `src/features/plan-editor/plan-shift-ui.test.tsx`（仿 `draftMirror-ui.test.tsx`，mock `shiftPlan`/`undoPlanShift`/`getPlan`）：选中天→弹层→预览 K/J 正确→提交→网格日期变、芯片出现；撤销→恢复；draft 无入口；K=0 禁用；409 映射。
- 不加 e2e。

## 5. Out of Scope

见 §1 非目标；另：不改 `StartDateControl`（草稿仍用它）；不做后移历史列表；不做批量多计划后移。
