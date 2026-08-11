# SPEC 038 — 追踪图坐标轴与数值 + 编排页实际完成对照

- **Status: InProgress**(2026-08-11 David 拍板)
- **级别**: T2(编排页 ACTUAL 为 spec 037 拍板第 3 条 deferred 项的正式复活)
- **端**: 仅 plan-web。backend 零改动——两块数据源均已存在。

## 1. 拍板(David 2026-08-11)

原始反馈:「追踪的图表只能看到趋势,没法看到每个的具体数据」;
「在计划编排区域,显示学员实际完成的强度和重量,放在教练设定目标边上方便对比」。

1. **追踪图选 B**:不新增后端序列;所有图卡补横纵坐标轴 + 每个数据点常显具体数值。
2. **编排页选 A**:已打卡的行,在目标格正下方以浅色行显示实际完成值,不新增列组。
3. **偏差配色(David 2026-08-11 修正)**:实际与目标偏差**超阈值标红**——重量
   |实际−目标| > 5kg;RPE |实际−目标| > 1;%1RM 偏差 > 5 个百分点(区间目标以边界外起算);
   **力竭标红**;偏差**在阈值以内标黄**(达标确认);无从比较(rir/未设目标/e1RM 不可得/自重)
   中性灰;未完成组灰显。

## 2. 数据源(全部现成)

- 追踪图:`GET /coach/students/:id/exercise-stats` 的 `e1rm_series` /
  `weekly_volume` / `weekly_family_metrics` / 分布字段——不变。
- 编排页实际值:`GET /students/:id/sets?from&to&scope=plan`(spec 010 已有,
  教练可读,含 `plan_exercise_id`/`set_index`/`weight_kg`/`reps`/`rpe`/`coach_rpe`/
  `completed`/`failed`)。按 `plan_exercise_id` ↔ 行 `serverRowId` 对齐,`set_index` 排序。

## 3. 行为细则

### 3.1 追踪图(TrackingDashboard)

- 折线图:左侧 y 轴三档刻度(min/mid/max,含横向网格线);底部 x 轴按点标日期
  (点数 > 7 时首/中/末);每个数据点上方常显数值。
- 柱状图:左侧 y 轴 0/mid/max 三档;柱顶常显数值;x 轴沿用现有 slot 标签。
- 横向条形图(分布类)已逐行带具体数值,不动。

### 3.2 编排页实际值(DayColumn)

- 仅 `hasLogs` 行渲染;强度列目标格下逐组显示实际 RPE chip(`@8`),重量列目标格下
  逐组显示实际 `重量×次数` chip(`92.5×5`)。
- 配色判定(红=超阈/力竭,黄=阈内达标,灰=不可比或未完成):
  - 重量:目标取该组重量格(fixed/per_set);weight_range 取界外 >5kg;bodyweight 不判。
  - RPE:目标 rpe/rpe_range 模式逐组比;rir 不判(口径不可比)。
  - %1RM:经动作库派生主项系列 → `exerciseStatsOverview.e1rm[family]` 换算实际 %,
    偏差 > 5pp 红、以内黄;系列或 e1RM 不可得则只显示不判。
- 学员 `rpe` 为准,空则用 `coach_rpe`;都空显 `—`。
- 草稿计划(无 serverRowId/无打卡)零请求零渲染;接口失败静默(编排主流程不受影响)。
