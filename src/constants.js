// 화면과 계산에서 함께 쓰는 고정값

// 평가 단계. 평가자 관계는 store.evaluatorsFor에서 정한다.
export const STAGES = {
  self: { label: '자기평가', evaluator: '본인' },
  leader: { label: '팀장평가', evaluator: '소속 팀장' },
  members: { label: '팀원평가', evaluator: '소속 팀원' },
  exec: { label: '임원평가', evaluator: '배정된 임원' },
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
  exec: ['self'],
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
  percentileMethod: [
    { key: 'pr', label: '백분위 순위(PR)', desc: '(나보다 낮은 인원 + 동점 인원 × 0.5) ÷ 비교 집단 인원 × 100' },
    { key: 'rank', label: '순위 백분율', desc: '(비교 집단 인원 − 순위) ÷ (비교 집단 인원 − 1) × 100. 1등이 100입니다.' },
  ],
  percentileTies: [
    { key: 'midpoint', label: '동점자는 중간 순위', desc: '동점자들이 차지하는 순위의 가운데 값을 씁니다. (PR: 낮은 인원 + 동점 인원 × 0.5)' },
    { key: 'upper', label: '동점자는 모두 높은 순위', desc: '동점자 모두 그중 가장 높은 순위를 받습니다.' },
  ],
  percentileExclusion: [
    { key: 'completeOnly', label: '3단계 평가 완료자만 비교', desc: '평가가 끝나지 않은 사람, 비활성·평가 대상 아님인 사람은 비교 집단에서 빼고 백분위도 계산하지 않습니다.' },
  ],
  correctionRule: [
    { key: 'sum', label: '부서 보정 + 개인 보정 함께 적용', desc: 'KPI 반영 후 점수 + 부서별 보정값 + 개인별 보정값 (값이 없는 쪽은 적용하지 않음)' },
    { key: 'personFirst', label: '개인 보정 우선', desc: '개인별 보정값이 있으면 그 값만, 없으면 부서별 보정값을 KPI 반영 후 점수에 더합니다.' },
  ],
  percentileGroup: [
    { key: 'all', label: '전체 평가 대상자' },
    { key: 'team', label: '같은 부서' },
    { key: 'role', label: '같은 역할(사원/팀장)' },
  ],
  kpiMethod: [
    { key: 'none', label: 'KPI 반영 안 함', desc: '기준 점수를 그대로 씁니다.' },
    { key: 'multiply', label: '곱하기', desc: '기준 점수 × (부서 KPI ÷ 100)' },
    { key: 'mix', label: '비율 혼합', desc: '기준 점수 × (1 − 반영 비율) + 부서 KPI × 반영 비율' },
  ],
  kpiBase: [
    { key: 'weighted', label: '가중치 적용 점수' },
    { key: 'percentile', label: '백분위 환산 점수' },
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
