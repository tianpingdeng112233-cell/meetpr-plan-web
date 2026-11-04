# 024 卡 A — 网页端服务期倒计时（学员栏 / 资料栏 / 总览 / 接收申请）

先读仓根 `CONTEXT.md`（「服务期」词条）与 `specs/024-service-term-countdown/SPEC.md`（含「屏幕稿」转写，布局以此为准）。本卡以 SPEC 为准；与 SPEC 或代码现状冲突时停下写进 JOURNAL，不自行定产品取舍。

- **级别**: T2 / P1。分支 `feat/024-service-term`（已从 `origin/main` 切好，worktree `~/Projects/apps/meetpr-plan-web-wt-024`）。
- **JOURNAL**: `docs/journal/2026-11-04-024-A.md`。
- **后端依赖**: backend spec 059（并行开发中，尚未部署）。接口契约如下，测试一律在 `src/api` 边界 mock，不连真后端：
  - `GET /coach/students` 每个学员新增 `service_until: 'YYYY-MM-DD' | null`（ended 学员恒为 null）。
  - `POST /coach/bind-requests/:id/accept` body 可选 `service_until: 'YYYY-MM-DD' | null`。
  - `PUT /coach/students/:id/service-term` body `{ service_until: 'YYYY-MM-DD' | null }` → `{ service_until }`；404 `COACH_STUDENT_NOT_FOUND`；400 非法日期。

## 目标

SPEC §1–§4 与「屏幕稿」①–④ 全部落地：服务期纯函数、学员栏胶囊（显示名正下方）、资料栏只读/编辑态、总览服务期标签（排最前、同色内描边、红色归需关注）、接收申请卡选填日期与提示文案、三语文案。

## 文件范围（预期，不限于）

- 新建 `src/features/workspace/serviceTerm.ts`（+ 测试）：档位/文案、加月（月末溢出取当月最后一天）、按浏览器本地日期算天数。
- `src/api/types.ts`、`src/api/coach.ts`（字段、accept 参数、新 PUT）
- `src/features/workspace/studentRailModel.ts`、`StudentRail.tsx`
- `src/features/plan-editor/components/StudentProfile.tsx`
- `src/features/workspace/overviewBoard.ts`、`OverviewTags.tsx`
- `src/features/workspace/RequestsPage.tsx`
- `src/i18n/` 对应 strings 文件（简/繁/英）

## 约束

- 只用浏览器本地日期算「今天」；日期字符串比较/运算别经 `new Date('YYYY-MM-DD')` 的 UTC 解析（会差一天），按年月日分量算。
- 没设服务期的学员：学员栏、总览、资料栏只读态与现网完全一致（除资料栏多一个「设置服务期」文字按钮）。
- 已解绑只读态隐藏服务期整行；不显示胶囊与标签。
- 「+1/+3 个月」只改输入框的值，按「保存」/「接受」才提交。
- 不改导航、顶栏、⌘K、编辑网格；不加轮询。沿用仓内现有 token 与组件样式。
- 改动留在工作区，**不 commit、不 push、不开 PR**（收货后由 Opus 提交）。

## 验收标准

SPEC「验收清单」第 1、2、3、4、5、7 条的前端行为全部有测试覆盖；第 6、8 条与浏览器亲验由 Opus 收货时做。另：`npm test`、`npm run lint`、`npm run build` 全绿，输出摘要贴进 JOURNAL。

## 测试 seam（先红后绿，红的输出存进 JOURNAL）

1. `serviceTerm.test.ts`（新）：N = 8、7、4、3、1、0、−1 的档位与简/繁/英文案；1/31 +1 个月、11/30 +3 个月、12/15 +1 个月跨年。
2. `studentRailModel.test.ts`（已有）：行模型带胶囊数据；未设置为空；ended 无胶囊。
3. `overviewBoard.test.ts`（已有）：服务期标签排最前、tone 映射、红色计入 attention 与红色计数、黄/灰不计入。
4. `RequestsPage.test.tsx`（已有）：不填接受 → 请求体不含 `service_until`（或为 null）；填了接受 → 带日期。
5. `StudentProfile.test.tsx`（已有）：设置 → 保存调用 PUT；清除 → PUT null；保存失败显示错误文案并保留编辑态；只读态无服务期行。

## 交付

JOURNAL 写明改动文件清单、红/绿证据摘要、全量结果与任何偏离；工作区留改动等收货。
