import { db, stagesFor, evaluatorsFor, getEvaluation, stageStatus, targetStatus, isEvalTarget } from './store'
import { GRADES, POLICY_OPTIONS, ROLE_RATIO_ELEMENTS, RATIO_ELEMENTS } from './constants'

// 평가 결과 계산 파이프라인
// 응답 → 항목 점수 → 단계 점수 → 가중치 적용(개인평가) → 부서 KPI 반영 → 보정 → 직접 수정 → 등급
// 정해지지 않은 정책이 있으면 숫자를 만들지 않고 { value: null, reason } 으로 이유를 남긴다.

const ok = (value) => ({ value, reason: null })
const pending = (reason) => ({ value: null, reason })
const round2 = (n) => Math.round(n * 100) / 100

export const fmt = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? '-' : Number(v.toFixed(digits)).toString())

// ---- 문항·항목 ----

const choiceOf = (q, choiceId) => q.choices.find((c) => c.id === choiceId)
const maxChoiceScore = (q) => {
  const scores = q.choices.filter((c) => !c.deleted && typeof c.score === 'number').map((c) => c.score)
  return scores.length ? Math.max(...scores) : null
}

// 점수에 쓰이는 항목: 배점이 있고 객관식 문항이 하나 이상
export const isScoredItem = (it) => typeof it.points === 'number' && it.points > 0 && it.questions.some((q) => q.type === 'choice')
export const scoredItemsFor = (stage) => db.items.filter((it) => it.stages.includes(stage) && isScoredItem(it))

// 평가자 한 명의 응답으로 항목 점수 계산
export function itemScore(item, answers) {
  const rule = db.settings.itemScoreRule
  const qs = item.questions.filter((q) => q.type === 'choice')
  const parts = []
  for (const q of qs) {
    const c = choiceOf(q, answers[q.id])
    if (!c) return pending(`'${q.text}' 미응답`)
    if (typeof c.score !== 'number') return pending(`'${c.label}' 선택지 점수 미설정`)
    const max = maxChoiceScore(q)
    if (!max) return pending(`'${q.text}' 최고 점수 미설정`)
    parts.push({ s: c.score, max })
  }
  if (!rule) return pending('항목 점수 계산 규칙 미설정')
  if (rule === 'avgRatio') return ok(item.points * (parts.reduce((a, p) => a + p.s / p.max, 0) / parts.length))
  return ok(item.points * (parts.reduce((a, p) => a + p.s, 0) / parts.reduce((a, p) => a + p.max, 0)))
}

// ---- 단계 ----

export function stageResult(target, stage) {
  const status = stageStatus(target, stage)
  const items = scoredItemsFor(stage)
  const max = items.reduce((a, it) => a + it.points, 0)
  const base = { stage, status, max, items: items.map((it) => ({ item: it, score: pending('평가 미완료') })), raw: pending('평가 미완료'), score100: pending('평가 미완료') }
  if (status === 'unassigned') return { ...base, raw: pending('평가자 배정 필요'), score100: pending('평가자 배정 필요') }
  if (status !== 'done') return base
  if (!items.length) return { ...base, raw: pending('점수 문항 없음'), score100: pending('점수 문항 없음') }

  const evaluators = evaluatorsFor(target, stage)
  if (evaluators.length > 1 && !db.settings.multiEvaluatorRule) {
    const r = pending('다수 평가자 합산 방식 미설정')
    return { ...base, items: items.map((it) => ({ item: it, score: r })), raw: r, score100: r }
  }
  // 평가자별 항목 점수 → 평균 (평가자가 한 명이면 그대로)
  const itemRows = items.map((it) => {
    const scores = evaluators.map((e) => itemScore(it, getEvaluation(stage, target.id, e.id).answers))
    const bad = scores.find((s) => s.value === null)
    return { item: it, score: bad ? pending(bad.reason) : ok(scores.reduce((a, s) => a + s.value, 0) / scores.length) }
  })
  const bad = itemRows.find((r) => r.score.value === null)
  if (bad) return { ...base, items: itemRows, raw: pending(bad.score.reason), score100: pending(bad.score.reason) }
  const raw = itemRows.reduce((a, r) => a + r.score.value, 0)
  return { ...base, items: itemRows, raw: ok(raw), score100: ok((raw / max) * 100) }
}

