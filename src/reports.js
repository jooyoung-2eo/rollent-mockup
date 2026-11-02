import { db, evaluatorsFor, getEvaluation, teamName, leadersOf } from './store'
import { stageLabel } from './constants'
import { fmt } from './scoring'

// 보고서에 쓰는 문항별 점수. 현재 배정된 평가자의 제출 응답만 쓴다(평가자 이름은 넣지 않는다).
export function questionScores(user, stage) {
  const evals = evaluatorsFor(user, stage).map((e) => getEvaluation(stage, user.id, e.id)).filter((ev) => ev?.status === 'submitted')
  return db.items.filter((it) => it.stages.includes(stage)).flatMap((it) => it.questions.filter((q) => q.type === 'choice').map((q) => {
    const scores = evals.map((ev) => q.choices.find((c) => c.id === ev.answers[q.id])?.score).filter((s) => typeof s === 'number')
    const max = Math.max(...q.choices.filter((c) => !c.deleted && typeof c.score === 'number').map((c) => c.score), -Infinity)
    return {
      item: it.name, text: q.text,
      score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      max: Number.isFinite(max) ? max : null,
      count: scores.length,
    }
  }))
}

// 면담 보고서에 넣어도 되는 서술형·주관식 응답 (문항 설정에서 '면담 보고서에 포함'을 켠 것만)
export function shareableTexts(user) {
  const out = []
  ;['leader', 'members', 'exec'].forEach((stage) => {
    const evals = evaluatorsFor(user, stage).map((e) => getEvaluation(stage, user.id, e.id)).filter((ev) => ev?.status === 'submitted')
    db.items.forEach((it) => it.questions.filter((q) => q.type !== 'choice' && q.shareInInterview && it.stages.includes(stage)).forEach((q) => {
      evals.forEach((ev) => {
        const v = ev.answers[q.id]
        if (v && String(v).trim()) out.push({ stage: stageLabel(stage), question: q.text, text: String(v).trim() })
      })
    }))
  })
  return out
}

// 항목 점수 비율로 본 상·하위 항목 (근거가 있는 점수만, 참고용)
export function itemExtremes(row) {
  const list = []
  row.stages.forEach((s) => s.items.forEach((i) => {
    if (i.score.value !== null && i.item.points) list.push({ name: `${i.item.name} (${stageLabel(s.stage)})`, ratio: i.score.value / i.item.points, score: i.score.value, points: i.item.points })
  }))
  if (list.length < 2) return { high: [], low: [] }
  const sorted = [...list].sort((a, b) => b.ratio - a.ratio)
  const top = sorted[0].ratio
  const bottom = sorted[sorted.length - 1].ratio
  if (top === bottom) return { high: [], low: [] } // 차이가 없으면 강점·약점을 가르지 않는다
  return { high: sorted.filter((x) => x.ratio === top), low: sorted.filter((x) => x.ratio === bottom) }
}

export const leaderNameOf = (user) => leadersOf(user.teamId).filter((l) => l.id !== user.id).map((l) => l.name).join(', ') || '-'
export const valueText = (v) => (v?.value === null || v?.value === undefined ? `미확정 (${v?.reason ?? '값 없음'})` : fmt(v.value))
export { teamName, fmt }
