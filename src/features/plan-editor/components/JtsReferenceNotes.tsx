export function JtsDeadliftFootnote({ className = 'week-capacity-deadlift-note' }: { className?: string }) {
  return <small className={className}>硬拉容量个体差异大,约半数人最佳频率为每周 1 次,起点常为深蹲的 1/2-2/3</small>
}

export function JtsVolumeDisclaimer({ className }: { className?: string }) {
  return <small className={className}>参考区间来自 JTS 手册,MRV 是中循环概念——蓄积末周有意超出属正常安排,仅供参考,不校验不拦截</small>
}
