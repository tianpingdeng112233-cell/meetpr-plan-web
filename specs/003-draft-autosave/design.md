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

- **`src/features/plan-editor/autosave.ts` — `createSaveController({ delay, persist })`**:纯 JS,不含 React。**单一串行化保存队列**——手动保存、防抖自动保存、离开计划的 flush 全走同一个 in-flight 队列(`drain` 循环:`while(dirty){dirty=false; await persist()}`),所以并发触发**永不丢编辑、永不双重 reconcile**。`persist()` 由 PlanEditor 提供、自己读最新内容、返回是否成功(失败则保留 dirty 等下次重试)。暴露 `scheduleAutosave()` / `saveNow()`(立即,可 await 成败)/ `flush()`(有待存才落,卸载用)/ `cancelAutosave()`(只丢防抖计时器、不清 dirty)。`setTimeout` 驱动 → `vi.useFakeTimers()` 完整单测(仓库无 RTL,可测逻辑抽到这里)。
- **PlanEditor 接线**:`persistRef` 每次 render 重新赋值(读最新 `weeks`/`onSave`/`published`/状态文字);`useRef(createSaveController(...))`;`useEffect([weeks, published])` 跳首帧后 `scheduleAutosave()`(`published || publishing` 时 `cancelAutosave()`);卸载 `useEffect` `flush()`。手动按钮 → `saveNow()`。
- **发布协调(publishing 闩)**:客户端 `published` 只在发布往返**之后**才置真,存在一个"服务端已发布、客户端还以为是草稿"的窗口。`handlePublish` 一进来就 `publishing.current=true` + `cancelAutosave()`,然后 **`flush()` 先把待存草稿落库**(所见即所发),再 `onPublish()`,最后 `setPublished(true)`;失败才解闩。调度 effect 与手动保存都查 `publishing`,发布窗口内一律不自动保存。

## 范围 / 分支

建在 **main**(生产基线,下次 `vercel --prod` 生效)。feat/002 合并时继承;届时 `onSave(weeks, importedStart)` 签名 + xlsx 导入进草稿也顺带被自动保存(导入不设例外),合并时把 autosave 的 `save` 适配成带 `importedStart`。

## 测试

`autosave.test.ts`(fake timers,9 例):防抖只存一次、advance < delay 不存、`saveNow` 成/败、`saveNow` 失败保留 dirty 下次重试、`flush` 有待存才落、`cancelAutosave` 丢计时器但 flush 仍能落、**并发途中再改会二次存且存的是最新内容(findings 3/4 回归)**、**in-flight 中 flush 仍落最后一版(卸载安全)**。组件接线因无 RTL 靠类型 + 手动验证 + adversarial review。

## 评审发现的并发问题(已修)
首版(`createAutosaver`)经 8-agent adversarial review 抓到 5 个真 bug,故改成上面的串行控制器 + publishing 闩:
- **HIGH · published 覆盖**:发布往返期间(client `published` 仍 false)已排程的自动保存计时器 / 卸载 flush 会静默 reconcile 刚发布的计划 → publishing 闩 + 发布前先 flush 草稿修复。
- **HIGH · 草稿丢数据**:手动保存 in-flight 时到达的编辑被 `if(saving)return` 吞掉不重排;卸载 flush 在 in-flight 时空转 + `dispose` 抑制重排 → 串行队列 drain 循环(永不丢)修复。
- **MEDIUM · 发布吞最后编辑**:1.5s debounce 内编辑后立刻发布,`cancel` 丢掉未落库编辑 → 发布前 `flush()` 修复(所见即所发)。
