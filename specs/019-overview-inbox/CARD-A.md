# 019 · 卡 A — 总览重做（邀请 + 申请 + 两段看板 + 可点提醒标签）与后移挪位

先读仓根 `CONTEXT.md`（「需要注意」「计划快结束」「RPE 超标」「未完成」「落后」是本卡新词）、`CLAUDE.md`，再完整读 `specs/019-overview-inbox/SPEC.md`（含文末「屏幕稿」转写）——它是唯一验收口径。后端契约见 `MeetPR-backend` 仓 `specs/054-coach-overview-alerts/SPEC.md` §2–§3（本卡只消费，不改后端）。分支 `feat/019-overview-board`，基于 `docs/spec-019-overview-inbox`（main + spec），worktree `meetpr-plan-web-wt-019-impl`。

## 为什么一张卡
总览、导航、深链跳转都汇在 `PlanWorkspace` 这一个编排点，后移挪位只是同一套深链（「去后移」）的落点；拆开会两次改 `PlanWorkspace.tsx` 和同一批测试。

## 目标
1. **导航**（SPEC §1）：`CoachView` 去掉 `requests`；`CoachShell` 删「学员申请」项、删待排队列与状态栏「待排 N」；总览红色计数 = 申请数 + 需要注意学员数；`coachViewNavigation` 把记住的 `requests` 落到 `board`；⌘K 申请 / 学员申请 / 邀请 → 总览。
2. **顶部**（SPEC §2 + 屏幕稿）：左「邀请学员」——四步、邀请码、链接、二维码、复制邀请消息 / 复制链接 / 下载二维码。邀请消息、链接、二维码组件从 `src/features/onboarding/CoachWelcomePage.tsx` 抽出复用（同一函数，不复制文案）；数据源与 welcome 页同一接口。右「学员申请」——复用 `RequestsPage` 的卡片与接受 / 拒绝 / 轮询逻辑（拆成可嵌入组件，原页面文件可删）。
3. **看板**（SPEC §3、§4 + 屏幕稿）：新纯函数 `src/features/workspace/overviewBoard.ts` 把学员、计划、overview、会话、视频与 `GET /coach/overview-alerts` 结果折成两段行 + 标签 + 红色计数；`StatsViews.tsx` 的 `StudentBoard` 按屏幕稿重写为两段六列；删筛选与四个旧列。口径函数（完成率、计划摘要等）复用 `rosterOverview.ts` / `metricThresholds.ts` / `pendingPlan.ts`，不复制。
4. **提醒接口接入**（SPEC §6）：`src/api/` 新增 `getOverviewAlerts()`、`markPlanViewed(studentId)`；随现有 60 秒可见轮询刷新，回总览立即刷新；失败一行重试；404 退回旧「下周未排」口径且不显示 RPE / 未完成 / 落后。打开某学员计划编排（任何入口）即调 `markPlanViewed`，失败静默。
5. **深链跳转**（SPEC §4 表格）：扩展现有 `editorIntent`（今天只有 `videos | chat`）为可表达「定位训练日 + 高亮组」「弹出新建计划并预填开始日」「定位训练日并弹出后移面板」；完成率低 → 追踪页选中该学员。留言 / 视频沿用现有 `openFromOverview`。
6. **后移挪位**（SPEC §5）：`DayColumn.tsx` 展开卡（`blockView`）把 `shiftAction` 从 `block-edit-footer` 挪进 `block-edit-head` 右侧、与收起并排；按周排 / 按天排都生效；`PlanShiftControl` 支持被深链直接打开。
7. **文案**：`src/i18n/` 简中、英文、繁中（018 已合入）三套齐全。

## 文件范围（预计）
`src/features/workspace/{PlanWorkspace,CoachShell,StatsViews,RequestsPage,CommandPalette,coachViewNavigation,overviewBoard(新)}.ts(x)`、`src/features/onboarding/CoachWelcomePage.tsx`（只做抽取，不改其页面行为）、`src/features/plan-editor/{PlanEditor,components/DayColumn}.tsx`、`src/features/workspace/PlanDialogs.tsx`（预填开始日入参）、`src/api/*`、`src/i18n/*`、`src/index.css` / `block-grid.css`；对应测试。

## 约束
- 只用屏幕稿转写里的现有 token；不用橙 / 金色；网页只做浅色。
- 不改后端；不改 `/coach/welcome` 页面行为；不改计划编辑器除后移挪位与深链定位以外的任何行为；不回退 011–018 已交付行为。
- 现有测试业务断言不得删改；原「学员申请 tab」用例改写为总览顶部断言（同一行为换位置）。
- 与在途 PR #126（spec 015，改 `PlanWorkspace` / `PlanDialogs` / `DayColumn`）可能冲突：本卡基于 main，冲突留给后合并的一方处理，不要去合 015 分支。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam（先红后绿，红要实际跑出来）
1. `overviewBoard.test.ts`（主力，纯函数）：SPEC 验收 1、6（七种标签的条件与颜色）、10（分段、排序、只落后留正常段）、11（溢出 +N）、13（404 退回口径）。
2. `PlanWorkspace.test.tsx`（最高层）：验收 2–5、7–9、12、13，含每种标签点击后的落点断言与 `markPlanViewed` 调用。
3. `CoachShell.test.tsx`、`coachViewNavigation.test.ts`：验收 1、2。
4. 后移：沿用现有后移 UI 测试（如 `plan-shift-ui.test.tsx`），断言控件在卡片头部、深链可直接打开面板（验收 9、14）。
5. 全量 `npm test`、`npx tsc --noEmit`、`npm run build` 全绿（本仓无 CI，这三条即合并闸门；本机负载高时用长超时）。

## 验收
SPEC 019 验收清单 1–16 全部。浏览器验收由 Claude 在沙箱外做，夹具会包含：有 / 无申请、零学员、七种标签各至少一例、标签溢出、提醒接口失败与 404、已发布计划的后移。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件、红 → 绿证据（命令 + 数字）、三条命令结果、与 SPEC 不一致或拿不准的地方（尤其深链落点、欢迎页抽取、404 退回）。
