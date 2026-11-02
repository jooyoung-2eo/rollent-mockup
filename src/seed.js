import { DEFAULT_CHOICE_LABELS, EXAMPLE_CHOICE_SCORES, roleFromPosition } from './constants'

// 테스트용 가상 데이터. 실제 직원 정보가 아니다.
// public/samples/employees-34.csv 와 같은 34명이다.

const PROD_MEMBERS = ['김민준', '이서준', '박도윤', '최예준', '정시우', '강하준', '조주원', '윤지호', '장지후', '임준서', '한건우', '오현우', '서우진', '신선우']
// 관리팀 첫 사람은 생산팀 첫 사람과 동명이인이다(이름+사번 로그인 확인용)
const ADMIN_MEMBERS = ['김민준', '이지민', '박서연', '최서윤', '정지우', '강하윤', '조하은', '윤민서', '장수아', '임지유', '한윤서', '오채원', '서지아', '신다은']
const MEMBER_POSITIONS = ['사원', '사원', '주임', '대리', '사원', '과장', '대리', '사원', '주임', '차장', '사원', '대리', '사원', '과장']
const EXECS = [['장민석', '전무'], ['강태호', '상무'], ['송하은', '상무'], ['윤지영', '이사']]

export const SEED_PERIOD = { name: '2026년 하반기 정기평가', start: '2026-10-01', end: '2026-11-30', deadline: '2026-11-20' }

function choiceQuestion(id, text) {
  return {
    id, text, type: 'choice', required: true, maxLength: null, shareInInterview: false,
    choices: DEFAULT_CHOICE_LABELS.map((label, i) => ({ id: `${id}-c${i + 1}`, label, score: EXAMPLE_CHOICE_SCORES[i], deleted: false })),
  }
}
function textQuestion(id, text, type, required = false) {
  return { id, text, type, required, maxLength: type === 'short' ? 100 : 1000, shareInInterview: false, choices: [] }
}

export function seedItems() {
  return [
    { id: 'i1', name: '업무 성과', points: 40, stages: ['self', 'leader', 'exec'], questions: [
      choiceQuestion('q1', '목표한 업무를 기한 안에 달성했다.'),
      choiceQuestion('q2', '업무 결과물의 품질이 기대 수준을 충족했다.'),
    ] },
    { id: 'i2', name: '협업과 소통', points: 30, stages: ['self', 'leader', 'members', 'exec'], questions: [
      choiceQuestion('q3', '동료와 원활하게 소통한다.'),
      choiceQuestion('q4', '팀 목표 달성을 위해 적극적으로 협력한다.'),
    ] },
    { id: 'i3', name: '역량 개발', points: 30, stages: ['self', 'leader', 'exec'], questions: [
      choiceQuestion('q5', '직무 역량을 높이기 위해 꾸준히 노력했다.'),
      textQuestion('q6', '올해 가장 큰 성과를 한 줄로 적어 주세요.', 'short'),
    ] },
    { id: 'i4', name: '리더십', points: 40, stages: ['members'], questions: [
      choiceQuestion('q7', '팀원에게 업무 방향을 명확하게 제시한다.'),
      choiceQuestion('q8', '팀원의 의견을 경청하고 성장을 지원한다.'),
    ] },
    { id: 'i5', name: '종합 의견', points: null, stages: ['leader', 'members', 'exec'], questions: [
      textQuestion('q9', '강점과 보완할 점을 자유롭게 적어 주세요.', 'long'),
    ] },
  ]
}

export function seedEmployees() {
  const teams = [{ id: 1, name: '생산팀' }, { id: 2, name: '관리팀' }, { id: 3, name: '경영진' }]
  const users = []
  let id = 1
  const add = (name, empNo, teamId, position) => {
    const u = { id: id++, name, empNo, teamId, position, role: roleFromPosition(position), evalTarget: true, active: true }
    users.push(u)
    return u
  }
  add('박성호', '2015001', 1, '팀장')
  PROD_MEMBERS.forEach((n, i) => add(n, String(2019101 + i), 1, MEMBER_POSITIONS[i]))
  add('이수진', '2015002', 2, '팀장')
  ADMIN_MEMBERS.forEach((n, i) => add(n, String(2020201 + i), 2, MEMBER_POSITIONS[(i + 3) % 14]))
  EXECS.forEach(([n, p], i) => add(n, String(2008001 + i), 3, p))
  return { teams, users }
}

