import { readFileSync } from 'node:fs'
import ts from 'typescript'
import onboarding from './onboarding-zh-hant.json'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { S, fmt, setLocale } from './strings'
import { zhHant } from './strings-zh-hant'
import glossary from './glossary-zh-hant.json'
import simplifiedOnly from './simplified-only.json'
import exerciseNames from './exercise-names-zh-hant.json'

const simplified = new Set(simplifiedOnly)
afterEach(() => setLocale('zh'))
it('covers every simplified key, preserves interpolation values, and contains no simplified-only characters', () => {
  setLocale('zh')
  const walk = (zh: unknown, hant: unknown) => {
    expect(typeof hant).toBe(typeof zh)
    if (typeof zh === 'object' && zh !== null) {
      expect(Object.keys(hant as object)).toEqual(Object.keys(zh))
      for (const key of Object.keys(zh)) walk((zh as Record<string, unknown>)[key], (hant as Record<string, unknown>)[key])
    } else {
      const args = ['__A__', '__B__', '__C__', '__D__', '__E__', '__F__']
      const evaluate = (value: unknown) => typeof value === 'function' ? String(value(...args)) : String(value)
      const original = evaluate(zh), result = evaluate(hant)
      expect(result.match(/__[A-F]__/g)).toEqual(original.match(/__[A-F]__/g))
      expect([...result].filter(c => simplified.has(c))).toEqual([])
    }
  }
  for (const key of Object.keys(zhHant) as Array<keyof typeof zhHant>) walk(S[key], zhHant[key])
  for (const text of [...Object.values(exerciseNames), ...Object.values(glossary), ...Object.values(onboarding)]) expect([...text].filter(c => simplified.has(c))).toEqual([])
  expect(glossary).toMatchObject({ '力量举': '健力', '硬拉': '硬舉', '退出登录': '登出', '训练计划': '課表', '视频反馈': '影片反饋', '邮箱': '電子郵件' })
})
it('displays system exercises in Taiwan terms and preserves custom names and interpolated user content', () => {
  setLocale('zh-Hant')
  expect(fmt.exerciseName({ name: '相扑硬拉', created_by_coach_id: null })).toBe('相撲硬舉')
  expect(fmt.exerciseName({ name: '我的卧推' })).toBe('我的卧推')
  expect(fmt.exerciseName({ name: '卧推', custom: true })).toBe('卧推')
  expect(S.auth.loginFailed('用户的错误')).toBe('登入失敗（用户的错误）')
})

it('uses v2.1 bar and lever terms in system exercise displays', () => {
  setLocale('zh-Hant')
  expect(S.common.equipmentLabels.specialty_bar).toBe('特殊槓')
  expect(S.editor.sampleExercises.lowBarSquat).toBe('低槓深蹲')
  expect(S.editor.sampleExercises.safetyBarSquat).toBe('安全槓深蹲')
  expect(fmt.exerciseName({ name: 'EZ杆二头弯举', created_by_coach_id: null })).toBe('EZ槓二頭彎舉')
  expect(fmt.exerciseName({ name: '坐姿杠杆臂屈伸', created_by_coach_id: null })).toBe('坐姿槓桿臂屈伸')
  expect(fmt.exerciseName({ name: 'EZ杆二头弯举', custom: true })).toBe('EZ杆二头弯举')
})

it('uses v2.2 publish and retrieve terms in user-facing copy', () => {
  setLocale('zh-Hant')
  expect(S.editor.publishToStudent).toBe('發布給學員')
  expect(S.auth.resendCode).toBe('重新取得')
  expect(S.video.gettingLink).toBe('正在取得播放連結…')
})

it('keeps checked-in generation current and reproducible', () => {
  expect(() => execFileSync(process.execPath, ['scripts/gen-zh-hant.mjs', '--check'], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow()
}, 30_000)

it('applies every glossary override, including longer overlapping terms', () => {
  expect(glossary).toEqual({
    '力量举': '健力', '卧推': '臥推', '硬拉': '硬舉', '深蹲': '深蹲', '杠铃': '槓鈴', '杠': '槓', '哑铃': '啞鈴',
    '杆': '槓', '杠杆': '槓桿', '次数（reps 义）': '下數', 'N 次（reps 单位）': 'N 下',
    '组': '組', '顶组': '頂組', '退让组': '回退組', '热身组': '熱身組', '减载': '減量', '备赛': '備賽', '巅峰期': '巔峰期',
    '训练计划': '課表', '计划': '課表', '个人记录': '個人紀錄', '个人纪录': '個人紀錄', '最佳纪录': '個人紀錄',
    '视频反馈': '影片反饋', '反馈': '反饋', '视频': '影片', '登录': '登入', '退出登录': '登出', '账号': '帳號',
    '邮箱': '電子郵件', '设置': '設定', '保存': '儲存', '默认': '預設', '消息': '訊息', '信息': '資訊', '推送': '推播',
    '数据': '資料', '屏幕': '螢幕', '网络': '網路', '链接': '連結', '二维码': 'QR Code', '扫码': '掃描 QR Code',
    '点击': '點選', '搜索': '搜尋', '撤销': '復原', '模板': '範本', '拖动': '拖曳', '粘贴': '貼上', '文件': '檔案',
    '上传': '上傳', '激活': '啟用', '发布': '發布', '获取': '取得', '内测': '測試版', '周': '週', '用户': '使用者', '手机号': '手機號碼',
    '“': '「', '”': '」', '‘': '『', '’': '』',
  })
})
it('scans all generated literal branches, not only the exercised interpolation branches', () => {
  const source = ts.createSourceFile('strings-zh-hant.ts', readFileSync('src/i18n/strings-zh-hant.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      expect([...node.text].filter(char => simplified.has(char)), node.text).toEqual([])
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
})

it('uses v2 reps terms only in repetition contexts', () => {
  expect(zhHant.common.reps).toBe('下')
  expect(zhHant.common.countReps(2)).toBe('2 下')
  expect(zhHant.video.repCount(2)).toBe('2 下')
  expect(zhHant.block.historyHint).toContain('近 5 次記錄；填了組數、下數')
  expect(zhHant.auth.rateLimited).toBe('嘗試次數過多，請稍後重試')
  expect(zhHant.stats.board.sessions(3)).toBe('3 次')
  expect(zhHant.stats.context.historyRecent(3, 2)).toContain('最近 2 次')
})
