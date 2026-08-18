// Chinese parsing and canonical-name tokens are protocol data, not display copy.
// They intentionally never depend on the current locale.
export const STABLE_ZH = {
  bodyweight: '自重',
  unknownExercise: '未知动作',
  liftNameTokens: { squat: '深蹲', bench: '卧推', deadlift: '硬拉' },
  weekdaysMondayFirst: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  patterns: {
    bodyweight: /自重|bodyweight/i,
    reps: /^(\d{1,2})(?:\s*(?:(?:-|–|—|~|到|至)\s*(\d{1,2})|(\+)))?$/,
    repsCharacter: /[0-9\-–—~到至+]/,
    repRange: /(\d{1,2})\s*(?:-|–|—|~|到|至)\s*(\d{1,2})/,
    curl: /二头.*弯举|弯举.*二头/,
  },
  catalogGuess: {
    lift: { bench: /卧推|bench/, deadlift: /硬拉|deadlift/, squat: /蹲|squat/ },
    equipment: { dumbbell: /哑铃|db|dumbbell/, barbell: /杠铃|barbell/, cable: /绳索|龙门|cable/, band: /弹力|弹力带|band/, machine: /器械|machine|史密斯/, kettlebell: /壶铃|kettlebell/, specialty_bar: /安全杆|ssb|特殊杆/ },
    muscle: { core: /平板|支撑|腹|卷腹|核心|core|plank/, chest: /卧推|俯卧撑|胸|夹胸|chest|push.?up/, back: /划船|下拉|引体|背|row|pulldown|pull.?up/, shoulder: /肩|推举|侧平举|shoulder|press/, triceps: /三头|臂屈伸|triceps/, biceps: /二头|弯举|biceps|curl/, glute: /臀|glute|臀推|髋推/, hamstring: /腘|腿弯举|hamstring/, hip: /髋|hip/, quad: /蹲|腿举|腿屈伸|quad|股四/ },
    movement: { squat: /蹲|腿举|squat/, hip_hinge: /硬拉|臀推|髋推|hinge|deadlift/, horizontal_push: /卧推|俯卧撑|夹胸|horizontal.*push/, vertical_push: /推举|实力推|肩推|press/, horizontal_pull: /划船|row/, vertical_pull: /下拉|引体|pulldown|pull.?up/, warm_up: /热身|激活|warm/ },
  },
  aliases: {
    dumbbellBench: '哑铃卧推', flatDumbbellBench: '平板哑铃卧推', lyingDumbbellBench: '平躺哑铃卧推', anyBicepsCurl: '任意二头弯举', anyBiceps: '任意二头', biceps: '二头', dumbbellCurl: '哑铃二头弯举', pauseDeadlift: '暂停硬拉', sumoPauseDeadlift: '相扑暂停硬拉', conventionalPauseDeadlift: '传统暂停硬拉',
  },
  clipboard: {
    header: '动作\t组\t次\t强度类型\t强度值\t重量模式\t重量\t备注\t百分比锚点', bodyweight: '自重', none: '无', perSetWeight: '逐组标重', weightRange: '重量区间', fixedWeight: '固定重量', everySetBodyweight: '每组自重', topSet: '当日顶组', weightMode: '重量模式', weight: '重量', pctAnchor: '百分比锚点', exercise: '动作', legacyPerSetRpe: '旧逐组rpe', perSet: '逐组',
  },
  setRef: { logged: '[训练分享]', planned: '[训练计划]', plannedSuffix: ' 计划' },
  import: {
    countToken: String.raw`(?:\d{1,2}|[一二两三四五六七八九十]{1,3})`, countDigits: { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 } as Record<string, number>, ten: '十', tenPattern: /^([一二两三四五六七八九])?十([一二两三四五六七八九])?$/,
    timeSuffix: /^\s*(?:s|S|秒)/, failurePattern: /力竭/, failure: '力竭', dropSetPattern: /降组/, dropSet: '降组', backoffPattern: /回组/, backoff: '回组', pauseDuration: /(?:长)?暂停\s*(?:卧推|深蹲|硬拉)?\s*(\d+(?:\.\d+)?)\s*(?:s|S|秒)/,
    timedRange: /^(\d+(?:\.\d+)?)\s*(s|S|秒)?\s*(?:-|–|—|~|到|至)\s*(\d+(?:\.\d+)?)\s*(?:s|S|秒)$/,
    timedSingle: /^(\d+(?:\.\d+)?)\s*(?:s|S|秒)$/, kg: /kg|公斤/gi, markerWords: /力竭|降组|回组/g, pauseCleanup: /(?:长)?暂停\s*(?:卧推|深蹲|硬拉)?\s*\d*\s*(?:s|S|秒)?/g,
    bodyweightCue: /自重|徒手|bodyweight|弹力带|弹力绳|弹力|band|磅数/i, ramp: /(\d+(?:\.\d+)?)\s*(?:→|->|~)\s*(\d+(?:\.\d+)?)\s*(?:\+|递增|加)\s*(\d+(?:\.\d+)?)/,
    setRepsCleanup: /\b\d{1,2}\s*(?:[*＊xX×]\s*|[组組]\s*)\d{1,2}\b/g, setCleanup: /\d{1,2}\s*[组組]/g, repRangeCleanup: /\d{1,2}\s*(?:-|–|—|~|到|至)\s*\d{1,2}\s*(?:个|次)?/g,
    eventOnly: /(?:\bIPF\b|比赛|赛事|锦标赛|公开赛|邀请赛)/i, spoto: /^spoto\s*暂停(?:卧推)?\s*(\d+(?:\.\d+)?)?\s*(?:s|S|秒)?$/i, spotoName: 'spoto 暂停卧推', ssbTempo: /^安全[杆杠]节奏(?:深)?蹲\s*([0-9０-９]{3})$/, ssbTempoName: '安全杠节奏深蹲', pauseName: /^(?:长)?暂停\s*(卧推|深蹲|硬拉)\s*(\d+(?:\.\d+)?)?\s*(?:s|S|秒)?$/, pausePrefix: '暂停', rest: /休息/,
    compositeArms: /^二三头自选\s*[*＊xX×]\s*2$/, compositeChoices: ['二头动作自选', '三头肌自选'], optionalNote: '自选',
  },
} as const