// ---- 테스트용 응답 ----
// 결정적인 의사 난수로 응답을 만든다(같은 시드면 항상 같은 결과)
function pick(seed, n) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return Math.floor((x - Math.floor(x)) * n)
}

function makeAnswers(items, stage, seed) {
  const answers = {}
  items.filter((it) => it.stages.includes(stage)).forEach((it) => {
    it.questions.forEach((q, qi) => {
      if (q.type === 'choice') answers[q.id] = q.choices[pick(seed + qi * 7 + it.id.length, 3)].id // 상위 3개 선택지 중 하나
      else if (q.type === 'short') answers[q.id] = '신규 공정 개선안을 정리해 적용했습니다.'
      else answers[q.id] = '맡은 업무를 책임감 있게 마무리합니다. 일정 공유를 조금 더 자주 하면 좋겠습니다.'
    })
  })
  return answers
}

// 진행 상황이 섞여 보이도록 일부 평가만 제출·임시저장 상태로 만든다
export function seedEvaluations(users, items, execAssign) {
  const evals = {}
  const byTeam = (teamId, role) => users.filter((u) => u.teamId === teamId && u.role === role)
  const at = '2026-10-15T09:00:00.000Z'
  const put = (stage, target, evaluator, status, n) => {
    const key = `${stage}:${target.id}:${evaluator.id}`
    evals[key] = {
      key, stage, targetId: target.id, evaluatorId: evaluator.id, targetRole: target.role, evaluatorRole: evaluator.role,
      answers: makeAnswers(items, stage, target.id * 31 + evaluator.id * 7 + n),
      status, updatedAt: at, submittedAt: status === 'submitted' ? at : null, seeded: true,
    }
  }
  const execOf = (t) => users.find((u) => u.id === execAssign[t.id])
  const plan = [
    // [팀, 자기평가 제출 수, 팀장평가 제출 수, 임원평가 제출 수, 팀장에 대한 팀원평가 제출 수]
    [1, 14, 12, 10, 14],
    [2, 10, 5, 3, 8],
  ]
  plan.forEach(([teamId, selfN, leaderN, execN, upN]) => {
    const leader = byTeam(teamId, 'leader')[0]
    const members = byTeam(teamId, 'member')
    put('self', leader, leader, 'submitted', 1)
    members.forEach((m, i) => {
      if (i < selfN) put('self', m, m, 'submitted', i)
      else if (i === selfN) put('self', m, m, 'draft', i)
      if (i < leaderN) put('leader', m, leader, 'submitted', i)
      else if (i === leaderN) put('leader', m, leader, 'draft', i)
      if (i < execN && execOf(m)) put('exec', m, execOf(m), 'submitted', i)
      if (i < upN) put('members', leader, m, 'submitted', i)
    })
    if (teamId === 1 && execOf(leader)) put('exec', leader, execOf(leader), 'submitted', 3)
  })
  users.filter((u) => u.role === 'exec').slice(0, 2).forEach((e) => put('self', e, e, 'submitted', 2))
  return evals
}

// 임원별 담당 대상자. 실제 배정표가 정해지지 않아 테스트용으로 고르게 나눈 값이다.
export function seedExecAssign(users) {
  const execs = users.filter((u) => u.role === 'exec')
  const assign = {}
  const groups = [
    users.filter((u) => u.teamId === 1 && u.role === 'member').slice(0, 7),
    [...users.filter((u) => u.teamId === 1 && u.role === 'member').slice(7), ...users.filter((u) => u.teamId === 1 && u.role === 'leader')],
    users.filter((u) => u.teamId === 2 && u.role === 'member').slice(0, 7),
    [...users.filter((u) => u.teamId === 2 && u.role === 'member').slice(7), ...users.filter((u) => u.teamId === 2 && u.role === 'leader')],
  ]
  groups.forEach((g, i) => g.forEach((t) => { assign[t.id] = execs[i].id }))
  return assign
}
