import { db, stagesFor, evaluatorsFor, getEvaluation, stageStatus, targetStatus, isEvalTarget } from './store'
import { GRADES, POLICY_OPTIONS } from './constants'

// 평가 결과 계산 파이프라인
// 응답 → 항목 점수 → 단계 점수 → 가중치 적용 → 백분위 → 부서 KPI → 개인 조정 → 등급
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

// 결과 산출 대상: 활성 평가 대상자 중 사원·팀장 (임원은 자기평가만 진행)
export const resultTargets = () => db.users.filter((u) => isEvalTarget(u) && (u.role === 'member' || u.role === 'leader'))

function personBase(t) {
  const stages = stagesFor(t)
  const stageRows = stages.map((s) => stageResult(t, s))
  const wc = weightCheck(t.role, stages)
  let weighted
  const stageBad = stageRows.find((r) => r.score100.value === null)
  if (stageBad) weighted = pending(stageBad.score100.reason)
  else if (!wc.valid) weighted = pending(wc.reason)
  else weighted = ok(round2(stageRows.reduce((a, r) => a + (r.score100.value * db.weights[t.role][r.stage]) / 100, 0)))
  return { user: t, status: targetStatus(t), stages: stageRows, weights: stages.map((s) => ({ stage: s, weight: db.weights[t.role]?.[s] ?? null })), weighted }
}

// 백분위: 개인평가 점수(가중치 적용 점수) 기준. KPI·보정 결과와는 별개의 값이다.
function percentileOf(row, rows) {
  const s = db.settings
  if (row.weighted.value === null) return pending(row.weighted.reason)
  const missing = [
    !s.percentileMethod && '산출 공식', !s.percentileGroup && '비교 집단',
    !s.percentileTies && '동점자 처리', !s.percentileExclusion && '비교 대상 제외 기준',
  ].filter(Boolean)
  if (missing.length) return pending(`백분위 ${missing.join('·')} 미설정`)
  // 비교 대상 제외 기준 'completeOnly': 3단계 평가가 끝나 개인평가 점수가 있는 사람만 비교한다
  const peers = rows.filter((r) => r.weighted.value !== null && (s.percentileGroup === 'all'
    || (s.percentileGroup === 'team' && r.user.teamId === row.user.teamId)
    || (s.percentileGroup === 'role' && r.user.role === row.user.role)))
  const n = peers.length
  const v = row.weighted.value
  const below = peers.filter((p) => p.weighted.value < v).length
  const equal = peers.filter((p) => p.weighted.value === v).length // 본인 포함
  if (s.percentileMethod === 'pr') {
    const tie = s.percentileTies === 'midpoint' ? equal * 0.5 : equal
    return ok(round2(((below + tie) / n) * 100))
  }
  if (n < 2) return pending('비교 집단 인원 부족(2명 이상 필요)')
  const higher = n - below - equal
  const rank = s.percentileTies === 'midpoint' ? higher + (equal + 1) / 2 : higher + 1
  return ok(round2(((n - rank) / (n - 1)) * 100))
}

function kpiOf(row) {
  const { kpiMethod: method, kpiBase: baseKey, kpiMixRatio } = db.settings
  // 개인평가 점수가 없으면(평가 미완료 등) 정책 미설정보다 그 이유를 먼저 보여준다
  if (row.weighted.value === null) return { base: row.weighted, kpi: null, after: pending(row.weighted.reason) }
  if (!method) return { base: pending('KPI 반영 방식 미설정'), kpi: null, after: pending('KPI 반영 방식 미설정') }
  if (!baseKey) return { base: pending('KPI 기준 점수 미설정'), kpi: null, after: pending('KPI 기준 점수 미설정') }
  const base = baseKey === 'weighted' ? row.weighted : row.percentile
  if (base.value === null) return { base, kpi: null, after: pending(base.reason) }
  if (method === 'none') return { base, kpi: null, after: ok(base.value) }
  const kpi = db.kpiScores[row.user.teamId]
  if (typeof kpi !== 'number') return { base, kpi: null, after: pending(`${row.teamName} KPI 점수 미입력`) }
  if (method === 'multiply') return { base, kpi, after: ok(round2(base.value * (kpi / 100))) }
  if (typeof kpiMixRatio !== 'number') return { base, kpi, after: pending('KPI 반영 비율 미설정') }
  const r = kpiMixRatio / 100
  return { base, kpi, after: ok(round2(base.value * (1 - r) + kpi * r)) }
}

