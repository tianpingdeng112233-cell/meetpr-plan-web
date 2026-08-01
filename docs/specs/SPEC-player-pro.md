# SPEC — 播放器专业化:0.25× + 逐帧步进 + 冻结帧画笔标注(web)

- 状态:APPROVED(⚖️ 2026-08-01 David 圈选三项)
- 分级:T2 / 上线走 web-swap;仓 meetpr-plan-web,base = origin/main,分支 feat/player-pro
- 背景:专业教练视频审查需求梯队(逐帧判定 > 标注沟通 > 慢放)。A/B 对比、杆路径、VBT 明确不做。

## 一、0.25× 慢放(T0 级)

- `video-speeds` 档位数组 `[0.5,1,1.5,2]` → `[0.25,0.5,1,1.5,2]`,其余逻辑不动。

## 二、逐帧步进

- 常量 `FRAME_SECONDS = 1/30`(学员视频 30fps 拍摄为主;不精确到容器真实帧率,按 1/30 步进即可)。
- 行为:步进时**先暂停**(video.pause()),再 `seekTo(currentTime ± FRAME_SECONDS)`,同步 currentTime state。
- 入口:控制条播放按钮旁 `⏮ᶠ/⏭ᶠ`(样式与现有按钮一致,aria-label 上一帧/下一帧);
  键盘 `,` = 上一帧、`.` = 下一帧(挂 useGlobalKeyboardHandler,guard editable/video/修饰键,与现有 ←/→ 空格同层)。
- 边界:0 与 duration 处夹取(seekTo 已夹取);duration<=0 时忽略。

## 三、冻结帧画笔标注 → 成图发进聊天

### 帧捕获(CORS 前置已现场核实)

- OSS bucket(meetpr-videos-prod.oss-accelerate)预检已返回 `Access-Control-Allow-Origin: *`。
- `<video>` 元素加 `crossOrigin="anonymous"`(拿干净帧的唯一途径)。
- **降级防线**:若带 crossOrigin 加载触发 onError(个别环境 CORS 失效),自动**去掉 crossOrigin 重载一次**
  (复用现有 playbackFailed/retried 机制旁路,别打断现有「URL 过期续签」逻辑),此时播放照常、
  「标注」按钮隐藏(annotateUnavailable)。canvas 导出抛 SecurityError 同样降级为 toast 提示不崩。

### 标注 UI

- 控制条加「✏️ 标注」按钮:点击 → video.pause() → 打开标注层(覆盖在 video-portrait 上,尺寸随显示区):
  - 底图:`drawImage(video)` 按视频**原生分辨率**(videoWidth/Height)画进离屏 canvas;显示层等比缩放。
  - 工具:**画笔(freehand)** 与 **直线** 两种,单一高对比颜色(琥珀 #F59E0B,黑边视频上清晰),线宽按分辨率自适应(~max(4, width/240));
  - 操作:工具切换、撤销(stroke 栈)、清空、取消(关闭标注层)、**「发送到聊天」**;
  - 标注层打开期间禁用全局键盘快捷键(视为编辑态,useGlobalKeyboardHandler 的 editable guard 或局部拦截)。
- 纯绘制逻辑(stroke 栈、坐标换算显示区↔原生分辨率)抽成可单测的纯函数/小模块。

### 发送管线(web 端补「聊天发图」,按 iOS 已在用的后端契约)

1. `POST /uploads/initiate` body `{ kind:'chat_image', size_bytes, content_type:'image/jpeg' }`(≤10MB;返回 attachment id + 分片 PUT URL,小图单分片);
2. `PUT` 合成图(canvas.toBlob('image/jpeg', 0.9))到返回的 OSS URL;
3. `POST /uploads/:attachmentId/complete`;
4. `POST /conversations/:conversationId/messages` body `{ kind:'image', attachment_id, client_id }`(client_id 复用现有 outbox uuid 习惯)。
- 会话来源:当前选中学员的会话;**无会话时先 `openConversation(studentId)`**(网络失败 → toast「发送失败」,标注层保留可重试)。
- 发送成功:关闭标注层,聊天流出现该图(既有 image 渲染/续签逻辑无需改动);发送中按钮 loading 防重复。
- API 层新增放 `src/api/uploads.ts`(或 chat.ts 内),**严禁碰 `configuredApiBase` 函数体**。

## 约束

- 不做:A/B 对比、杆路径追踪、角度量取、多色画笔、文字标注(全部明确 out of scope)。
- 429 走现有 rawRetrying 退避;上传 PUT 直连 OSS 不经后端限流。
- 不做无关重构;CSS 用现有 token。

## 验收标准

1. vitest:速度档含 0.25×;逐帧步进暂停+夹取边界;标注纯函数(stroke 栈/坐标换算);发送管线 mock(initiate→PUT→complete→message 顺序与 payload);crossOrigin 降级路径。
2. `tsc --noEmit && vite build` 通过;lint 干净。
3. 不 commit 不 push,留未提交 diff 等互审。
