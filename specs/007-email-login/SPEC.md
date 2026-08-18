# 007 — 登录页邮箱通道(海外教练 W5)

- 状态: InProgress(2026-08-18;⚖️David 离线授权代拍 A=补邮箱登录)
- 来源: ⚖️08-14 海外登录拍板(Global 无手机号)+ 08-14 复查发现 coach web 仅手机号通道;
  backend /auth/email/login 已上线(W2);⚖️08-17 海外自建后 plan-web 将双部署(CN 原样 + coach.meetpr.app)。

## 目标
LoginScreen 的账号输入框同时接受手机号或邮箱:含 `@` → POST /auth/email/login `{email,password}`;
否则走既有手机号通道(逐字节不变)。同一 bundle 双环境通用,零配置分叉。

## 要求
1. 输入框 label/placeholder 改为「手机号或邮箱 / Phone or email」双语一行(现有文案风格延续);
   校验:含 @ 时按邮箱格式校验,否则沿用现有手机号校验,错误文案分别给。
2. 邮箱通道错误映射:401 → 「邮箱或密码不正确」;其余沿用现有通用错误面。
3. 手机号路径零回归:既有测试不动照绿;新增邮箱路径测试(成功/401/格式校验)。
4. token 存取、登录后跳转与现有通道完全共用。
5. 门禁:npm run lint(tsc --noEmit)+ vitest run + vite build 全绿。
