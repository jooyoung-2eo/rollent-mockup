import { reactive, watch } from 'vue'
import { ROLE_STAGES, roleLabel } from './constants'
import { SEED_PERIOD, seedEmployees, seedItems, seedEvaluations, seedExecAssign } from './seed'
import { pointsReport, totalText } from './points'

// Rollent 데이터 저장소.
// 서버 없이 브라우저 localStorage에 저장한다. 같은 브라우저 안에서만 유지되고
// 다른 기기·다른 사용자와 공유되지 않는다. 실제 서비스에는 서버와 DB가 필요하다.

const DATA_KEY = 'rollent.data.v2'
const DATA_VERSION = 2

function createInitialData() {
  const { teams, users } = seedEmployees()
  const items = seedItems()
  const execAssign = seedExecAssign(users)
  return {
    version: DATA_VERSION,
    period: { ...SEED_PERIOD },
    teams,
    users,
    admins: seedAdmins(),
    items,
    settings: {
      execSelfEnabled: true, // 임원 자기평가 (관리자가 켜고 끌 수 있는 유일한 임원 평가)
      memberEvalEnabled: true, // 팀장에 대한 팀원평가
      itemScoreRule: null, // 미확정: 항목 안 여러 문항 → 항목 점수
      multiEvaluatorRule: null, // 미확정: 한 단계 평가자가 여럿일 때
      percentileMethod: null,
      percentileGroup: null,
      kpiMethod: null,
      kpiBase: null,
      kpiMixRatio: null,
      grade: { ratios: { A: null, B: null, C: null, D: null }, rounding: null, ties: null },
      ...POLICY_DEFAULTS_V3,
    },
    // 사원: 2차 작업 지시로 확정된 단계별 가중치(본인 20 · 팀장 40 · 본부장(임원) 40)
    // 팀장: 2차가 팀원평가라 지시된 가중치와 구조가 달라 미설정으로 둔다
    weights: { member: { ...CONFIRMED_MEMBER_WEIGHTS }, leader: { self: null, members: null, exec: null } },
    execAssign,
    execAssignIsTest: true,
    evaluations: seedEvaluations(users, items, execAssign),
    kpiScores: {}, // { teamId: 점수 }
    adjustments: [], // (이전 방식) 개인 점수 조정. 2차 작업 이후로는 쓰지 않고 이력으로만 보존
    deptCorrections: {}, // { teamId: { value, reason, savedAt, by } } 부서별 보정값
    personCorrections: {}, // { userId: { value, reason, savedAt, by } } 개인별 보정값
    overrides: {}, // { userId: { score, before, reason, at, by } } 최종 점수 직접 수정
    auditLog: [], // 보정·직접 수정 변경 이력 (삭제하지 않는다)
    finalized: {}, // { userId: { at, values, history } }
    interviewNotes: {}, // { userId: { strengths, improvements, checkpoints } }
    teamViewMode: 'list',
    nextId: 1000,
  }
}

// 2차 작업에서 추가한 정책. 모두 미설정(null)에서 시작한다.
const POLICY_DEFAULTS_V3 = {
  percentileTies: null, // 백분위 동점자 처리
  percentileExclusion: null, // 백분위 비교 대상 제외 기준
  correctionRule: null, // 부서별·개인별 보정값 적용 규칙
  overrideRange: null, // 최종 점수 직접 수정 허용 범위 (후보 없음)
  approvalProcess: null, // 직접 수정·보정 승인 절차 (후보 없음)
  finalizeRule: null, // 결과 확정·재계산 규칙 (후보 없음)
  disclosure: null, // 평가자 이름·서술형 응답·직원 결과 공개 범위 (후보 없음)
}
export const CONFIRMED_MEMBER_WEIGHTS = { self: 20, leader: 40, exec: 40 }

// 관리자 계정. 최종 점수 직접 수정은 canOverride 권한이 있는 계정만 할 수 있다.
function seedAdmins() {
  return [
    { id: 'admin', name: '관리자', empNo: '0000', title: '인사 관리자', canOverride: false },
    { id: 'ceo', name: '대표자', empNo: '0001', title: '대표자', canOverride: true },
  ]
}