export function stableSetRefFirstLine(setRef: {
  source: 'logged' | 'planned'; exercise_name: string; set_number: number; set_total: number | null; weight_kg: string | null; reps: number | null; reps_max: number | null; rpe: string | null; day_date: string
}): string {
  const prefix = setRef.source === 'logged' ? STABLE_ZH.setRef.logged : STABLE_ZH.setRef.planned
  const setTotal = setRef.set_total === null ? '' : `/${setRef.set_total}`
  const planned = setRef.source === 'planned' ? STABLE_ZH.setRef.plannedSuffix : ''
  const weight = setRef.weight_kg === null ? '-kg' : `${setRef.weight_kg}kg`
  const reps = setRef.reps === null ? '-' : `${setRef.reps}${setRef.reps_max === null ? '' : `-${setRef.reps_max}`}`
  const rpe = setRef.rpe === null ? '' : ` @RPE${setRef.rpe}`
  return `${prefix} ${setRef.exercise_name} 第${setRef.set_number}组${setTotal}${planned} ${weight}×${reps}${rpe} (${setRef.day_date})`
}

export const STABLE_IMPORT_SET_REPS = {
  full: new RegExp(`(${STABLE_ZH.import.countToken})\\s*(?:[*＊xX×]\\s*|[组組]\\s*)(${STABLE_ZH.import.countToken})(?:\\s*(?:-|–|—|~|到|至)\\s*(${STABLE_ZH.import.countToken}))?\\s*(?:个|次)?`),
  setOnly: new RegExp(`(${STABLE_ZH.import.countToken})\\s*[组組]`),
  range: new RegExp(`(${STABLE_ZH.import.countToken})\\s*(?:-|–|—|~|到|至)\\s*(${STABLE_ZH.import.countToken})\\s*(?:个|次)?`),
  single: new RegExp(`(${STABLE_ZH.import.countToken})\\s*(?:个|次)?`),
} as const
