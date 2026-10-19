# 011 · 卡 D — 热修：编辑卡里逐组强度 / 重量被截掉

先读仓根 `CONTEXT.md`、`CLAUDE.md` 和 `specs/011-block-editor/SPEC.md` §2。分支 `fix/011-per-set-boxes`（基于 main 67a186c，spec 011 已上线 staging）。

## 现象（David 2026-10-19 线上发现）
编辑卡里一行设为「逐组标重」（3 组 → 3 个重量框）或 RPE 逐组（统一值 + 多个框）时，只看得到第一个框，后面的被裁掉，只能在格内横向滚动，几乎发现不了。旧编辑器里这些框都看得见，属于已上线功能退化（交付红线）。

## 根因（已定位，不用另做假设）
`src/features/plan-editor/components/block-grid.css` 里 `.block-cell .intensity-controls, .block-cell .weight-controls` 设了 `flex-wrap: nowrap; overflow-x: auto`，强度列 / 重量列又窄，多出的框溢出被藏起来。

## 要求
- 逐组的强度框、重量框**全部可见**：放不下就换行，该行随之变高（不再是固定 38–40px 单行），不横向滚动、不裁切。普通单值行的高度和样子不变。
- 1440 宽、历史栏展开时，一行 10 组逐组重量 + 逐组 RPE 也全部可见、可点可输。
- 不回退卡 A / B / C 任何行为；数据模型、reconcile 不动。

## 测试 seam（先红后绿）
- 在现有 block-grid UI 测试（或 pct-anchor / cell-selection 等已有逐组用例旁）加：渲染一行 3 组逐组重量 + 逐组 RPE，断言编辑卡里所有框都在 DOM 且容器不是 `overflow-x: auto` / `nowrap`（沿用卡 A 读取实际 CSS 的断言方式）。先跑红，再改绿。

## 验收
上面要求全部满足；`npm test` 全量、`npx tsc --noEmit`、`npm run build` 通过。浏览器验收由 Claude 在沙箱外做。不 commit、不 push、不改锁文件；在 `docs/CODEX-JOURNAL.md` 追加一段。