// 이전 버전 데이터에 새 항목을 덧붙인다. 기존 직원·응답·설정은 그대로 둔다.
function migrate(data) {
  data.settings = { ...POLICY_DEFAULTS_V3, ...data.settings }
  for (const k of ['deptCorrections', 'personCorrections', 'overrides']) data[k] ??= {}
  data.auditLog ??= []
  data.adjustments ??= []
  data.admins.forEach((a) => { a.canOverride ??= false; a.title ??= '인사 관리자' })
  if (!data.admins.some((a) => a.id === 'ceo')) data.admins.push(seedAdmins()[1])
  // 사원 가중치가 아직 비어 있을 때만 지시된 값으로 채운다(관리자가 이미 넣은 값은 건드리지 않음)
  const w = data.weights.member
  if (w.self === null && w.leader === null && w.exec === null) data.weights.member = { ...CONFIRMED_MEMBER_WEIGHTS }
  // 이전 '개인 점수 조정' 기록은 계산에서 빼고 변경 이력으로 옮겨 보존한다
  if (!data.migratedV3) {
    data.adjustments.forEach((a) => data.auditLog.push({
      id: data.nextId++, kind: 'legacy', userId: a.userId, teamId: null,
      beforeValue: null, afterValue: a.type === 'reset' ? '조정 해제' : a.type === 'set' ? `점수 지정 ${a.value}` : a.value,
      beforeScore: a.before ?? null, afterScore: a.after ?? null, reason: a.reason, by: a.by ?? '관리자', at: a.at,
    }))
    data.migratedV3 = true
  }
  // 3차 작업: 임원 그룹(경영진)을 일반 부서와 구분한다. 직원의 소속(teamId)은 그대로 둔다.
  data.teams.forEach((t) => {
    if (t.kind) return
    const list = data.users.filter((u) => u.teamId === t.id)
    t.kind = list.length && list.every((u) => u.role === 'exec') ? 'exec' : 'dept'
  })
  // 3차 작업: 임원 배정마다 출처를 남긴다 ('test' 테스트용 가상 배정 / 'admin' 관리자가 지정)
  if (!data.execAssignSource) {
    data.execAssignSource = Object.fromEntries(Object.keys(data.execAssign).map((k) => [k, data.execAssignIsTest === false ? 'admin' : 'test']))
  }
  // 3차 작업: 평가 대상 여부를 직원 정보가 아닌 '평가 회차별 대상 명단'으로 옮긴다(값은 그대로 이전)
  data.period.id ??= 'P2026H2'
  data.evalTargets ??= {}
  const roster = (data.evalTargets[data.period.id] ??= {})
  data.users.forEach((u) => {
    if ('evalTarget' in u) {
      roster[u.id] ??= u.evalTarget
      delete u.evalTarget
    }
  })
  return data
}

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.version === DATA_VERSION) return migrate(data)
    }
  } catch {
    // 저장소를 쓸 수 없으면 초기 데이터로 시작한다
  }
  return migrate(createInitialData())
}

export const db = reactive(loadData())

function saveNow() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(db))
  } catch {
    // 저장 실패는 화면 동작에 영향을 주지 않는다
  }
}
saveNow() // 이전 버전에서 옮겨 온 항목도 바로 저장해 둔다

let saveTimer = null
watch(db, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 150)
}, { deep: true })

// 관리자가 누르는 '테스트 데이터로 되돌리기'
export function resetData() {
  const fresh = migrate(createInitialData())
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, fresh)
}

export const newId = () => db.nextId++

// ---- 세션 (탭을 닫으면 사라진다) ----

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem('rollent.session')) ?? null
  } catch {
    return null
  }
}

export const store = reactive({
  session: loadSession(), // { kind: 'admin' | 'user', id }
  toasts: [],
  confirmState: null,
  printJob: null, // { kind: 'final' | 'interview', userIds }
})

function saveSession() {
  try {
    sessionStorage.setItem('rollent.session', JSON.stringify(store.session))
  } catch {
    // 무시
  }
}

// 아이디=이름, 비밀번호=사번. 사번은 고유하므로 이름+사번 쌍은 동명이인이 있어도 한 사람만 가리킨다.
export function login(name, empNo) {
  const n = name.trim()
  const e = empNo.trim()
  const admin = db.admins.find((a) => a.name === n && a.empNo === e)
  if (admin) {
    store.session = { kind: 'admin', id: admin.id }
  } else {
    const user = db.users.find((u) => u.name === n && u.empNo === e)
    if (!user) return { ok: false, message: '이름 또는 사번이 맞지 않습니다.' }
    if (!user.active) return { ok: false, message: '비활성화된 계정입니다. 관리자에게 문의하세요.' }
    store.session = { kind: 'user', id: user.id }
  }
  saveSession()
  return { ok: true, kind: store.session.kind }
}

