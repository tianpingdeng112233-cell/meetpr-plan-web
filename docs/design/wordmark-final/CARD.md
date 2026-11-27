# 卡 Web：教练网页定稿字标（meetpr-plan-web，worktree `/Users/david/Projects/apps/meetpr-plan-web-wt-wordmark`，分支 `feat/wordmark-final`，基于 origin/main@1ed36ec）

网页只做浅色，只用浅色版。

## 目标
教练网页上四处品牌位换成定稿字标（浅色版），统一 24 高（宽 ≈ 96.9）。

## 文件范围
- 新增 `public/meetpr-wordmark.svg`：从 `docs/design/wordmark-final/meetpr-wordmark-final.svg` 原样复制（字节一致）。`docs/design/wordmark-final/` 下的参照图与源文件保留在仓里。
- `src/features/plan-editor/components/TopBar.tsx`：把 `<img src="/meetpr-icon-64.png" …30×30>` + `<b className="block-brand">MeetPR</b>` 换成一个字标 `<img src="/meetpr-wordmark.svg" alt="MeetPR" height=24>`；其后的分隔线与其余内容不动。`.block-brand` 样式若再无引用则删。
- `src/features/workspace/CoachShell.tsx`：顶栏 `coach-mark`（24×24 App 图标）换成字标 24 高；面包屑等其余不动，必要时只调 `.coach-mark` 的宽度样式。
- `src/features/auth/LoginScreen.tsx`：去掉黑色 “M” 方块和 “MeetPR” 文字，换成字标 24 高；右侧 “COACH” 标签保留。
- `src/features/onboarding/OnboardingPages.tsx`：页头链接 “MeetPR” 文字换成字标 24 高（仍是指向 `/` 的链接，alt="MeetPR"）；`onboarding.css` 相应调整。
- 抽一个小组件（如 `src/components/Wordmark.tsx`）统一四处，避免四份 `<img>` 各写尺寸。
- favicon（`meetpr-icon-32.png`）与其它图标不动。

## 验收标准
1. 四处均显示定稿字标浅色版，24 高、比例不变形，原有布局不挤压换行（TopBar 56 高一行不溢出到第二行）。
2. 可访问名称仍为 “MeetPR”。
3. `npx tsc --noEmit`、`npm test`（vitest 全量）、`npm run build` 全绿。本仓没有 GitHub CI，以本地三项为合并闸门。

## 测试 seam（先红后绿）
- 更新 `TopBar.test.tsx` 中断言 `src` 含 `meetpr-icon` 的那条：改为断言字标 `src` 为 `/meetpr-wordmark.svg`、height 为 24、alt 为 MeetPR。
- Wordmark 组件一条渲染测试即可；其余三处不必各写。
- 页面截图由 Opus 收货时做。
