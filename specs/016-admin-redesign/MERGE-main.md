# 016 · 合并 main（2026-10-22 放行后）

David 已放行 PR #124。合并前 main 已进了 spec 014 按天布局（#125）与 spec 018 繁体中文（#128），与本分支冲突：`docs/CODEX-JOURNAL.md`、`src/features/admin/AdminWorkspace.tsx`、`src/features/onboarding/CoachApplicationsSection.tsx`（本分支已删除、main 改过）。

## 要做
1. 在本分支 `git merge origin/main`，解决冲突：本分支 spec 016（卡 A/B/C）的全部行为保留；main 上繁体中文（spec 018）的改动全部保留。`CoachApplicationsSection.tsx` 保持删除，但 main 在它里面做的繁体文案改动要落到新的 `ApplicationsPage.tsx` / `strings-admin.ts` 对应位置。
2. 本分支新增的后台文案（`strings-admin.ts` 等）补齐繁体（台湾）版本：按 `specs/018-zh-hant/GLOSSARY-zh-Hant.md` 与 `scripts/gen-zh-hant.mjs` 的现行做法，与 main 上其他繁体文案同一口径。
3. JOURNAL 冲突：两边段落都保留，按时间顺序排列。

## 验收
`npm run lint`、全量测试（默认并发超时则两 worker 重跑并说明）、`npm run build` 全绿；繁体模式下后台各页无简体残留（沿用 018 的检查方式）。

## 约束
完成合并提交（merge commit 由你创建，提交信息写明解决了哪些冲突），但**不要 push、不要开 PR**；不改依赖与锁文件；不改后端。JOURNAL 追加「016 合并 main」一段。