export function logout() {
  store.session = null
  saveSession()
}

export const isAdmin = () => store.session?.kind === 'admin'
export function currentUser() {
  if (!store.session) return null
  if (store.session.kind === 'admin') return db.admins.find((a) => a.id === store.session.id) ?? null
  return db.users.find((u) => u.id === store.session.id) ?? null
}

// ---- 알림과 확인 팝업 ----

let toastId = 1
export function toast(message, variant = 'success') {
  const id = toastId++
  store.toasts.push({ id, message, variant })
  setTimeout(() => {
    store.toasts = store.toasts.filter((t) => t.id !== id)
  }, 3500)
}

// await confirmDialog({...}) 형태로 쓰며 확인 시 true를 반환한다
export function confirmDialog({ title = '확인', message, okText = '확인', danger = false }) {
  return new Promise((resolve) => {
    store.confirmState = { title, message, okText, danger, resolve }
  })
}

// ---- 조직 조회 ----

export const teamName = (teamId) => db.teams.find((t) => t.id === teamId)?.name ?? '미배정'
export const userById = (id) => db.users.find((u) => u.id === id)
export const userLabel = (u) => (u ? `${u.name} (${teamName(u.teamId)} · ${u.position})` : '-')
export const leadersOf = (teamId) => db.users.filter((u) => u.active && u.teamId === teamId && u.role === 'leader')
export const membersOf = (teamId) => db.users.filter((u) => u.active && u.teamId === teamId && u.role === 'member')
export { roleLabel }

// 폼의 소속 팀 값을 팀 id로 바꾼다. 'new'이면 입력한 이름으로 팀을 찾거나 새로 만든다.
export function resolveTeam(teamId, newTeamName) {
  if (teamId !== 'new') return teamId
  const name = newTeamName.trim()
  const found = db.teams.find((t) => t.name === name)
  if (found) return found.id
  const team = { id: newId(), name, kind: 'dept' }
  db.teams.push(team)
  return team.id
}

// 같은 팀에서는 팀장이 먼저 나오도록 정렬
const roleOrder = { leader: 0, member: 1, exec: 2 }
export function sortUsers(list) {
  const teamIndex = (id) => {
    const i = db.teams.findIndex((t) => t.id === id)
    return i < 0 ? 999 : i
  }
  return [...list].sort((a, b) => teamIndex(a.teamId) - teamIndex(b.teamId) || roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name, 'ko'))
}

// ---- 평가 단계와 평가자 배정 ----

// 평가를 받는 사람인지(활성 + 평가 대상)
// 이번 평가 회차의 대상 여부(활성 상태와 별개). 명단에 없으면 대상으로 본다(신규 직원 기본값, 기존과 동일).
export const isPeriodTarget = (u) => db.evalTargets[db.period.id]?.[u.id] ?? true
export function setPeriodTarget(userId, value) {
  (db.evalTargets[db.period.id] ??= {})[userId] = value
}
// 평가를 진행하는 사람: 활성 상태이면서 이번 회차 대상 (비활성 직원은 기존처럼 평가에서 빠진다)
export const isEvalTarget = (u) => !!u && u.active && isPeriodTarget(u)

// 임원 그룹(경영진)과 일반 부서
export const isExecGroup = (teamId) => db.teams.find((t) => t.id === teamId)?.kind === 'exec'
export const deptTeams = () => db.teams.filter((t) => t.kind !== 'exec')

// 임원 담당 배정 (직원 1명 → 임원 1명). 화면 어디서 바꾸든 이 함수로 같은 데이터를 고친다.
export function setExecFor(targetId, execId) {
  if (execId) {
    db.execAssign[targetId] = execId
    db.execAssignSource[targetId] = 'admin'
  } else {
    delete db.execAssign[targetId]
    delete db.execAssignSource[targetId]
  }
}
export const execSourceOf = (targetId) => (db.execAssign[targetId] ? db.execAssignSource[targetId] ?? 'admin' : null)

// 현재 설정에서 이 사람에게 적용되는 평가 단계
export function stagesFor(u) {
  if (!isEvalTarget(u)) return []
  return ROLE_STAGES[u.role].filter((s) => {
    if (u.role === 'exec' && s === 'self') return db.settings.execSelfEnabled
    if (s === 'members') return db.settings.memberEvalEnabled
    return true
  })
}

