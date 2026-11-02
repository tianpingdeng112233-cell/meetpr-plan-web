# 023 CARD — 跨学员 / 跨计划复制粘贴（plan-web 单卡）

先读仓根 `CONTEXT.md`，再读本目录 `SPEC.md` 全文。SPEC 是正典。**本卡等 022（`feat/022-brick-drag`）合入 main 后，从最新 main 开分支。**

## 目标

让编辑器内部剪贴板（动作 / 单天 / 多天三种）跨编辑器重新挂载存活，并在当前标签页刷新后仍可用，使跨学员、跨计划粘贴与同计划内粘贴完全一致。

## 文件范围

- 新建 `src/features/plan-editor/clipboardStore.ts`（+ 测试）：标签页级存储，`sessionStorage` 持久化，读写全部 try/catch，不可用时退化为模块内存。
- `src/features/plan-editor/PlanEditor.tsx`：三个 clipboard ref 与 `clipboardKindRef` / `clipboardTextRef` 改为经 store 读写；复制 / 粘贴逻辑与规则不改。
- 测试：新建跨挂载 DOM 测试（同 `multiday-selection-ui.test.tsx` 风格）。
- 不动 `clipboard.ts` 的文本序列化格式；不动 `PlanWorkspace.tsx` 的挂载 key；不改后端 / App；不加依赖。

## 约束

- 存储的内容必须是 `cloneRow` 之后的形态（无 `serverRowId` / `serverSortOrder` / `hasLogs`），粘贴时照现有路径再 clone，保证 id 不撞。
- 存储 schema 带版本号；读到不认识的版本或解析失败一律视为空剪贴板，不抛错。
- 外部文本优先级不变：系统剪贴板里有不同于上次复制的文本时，仍按现有逻辑解析外部文本。
- 只读编辑器不能粘贴（现状）；粘贴后已发布计划只改本地（现状）。

## 验收标准

SPEC「验收清单」1–11；第 9 条两端 App 核对由 Opus 收货时做。

## 测试 seam（先红后绿）

1. `clipboardStore` 单测：写 / 读 / 覆盖 / sessionStorage 抛错时降级 / 坏数据视为空。
2. 跨挂载 DOM：编辑器 A 复制（动作、单天、多天各一条）→ 卸载 → 不同 key 挂载 B → 粘贴 → `onSave` 收到的行（含 `opaqueSets`）与多天偏移正确。改前应红。
3. 既有粘贴用例保持绿。

## 交付

- 分支 `feat/023-cross-student-paste`，一个 PR（base `main`），不合并。
- JOURNAL：`docs/journal/<日期>-023-cross-student-paste.md`。
- 闸门：`npm test` 全量、`npx tsc --noEmit`、`npm run build`、`git diff --check` 全绿，写进 JOURNAL。
- 浏览器自测用本地后端，不连生产写数据。