// ---- 가중치 ----

// 역할의 가중치가 현재 켜진 단계 기준으로 유효한지
export function weightCheck(role, stages) {
  const w = db.weights[role]
  if (!w) return { valid: false, reason: '가중치 대상 아님' }
  const missing = stages.filter((s) => typeof w[s] !== 'number')
  if (missing.length) return { valid: false, reason: '가중치 미설정' }
  const sum = stages.reduce((a, s) => a + w[s], 0)
  if (Math.abs(sum - 100) > 0.001) return { valid: false, reason: `가중치 합계 ${sum}% (100% 필요)` }
  return { valid: true, reason: null }
}

// 결과 산출 대상: 활성 평가 대상자 (임원은 상향평가가 생겨 결과 산출 대상에 포함)
export const resultTargets = () => db.users.filter((u) => isEvalTarget(u) && stagesFor(u).length)

// 개인평가 점수: 켜진 1·2·3차 단계 점수를 단계 가중치로 합친다
// (팀장은 자기·팀원(상향)·임원평가, 임원은 자기·상향평가)
function personBase(t) {
  const stages = stagesFor(t)
  const stageRows = stages.map((s) => stageResult(t, s))
  let weighted
  const stageBad = stageRows.find((r) => r.score100.value === null)
  if (stageBad) weighted = pending(stageBad.score100.reason)
  else {
    const wc = weightCheck(t.role, stages)
    weighted = wc.valid ? ok(round2(stageRows.reduce((a, r) => a + (r.score100.value * db.weights[t.role][r.stage]) / 100, 0))) : pending(wc.reason)
  }
  const weights = stages.map((s) => ({ stage: s, weight: db.weights[t.role]?.[s] ?? null }))
  return { user: t, status: targetStatus(t), stages: stageRows, weights, weighted }
}

// ---- 팀 KPI ----
// 지표 달성률: 높을수록 좋음 = 실적 ÷ 목표, 낮을수록 좋음 = 목표 ÷ 실적. 환산점수는 달성률(최대 100).
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
export function indicatorRate(i) {
  if (!isNum(i.target) || !isNum(i.actual) || i.target <= 0 || i.actual < 0) return null
  if (i.direction === 'lower') return i.actual === 0 ? null : (i.target / i.actual) * 100
  return (i.actual / i.target) * 100
}
export const indicatorScore = (i) => {
  const r = indicatorRate(i)
  return r === null ? null : Math.min(r, 100)
}
export const teamKpiData = (teamId) => db.teamKpi[db.period.id]?.[teamId] ?? null
export function teamKpiOf(teamId) {
  const t = teamKpiData(teamId)
  if (!t) return pending('팀 KPI 미입력')
  if (t.mode === 'direct') return isNum(t.direct) ? ok(round2(t.direct)) : pending('팀 KPI 직접 입력값 없음')
  const list = t.indicators ?? []
  if (!list.length) return pending('팀 KPI 지표 없음')
  const sum = round2(list.reduce((a, i) => a + (Number(i.weight) || 0), 0))
  if (sum !== 100) return pending(`팀 KPI 가중치 합계 ${sum}% (100% 필요)`)
  let total = 0
  for (const i of list) {
    const c = indicatorScore(i)
    if (c === null) return pending(`'${i.name}' 목표·실적 확인 필요`)
    total += (c * i.weight) / 100
  }
  return ok(round2(total))
}

// 직급별 비율 검사
export function ratioCheck(role, ratios = db.roleRatios[role]) {
  const els = (ROLE_RATIO_ELEMENTS[role] ?? []).filter((e) => ratios?.[e]?.on)
  if (!els.length) return { valid: false, reason: '직급별 비율 미설정', els }
  if (els.some((e) => !isNum(ratios[e].value) || ratios[e].value < 0)) return { valid: false, reason: '직급별 비율 값 확인 필요', els }
  const sum = round2(els.reduce((a, e) => a + ratios[e].value, 0))
  if (sum !== 100) return { valid: false, reason: `직급별 비율 합계 ${sum}% (100% 필요)`, els }
  return { valid: true, reason: null, els }
}
export const ratioText = (role) => {
  const c = ratioCheck(role)
  return c.valid ? c.els.map((e) => `${RATIO_ELEMENTS[e].label} ${db.roleRatios[role][e].value}%`).join(' · ') : c.reason
}

