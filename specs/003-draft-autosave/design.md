# 003 · 草稿自动保存(Draft Autosave)

状态:已定稿(David 2026-07-01 口头通过设计)。范围:`apps/meetpr-plan-web` 计划编辑器。

## 目标 / 非目标

**目标**:草稿计划边写边自动落库,教练不必惦记点保存。
**非目标**:
- **已发布计划不自动保存**。已发布仍走手动「更新计划」+ `window.confirm`——自动保存一份学员正在看的计划,等于重开发布守卫刚堵掉的静默覆盖(commit `5b1e963` / `a0da2f1`)。
- 不做离线队列、不做多端冲突合并(单教练编辑 + `reconcile` 幂等即可)。

## 行为

- **触发**:草稿态(`!published` 且有 `onSave`)下,编辑内容(`weeks`)变化 → 停手 **1500ms** 后自动 `reconcile` 落库。**跳过首帧**(刚加载的初始 `weeks` 不算改动,避免"打开即存")。
- **指示**(复用顶栏 `statusText`):`自动保存中…` → 成功 `草稿 · 已自动保存` → 失败 `自动保存失败 · 改动已保留`。失败**不丢数据**,下次编辑再触发重试。
- **手动按钮保留**(David 选):草稿态「保存草稿」= 立即存一份的保险;已发布态「更新计划」不变。
- **并发合并**:一次落库进行中不重叠;若落库途中又有编辑,存完再存一次,收敛到最新。
- **卸载补存**:切学员 / 切计划(PlanEditor 因 `key` 卸载)时,若有已排程未落库的改动,**立即补存一次**(存到正被离开的那份计划),避免丢最后 <1.5s 的编辑。发布使草稿态结束时,取消尚未触发的自动保存。

## 结构(隔离边界)

- **`src/features/plan-editor/autosave.ts` — `createAutosaver({ delay, save })`**:纯 JS 定时器逻辑,不含 React。暴露 `schedule()`(防抖重排)/ `flush()`(立即落一次待存)/ `cancel()`(取消待存)/ `dispose()`(卸载后阻止再排程)。承载 debounce + 并发合并,`setTimeout` 驱动 → 用 `vi.useFakeTimers()` 可完整单测(仓库无 RTL,把可测逻辑抽离到这里)。
- **PlanEditor 接线**:`useRef(createAutosaver(...))` + 一个 `useEffect([weeks, published])` 跳首帧后 `schedule()`(published 时 `cancel()`),另一个卸载 `useEffect` `flush()`+`dispose()`。真正的落库 `save` 用 `ref` 指向最新闭包(读最新 `weeks` / `onSave`),状态文字仍在 PlanEditor。

## 范围 / 分支

建在 **main**(生产基线,下次 `vercel --prod` 生效)。feat/002 合并时继承;届时 `onSave(weeks, importedStart)` 签名 + xlsx 导入进草稿也顺带被自动保存(导入不设例外),合并时把 autosave 的 `save` 适配成带 `importedStart`。

## 测试

`autosave.test.ts`(fake timers):防抖只存一次、advance < delay 不存、`flush` 立即存、并发途中再改会二次存、`cancel` 不存、`dispose` 后不再排程。组件接线因无 RTL 靠类型 + 手动验证。
