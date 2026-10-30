# 020 · 卡 A — 顶栏「反馈」入口 + 点视频即进反馈 + 整日反馈

先读仓根 `CONTEXT.md`（「整日反馈」「已反馈（某天）」是本卡新词，「反馈模式」定义已更新）、`CLAUDE.md`，再完整读 `specs/020-day-feedback/SPEC.md`（含文末「屏幕稿」转写）——它是唯一验收口径。spec 013（`specs/013-feedback-in-editor/SPEC.md`）是本卡的底座，只改 020 §2 点名的那一条（历史记录 ▶）。分支 `feat/020-day-feedback`，基于 `origin/main`，worktree `meetpr-plan-web-wt-020-impl`。

## 为什么一张卡
顶栏按钮、历史栏、训练日列表、格子标记都汇到同一个反馈会话状态（`feedbackSession` / `PlanEditor` / `BlockHistory`），拆开会两次改同一批文件和测试。

## 目标
1. **数据**（SPEC §3.3）：`src/api/` 新增读取 `GET /students/:id/feedback`；`CoachFeedbackPayload.video_id`（以及 `day_date`）放宽为可空。`src/features/plan-editor/feedbackModel.ts` 新增纯函数：计划树 + 学员记录 + 反馈列表 + 视频列表 → 已完成训练日列表（日期升序、星期、实际日期、当天反馈条数）、按天的反馈明细（出处：按组 / 整日）、格子「已反馈」映射。归天规则按 SPEC §3.3。
2. **顶栏按钮**（SPEC §1）：`components/TopBar.tsx` 在「显示实际」左边加「反馈」按钮（角标 = 待看视频数，开 / 关两态样式按屏幕稿），点击进出反馈模式；历史栏收起时也可用。
3. **历史栏**（SPEC §1、§2、§3）：`components/BlockHistory.tsx` 入口改「▶ 反馈 · 待看 N」；反馈模式栏顶改为「← 历史 · 反馈 · 含已看」；新增「训练日」一节（在待看列表上方、自滚动、进入时滚到底）；待看列表每条加 ▶ 圆标、节头「待看视频 N · 点一段在大窗播放」；选中训练日时回复区切到「当天反馈」（列当天所有反馈 + 整日反馈输入框 + ⌘↵ 发送），与视频回复互斥。
4. **点视频即进反馈**（SPEC §2）：历史记录里的 ▶ 改为进入反馈模式播放该段（不在本计划落「不在本计划」并选中；已看的也临时显示并选中），回复可用；退出回原历史级别。
5. **网格标记**（SPEC §4）：`DayColumn.tsx` / `BlockGrid.tsx`（两种排版、扫视 / 编辑态）格头加「已反馈 / 已反馈 N」小签、悬停提示、点击进入反馈模式并选中该天；训练日选中 / 悬停时那天格子高亮。
6. **发送**：整日反馈 `POST /coach/feedback` 请求体按 SPEC §3.2；成功追加并刷新状态，失败保留输入。发出视频反馈后也刷新当天状态。
7. **文案**：`src/i18n/` 简中、英、繁三套齐全；旧入口文案残留 grep 干净。

## 文件范围（预计）
`src/api/{coach,types}.ts`、`src/features/plan-editor/{feedbackModel,feedbackSession,PlanEditor}.ts(x)`、`src/features/plan-editor/components/{TopBar,BlockHistory,DayColumn,BlockGrid}.tsx`、`src/features/workspace/{PlanWorkspace,VideoWorkbench}.tsx`（只为回复区切换 / 刷新所需的最小改动）、`src/i18n/*`、相关 css；对应测试。

## 约束
- 只用屏幕稿转写里的颜色（深色 #111827、淡黄 #FEF3C7 / #FFFBEB、浅灰 #F9FAFB / #E5E7EB）；不用橙 / 金色；网页只做浅色。
- 不改后端、不改 App；不回退 011–019 已交付行为。
- 现有测试业务断言不得删改；唯一例外：断言「历史 ▶ 停在历史模式」的用例按 SPEC §2 改写，并在 JOURNAL 写明。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam（先红后绿，红要实际跑出来）
1. `feedbackModel.test.ts`（主力，纯函数）：SPEC「测试 seam」第一条列的五种情况。
2. `PlanWorkspace.test.tsx`（最高层）：验收 1–4、8–11 的入口、请求体与失败重试。
3. 013 既有反馈 / 历史栏测试保持绿。
4. 全量 `npm test`、`npx tsc --noEmit`、`npm run build` 全绿（本仓无 CI，这三条即合并闸门；本机负载高时用长超时）。

## 验收
SPEC 020 验收清单 1–13 全部。浏览器验收由 Claude 做，夹具会包含：有 / 无待看、只有视频反馈的天、整日 + 按组混合的天、`day_date` 为空的旧反馈、上个 block 的历史视频、反馈接口失败、按天排。

## 交付
写 `docs/journal/2026-10-24-020-card-a.md`（一卡一文件）：改动文件、红 → 绿证据（命令 + 数字）、三条命令结果、与 SPEC 不一致或拿不准的地方。
