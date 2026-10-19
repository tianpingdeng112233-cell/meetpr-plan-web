# 013 · 卡 A — 编辑器内：视频标记、反馈模式、「显示实际」开关

先读仓根 `CONTEXT.md`、`CLAUDE.md`，再完整读 `specs/013-feedback-in-editor/SPEC.md`（含文末「屏幕稿」转写），以及前置 `specs/011-block-editor/SPEC.md` §1、§3（历史栏与竖屏视频窗）、`specs/012-insert-delete-training-day/SPEC.md` §1。SPEC 013 是唯一验收口径。分支 `feat/013-feedback-in-editor`（基于 `docs/spec-013-feedback-in-editor`，即 main 1f3ac14 + spec）。

## 目标（只做编辑器这一侧，导航 / 聊天浮窗 / 总览归卡 B）
1. **视频标记**（SPEC §2、屏幕稿 ⑦）：积木上待看 / 已看两种标记；练了没传只有 ✓；自加动作在开关关时落日卡头部、开时落自加积木；悬停提示；历史栏头部「待看 N」入口。
2. **反馈模式**（SPEC §3、屏幕稿 ⑧）：点标记 / 「待看 N」进入；历史栏宽度不变，内容换成待看列表 + 打点列表 + 回复区；视频在 011 的竖屏大窗里放，大窗控制条加画线、＋打点；列表按计划顺序、「不在本计划」分组、与积木双向高亮、`← / →` 切段、「含已看」；打开即已看；Esc 顺序（输入框 → 大窗 → 反馈模式 → 编辑卡）；切学员 / 切计划规则；视频接口失败的降级。011 历史 ▶ 行为不变，但共用同一个大窗组件（回看时也有画线 / 打点）。
3. **「显示实际」开关**（SPEC §7、屏幕稿 ⑪）：顶栏右侧开关，默认关、本机记住；开时已打卡积木显示实际速记、未打卡变灰、悬停看处方、自加动作作只读积木；复制 / 填充仍取处方。
4. 给卡 B 留好入口：编辑器 / 工作区对外暴露「以某段视频打开反馈模式」的方法（卡 B 的总览跳转和聊天视频胶囊要调用），名字由你定，在 JOURNAL 里写清。

## 文件范围（预计）
`src/features/plan-editor/components/BlockGrid.tsx`、`BlockHistory.tsx`、`components/block-grid.css`、`PlanEditor.tsx`、`TopBar` 相关组件；新纯函数模块（视频 → 积木状态推导、实际速记，放 `src/features/plan-editor/` 下）；从 `src/features/workspace/VideosPage.tsx` 抽出可复用的工作台部件（打点、画线、快捷回复、发送反馈），`VideosPage` 自身在卡 B 删除前须保持可用；`PlanWorkspace.tsx`（把当前学员视频列表传进编辑器）；`src/i18n/*`；对应测试。

## 约束
- 不改后端、不加接口、不改数据模型与 `reconcile`；不回退 spec 011 / 012 任何已交付行为（Esc 先关视频窗、逐组标重、插入 / 删除训练日等）。
- 不用橙 / 金色（淡黄可用）；中英文文案都要。
- 本卡**不删**「反馈工作区」tab、不动总览、不做聊天浮窗（卡 B）。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam
按 SPEC 013「测试 seam」：
- 新纯函数「视频 → 积木状态」与「实际速记」先写会红的用例并实际跑红（覆盖：多组混合状态、自加动作、`plan_exercise_id` 为空、上个 block、同一动作多段；逐组不同、额外组、缺 RPE、失败组）。
- `PlanWorkspace.test.tsx` 最高层：点标记进反馈模式、Esc 顺序、打开即已看后标记变化、开关开 / 关渲染与复制仍取处方。
- `VideosPage` 现有测试在抽组件后保持全绿；`block-grid-ui`、`block-history-ui` 等现有测试全绿，业务断言不得删除。

## 验收
SPEC 013 验收清单 3–11、14、16–20（1、2、12、13、15 中涉及导航 / 浮窗 / 总览的部分归卡 B）。浏览器验收由 Claude 在沙箱外做；收货夹具会包含：逐组重量 / 逐组 RPE 行、10 组长行、自加动作带视频、上个 block 的视频、`plan_exercise_id` 为空的视频。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件、红 → 绿证据（命令 + 数字）、`npm test` / `npx tsc --noEmit` / `npm run build` 结果、给卡 B 的入口名、与 SPEC 不一致或拿不准的地方。