// 개인평가 점수에 팀 KPI 실적을 직급별 비율로 반영한다 (보정 전 점수)
function ratioOf(row) {
  const kpi = teamKpiOf(row.user.teamId)
  const parts = { personal: row.weighted, kpi }
  const c = ratioCheck(row.user.role)
  const base = { kpi }
  if (!c.valid) return { ...base, after: pending(c.reason) }
  const bad = c.els.find((e) => parts[e].value === null)
  if (bad) return { ...base, after: pending(parts[bad].reason) }
  return { ...base, after: ok(round2(c.els.reduce((a, e) => a + (parts[e].value * db.roleRatios[row.user.role][e].value) / 100, 0))) }
}

// 개인별 보정. 보정값은 부서 KPI 반영 후 점수에 더하는 점수(±)이며, 저장하면 바로 반영된다.
// applied: 'none' 보정값 없음 · 'applied' 적용됨 · 'pending' 앞 단계 보류
export function correctionOf(row) {
  const person = db.personCorrections[row.user.id] ?? null
  const before = row.kpiAfter
  const pv = person ? person.value : null
  const base = { person: pv, personReason: person?.reason ?? '', before }
  if (before.value === null) return { ...base, after: pending(before.reason), applied: 'pending' }
  if (pv === null) return { ...base, after: ok(before.value), applied: 'none' }
  return { ...base, after: ok(round2(before.value + pv)), applied: 'applied' }
}

// 최종 점수 직접 수정. 보정 결과를 덮어쓰지 않고 따로 둔 값으로 최종 점수를 정한다.
function overrideOf(row) {
  const o = db.overrides[row.user.id] ?? null
  if (!o) return { override: null, final: row.corrected }
  if (row.weighted.value === null) return { override: o, final: pending('평가 미완료 (직접 수정값 보류)') }
  return { override: o, final: ok(o.score) }
}

// ---- 등급 ----

export function gradeCheck() {
  const g = db.settings.grade
  if (g.mode === 'absolute') {
    const c = g.cutoffs ?? {}
    if (['A', 'B', 'C'].some((k) => typeof c[k] !== 'number')) return { valid: false, reason: '절대평가 등급 기준 점수 미설정' }
    if (!(c.A > c.B && c.B > c.C)) return { valid: false, reason: '등급 기준 점수는 A > B > C 순이어야 함' }
    return { valid: true, reason: null }
  }
  const values = GRADES.map((k) => g.ratios[k])
  if (values.some((v) => typeof v !== 'number')) return { valid: false, reason: '등급 비율 미설정' }
  const sum = values.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 0.001) return { valid: false, reason: `등급 비율 합계 ${sum}% (100% 필요)` }
  if (!g.rounding) return { valid: false, reason: '등급 인원 반올림 방식 미설정' }
  if (!g.ties) return { valid: false, reason: '동점자 처리 방식 미설정' }
  return { valid: true, reason: null }
}

function assignGrades(rows) {
  const check = gradeCheck()
  const eligible = rows.filter((r) => r.final.value !== null && (r.status === '완료' || r.status === '최종 확정'))
  rows.forEach((r) => {
    if (r.final.value === null) r.grade = pending(r.final.reason)
    else if (r.status !== '완료' && r.status !== '최종 확정') r.grade = pending('평가 미완료')
    else if (!check.valid) r.grade = pending(check.reason)
  })
  if (!check.valid || !eligible.length) return
  const g = db.settings.grade
  // 절대평가: 최종 점수가 기준 점수 이상이면 그 등급 (C 기준 미만은 D)
  if (g.mode === 'absolute') {
    eligible.forEach((r) => { r.grade = ok(['A', 'B', 'C'].find((k) => r.final.value >= g.cutoffs[k]) ?? 'D') })
    return
  }
  const roundFn = Math[g.rounding]
  const n = eligible.length
  let cum = 0
  const cut = GRADES.map((k) => { cum += g.ratios[k]; return Math.min(n, roundFn((cum / 100) * n)) })
  const sorted = [...eligible].sort((a, b) => b.final.value - a.final.value)
  sorted.forEach((r, i) => { r._g = GRADES.findIndex((_, gi) => i < cut[gi]); if (r._g < 0) r._g = 3 })
  // 동점자 처리
  const groups = {}
  sorted.forEach((r) => { (groups[r.final.value] ??= []).push(r) })
  Object.values(groups).forEach((grp) => {
    const idx = g.ties === 'upper' ? Math.min(...grp.map((r) => r._g)) : Math.max(...grp.map((r) => r._g))
    grp.forEach((r) => { r.grade = ok(GRADES[idx]) })
  })
}

