# 022 CARD — 动作块拖动排序（plan-web 单卡）

先读仓根 `CONTEXT.md`（动作块 / 分区 / 计划树），再读本目录 `SPEC.md` 全文（含「屏幕稿」转写）。SPEC 是正典，本卡只补实装边界。

## 目标

折叠态动作块（`BlockGrid.tsx` 的 `.block-brick`）可在当天同一分区内拖动排序；展开态（`DayColumn.tsx`）序号列 / ⋮ / 行内空白都能起拖。视觉按 SPEC「屏幕稿」①②③。

## 文件范围

- `src/features/plan-editor/components/BlockGrid.tsx`、`block-grid.css`：动作块拖动、占位、插入线、无效态、锁定气泡。
- `src/features/plan-editor/components/DayColumn.tsx`、`src/index.css`：展开态起拖区扩大（序号列显示 ⋮）、插入线样式对齐稿。
- `src/features/plan-editor/PlanEditor.tsx`：把 `reorderRow` 接给 BlockGrid；状态栏文案。
- `src/i18n/strings-editor.ts`：新增文案（中 / 英 / 繁按仓内现有三语规则）。
- 测试：`week-band-ui.test.tsx` 或新建同风格 `block-drag-ui.test.tsx`；`tier-sections.test.tsx`。
- 范围外文件一律不动；不改后端、不改 App、不加依赖（不引 dnd 库，沿用现有 mousedown/mousemove/`elementsFromPoint` 写法）。

## 约束

- **顺序真源只有 `day.rows` 数组序**。必须复用 `weekBandModel.ts` 的 `reorderRowsInWeek` + `setWeeksWithHistory`，不新增顺序字段，不改 `orderWeeksForSave` / `reconcile.ts`。
- 起拖阈值 5px；未到阈值松手 = 现有点击选中；拖动开始后屏蔽框选（`startRectangle`）、点格展开（`suppressClick`）与块的 click。
- 起拖时若多选，收成被拖块单选（SPEC 7A）。
- 不可拖：锁定天（任一行 `hasLogs`）、学员自加块（`data-student-added`，也不是落点）、`readOnly`。
- 按周 / 按天两种布局行为一致。
- 鼠标松在窗口外 / 窗口失焦：干净取消（参照 `handleDayMoveStart` 的 `buttons === 0` 与 `blur` 处理）。
- 已发布计划：拖动只改本地，照现有「更新计划」流程；不得新增任何自动写入。

## 验收标准

SPEC「验收清单」1–13 全部；第 10 条两端 App 核对由 Opus 收货时做，Codex 只需保证 `onSave` 输出顺序正确。

## 测试 seam（先红后绿）

1. 折叠态（新增，DOM 级）：真实 `PlanEditor` + `blockGridTestUtils` + mock `document.elementsFromPoint`，在 `onSave` 边界断言：
   - 同分区拖动后保存顺序正确（草稿 Ctrl+S 与已发布「更新计划」各一条，仿 `delivers the displayed main/aux order`）；
   - 跨分区、锁定天、只读、学员自加块、移动 <5px：顺序不变；<5px 时仍是选中。
2. 展开态（扩展 `tier-sections.test.tsx`）：从序号列起拖成功；在动作名输入框内按下不起拖。
3. 规则层 `weekBandModel.test.ts` 不改。

## 交付

- 分支 `feat/022-brick-drag`，一个 PR（base `main`），不合并。
- JOURNAL：`docs/journal/2026-11-02-022-brick-drag.md`（复现命令、红绿记录、验证结果）。
- 合并闸门（本仓无 CI）：`npm test` 全量、`npx tsc --noEmit`、`npm run build` 全绿，`git diff --check` 通过，结果写进 JOURNAL。
- 浏览器自测：本地 `npm run dev`（5180）用内存 / 本地后端走一遍 ①②③，截图放 PR。不要连生产后端写数据。
- 需要 iOS 模拟器时只用 `iPhone 17e`。