// 단계별 평가자 목록 (조직 정보에서 자동으로 계산된다)
export function evaluatorsFor(target, stage) {
  if (!target) return []
  if (stage === 'self') return [target]
  if (stage === 'leader') return leadersOf(target.teamId).filter((l) => l.id !== target.id)
  if (stage === 'members') return membersOf(target.teamId).filter((m) => m.id !== target.id)
  if (stage === 'exec') {
    const e = userById(db.execAssign[target.id])
    return e && e.active && e.role === 'exec' ? [e] : []
  }
  return []
}

// 전체 배정 목록: [{ stage, target, evaluator }]
export function allAssignments() {
  const list = []
  db.users.forEach((t) => {
    stagesFor(t).forEach((stage) => {
      evaluatorsFor(t, stage).forEach((e) => list.push({ stage, target: t, evaluator: e }))
    })
  })
  return list
}

export const tasksFor = (evaluatorId) => allAssignments().filter((a) => a.evaluator.id === evaluatorId)

// 이 사용자가 이 평가를 할 권한이 있는지 (화면 이동 전에 반드시 확인)
export function canEvaluate(evaluatorId, stage, targetId) {
  const target = userById(targetId)
  if (!target || !stagesFor(target).includes(stage)) return false
  return evaluatorsFor(target, stage).some((e) => e.id === evaluatorId)
}

// ---- 평가 응답 ----

export const evalKey = (stage, targetId, evaluatorId) => `${stage}:${targetId}:${evaluatorId}`
export const getEvaluation = (stage, targetId, evaluatorId) => db.evaluations[evalKey(stage, targetId, evaluatorId)] ?? null

export const evalStatus = (ev) => (!ev ? 'todo' : ev.status === 'submitted' ? 'done' : 'progress')
export const EVAL_STATUS_LABEL = { todo: '시작 전', progress: '진행 중', done: '완료', unassigned: '배정 필요', off: '해당 없음' }

// 이 단계에서 답할 문항 (삭제되지 않은 문항)
export function questionsFor(stage) {
  return db.items.filter((it) => it.stages.includes(stage)).flatMap((it) => it.questions.map((q) => ({ ...q, item: it })))
}

// 제출 전 확인: 필수 문항 미응답, 글자 수 초과, 삭제된 선택지
export function validateAnswers(stage, answers) {
  const problems = []
  questionsFor(stage).forEach((q) => {
    const v = answers[q.id]
    const empty = v === undefined || v === null || String(v).trim() === ''
    if (q.required && empty) problems.push({ questionId: q.id, message: `'${q.text}' 문항에 응답해 주세요.` })
    if (!empty && q.type === 'choice' && !q.choices.some((c) => c.id === v && !c.deleted)) {
      problems.push({ questionId: q.id, message: `'${q.text}' 문항의 선택지가 바뀌었습니다. 다시 선택해 주세요.` })
    }
    if (!empty && q.type !== 'choice' && q.maxLength && String(v).length > q.maxLength) {
      problems.push({ questionId: q.id, message: `'${q.text}' 문항은 ${q.maxLength}자까지 입력할 수 있습니다.` })
    }
  })
  return problems
}

export function saveEvaluation(stage, target, evaluator, answers, submit) {
  if (!canEvaluate(evaluator.id, stage, target.id)) throw new Error('배정되지 않은 평가입니다.')
  const key = evalKey(stage, target.id, evaluator.id)
  const now = new Date().toISOString()
  const prev = db.evaluations[key]
  if (prev?.status === 'submitted') throw new Error('이미 제출한 평가입니다.')
  db.evaluations[key] = {
    key, stage, targetId: target.id, evaluatorId: evaluator.id, targetRole: target.role, evaluatorRole: evaluator.role,
    answers: { ...answers }, status: submit ? 'submitted' : 'draft', updatedAt: now, submittedAt: submit ? now : null,
  }
}

// 관리자: 제출된 평가를 다시 작성할 수 있게 연다
export function reopenEvaluation(key) {
  const ev = db.evaluations[key]
  if (ev) {
    ev.status = 'draft'
    ev.submittedAt = null
  }
}

// 평가 문항 저장. 화면 검사와 별도로 여기서도 평가표별 배점 합계(100점)를 확인하고, 맞지 않으면 저장하지 않는다.
export function commitItems(items) {
  const r = pointsReport(items, db.settings)
  if (!r.ok) {
    const bad = r.stages.filter((s) => !s.ok).map((s) => `${s.label} ${totalText(s)}`)
    throw new Error([...r.itemErrors, ...bad].join(' / '))
  }
  db.items = JSON.parse(JSON.stringify(items))
}

