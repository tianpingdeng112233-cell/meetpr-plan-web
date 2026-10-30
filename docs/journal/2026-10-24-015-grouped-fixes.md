# 015 同类写法归组与次数「力竭」实装记录

- 日期：2026-10-24；分支：`feat/015-sheet-import`；接手 HEAD：`339bbfa`，接手时工作区干净。
- 依据：根目录 `CONTEXT.md`、`specs/015-sheet-import-any-template/SPEC.md` §2.0.2 / §2.0.3 与本次任务卡。未修改其他 journal 或正典文档。

## 实现

- 编辑卡次数旁增加「力竭」开关，保留只读/已打卡锁。内部次数值为稳定中文协议值，zh/en 展示独立翻译；速记显示「力竭」/「To failure」。关闭后恢复空的普通输入，避免擅自猜测次数。
- 次数完整性接受「力竭」。重量、自重及旧 RPE 保存路径的全部组使用 `set_type: failed`、`target_reps: 1`、`target_reps_max: null`；映射计划及保存回包两条回读路径均恢复「力竭」。普通、区间、AMRAP 与未编辑 opaque 数据沿用原逻辑。
- 导入摘要按 field + 原文精确归组，跨当前所选周计数，每个动作在同一组只计一次。不同字段的相同原文仍为不同组。
- 数字输入通过既有次数/强度/重量校验后即视为已处理；也可选择力竭、不设强度、不设重量。全部组处理完前，按钮和创建函数均拦截。创建前复制 AI 结果并应用所有处理值，再进入既有 buildWeeks/reconcile；不会修改原识别结果，原文缺失于备注时补入备注。
- 重新选择周只按当前选择重算归组；收到新的识别结果或更换来源时清空旧处理选择，避免将旧解释套入新结果。没有 `unparsed` 的旧后端响应继续兼容。

## 测试 seam 与先红后绿

复用任务卡指定的最高层入口，不新增私有函数测试：

| seam / 命令筛选 | 红 | 绿 | 证明内容 |
| --- | --- | --- | --- |
| `reconcile.test.ts -t '力竭 reps round trip'` | 3 failed；期望 failed 组，实际 `sets: []` | 3 passed | 重量/自重/旧 RPE 全组保存与两条回读 |
| `block-grid-ui.test.tsx -t 'toggles 力竭'` | 1 failed；找不到开关 | 1 passed | 编辑卡开/关、输入恢复、速记、不算待填全 |
| `import/ImportPlanDialog.test.tsx -t 'groups repeated texts'` | 4 failed；期望 3 组，实际 0 组 | 4 passed | 3 周 6 动作、同文不同字段、创建门禁、原文备注、力竭/数字、RPE/RIR/百分比及清空选项、zh/en |

原始日志保存在本机 `/tmp/015-reps-{red,green}.log`、`/tmp/015-ui-{red,green}.log`、`/tmp/015-groups-{red,green}.log`；全部新增 8 个测试用例均观察到红后转绿。

## 自审与独立审查

- 主代理已阅读所有改动 diff，包括新增文件；`git diff --check` 无问题。
- Standards 独立只读审查：无硬性违规/阻断项；一个低优先级重复逻辑建议已落实为 reconcile 内局部 `setTypeAt`。
- Spec 独立只读审查：无明确阻断项、无范围扩张。重选/重识别生命周期经代码审查，本卡未另加该生命周期测试。
- 仓库没有 `docs/agents/issue-tracker.md`，已告知可用 `$setup-matt-pocock-skills` 补配置；本次由用户指定的仓内 spec 提供审查依据。
- Impeccable 针对改动 UI 文件的机械检查输出 `[]`。没有生成设计稿或修改导航。

## 验证边界与工程选择

- 不设强度且不设重量的动作仍遵循原有不完整行规则，保存为零组占位；「力竭」只满足次数字段，不放宽其他完整性要求，也不自动猜成自重。
- 临时合成 UI 验证页面曾写入 import 目录，浏览器访问前即被审批拒绝，随后已删除。浏览器自动审批拒绝访问 `http://localhost:5180`，提示未获站点网络访问授权；没有绕过，没有截图，因此真实浏览器视觉核验待补。
- 本轮是前端自测，未做真实 AI 后端联调或宣布产品验收通过。未启动、停止或重启 Vite。
- Git metadata 指向工作区外主仓 `.git/worktrees/meetpr-plan-web-wt-015`，当前权限只读，现场 `test -w` 返回不可写。按任务卡保留 **uncommitted**，未 commit/push。

## 改动文件

- 导入：`src/api/planImports.ts`；`src/features/plan-editor/import/ImportPlanDialog.tsx`、`GroupedTextFixes.tsx`、`groupedFixes.ts`、`import.css`。
- 编辑与保存：`src/features/plan-editor/components/DayColumn.tsx`、`BlockGrid.tsx`、`block-grid.css`；`inputGuard.ts`、`types.ts`、`mapping.ts`、`reconcile.ts`。
- 翻译：`src/i18n/stable-zh.ts`、`strings-editor.ts`、`strings-import.ts`。
- 测试：`src/features/plan-editor/reconcile.test.ts`、`block-grid-ui.test.tsx`、`import/ImportPlanDialog.test.tsx`。
- 本文件；合计 19 个文件。

## 最终检查结果

- `npm test`：exit 0；105/105 文件，1112/1112 tests passed。
- `npx tsc --noEmit`：exit 0；0 errors。
- `npm run build`：exit 0；Vite 248 modules，3.71s。保留现有大 chunk 提示，不引入无关拆包改动。
- 日志：`/tmp/015-all-tests-final.log`、`/tmp/015-tsc-final.log`、`/tmp/015-build-final.log`。
