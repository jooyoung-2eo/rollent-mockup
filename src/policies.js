import { db, isEvalTarget, evaluatorsFor } from './store'
import { POLICY_OPTIONS } from './constants'
import { weightCheck, ratioCheck, gradeCheck, gradeRuleText } from './scoring'

// 정책 설정 화면에 보여줄 항목 (간단한 목록)
// control: { type: 'select', path, group } 이 화면에서 바로 선택 / { type: 'link', to, tab, label } 다른 화면에서 설정

export const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], db.settings)
export function setPath(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => o[k], db.settings)[last] = value
}

const sel = (key, label, path, group) => ({
  key, label,
  status: () => (getPath(path) ? { set: true, text: POLICY_OPTIONS[group].find((o) => o.key === getPath(path))?.label ?? '설정됨' } : { set: false, text: '미설정' }),
  control: { type: 'select', path, group },
})
const link = (key, label, status, to, tab, linkLabel) => ({ key, label, status, control: { type: 'link', to, tab, label: linkLabel } })

export const POLICIES = [
  link('weightsMember', '사원 단계별 가중치', () => {
    const c = weightCheck('member', ['self', 'leader', 'exec'])
    const w = db.weights.member
    return c.valid ? { set: true, text: `본인 ${w.self}% · 팀장 ${w.leader}% · 임원 ${w.exec}%` } : { set: false, text: c.reason }
  }, '/eval-settings', 'weights', '가중치'),
  link('weightsLeader', '팀장 단계별 가중치', () => {
    const c = weightCheck('leader', ['self', 'members', 'exec'])
    const w = db.weights.leader
    return c.valid ? { set: true, text: `본인 ${w.self}% · 팀원 ${w.members}% · 임원 ${w.exec}%` } : { set: false, text: c.reason }
  }, '/eval-settings', 'weights', '가중치'),
  link('weightsExec', '임원 단계별 가중치', () => {
    const c = weightCheck('exec', ['self', 'upward'])
    const w = db.weights.exec
    return c.valid ? { set: true, text: `본인 ${w.self}% · 상향 ${w.upward}%` } : { set: false, text: c.reason }
  }, '/eval-settings', 'weights', '가중치'),
  link('roleRatios', '직급별 부서 KPI 반영 비율', () => {
    const bad = ['member', 'leader', 'exec'].filter((r) => !ratioCheck(r).valid)
    return bad.length ? { set: false, text: '합계 확인 필요' } : { set: true, text: '사원·팀장·임원 설정됨' }
  }, '/kpi', 'ratio', '부서 KPI 관리'),
  link('teamKpi', '팀 KPI', () => {
    const p = db.teamKpi[db.period.id] ?? {}
    const n = db.teams.filter((t) => p[t.id] && (p[t.id].mode === 'direct' ? typeof p[t.id].direct === 'number' : p[t.id].indicators?.length)).length
    return n ? { set: true, text: `${n} / ${db.teams.length}개 팀 입력` } : { set: false, text: '미입력' }
  }, '/kpi', 'team', '부서 KPI 관리'),
  sel('itemScoreRule', '항목 점수 계산 (한 항목에 여러 문항)', 'itemScoreRule', 'itemScoreRule'),
  sel('multiEvaluatorRule', '다수 평가자 점수 합산', 'multiEvaluatorRule', 'multiEvaluatorRule'),
  link('gradeRule', 'A~D 등급 기준 (상대평가 / 절대평가)', () => {
    const c = gradeCheck()
    return c.valid ? { set: true, text: gradeRuleText() } : { set: false, text: c.reason }
  }, '/results', null, '평가 결과'),
  link('execAssign', '임원별 담당 직원', () => {
    // 평가 대상 사원·팀장 중 담당 임원이 없는 사람이 있으면 미설정. 테스트용 가상 배정은 따로 알려준다
    const missing = db.users.filter((u) => isEvalTarget(u) && (u.role === 'member' || u.role === 'leader') && !evaluatorsFor(u, 'exec').length).length
    const test = Object.keys(db.execAssign).filter((k) => (db.execAssignSource[k] ?? 'admin') === 'test').length
    if (missing) return { set: false, text: `미배정 ${missing}명` }
    return { set: true, text: test ? `모두 배정됨 (테스트용 가상 배정 ${test}건)` : '모두 배정됨' }
  }, '/org', null, '직원 및 부서 관리'),
]
