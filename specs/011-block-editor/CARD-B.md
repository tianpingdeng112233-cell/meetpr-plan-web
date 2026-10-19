# 011 · 卡 B — 历史栏与视频、顶栏精简、新建计划、品牌

先读仓根 `CONTEXT.md` 和 `CLAUDE.md`，再完整读 `specs/011-block-editor/SPEC.md`（含文末「屏幕稿（定稿，转写）」）。本卡在卡 A 已收货的分支上接着做。SPEC 是唯一验收口径。

## 目标
右侧历史栏常驻并逐级收窄到近 5 次、视频固定在栏顶播放；顶栏只留必要元素、其余进「计划▾」；新建计划可选练日、自选 D1、第一练日期；左上角与标签页换成 app 图标。

## 范围（本卡做）
- SPEC §3 全部：常驻不自动收起、可手动收起成 44px 竖条（状态记本机）、第 0–3 级、面包屑可点回上级、记录一行 + 展开逐组、视频固定在栏顶（复用视频页播放组件：倍速、逐帧）、旧后端降级（无 `filtered_sessions` / `video_id` 时第 2、3 级退回第 1 级并提示，▶ 跳视频页）、本页会话缓存。
- 后端契约：MeetPR-backend spec 051（PR #304）—— `GET /coach/students/:id/exercise-stats?exercise_id=&sets=&reps=` 返回 `filtered_sessions`（≤5，单位 = 一次处方行，含 `prescribed {sets, reps}` 与逐组 `video_id`），`recent_sessions[].sets[].video_id`。视频地址取现有 `GET /uploads/:id/url`。
- SPEC §6 全部：app 图标（源文件 `/Users/david/Projects/apps/MeetPR-release/MeetPR/Assets.xcassets/AppIcon.appiconset/meetpr-icon-1024.png`，复制进本仓并生成合适尺寸，含 favicon）+「MeetPR」字样；顶栏只留 图标 · 学员▾ · 计划▾ · 保存状态 · 待核对芯片（>0 才出现）· 发布给学员 / 更新计划；「计划▾」菜单按转写的条目与顺序；新建计划对话框按 SPEC §6 与转写（周数 3–6 默认 4、勾练日、自选 D1、其余按星期循环排、第一练日期只能选 D1 星期，默认 D1=周一且日期=最近的周一）；「计划设置」复用同一套字段。
- 页面配色收尾：全页不再出现橙 / 金（app 图标除外），高亮淡黄。
- **卡 A 收货时转来的两项**：① 卡 A 拆掉了顶部周期化条，「改周数」能力要在「计划▾ › 计划设置」里恢复（含原有的删周确认与保存流程）；② 星期规律与新建的空骨架重开计划后不能丢（SPEC §6 末两条），给出重开后的证据。
- 卡 A 的编辑卡已去掉旧的日头画像 / 上下文块，本卡把这些内容放进历史栏第 0 级。

## 约束
- 不改数据模型；新建计划时 `start_date` = 第一练日期。
- 中英文文案都要。不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam（先红后绿）
1. 历史栏纯函数（扩展现 `contextRailLevel`）：行状态 → 级别 → 请求参数；旧后端响应 → 降级结果；顶组选取（重量最大、并列取组序靠前）。
2. 新建计划的纯函数：练日 + D1 → Dx 顺序；D1 星期 + 今天 → 默认第一练日期；周数 → 结束日期。
3. `PlanEditor` / 顶栏组件测试（现有 seam）：验收 3、4、5、8、11。
4. `api/coach` 请求测试：`sets` / `reps` 参数拼接。

## 验收（对应 SPEC 验收清单）
第 3、4、5、8、11、12、13 条全部通过。`npm test` 全量、`npx tsc --noEmit`、`npm run build` 通过。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件、先红后绿证据、与 SPEC 不一致或拿不准的地方。
