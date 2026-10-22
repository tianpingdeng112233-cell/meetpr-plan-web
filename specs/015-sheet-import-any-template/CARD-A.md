# 015 卡 A — 从表格导入（网页全部）

先读仓根 `CONTEXT.md`（「从表格导入」「导入存疑」「待核对行」「快照」「计划树」），再读 `CLAUDE.md` 和 `specs/015-sheet-import-any-template/SPEC.md`（含文末「屏幕稿」转写，是 UI 的唯一参照；外链打不开不用开）。SPEC 是实现契约，本卡只补边界与验收。

## 目标

教练在「新建计划」里选「从表格导入」，上传或粘贴任意版式的训练表，经后端 AI 两步识别后生成一份新的草稿计划；拿不准的行以「导入存疑」进 ⚠ 待核对；计划菜单瘦身；周数放到 3–12；过往训练改为首次发布时询问补记。

## 范围（SPEC 各节全部做）

1. **API**：新增 `src/api/planImports.ts`（status / outline / weeks，契约见 SPEC §6 与后端 spec 052；后端 PR MeetPR-backend#320，接口与错误码以它为准：outline 502 带 `reason`，weeks 单周 `{index,error:'PARSE_FAILED',reason}`，429 `IMPORT_DAILY_LIMIT`，422 `NO_TRAINING_WEEKS`，413 `PAYLOAD_TOO_LARGE`/`IMPORT_HEADERS_TOO_LARGE`，409 `IMPORT_WEEK_CALL_LIMIT`）。**请求里永不带文件名。**
2. **读表**（`src/features/plan-editor/import/`）：`workbookToSheets`（SheetJS，xlsx/xls/csv；`.et` 能读就收，读不了给「请在 WPS 里另存为 .xlsx」；日期格转 ISO；只发非空、trim 的格子）、`pastedToSheets`（优先 `text/html` 表格保留合并格，否则制表符文本）、按 `region` 截出每周 cells 与 `header_cells`。
3. **弹窗流程**：`NewPlanDialog` 加分段切换；`ImportPlanDialog` 按屏幕稿 ⑮⑯⑰ 实装（选来源 → 认结构 → 选周（连续、≤12）→ 逐周识别 → 结果摘要含失败周原表格子可编辑重识别 / 先空着 / 不导 → 创建）。status `enabled:false` 时不出现「从表格导入」。
4. **创建**：`aiWeeksToParsed`（第二步响应 → 现有 `ParsedWeek`）→ 现有 `buildWeeks`；`createPlan`（plan_weeks = 选中周数，start_date = 第一周周一或教练所选，星期由各周训练日位置得出）；自定义动作按 SPEC §3 自动新建（先 `ExerciseIndex.resolve`；同次导入同名只建一个；该教练已有同名自定义动作复用；`family_guess` → 主项变式，否则辅助项默认）；现有 `reconcile` 保存；打开编辑器停在当前周。
5. **导入存疑**（SPEC §4，屏幕稿 ⑱）：行状态里记五种存疑之一或多种，随快照持久、不进计划树；并入 ⚠ 计数与跳转；改行或点「确认」消失；无日期周在设好日期后整体消失。
6. **发布**：有存疑行时发布 / 更新弹一次确认（不拦截）；**首次发布**确认框加「补记过去训练」默认勾选项（SPEC §2 第 6 步）。导入流程本身不再调用 `markImportedHistory`。
7. **计划 ▾ 瘦身 + 周数 3–12**（SPEC §1、§5，屏幕稿 ⑲）：菜单只剩切换列表与「＋ 新建计划」；每行「⋯」小菜单；新建与计划设置周数 3–12。
8. **删旧**：删 `TopBar` 的「导入 .xlsx」与 `handleImport` 覆盖路径；删 `selectSheet` / `detectDayOffset` / `weekBlocks` / `parseDay` / `parseSetLine` / `dayColumns` 及其测试；保留并复用 `readWorkbook` 的 SheetJS 读取、日期换算、`buildWeeks`。删后 grep 旧文案「导入 .xlsx」`importXlsx` 无残留（i18n 中英文都删）。
9. **文档**：`docs/教练使用指南.md` 第一节（菜单）与第五节（导入）按新行为改写。英文 i18n 同步补齐新文案。

## 约束

- 不改后端；不动编辑器网格排版（spec 014「按天排」同期在改，本卡只碰待核对行计数 / 定位、编辑卡行尾、TopBar 菜单、新建 / 设置弹窗）。
- 不提交真实学员表格进仓（仓库公开）；测试用合成表与 `XLSX.write` 造的工作簿。
- 不 commit、不 push；改动留在工作树，写 `docs/CODEX-JOURNAL.md`。

## 测试 seam（先红后绿，SPEC §7）

1. `import/` 纯函数单测：`workbookToSheets`、`pastedToSheets`（含合并格 HTML）、region 截取、`aiWeeksToParsed`、存疑种类推导。
2. `ImportPlanDialog` 组件测试（mock `src/api/planImports.ts`、`createPlan`、`createCustomExercise`）：SPEC §7.2 全部条目，另加「请求体无文件名」「次数为 0 时按钮置灰」。
3. 编辑器 / TopBar 现有测试扩展：SPEC §7.3 全部条目；计划菜单「⋯」各项出现条件与作用对象；周数 3–12。

## 验收

- `npm test`、`npx tsc --noEmit`、`npm run build` 全绿，报通过数。
- 旧词 grep 无残留：`导入 .xlsx`、`importXlsx`、`importOverwriteConfirm`、`selectSheet`、`detectDayOffset`。
- JOURNAL 写明：做了什么、与 SPEC 的偏差及原因、浏览器侧未验的点（Opus 会用本地后端 + 真 key 亲验）。