// ---- 전체 계산 ----

export function computeResults() {
  const rows = resultTargets().map(personBase)
  rows.forEach((r) => { r.teamName = db.teams.find((t) => t.id === r.user.teamId)?.name ?? '미배정' })
  rows.forEach((r) => {
    const k = ratioOf(r)
    r.kpiBefore = r.weighted // 개인평가 점수
    r.teamKpi = k.kpi
    r.kpiScore = k.kpi.value
    r.kpiAfter = k.after // 직급별 비율 반영 점수 (보정 전)
  })
  rows.forEach((r) => {
    r.corr = correctionOf(r)
    r.corrected = r.corr.after
    const o = overrideOf(r)
    r.override = o.override
    r.final = o.final
  })
  assignGrades(rows)
  const byId = Object.fromEntries(rows.map((r) => [r.user.id, r]))
  return { rows, byId }
}

// 최종 확정 시 저장하는 값(이후 설정이 바뀌어도 그대로 남는다)
export function snapshotOf(row) {
  const v = (x) => x?.value ?? null
  return {
    stages: row.stages.map((s) => ({ stage: s.stage, raw: v(s.raw), max: s.max, score100: v(s.score100), items: s.items.map((i) => ({ itemId: i.item.id, name: i.item.name, points: i.item.points, score: v(i.score) })) })),
    weights: row.weights.map((w) => ({ ...w })),
    weighted: v(row.weighted),
    kpiBefore: v(row.kpiBefore),
    kpiScore: row.kpiScore,
    kpiAfter: v(row.kpiAfter),
    kpiRule: ratioText(row.user.role),
    personCorrection: row.corr.person === null ? null : { value: row.corr.person, reason: row.corr.personReason },
    corrected: v(row.corrected),
    override: row.override ? { ...row.override } : null,
    final: v(row.final),
    history: auditFor(row.user).map((a) => ({ ...a })),
    grade: v(row.grade),
    gradeRule: gradeRuleText(),
  }
}

export function policyName(group, key) {
  return POLICY_OPTIONS[group]?.find((o) => o.key === key)?.label ?? '미설정'
}

export function gradeRuleText() {
  const g = db.settings.grade
  if (!gradeCheck().valid) return '미설정'
  if (g.mode === 'absolute') return `절대평가 / A ${g.cutoffs.A}점 이상 · B ${g.cutoffs.B}점 이상 · C ${g.cutoffs.C}점 이상 · D ${g.cutoffs.C}점 미만`
  return `상대평가 / A ${g.ratios.A}% · B ${g.ratios.B}% · C ${g.ratios.C}% · D ${g.ratios.D}% / 인원 ${policyName('gradeRounding', g.rounding)} / ${policyName('gradeTies', g.ties)}`
}

// 확정값과 현재 계산값이 다른지 (재계산 필요 표시용)
export function snapshotDiffers(row) {
  const f = db.finalized[row.user.id]
  if (!f) return false
  const now = snapshotOf(row)
  return ['weighted', 'kpiAfter', 'corrected', 'final', 'grade'].some((k) => f.values[k] !== now[k])
}

// 이 직원의 점수에 영향을 준 변경 이력(본인 보정·직접 수정)
export function auditFor(user) {
  return db.auditLog.filter((a) => a.userId === user.id)
}