// 부서별·개인별 보정. 보정값은 KPI 반영 후 점수에 더하는 점수(±)로 저장한다.
// 두 값을 함께 쓰는 규칙(correctionRule)이 정해지기 전에는 최종 점수에 반영하지 않고,
// 각 값을 하나씩 적용했을 때의 예상 점수만 보여준다.
// applied: 'none' 보정값 없음 · 'saved' 저장됐지만 미적용 · 'applied' 적용됨 · 'pending' 앞 단계 보류
export function correctionOf(row) {
  const dept = db.deptCorrections[row.user.teamId] ?? null
  const person = db.personCorrections[row.user.id] ?? null
  const before = row.kpiAfter
  const dv = dept ? dept.value : null
  const pv = person ? person.value : null
  const expect = (v) => (before.value === null || v === null ? null : round2(before.value + v))
  const base = { dept: dv, deptReason: dept?.reason ?? '', person: pv, personReason: person?.reason ?? '', before, expectDept: expect(dv), expectPerson: expect(pv) }
  if (before.value === null) return { ...base, after: pending(before.reason), applied: 'pending' }
  if (dv === null && pv === null) return { ...base, after: ok(before.value), applied: 'none' }
  const rule = db.settings.correctionRule
  if (!rule) return { ...base, after: pending('보정 적용 규칙 미설정'), applied: 'saved' }
  const add = rule === 'sum' ? (dv ?? 0) + (pv ?? 0) : pv !== null ? pv : dv
  return { ...base, after: ok(round2(before.value + add)), applied: 'applied' }
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
  rows.forEach((r) => { r.percentile = percentileOf(r, rows) })
  rows.forEach((r) => {
    const k = kpiOf(r)
    r.kpiBefore = k.base
    r.kpiScore = k.kpi
    r.kpiAfter = k.after
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
    percentile: v(row.percentile),
    percentileRule: ['percentileMethod', 'percentileGroup', 'percentileTies', 'percentileExclusion'].map((k) => policyName(k, db.settings[k])).join(' / '),
    kpiBefore: v(row.kpiBefore),
    kpiScore: row.kpiScore,
    kpiAfter: v(row.kpiAfter),
    kpiRule: policyName('kpiMethod', db.settings.kpiMethod),
    deptCorrection: row.corr.dept === null ? null : { value: row.corr.dept, reason: row.corr.deptReason },
    personCorrection: row.corr.person === null ? null : { value: row.corr.person, reason: row.corr.personReason },
    correctionRule: policyName('correctionRule', db.settings.correctionRule),
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
  return `A ${g.ratios.A}% · B ${g.ratios.B}% · C ${g.ratios.C}% · D ${g.ratios.D}% / 인원 ${policyName('gradeRounding', g.rounding)} / ${policyName('gradeTies', g.ties)}`
}

// 확정값과 현재 계산값이 다른지 (재계산 필요 표시용)
export function snapshotDiffers(row) {
  const f = db.finalized[row.user.id]
  if (!f) return false
  const now = snapshotOf(row)
  return ['weighted', 'percentile', 'kpiAfter', 'corrected', 'final', 'grade'].some((k) => f.values[k] !== now[k])
}

// 이 직원의 점수에 영향을 준 변경 이력(본인 보정·직접 수정 + 소속 부서 보정)
export function auditFor(user) {
  return db.auditLog.filter((a) => a.userId === user.id || (a.kind === 'dept' && a.teamId === user.teamId))
}
