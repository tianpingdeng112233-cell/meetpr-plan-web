# 005 — 教练端「动作库」tab（浏览 / 搜索 / 分类 / 新建）

- **状态**: Draft（冻结时点 = 本 spec PR 合并）
- **日期**: 2026-07-13
- **P 档**: P1（下一班车候选；web cadence：上线前跑 review-loop）
- **拍板**: David 2026-07-13 —— 设计定稿 v5，见设计源 `/Users/david/Projects/catalog-mock.html`（标题「设计稿 v5」，一比一还原信息架构）。
- **代码基线**: `origin/main` @ `c9fdd29`。
- **后端契约**: 零后端改动。消费现有 `GET /exercises`（已返回 `muscle_groups`/`equipment`/`movement_pattern`/`competition_stance`，已按 coach 作用域返回 系统∪本人自建）与 `POST /exercises`（已存多肌群/器械/模式数组、从登录态写 `created_by_coach_id`）。契约以 MeetPR-backend `src/routes/plans/serialization.ts:107-120,220-235`（`ExerciseResponse`/`toExercise`）与 `src/routes/exercises/schemas.ts`（`CreateExerciseBodySchema`）为准。

## Goal

教练在一个专门的 tab 里浏览全量动作库、按分类/肌群/器械快速定位、搜索直达、并新建自建动作（建完即可在计划编写里引用）。把原本只散落在编辑器 typeahead（`ExercisePopover`）里的动作检索与新建（`CustomExerciseDialog`），升级成有正式家的全量浏览器。

## 非目标

- **自建动作的编辑 / 删除**：后端 exercises API 仅 list+create、无 `PATCH/DELETE /exercises/:id`。本卡只做浏览/搜索/查看/新建；自建动作详情里「编辑/删除」入口灰置 + 标注「暂不支持（需后端端点）」，**不**在本卡实现，也**不**假造本地删改。
- **收录审核 / 可见性 / admin**：教练端零感知（设计拍板），本波完全不涉；后端亦无 `review_status`/admin 角色（greenfield，另立）。
- **`name_en` 落库**：后端 create schema 不接受 `name_en`；新建表单**不含**英文名输入（避免"填了不存"）。系统动作已有的 `name_en` 照常展示。
- 不动 plan-editor 现有逻辑；动作库是独立 view。

## 设计源与信息架构（一比一还原 v5）

打开 `/Users/david/Projects/catalog-mock.html` 亲读。要点：

1. **左导航加 tab**：`CoachRail` 的 `CoachView` 加 `'catalog'`，`tabs` 加一项 `{ id:'catalog', icon:'▧', label:'动作库' }`，**置于 `editor` 之后（第 2 位）**。`PlanWorkspace` 加 `view==='catalog'` 分支渲染 `<CatalogPage>`。
2. **单条分类导航（左侧，唯一的分类筛选）** 两段：
   - 顶部固定：`全部动作` / `我的自建`。
   - 「比赛三项 · 按项」：`深蹲族` / `卧推族` / `硬拉族`（按 `main_lift_family`；主项 + 变式并进族，不再单列"分类"分面）。
   - 「辅助 · 按肌群」：**辅助动作直接按主肌群摊开**（主肌群 = `muscle_groups[0]`）。部位标题（下肢 / 上肢推 / 上肢拉 / 核心）只是**不可点的分组标签**。肌群项**数据驱动**——只列当前有辅助动作的主肌群。**左侧不放彩色圆点**（David 明确删）。
3. **情境细分 chips（表格上方一行，跟随左选）**：
   - `全部动作` → `分类`：全部 / 主项 / 主项变式 / 辅助。
   - 三项族 → `细分`：全部 / 主项 / 变式。
   - 进任一肌群项 / 我的自建 → **收起该行**（无二级细分）。
   - 搜索激活时也收起。
4. **顶栏**：大搜索框（名 / 英文 / 别名，**搜索时全库穿透、无视左侧分类**）+ 一个器械下拉（`器械 · 全部` / 各器械）+ 结果计数 + `＋ 新建动作`（白按钮）。
5. **表格（扫视态）** 4 列：动作名（+英文副行、比赛动作「赛」角标、自建绿「自建」tag）/ 分类 tag（主项红·变式琥珀·辅助中性）/ 器械 / 肌群（主肌群 tag 高亮、协同常规 tag）。行点开右侧详情抽屉。复用 `.roster-table` 语言。
6. **详情抽屉（编辑态，右侧 384px，复用 `.writing-panel` 语言）**：动作名/英文、badges（分类/族/比赛/来源）、字段（分类/主项族/动作模式/器械/主肌群/协同肌群/别名）。系统动作只读 + 「在计划中使用」；自建动作显示「编辑/删除」入口但**灰置标注暂不支持**（见非目标）。
7. **新建动作抽屉**：动作名 / **主肌群（单选，决定归类）** / 协同肌群（多选）/ 器械（多选）/ 动作模式（单选）；按名 `guessFields` 自动预选（沿用 `CustomExerciseDialog` 现有逻辑）；分类锁死「辅助动作」；**无任何审核痕迹**。提交 → `onCreateExercise`，成功后本地即用、出现在对应主肌群分类与「我的自建」。

## 数据 / API 对接

- `src/api/types.ts`：`ExerciseResponse` 补 `muscle_groups: MuscleGroup[]`、`equipment: Equipment[]`、`movement_pattern: MovementPattern[]`、`competition_stance: string | null`（对齐后端 `toExercise`）。
- `src/api/exercises.ts`：`CreateCustomExerciseInput` / `customExerciseBody` 扩展为支持 **主肌群 + 协同肌群数组**（`muscle_groups: [primary, ...synergists]`）、多器械数组、单动作模式。保持向后兼容现有 `CustomExerciseDialog` 调用（单肌群仍可）。
- 消费复用 `PlanWorkspace` 已加载的 `exerciseList` / `catalog` / `index` / `onCreateExercise`，**别在 CatalogPage 里重复 `listExercises`**。客户端一次拉取、本地筛选（沿用 `listExercises` 既有"小到可一次取全"模式）。
- 分类口径：辅助归类 / 肌群细分 chips / 肌群筛选一律**按主肌群 `muscle_groups[0]`**（与详情主肌群、新建单选口径一致）；搜索匹配名/英文/别名（别名走现有 `ExerciseIndex` 能力，若便利）。

## 视觉纪律

- 复用 `src/index.css` 现有设计 token 与 `.data-page` / `.page-top` / `.roster-table` / `.writing-panel` 语言（参照 `StatsViews.tsx` / `RequestsPage.tsx` 的 `data-page` 用法）。**别造新色板**，别引新依赖。新增样式追加进 `index.css`，命名与既有一致。

## 验收

- `npm run build`（`tsc --noEmit && vite build`）绿、`npm run test`（vitest）绿、`npm run lint`（`tsc --noEmit`）绿。
- `npm run dev`（5180，直连真后端）+ 浏览器亲验：tab 可切换；分类导航一键直达；搜索全库穿透；辅助按主肌群分类正确；三项族/全部动作的情境细分 chips 正确、进肌群项收起；新建自建动作后本地即用并出现在对应主肌群与「我的自建」；详情抽屉查看正常、自建「编辑/删除」灰置标注。
- 不回归：编辑器 typeahead / `CustomExerciseDialog` / 现有 tab 行为不变。
