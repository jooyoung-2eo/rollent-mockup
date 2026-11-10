// 화면과 계산에서 함께 쓰는 고정값

// 평가 단계. 평가자 관계는 store.evaluatorsFor에서 정한다.
export const STAGES = {
  self: { label: '자기평가', evaluator: '본인' },
  leader: { label: '팀장평가', evaluator: '소속 팀장' },
  members: { label: '팀원평가', evaluator: '소속 팀원' },
  exec: { label: '임원평가', evaluator: '배정된 임원' },
  upward: { label: '상향평가', evaluator: '담당 임원이 배정된 팀장' },
}
export const STAGE_KEYS = Object.keys(STAGES)
export const stageLabel = (key) => STAGES[key]?.label ?? key

// 사용자 역할(평가 구조를 정한다)
export const ROLES = {
  member: '사원',
  leader: '팀장',
  exec: '임원',
}
export const roleLabel = (role) => ROLES[role] ?? role

// 역할별 평가 단계 (설정에 따라 일부 단계가 꺼질 수 있다)
export const ROLE_STAGES = {
  member: ['self', 'leader', 'exec'],
  leader: ['self', 'members', 'exec'],
  exec: ['self', 'upward'],
}

// 직급. CSV와 직원 수정 화면에서 쓴다. 직급에서 역할을 추천하지만 관리자가 바꿀 수 있다.
export const POSITIONS = ['사원', '주임', '대리', '과장', '차장', '팀장', '이사', '상무', '전무']
export function roleFromPosition(position) {
  if (position === '팀장') return 'leader'
  if (['이사', '상무', '전무', '임원'].includes(position)) return 'exec'
  return 'member'
}

export const ANSWER_TYPES = [
  { key: 'short', label: '주관식' },
  { key: 'long', label: '서술형' },
  { key: 'choice', label: '객관식' },
]
export const answerTypeLabel = (key) => ANSWER_TYPES.find((a) => a.key === key)?.label ?? key

export const DEFAULT_CHOICE_LABELS = ['매우 그렇다', '그렇다', '보통이다', '그렇지 않다', '전혀 그렇지 않다']
// 선택지 점수 예시. 새 문항에 자동으로 넣지 않고, 관리자가 '예시 점수 채우기'를 누를 때만 쓴다.
export const EXAMPLE_CHOICE_SCORES = [5, 4, 3, 2, 1]

// 미확정 정책의 선택지. null은 '미설정'을 뜻한다.
export const POLICY_OPTIONS = {
  itemScoreRule: [
    { key: 'avgRatio', label: '문항 비율 평균 × 항목 배점', desc: '각 문항의 (선택 점수 ÷ 그 문항의 최고 점수)를 평균 내어 항목 배점을 곱합니다.' },
    { key: 'sumRatio', label: '문항 점수 합 비율 × 항목 배점', desc: '(선택 점수 합 ÷ 최고 점수 합)에 항목 배점을 곱합니다.' },
  ],
  multiEvaluatorRule: [
    { key: 'average', label: '평가자 점수 평균', desc: '한 단계에 평가자가 여럿이면(예: 팀원평가) 평가자별 점수를 평균 냅니다.' },
  ],
  gradeRounding: [
    { key: 'round', label: '반올림' },
    { key: 'floor', label: '내림' },
    { key: 'ceil', label: '올림' },
  ],
  gradeTies: [
    { key: 'upper', label: '동점자는 모두 높은 등급' },
    { key: 'lower', label: '동점자는 모두 낮은 등급' },
  ],
}
export const policyLabel = (group, key) => POLICY_OPTIONS[group]?.find((o) => o.key === key)?.label ?? '미설정'

export const GRADES = ['A', 'B', 'C', 'D']

// 저장은 ISO(UTC)로 하고, 화면에는 이 PC의 현지 날짜·시각으로 보여준다
const pad = (n) => String(n).padStart(2, '0')
export function localDate(iso) {
  if (!iso) return '-'
  const d = iso instanceof Date ? iso : new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function localDateTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 직급별 최종 반영 요소 (팀 KPI 관리 › 직급별 비율)
export const RATIO_ELEMENTS = {
  personal: { label: '개인평가', desc: '1·2·3차 평가 단계 점수를 단계 가중치로 합친 점수' },
  kpi: { label: '팀 KPI', desc: '소속 팀의 KPI 점수' },
}
// 직급별로 쓸 수 있는 요소: 개인평가에 부서(팀) KPI 실적을 반영한다
export const ROLE_RATIO_ELEMENTS = {
  member: ['personal', 'kpi'],
  leader: ['personal', 'kpi'],
  exec: ['personal', 'kpi'],
}
// 처음 값: 사용자가 보내준 화면 예시에서 상향평가 몫을 개인평가로 합친 값
// (팀장 개인 20 + 상향 40 → 60, 임원 상향 40 → 개인평가 40)
export const DEFAULT_ROLE_RATIOS = {
  member: { personal: { on: true, value: 80 }, kpi: { on: true, value: 20 } },
  leader: { personal: { on: true, value: 60 }, kpi: { on: true, value: 40 } },
  exec: { personal: { on: true, value: 40 }, kpi: { on: true, value: 60 } },
}
// 이전 기본값 (직급별 비율에 상향평가가 따로 있던 때). 이 값 그대로면 새 기본값으로 바꾼다
export const OLD_DEFAULT_ROLE_RATIOS = {
  leader: { personal: { on: true, value: 20 }, kpi: { on: true, value: 40 }, upward: { on: true, value: 40 } },
  exec: { kpi: { on: true, value: 60 }, upward: { on: true, value: 40 } },
}
// 질문 CSV의 적용 단계 이름
export const STAGE_BY_LABEL = Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [v.label, k]))
