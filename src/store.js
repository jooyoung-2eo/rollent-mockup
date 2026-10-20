import { reactive } from 'vue'

// Rollent 목업 데이터 저장소.
// 실제 서버와 통신하지 않으며, 모든 데이터는 화면 시연을 위한 가상 데이터이다.
// 페이지를 새로 고치면 로그인 상태를 제외한 데이터는 초기값으로 돌아간다.

export const EVAL_TYPES = [
  { key: 'self', label: '자기평가' },
  { key: 'leader', label: '팀장평가' },
  { key: 'exec', label: '임원평가' },
]

export const ANSWER_TYPES = [
  { key: 'yn', label: 'Y/N', scored: true },
  { key: 'scale', label: '1~5점', scored: true },
  { key: 'short', label: '주관식', scored: false },
  { key: 'long', label: '서술형', scored: false },
]

export const PAGES = {
  home: 'HOME',
  teams: '팀 관리',
  users: '사원 관리',
  items: '평가항목',
  'admin-eval': '관리자 평가',
  results: '응답결과',
}

// 팀장은 따로 저장하지 않고, 사용자 중 역할이 팀장이고 소속 팀이 같은 사람으로 판단한다
const teams = [
  { id: 1, name: '서비스팀' },
  { id: 2, name: '생산팀' },
  { id: 3, name: '커뮤니케이션팀' },
]

const users = [
  { id: 101, empNo: '2020001', name: '홍길동', role: 'leader', teamId: 1 },
  { id: 102, empNo: '2020002', name: '김철수', role: 'leader', teamId: 2 },
  { id: 103, empNo: '2020003', name: '이영희', role: 'leader', teamId: 3 },
  { id: 201, empNo: '2023011', name: 'A 사원', role: 'member', teamId: 1 },
  { id: 202, empNo: '2023012', name: 'B 사원', role: 'member', teamId: 1 },
  { id: 203, empNo: '2023013', name: 'C 사원', role: 'member', teamId: 1 },
  { id: 204, empNo: '2023021', name: 'D 사원', role: 'member', teamId: 2 },
  { id: 205, empNo: '2023022', name: 'E 사원', role: 'member', teamId: 2 },
  { id: 206, empNo: '2023031', name: 'F 사원', role: 'member', teamId: 3 },
  { id: 207, empNo: '2023032', name: 'G 사원', role: 'member', teamId: 3 },
]

const items = [
  { id: 1, name: '업무 목표 달성', content: '올해 설정한 업무 목표를 얼마나 달성했는지 평가합니다.', answerType: 'scale', types: ['self', 'leader', 'exec'] },
  { id: 2, name: '협업 태도', content: '동료와 원활하게 소통하고 협력했는지 평가합니다.', answerType: 'scale', types: ['self', 'leader', 'exec'] },
  { id: 3, name: '업무 역량 향상', content: '직무 역량을 높이기 위해 노력했는지 평가합니다.', answerType: 'scale', types: ['self', 'leader'] },
  { id: 4, name: '보안 수칙 준수', content: '회사 보안 수칙을 준수했는지 확인합니다.', answerType: 'yn', types: ['self'] },
  { id: 5, name: '책임감', content: '맡은 업무를 끝까지 책임지고 수행했는지 평가합니다.', answerType: 'scale', types: ['leader', 'exec'] },
  { id: 6, name: '올해의 성과 요약', content: '올해 가장 큰 성과를 한 줄로 작성합니다.', answerType: 'short', types: ['self'] },
  { id: 7, name: '종합 의견', content: '평가 대상자에 대한 종합 의견을 작성합니다.', answerType: 'long', types: ['leader', 'exec'] },
]

// 사용자별 진행 단계(시드 데이터 생성용): 0 시작 전, 1 자기평가 일부, 2 자기평가 완료,
// 3 팀장평가까지 완료, 4 전체 완료
const seedProgress = { 101: 4, 102: 4, 103: 3, 201: 1, 202: 2, 203: 3, 204: 4, 205: 4, 206: 0, 207: 3 }

function seedAnswers() {
  const answers = {}
  users.forEach((u, ui) => {
    const level = seedProgress[u.id] ?? 0
    const a = { self: {}, leader: {}, exec: {} }
    EVAL_TYPES.forEach((t, ti) => {
      const typeItems = items.filter((it) => it.types.includes(t.key))
      const done = level >= ti + 2 || (ti === 0 && level >= 2)
      const partial = ti === 0 && level === 1
      typeItems.forEach((it, ii) => {
        if (!done && !(partial && ii === 0)) return
        if (it.answerType === 'scale') a[t.key][it.id] = 3 + ((ui + ii + ti) % 3)
        else if (it.answerType === 'yn') a[t.key][it.id] = 'Y'
        else a[t.key][it.id] = '맡은 업무를 성실하게 수행했습니다.'
      })
    })
    answers[u.id] = a
  })
  return answers
}

function loadSession(key, fallback) {
  try {
    const v = sessionStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

function saveSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 무시한다
  }
}

