# 027-A — 视频与计划定位联动

先读已有 CONTEXT.md、CLAUDE.md、SPEC.md 与 design/approved.html。

- 目标与验收：完成 SPEC 六项清单；保留浮窗外观，补齐定位、播放日高亮、首尾滚动和自由浏览。
- 范围：plan-editor 的 BlockGrid、视频浮窗/播放目标接线与相关 CSS、回归用例；一个写者、一张卡。
- 约束：播放上下文与编辑选择分离；自动滚动不跟随悬停或播放进度；拖动不破坏现有积木排序、框选与编辑；不得写真实后端或改变计划树。
- 测试 seam：SPEC 中既有 PlanEditor/EditorFeedbackHandle 与真实浏览器布局；逐行为先红后绿。
- Out of Scope：同 SPEC。开发证据追加 docs/journal/2026-11-13-027-A.md。
