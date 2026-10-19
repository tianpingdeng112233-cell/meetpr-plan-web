# 013 · 卡 B — 删「反馈工作区」、聊天浮窗、总览两列

先读仓根 `CONTEXT.md`、`CLAUDE.md`、`specs/013-feedback-in-editor/SPEC.md`（含文末「屏幕稿」转写）与 `docs/CODEX-JOURNAL.md` 里卡 A 的交付段（反馈模式入口名）。在卡 A 收货之后、同一分支 `feat/013-feedback-in-editor` 上做。

## 目标
1. **导航**（SPEC §1）：删「反馈工作区」一级导航及其快捷键、命令面板项、`⌘K` 关键词；老 view / 地址落到计划编排同一学员；原徽标（未读 + 待看）移到「计划编排」导航项。`StudentHubPage` / `VideosPage` 中不再被使用的部分删除（卡 A 抽出的部件保留）。
2. **聊天浮窗**（SPEC §4、屏幕稿 ⑨）：只在计划编排，对象 = 当前学员；收起 / 展开、未读数、本机记住展开状态、切学员换内容、无会话时沿用「开始对话」；视频胶囊调用卡 A 的入口进反馈模式；竖屏大窗打开时浮窗 / 按钮移到大窗左侧不重叠。复用 `MessagesPage` 的对话部件。
3. **总览**（SPEC §5、屏幕稿 ⑩）：新增「待看视频」「未读消息」两列（右对齐胶囊 / 「—」）、可排序、悬停提示；点待看 → 计划编排该学员 + 反馈模式 + 第一段待看；点未读 → 计划编排该学员 + 展开浮窗；去掉学员名旁未读圆点。
4. **旧词清扫**（SPEC §6）：全仓 grep「反馈工作区」、`feedback` 导航键、`acceptForMessages` 等残留，中英文案同步清理。

## 文件范围（预计）
`src/features/workspace/CoachShell.tsx`、`PlanWorkspace.tsx`、`StudentHubPage.tsx`、`VideosPage.tsx`、`CommandPalette.tsx`、`coachViewNavigation.ts`、`globalKeyboard.ts`、`StatsViews.tsx`、`rosterOverview.ts`、`src/features/chat/MessagesPage.tsx`、`src/i18n/*`，以及对应测试。

## 约束
- 不改后端、不加接口；不回退卡 A 与 spec 011 / 012 行为。
- 不用橙 / 金色；中英文文案都要。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam
- `PlanWorkspace.test.tsx` / `CoachShell.test.tsx`：导航项删减与计数、老 view 落点、总览数字跳转进反馈模式 / 展开浮窗、浮窗切学员。先改断言跑红再实装。
- `StatsViews` 现有测试：两列与排序。
- 被删页面的测试随页面迁移或删除，但其中的业务断言（打点、反馈发送、已看只发一次）必须在卡 A 的新位置有等价覆盖。

## 验收
SPEC 013 验收清单 1、2、12、13、15，以及全清单回归。浏览器验收由 Claude 在沙箱外做。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件、红 → 绿证据、三条命令结果、旧词 grep 结果、拿不准的地方。
