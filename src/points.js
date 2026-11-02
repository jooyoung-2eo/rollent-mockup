import { STAGES, STAGE_KEYS } from './constants'

// 평가표(평가 단계)별 배점 검증.
// 배점은 평가 항목에 매기고, 항목은 여러 평가 단계에 쓰인다. 단계마다 평가표가 따로이므로
// '그 단계에 쓰이는 점수 항목의 배점 합'이 단계별로 정확히 100점이어야 한다(단계끼리 합치지 않는다).
// 화면 표시와 실제 저장(store.commitItems) 모두 이 함수를 쓴다.

export const POINTS_TARGET = 100
const hasChoice = (it) => it.questions.some((q) => q.type === 'choice')
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export function pointsReport(items, settings) {
  const itemErrors = []
  items.forEach((it) => {
    const p = it.points
    if (hasChoice(it)) {
      if (p === null || p === undefined || p === '') itemErrors.push(`'${it.name}' 항목의 배점이 입력되지 않았습니다.`)
      else if (!isNum(p) || p <= 0) itemErrors.push(`'${it.name}' 항목의 배점은 0보다 큰 숫자여야 합니다.`)
    } else if (p !== null && p !== undefined && p !== '') {
      itemErrors.push(`'${it.name}' 항목에는 객관식 문항이 없어 배점이 점수에 반영되지 않습니다. 배점을 비우거나 객관식 문항을 추가하세요.`)
    }
  })
  // 꺼진 단계(팀원평가 사용 안 함)는 평가표가 쓰이지 않으므로 검사하지 않는다
  const stages = STAGE_KEYS.filter((s) => s !== 'members' || settings.memberEvalEnabled).map((stage) => {
    const scored = items.filter((it) => it.stages.includes(stage) && hasChoice(it) && isNum(it.points))
    const total = Math.round(scored.reduce((a, it) => a + it.points, 0) * 100) / 100
    const diff = Math.round((total - POINTS_TARGET) * 100) / 100
    return { stage, label: STAGES[stage].label, total, diff, ok: diff === 0, items: scored.map((it) => ({ name: it.name, points: it.points })) }
  })
  return { stages, itemErrors, ok: !itemErrors.length && stages.every((s) => s.ok) }
}

// 예: '현재 배점 합계: 95점 / 100점 (5점 부족)'
export function totalText(s) {
  const tail = s.diff === 0 ? '' : s.diff < 0 ? ` (${-s.diff}점 부족)` : ` (${s.diff}점 초과)`
  return `현재 배점 합계: ${s.total}점 / ${POINTS_TARGET}점${tail}`
}
