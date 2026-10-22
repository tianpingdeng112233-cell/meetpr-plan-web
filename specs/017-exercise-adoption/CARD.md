# 017 · 卡 — 后台动作库「教练自建」与收录 + 教练端被收录动作只改名

先读仓根 `CONTEXT.md`、`CLAUDE.md`、`specs/017-exercise-adoption/SPEC.md`（全文）、四张稿 `specs/017-exercise-adoption/design/*.dc.html` 的源码，以及后端契约 `~/Projects/apps/MeetPR-backend-wt-053-adopt/specs/053-exercise-adoption/SPEC.md` §2–§3（接口形状、错误码以它为准）。术语见后端仓 `CONTEXT.md` 的「收录」「教练叫法」。在分支 `feat/017-exercise-adoption`（基于 016 分支）上做。

## 目标
按 SPEC 017 §1–§8：动作库页两层分段、待处理表、收录弹窗（先推荐 → 新建，同一弹窗两态）、已收录表与撤销、成功/失败处理、教练端 `CatalogPage` 被收录动作只改名无删除、中英文案。

## 文件范围（预计）
`src/api/admin.ts`（新三个接口与类型）、`src/api/exercises.ts`（`canonical_exercise_id` / `adopted` 字段）、`src/features/admin/`（可拆 `CustomExercisesPage.tsx`、`AdoptDialog.tsx`、候选排序纯函数文件）、`src/features/catalog/CatalogPage.tsx` 及其测试、`src/i18n/strings-admin.ts`、catalog 相关 strings、`src/features/admin/AdminWorkspace.test.tsx`。

## 约束
- 不改后端（后端接口由 spec 053 另行实现，测试里桩 `fetch`）；不加依赖、不改锁文件。
- 候选排序写成纯函数并单测（别名表命中 > 互相包含 > 单字 Dice ≥ 0.5，前 3）。
- 浅色配色沿用 016；不 commit、不 push、不开 PR。

## 测试 seam（先红后绿）
SPEC 017「测试 seam」：`AdminWorkspace.test.tsx`（动作库分段、待处理/已收录、两种收录请求体、撤销、409 刷新、无候选直接新建）+ catalog 现有测试（被收录只改名、无删除）+ 候选排序纯函数单测。

## 验收
SPEC 017 验收清单 1–9；第 10 条由 Claude 收货时在 staging 上做。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加「017」一段：改动文件、红 → 绿证据、lint / 测试 / build 结果、拿不准的地方。