export const store = reactive({
  loggedIn: loadSession('rollent.loggedIn', false),
  userName: loadSession('rollent.userName', '관리자'),
  lang: 'ko',
  teams,
  users,
  items,
  weights: { self: 30, leader: 30, exec: 40 },
  answers: seedAnswers(),
  // 평가항목 이름 목록. 항목을 만들 때 여기서 고른다
  itemNames: [...items.map((it) => it.name), '근태 준수', '문제 해결 능력', '고객 지향성'],
  recent: ['users', 'admin-eval', 'items'],
  // 홈 위젯은 배열 순서대로 표시한다
  homeWidgets: [
    { key: 'recent', label: '최근 사용 항목', visible: true },
    { key: 'chart', label: '팀별 평가 진행률', visible: true },
    { key: 'progress', label: '직원 평가 진행 현황', visible: true },
  ],
  teamViewMode: 'list', // list | org
  toasts: [],
  confirmState: null,
})

let nextId = 1000
export const newId = () => nextId++

export function login(empNo) {
  const user = store.users.find((u) => u.empNo === empNo)
  store.loggedIn = true
  store.userName = user ? user.name : '관리자'
  saveSession('rollent.loggedIn', true)
  saveSession('rollent.userName', store.userName)
}

export function logout() {
  store.loggedIn = false
  saveSession('rollent.loggedIn', false)
}

export function addRecent(page) {
  store.recent = [page, ...store.recent.filter((p) => p !== page)].slice(0, 5)
}

export function toast(message, variant = 'success') {
  const id = newId()
  store.toasts.push({ id, message, variant })
  setTimeout(() => {
    store.toasts = store.toasts.filter((t) => t.id !== id)
  }, 3000)
}

// 확인 팝업. await confirmDialog({...}) 형태로 사용하며 확인 시 true를 반환한다.
export function confirmDialog({ title = '확인', message, okText = '확인', danger = false }) {
  return new Promise((resolve) => {
    store.confirmState = { title, message, okText, danger, resolve }
  })
}

// ---- 조회 도우미 ----

export const teamName = (teamId) => store.teams.find((t) => t.id === teamId)?.name ?? '미배정'
export const userById = (id) => store.users.find((u) => u.id === id)
export const leadersOf = (teamId) => store.users.filter((u) => u.teamId === teamId && u.role === 'leader')
export const membersOf = (teamId) => store.users.filter((u) => u.teamId === teamId && u.role === 'member')
export const roleLabel = (role) => (role === 'leader' ? '팀장' : '사원')

// 폼의 소속 팀 값을 팀 id로 바꾼다. 'new'이면 입력한 이름으로 팀을 찾거나 새로 만든다.
export function resolveTeam(teamId, newTeamName) {
  if (teamId !== 'new') return teamId
  const name = newTeamName.trim()
  const found = store.teams.find((t) => t.name === name)
  if (found) return found.id
  const team = { id: newId(), name }
  store.teams.push(team)
  return team.id
}
export const itemsOfType = (type) => store.items.filter((it) => it.types.includes(type))
export const answerTypeLabel = (key) => ANSWER_TYPES.find((a) => a.key === key)?.label ?? key
const isScored = (it) => it.answerType === 'yn' || it.answerType === 'scale'

function answersOf(userId) {
  if (!store.answers[userId]) store.answers[userId] = { self: {}, leader: {}, exec: {} }
  return store.answers[userId]
}

// 점수가 매겨지는 항목(Y/N, 1~5점)을 모두 응답하면 해당 유형 완료로 본다
export function isTypeComplete(userId, type) {
  const a = answersOf(userId)[type]
  const scored = itemsOfType(type).filter(isScored)
  return scored.length > 0 && scored.every((it) => a[it.id] !== undefined && a[it.id] !== '')
}

// 100점 만점 환산: 1~5점은 x20, Y는 100점, N은 0점
export function typeScore(userId, type) {
  if (!isTypeComplete(userId, type)) return null
  const a = answersOf(userId)[type]
  const vals = itemsOfType(type).filter(isScored).map((it) => {
    const v = a[it.id]
    if (it.answerType === 'yn') return v === 'Y' ? 100 : 0
    return Number(v) * 20
  })
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
}

export function finalScore(userId) {
  const scores = EVAL_TYPES.map((t) => typeScore(userId, t.key))
  if (scores.some((s) => s === null)) return null
  const w = store.weights
  return Math.round((scores[0] * w.self + scores[1] * w.leader + scores[2] * w.exec) / 100)
}

// 현재 단계: 아직 끝나지 않은 첫 번째 평가 유형. 모두 끝나면 'done'
export function currentStage(userId) {
  const t = EVAL_TYPES.find((t) => !isTypeComplete(userId, t.key))
  return t ? t.key : 'done'
}

export function stageLabel(userId) {
  const s = currentStage(userId)
  return s === 'done' ? '평가완료' : EVAL_TYPES.find((t) => t.key === s).label
}

// 시작 전 / 진행 중 / 완료
export function progressStatus(userId) {
  const a = answersOf(userId)
  const answered = EVAL_TYPES.some((t) => Object.keys(a[t.key]).length > 0)
  if (!answered) return '시작 전'
  return currentStage(userId) === 'done' ? '완료' : '진행 중'
}

export function saveAnswers(userId, type, values) {
  answersOf(userId)[type] = { ...values }
}

export function getAnswers(userId, type) {
  return { ...answersOf(userId)[type] }
}
