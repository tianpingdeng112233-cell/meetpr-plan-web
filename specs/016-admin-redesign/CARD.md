# 016 · 卡 — 管理后台浅色重做 + 删计划总览

先读仓根 `CONTEXT.md`、`CLAUDE.md`、`specs/016-admin-redesign/SPEC.md`（全文，含「屏幕稿」节）以及 `specs/016-admin-redesign/design/*.dc.html` 五张稿的源码。在分支 `feat/014-admin-redesign`（本 worktree）上做。

## 目标
按 SPEC §1–§8 一次做完：
1. 删计划总览：`PlansPage`、`PlanDetailPage`、`buildMatrix`、`PlanContext` 等计划相关页面/类型/导航/路由；`src/api/admin.ts` 里前端不再用的 `getAdminPlans` / `getAdminPlan` 及类型一并删（`admin.test.ts` 同步）。
2. 浅色：删除 `src/index.css` 里 `[data-testid="admin-workspace"]` 的暗色变量块及其 `.state-*` 暗色覆写，换成 SPEC §2 的浅色取值（可以在该选择器下重定义同名变量，或直接用 Tailwind 任意值，取其简）；`AdminWorkspace.tsx` 里写死的暗色 hex（`#E5221E`、`#1F1F1F`、`#1A1A1A`、`bg-black`、`text-white` 等）全部换掉。
3. 教练申请页：在 `src/features/admin/` 内新写（例如 `ApplicationsPage.tsx`），复用 `src/api/onboarding.ts` 的 `getCoachApplications` / `reviewCoachApplication`、`onboarding/text.ts` 的 `errorText`、`onboarding/telemetry.ts` 的 `trackOnboarding`。申请列表在 `AdminWorkspace` 层加载一次，供左栏计数、总览待办、申请页共用，审核成功后本地更新。删除 `CoachApplicationsSection.tsx` 及 `onboarding.css` 中只服务它的 `.onboarding-admin` 样式（确认无其他引用）。
4. 总览、统一页头、用户详情、其余三页换装，按 SPEC §3–§7。
5. 文案：`src/i18n/strings-admin.ts` 中英同步增删；教练申请页文案改走 `S.admin.*`，不再用 `text()` 内联中英。

## 文件范围（预计）
`src/features/admin/AdminWorkspace.tsx`（可拆出 `ApplicationsPage.tsx` 等同目录文件）、`src/features/admin/AdminWorkspace.test.tsx`、`src/api/admin.ts`、`src/api/admin.test.ts`、`src/i18n/strings-admin.ts`、`src/index.css`、`src/features/onboarding/CoachApplicationsSection.tsx`（删）、`src/features/onboarding/onboarding.css`、`src/features/onboarding/onboarding.test.tsx`。超出这个范围先在 JOURNAL 里说明原因。

## 约束
- 不改后端、不加接口、不改锁文件、不加依赖。
- 不动教练端/学员端/入驻页面的样式与行为；`:root` 全局变量不改，只改管理后台作用域。
- 不做暗色、不加主题切换；红色只用于 ADMIN 小标。
- 不 commit、不 push、不开 PR。

## 测试 seam（先红后绿）
- `AdminWorkspace.test.tsx`：先加/改断言并跑红——左栏五项无「计划总览」、默认落总览、待处理计数（左栏 + 待办卡）、总览四数字无「已发布计划」、用户详情计划行不是 button。
- 把 `onboarding.test.tsx` 中两条 `CoachApplicationsSection` 业务测试（确认后才 POST + `welcome_email_sent:false` 后可重发；`COACH_APPLICATION_EMAIL_IS_STUDENT` 报错后仍待处理）迁到 `AdminWorkspace.test.tsx`，经左栏进入教练申请页验证，并补：成功审核后行离开待处理且计数减一、重发成功后「邮件未送达」消失、通过成功打点 `coach_application_approved`。
- 被删的计划相关测试直接删除。

## 验收
SPEC 016 验收清单 1–13；第 14 条浏览器实看由 Claude 收货时做。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件清单、红 → 绿证据（先红的测试名与失败摘要）、`typecheck` / `test` / `build` 三条命令结果、验收清单第 1 条的 grep 结果、拿不准的地方。
