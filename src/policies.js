import { db, stagesFor } from './store'
import { POLICY_OPTIONS, ROLE_STAGES } from './constants'
import { weightCheck, gradeCheck } from './scoring'

// 계산에 필요한 정책 목록. 정책 설정 현황 화면에서 상태와 보류 단계를 보여준다.
// control: { type: 'select', path, group } 이 화면에서 바로 선택
//          { type: 'link', to, label }     다른 화면에서 설정
//          { type: 'none' }                후보가 없어 정책 확정이 먼저 필요
// match: 계산이 보류된 이유 문구에서 이 정책을 찾는 정규식

export const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], db.settings)
export function setPath(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => o[k], db.settings)[last] = value
}

const activeStages = (role) => ROLE_STAGES[role].filter((s) => s !== 'members' || db.settings.memberEvalEnabled)
const sel = (path, group) => ({
  status: () => (getPath(path) === null || getPath(path) === undefined ? { set: false, text: '미설정' } : { set: true, text: POLICY_OPTIONS[group].find((o) => o.key === getPath(path))?.label ?? '설정됨' }),
  control: { type: 'select', path, group },
})

export const POLICIES = [
  {
    key: 'execAssign', label: '임원별 실제 담당 대상자', steps: '임원평가(3차) 배정 → 3차 평가',
    status: () => {
      const test = Object.keys(db.execAssign).filter((k) => (db.execAssignSource[k] ?? 'admin') === 'test').length
      return test ? { set: false, text: `테스트용 가상 배정 ${test}건 사용 중` } : { set: true, text: '관리자 지정 배정만 사용' }
    },
    control: { type: 'link', to: '/org', label: '직원 및 부서 관리 › 임원 목록' }, match: /배정/,
  },
  {
    key: 'weightsMember', label: '사원 단계별 가중치', steps: '사원의 개인평가 점수',
    status: () => {
      const c = weightCheck('member', activeStages('member'))
      const w = db.weights.member
      return c.valid ? { set: true, text: `본인 ${w.self}% · 팀장 ${w.leader}% · 본부장(임원) ${w.exec}%` } : { set: false, text: c.reason }
    },
    control: { type: 'link', to: '/eval-settings', tab: 'weights', label: '가중치' }, match: /가중치/, role: 'member',
  },
  {
    key: 'weightsLeader', label: '팀장 단계별 가중치', steps: '팀장의 개인평가 점수',
    note: '지시된 20/40/40은 2차가 팀장평가인 구조입니다. 팀장은 2차가 팀원평가라 같은 값을 쓸지 확인이 필요합니다.',
    status: () => {
      const c = weightCheck('leader', activeStages('leader'))
      return c.valid ? { set: true, text: '설정됨' } : { set: false, text: c.reason }
    },
    control: { type: 'link', to: '/eval-settings', tab: 'weights', label: '가중치' }, match: /가중치/, role: 'leader',
  },
  { key: 'itemScoreRule', label: '항목 점수 계산 (한 항목에 여러 문항)', steps: '항목 점수 → 단계 점수 → 개인평가 점수', ...sel('itemScoreRule', 'itemScoreRule'), match: /항목 점수 계산 규칙/ },
  { key: 'multiEvaluatorRule', label: '다수 평가자 점수 합산', steps: '팀장의 팀원평가 단계 점수', ...sel('multiEvaluatorRule', 'multiEvaluatorRule'), match: /다수 평가자/ },
  { key: 'percentileMethod', label: '백분위 산출 공식', steps: '백분위', ...sel('percentileMethod', 'percentileMethod'), match: /백분위.*산출 공식/ },
  { key: 'percentileGroup', label: '백분위 비교 집단', steps: '백분위', ...sel('percentileGroup', 'percentileGroup'), match: /백분위.*비교 집단/ },
  { key: 'percentileTies', label: '백분위 동점자 처리', steps: '백분위', ...sel('percentileTies', 'percentileTies'), match: /백분위.*동점자/ },
  { key: 'percentileExclusion', label: '백분위 비교 대상 제외 기준', steps: '백분위', ...sel('percentileExclusion', 'percentileExclusion'), match: /비교 대상 제외/ },
  { key: 'kpiMethod', label: 'KPI 반영 공식', steps: 'KPI 반영 후 점수 → 보정 → 최종 점수', ...sel('kpiMethod', 'kpiMethod'), match: /KPI 반영 방식/ },
  { key: 'kpiBase', label: 'KPI 적용 기준 점수', steps: 'KPI 반영 후 점수', ...sel('kpiBase', 'kpiBase'), match: /KPI 기준 점수/ },
  {
    key: 'kpiScores', label: '부서별 KPI 점수', steps: 'KPI 반영 후 점수 (곱하기·혼합 방식일 때)',
    status: () => {
      const n = db.teams.filter((t) => typeof db.kpiScores[t.id] === 'number').length
      return { set: n > 0, text: n ? `${n}개 부서 입력` : '미입력' }
    },
    control: { type: 'link', to: '/kpi', tab: 'kpi', label: 'KPI 반영' }, match: /KPI 점수 미입력|KPI 반영 비율/,
  },
  { key: 'correctionRule', label: '부서별·개인별 보정 적용 규칙', steps: '보정 적용 후 점수 → 최종 점수 (보정값이 있는 직원)', ...sel('correctionRule', 'correctionRule'), match: /보정 적용 규칙/ },
  {
    key: 'overrideRange', label: '점수 조정·직접 수정 허용 범위', steps: '개인별 보정, 최종 점수 직접 수정',
    note: '정해지기 전에는 범위를 제한하지 않고 모든 변경을 이력으로 남깁니다.',
    status: () => ({ set: false, text: '미설정 (제한 없음)' }), control: { type: 'none' },
  },
  {
    key: 'approvalProcess', label: '보정·직접 수정 승인 절차', steps: '개인별 보정, 최종 점수 직접 수정',
    note: '승인 단계가 없으므로 저장 즉시 반영되며, 승인 완료로 표시하지 않습니다.',
    status: () => ({ set: false, text: '미설정 (승인 단계 없음)' }), control: { type: 'none' },
  },
  {
    key: 'gradeRatios', label: 'A~D 등급 비율', steps: '최종 등급',
    status: () => {
      const r = db.settings.grade.ratios
      const vals = ['A', 'B', 'C', 'D'].map((g) => r[g])
      return vals.every((v) => typeof v === 'number') ? { set: true, text: `A ${r.A} · B ${r.B} · C ${r.C} · D ${r.D}%` } : { set: false, text: '미설정' }
    },
    control: { type: 'link', to: '/results', label: '평가 결과' }, match: /등급 비율/,
  },
  { key: 'gradeRounding', label: '등급 인원 반올림 방식', steps: '최종 등급', ...sel('grade.rounding', 'gradeRounding'), match: /반올림/ },
  { key: 'gradeTies', label: '등급 동점자 처리', steps: '최종 등급', ...sel('grade.ties', 'gradeTies'), match: /^동점자 처리 방식/ },
  {
    key: 'finalizeRule', label: '결과 확정·재계산 규칙', steps: '최종 확정',
    note: '지금은 관리자가 직원별로 수동 확정하고, 확정 후 값이 바뀌면 "재계산 다름"으로만 알립니다.',
    status: () => ({ set: false, text: '미설정' }), control: { type: 'none' },
  },
  {
    key: 'disclosure', label: '평가자 이름·서술형 응답·직원 결과 공개 범위', steps: '면담 보고서, 직원 화면',
    note: '지금은 평가자 이름 비공개, 서술형은 문항별 설정, 직원 화면에 점수 비공개로 운영합니다.',
    status: () => ({ set: false, text: '미설정' }), control: { type: 'none' },
  },
]

// 이 정책 때문에 계산이 보류된 직원 수
export function blockedCount(policy, results) {
  if (!policy.match) return null
  return results.rows.filter((r) => (!policy.role || r.user.role === policy.role) && [
    ...r.stages.map((s) => s.score100), r.weighted, r.percentile, r.kpiAfter, r.corrected, r.grade,
  ].some((v) => v && v.value === null && policy.match.test(v.reason ?? ''))).length
}

export { gradeCheck, stagesFor }