// 문항·선택지별 응답 수 (수정·삭제 경고용)
export function responseCount(questionId, choiceId) {
  return Object.values(db.evaluations).filter((ev) =>
    choiceId ? ev.answers[questionId] === choiceId : ev.answers[questionId] !== undefined && ev.answers[questionId] !== '',
  ).length
}

// 단계 진행 상태: 배정된 평가자가 모두 제출하면 완료
export function stageStatus(target, stage) {
  if (!stagesFor(target).includes(stage)) return 'off'
  const evaluators = evaluatorsFor(target, stage)
  if (!evaluators.length) return 'unassigned'
  const statuses = evaluators.map((e) => evalStatus(getEvaluation(stage, target.id, e.id)))
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.some((s) => s !== 'todo')) return 'progress'
  return 'todo'
}

// 대상자 전체 상태: 시작 전 / 진행 중 / 완료 / 최종 확정
export function targetStatus(target) {
  const stages = stagesFor(target)
  if (!stages.length) return '해당 없음'
  if (db.finalized[target.id]) return '최종 확정'
  const statuses = stages.map((s) => stageStatus(target, s))
  if (statuses.every((s) => s === 'done')) return '완료'
  if (statuses.some((s) => s === 'done' || s === 'progress')) return '진행 중'
  return '시작 전'
}

// 이 사람에 대한 기록이 있는지(삭제 가능 여부 판단)
export function hasEvaluationRecords(userId) {
  return Object.values(db.evaluations).some((ev) => ev.targetId === userId || ev.evaluatorId === userId)
    || db.adjustments.some((a) => a.userId === userId) || !!db.finalized[userId]
    || !!db.personCorrections[userId] || !!db.overrides[userId] || db.auditLog.some((a) => a.userId === userId)
}

// ---- 보정·직접 수정 (값은 따로 저장하고, 바뀔 때마다 변경 이력을 남긴다) ----

const actorName = () => {
  const u = currentUser()
  return u ? (u.title ? `${u.name}(${u.title})` : u.name) : '알 수 없음'
}
export const canOverride = () => store.session?.kind === 'admin' && !!currentUser()?.canOverride

function audit(entry) {
  db.auditLog.push({ id: newId(), at: new Date().toISOString(), by: actorName(), ...entry })
}

// 부서별 보정값 저장. value가 null이면 '미입력'으로 되돌린다(초기화). affected: [{ userId, before, after }] 예상값
export function saveDeptCorrection(teamId, value, reason, affected = []) {
  const prev = db.deptCorrections[teamId]?.value ?? null
  if (value === null) delete db.deptCorrections[teamId]
  else db.deptCorrections[teamId] = { value, reason: reason || '', savedAt: new Date().toISOString(), by: actorName() }
  audit({ kind: 'dept', teamId, userId: null, beforeValue: prev, afterValue: value, beforeScore: null, afterScore: null, reason: reason || '', affected })
}

// 개인별 보정값 저장. beforeScore/afterScore는 '이 보정값만 적용했을 때' 예상 점수
export function savePersonCorrection(userId, value, reason, beforeScore, afterScore) {
  const prev = db.personCorrections[userId]?.value ?? null
  if (value === null) delete db.personCorrections[userId]
  else db.personCorrections[userId] = { value, reason, savedAt: new Date().toISOString(), by: actorName() }
  const u = userById(userId)
  audit({ kind: 'person', teamId: u?.teamId ?? null, userId, beforeValue: prev, afterValue: value, beforeScore, afterScore, reason })
}

// 최종 점수 직접 수정. 권한 있는 계정만. 다른 단계의 값은 건드리지 않는다.
export function saveOverride(userId, score, reason, beforeScore) {
  if (!canOverride()) throw new Error('최종 점수 직접 수정 권한이 없습니다.')
  const prev = db.overrides[userId]?.score ?? null
  if (score === null) delete db.overrides[userId]
  else db.overrides[userId] = { score, before: beforeScore, reason, at: new Date().toISOString(), by: actorName() }
  const u = userById(userId)
  audit({ kind: 'override', teamId: u?.teamId ?? null, userId, beforeValue: prev, afterValue: score, beforeScore, afterScore: score ?? beforeScore, reason })
}
