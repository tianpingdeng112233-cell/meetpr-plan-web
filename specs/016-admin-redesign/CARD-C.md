# 016 · 卡 C — 申请表「设备」改问学员手机，后台表头改「学员设备」

先读仓根 `CONTEXT.md`、`CLAUDE.md`。在本 worktree 分支 `feat/014-admin-redesign`（卡 A、B 已提交）上做。

## 背景
2026-10-22 David 拍板：教练申请表里「主要用什么设备」含义不清，改为问学员的手机；后台对应列改叫「学员设备」。已提交的旧申请数据不迁移、照旧显示。

## 目标
1. 教练申请页（`src/features/onboarding/OnboardingPages.tsx`）：题目改为「学员主要用什么手机」/ "What phones do most of your athletes use?"；选项与提交值不变（iPhone / 安卓 / 都有 → `iphone` / `android` / `both`）。
2. 后台教练申请表：列名「设备」→「学员设备」/ "Athlete phones"（`src/i18n/strings-admin.ts` 的 `applications.device`）。其他地方展示同一字段的，按同样含义改文案（如有）。
3. 总览待办行副标题保持「学员 N 人 · iPhone · …」格式不变。

## 约束
不改后端与接口字段名；不加依赖；不 commit / push / 开 PR。

## 测试 seam
`src/features/onboarding/onboarding.test.tsx`（申请页题目文案）与 `src/features/admin/AdminWorkspace.test.tsx`（表头文案）：先改断言跑红再改实现。

## 交付
JOURNAL 追加「016 卡 C」：改动文件、红 → 绿、lint / 相关测试 / build 结果。
