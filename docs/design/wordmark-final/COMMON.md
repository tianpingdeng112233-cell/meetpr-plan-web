# 定稿字标替换 · 三卡共用约定（2026-11-27，T1，David 已拍「全换」）

- 先读本仓 `CONTEXT.md`（有则读）与 `AGENTS.md`/`CLAUDE.md`。
- 素材唯一来源已放进本 worktree：
  - 浅色底 `meetpr-wordmark-final.svg`：藏青色块 #111827、字 #F5F6F8、P 里金色圆章 #D97706
  - 深色底 `meetpr-wordmark-final-on-dark.svg`：色块与字反色，圆章缩到 95%（David 定）
  - 都是纯 path，viewBox `0 0 2443 605`，宽高比 2443:605（18 高 ≈ 72.7 宽，21 高 ≈ 84.8，23 高 ≈ 92.9，24 高 ≈ 96.9）
- **不得重绘、改形状、改颜色、裁边、加描边或阴影**；原文件字节不改。资源按平台惯例引入（矢量优先）。
- 参照物：`docs/design/wordmark-final/reference.png`（右列「换成定稿」为目标效果，左列为现状）。尺寸以本卡写的高度为准，宽度按比例，左对齐处保持左对齐、原位置不动。
- 不改其它任何界面、文案、导航；不碰 App 图标；不碰教练端 App 界面（暂缓）。
- 顺手看到 App 内出现「内测」「TestFlight」「安卓」等字样，**不要改**，在 JOURNAL 里列出位置。
- 先红后绿：在卡内指定 seam 先写会红的测试，再改实现。
- JOURNAL：`docs/journal/2026-11-27-wordmark-final-<卡>.md`（本卡一个文件），写清改了什么、测试命令与结果、截图（如能截）、遗留。
- 不 commit、不 push、不开 PR（由 Opus 收货后做）；完成时 `git status` 列出改动文件。
