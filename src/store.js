import { reactive, watch, watchEffect } from 'vue'
import { ROLE_STAGES, roleLabel, DEFAULT_ROLE_RATIOS, OLD_DEFAULT_ROLE_RATIOS } from './constants'
import { SEED_PERIOD, seedEmployees, seedItems, seedEvaluations, seedExecAssign, seedTeamKpi } from './seed'
import { pointsReport, totalText } from './points'
import { i18n, t, dt } from './i18n'

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
      kpiMethod: null,
      kpiBase: null,
      kpiMixRatio: null,
      grade: { ratios: { A: null, B: null, C: null, D: null }, rounding: null, ties: null },
      ...POLICY_DEFAULTS_V3,
    },
    // 단계별 가중치. 사원은 2차 작업 지시값(본인 20 · 팀장 40 · 임원 40), 팀장·임원은 사원과 같은 비율로 둔다
    weights: clone(DEFAULT_WEIGHTS),
    execAssign,
    execAssignIsTest: true,
    evaluations: seedEvaluations(users, items, execAssign),
    kpiScores: {}, // (이전 방식) 부서 KPI 점수. 팀 KPI의 '직접 입력'으로 옮긴다
    teamKpi: {}, // { periodId: { teamId: { mode: 'indicators' | 'direct', direct, indicators: [] } } }
    roleRatios: clone(DEFAULT_ROLE_RATIOS), // 직급별 최종 반영 비율
    adjustments: [], // (이전 방식) 개인 점수 조정. 2차 작업 이후로는 쓰지 않고 이력으로만 보존
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
  overrideRange: null, // 최종 점수 직접 수정 허용 범위 (후보 없음)
  approvalProcess: null, // 직접 수정·보정 승인 절차 (후보 없음)
  finalizeRule: null, // 결과 확정·재계산 규칙 (후보 없음)
  disclosure: null, // 평가자 이름·서술형 응답·직원 결과 공개 범위 (후보 없음)
}
export const CONFIRMED_MEMBER_WEIGHTS = { self: 20, leader: 40, exec: 40 }
// 팀장: 자기 20 · 팀원(상향) 40 · 임원 40 / 임원: 자기 20 · 상향 80
export const DEFAULT_WEIGHTS = { member: { ...CONFIRMED_MEMBER_WEIGHTS }, leader: { self: 20, members: 40, exec: 40 }, exec: { self: 20, upward: 80 } }
const clone = (x) => JSON.parse(JSON.stringify(x))

// 관리자 계정. 최종 점수 직접 수정은 canOverride 권한이 있는 계정만 할 수 있다(관리자에게 부여).
function seedAdmins() {
  return [
    { id: 'admin', name: '관리자', empNo: '0000', title: '인사 관리자', canOverride: true },
  ]
}

// 이전 버전 데이터에 새 항목을 덧붙인다. 기존 직원·응답·설정은 그대로 둔다.
function migrate(data) {
  data.settings = { ...POLICY_DEFAULTS_V3, ...data.settings }
  for (const k of ['personCorrections', 'overrides']) data[k] ??= {}
  data.auditLog ??= []
  data.adjustments ??= []
  // 대표자 계정은 없애고 최종 점수 직접 수정 권한을 관리자에게 준다(기존 수정 기록은 그대로 둔다)
  data.admins = data.admins.filter((a) => a.id !== 'ceo')
  data.admins.forEach((a) => { a.title ??= '인사 관리자'; if (a.id === 'admin') a.canOverride = true; a.canOverride ??= false })
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
  // 팀 KPI: 이전 부서 KPI 점수는 '직접 입력' 값으로 옮긴다
  data.teamKpi ??= {}
  const tk = (data.teamKpi[data.period.id] ??= {})
  Object.entries(data.kpiScores ?? {}).forEach(([tid, v]) => {
    if (typeof v === 'number' && !tk[tid]) tk[tid] = { mode: 'direct', direct: v, indicators: [] }
  })
  data.kpiScores = {}
  data.roleRatios ??= clone(DEFAULT_ROLE_RATIOS)
  // 평가 회차: 회차 목록과, 선택하지 않은 회차의 평가 정보·결과 보관함
  // 등급: 상대평가(순위 비율, 기존 방식)와 절대평가(점수 기준) 중 선택
  data.settings.grade.mode ??= 'relative'
  data.settings.grade.cutoffs ??= { A: null, B: null, C: null }
  Object.values(data.periodData ?? {}).forEach((p) => {
    p.settings.grade.mode ??= 'relative'
    p.settings.grade.cutoffs ??= { A: null, B: null, C: null }
  })
  data.periods ??= [{ ...data.period }]
  data.periodData ??= {}
  // 백분위·보정 적용 규칙은 쓰지 않는다 (부서별 보정을 없애고 개인별 보정만 바로 반영)
  for (const k of ['percentileMethod', 'percentileGroup', 'percentileTies', 'percentileExclusion', 'correctionRule']) delete data.settings[k]
  // 팀 KPI 예시 값: 처음 한 번만, 아직 KPI가 없는 팀에 넣는다
  if (!data.kpiSeeded) {
    Object.entries(seedTeamKpi(data.teams)).forEach(([tid, v]) => { tk[tid] ??= v })
    data.kpiSeeded = true
  }
  // 팀원평가·상향평가를 단계 가중치에 넣는다. 비어 있는 가중치만 기본값으로 채운다
  const lw = data.weights.leader ?? {}
  if (['self', 'members', 'exec'].every((k) => typeof lw[k] !== 'number')) data.weights.leader = { ...DEFAULT_WEIGHTS.leader }
  else if (!('members' in lw)) lw.members = null
  data.weights.exec ??= { ...DEFAULT_WEIGHTS.exec }
  // 직급별 비율에서 상향평가 칸을 뺀다(개인평가 안으로 옮김). 이전 기본값 그대로면 새 기본값으로 바꾼다
  for (const role of ['member', 'leader', 'exec']) {
    const r = data.roleRatios[role]
    if (!r) { data.roleRatios[role] = clone(DEFAULT_ROLE_RATIOS[role]); continue }
    if (OLD_DEFAULT_ROLE_RATIOS[role] && JSON.stringify(r) === JSON.stringify(OLD_DEFAULT_ROLE_RATIOS[role])) data.roleRatios[role] = clone(DEFAULT_ROLE_RATIOS[role])
    else {
      delete r.upward
      r.personal ??= { on: false, value: null }
      r.kpi ??= { on: false, value: null }
    }
  }
  // 임원 상향평가 단계가 생겼으므로, 그 단계 문항이 하나도 없으면 기본 항목을 넣는다(기존 항목은 그대로)
  if (data.items.length && !data.items.some((it) => it.stages.includes('upward'))) {
    const up = seedItems().find((it) => it.stages.length === 1 && it.stages[0] === 'upward')
    const used = new Set(data.items.flatMap((it) => [it.id, ...it.questions.map((q) => q.id)]))
    if (!used.has(up.id) && !up.questions.some((q) => used.has(q.id))) data.items.push(up)
  }
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

// 전체 삭제: 고른 범위의 데이터를 비운다. 관리자 계정·정책 설정·가중치·직급별 비율·평가 회차는 남긴다.
// 평가 응답·결과, 평가 문항, 팀 KPI는 지금 선택한 회차만 지운다(다른 회차는 그대로).
// 직원·부서는 모든 회차가 함께 쓰므로, people을 지우면 모든 회차의 평가 응답·결과와 대상 명단·팀 KPI도 함께 지운다.
export function wipeData({ evaluations = false, people = false, items = false, kpi = false }) {
  const pid = db.period.id
  if (evaluations || people) Object.assign(db, emptyResults())
  if (people) {
    Object.values(db.periodData).forEach((p) => Object.assign(p, emptyResults()))
    db.users = []
    db.teams = []
    db.execAssign = {}
    db.execAssignSource = {}
    db.evalTargets = Object.fromEntries(db.periods.map((p) => [p.id, {}]))
    db.teamKpi = Object.fromEntries(db.periods.map((p) => [p.id, {}]))
  }
  if (items) db.items = []
  if (kpi) db.teamKpi[pid] = {}
}

// 관리자가 누르는 '테스트 데이터로 되돌리기'
export function resetData() {
  const fresh = migrate(createInitialData())
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, fresh)
}

export const newId = () => db.nextId++

// ---- 평가 회차 ----
// 선택한 회차의 평가 정보·결과는 지금처럼 db 최상위 필드에서 쓰고, 다른 회차는 periodData[회차 id]에 보관한다.
// 평가 대상 명단(evalTargets)과 팀 KPI(teamKpi)는 원래 회차 id별로 저장된다.
const PERIOD_CONFIG = ['items', 'weights', 'roleRatios', 'settings'] // 복제하는 평가 정보
const PERIOD_RESULTS = ['evaluations', 'finalized', 'personCorrections', 'overrides', 'interviewNotes', 'auditLog', 'adjustments'] // 복제하지 않는 평가 결과
function emptyResults() {
  return { evaluations: {}, finalized: {}, personCorrections: {}, overrides: {}, interviewNotes: {}, auditLog: [], adjustments: [] }
}
const pick = (keys) => clone(Object.fromEntries(keys.map((k) => [k, db[k]])))

// 회차 목록 (선택한 회차는 화면에서 고친 이름·기간이 바로 보이도록 db.period를 쓴다)
export const periodList = () => db.periods.map((p) => (p.id === db.period.id ? db.period : p))

function stashActive() {
  const id = db.period.id
  db.periods = db.periods.map((p) => (p.id === id ? { ...db.period } : p))
  db.periodData[id] = pick([...PERIOD_CONFIG, ...PERIOD_RESULTS])
}
function loadPeriod(id) {
  Object.assign(db, db.periodData[id])
  delete db.periodData[id]
  db.period = { ...db.periods.find((p) => p.id === id) }
}

export function switchPeriod(id) {
  if (id === db.period.id || !db.periodData[id]) return
  stashActive()
  loadPeriod(id)
}

// 팀 KPI는 지표(이름·적용 범위·목표·단위·방향·가중치)만 복제하고 실적과 직접 입력 점수는 비운다
function kpiPlanOf(periodId) {
  return Object.fromEntries(Object.entries(db.teamKpi[periodId] ?? {}).map(([tid, t]) => [tid, {
    mode: t.mode, direct: null, indicators: (t.indicators ?? []).map((i) => ({ ...clone(i), actual: null })),
  }]))
}

// 선택한 회차의 평가 정보(문항·가중치·직급별 비율·계산 규칙·팀 KPI 지표와 목표)와 평가 대상 명단만 복제한다.
// 응답·확정 결과·보정·직접 수정·면담 기록·팀 KPI 실적은 복제하지 않는다. 복제한 회차로 바로 이동한다.
export function clonePeriod(meta) {
  const id = `P${newId()}`
  const config = pick(PERIOD_CONFIG)
  const roster = clone(db.evalTargets[db.period.id] ?? {})
  const kpiPlan = kpiPlanOf(db.period.id)
  stashActive()
  db.periods.push({ id, ...meta })
  db.periodData[id] = { ...config, ...emptyResults() }
  db.evalTargets[id] = roster
  db.teamKpi[id] = kpiPlan
  loadPeriod(id)
  return id
}

// 회차와 그 회차의 평가 정보·결과를 모두 지운다. 회차가 하나뿐이면 지울 수 없다.
export function deletePeriod(id) {
  if (db.periods.length < 2) throw new Error('회차가 하나뿐이라 삭제할 수 없습니다.')
  if (id === db.period.id) {
    stashActive()
    loadPeriod(db.periods.find((p) => p.id !== id).id)
  }
  delete db.periodData[id]
  db.periods = db.periods.filter((p) => p.id !== id)
  delete db.evalTargets[id]
  delete db.teamKpi[id]
}

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
// 관리자 화면은 한국어로만 보여준다
watchEffect(() => { i18n.adminView = store.session?.kind === 'admin' })

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
    if (!user) return { ok: false, message: t('login.bad') }
    if (!user.active) return { ok: false, message: t('login.inactive') }
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
  if (stage === 'upward') {
    if (target.role !== 'exec') return []
    return db.users.filter((u) => u.active && u.role === 'leader' && db.execAssign[u.id] === target.id)
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
    if (q.required && empty) problems.push({ questionId: q.id, message: t('v.required', { q: dt(q.text) }) })
    if (!empty && q.type === 'choice' && !q.choices.some((c) => c.id === v && !c.deleted)) {
      problems.push({ questionId: q.id, message: t('v.choiceChanged', { q: dt(q.text) }) })
    }
    if (!empty && q.type !== 'choice' && q.maxLength && String(v).length > q.maxLength) {
      problems.push({ questionId: q.id, message: t('v.tooLong', { q: dt(q.text), n: q.maxLength }) })
    }
  })
  return problems
}

export function saveEvaluation(stage, target, evaluator, answers, submit) {
  if (!canEvaluate(evaluator.id, stage, target.id)) throw new Error(t('ev.errNotAssigned'))
  const key = evalKey(stage, target.id, evaluator.id)
  const now = new Date().toISOString()
  const prev = db.evaluations[key]
  if (prev?.status === 'submitted') throw new Error(t('ev.errSubmitted'))
  db.evaluations[key] = {
    key, stage, targetId: target.id, evaluatorId: evaluator.id, targetRole: target.role, evaluatorRole: evaluator.role,
    answers: { ...answers }, status: submit ? 'submitted' : 'draft', updatedAt: now, submittedAt: submit ? now : null,
  }
}

// 관리자: 제출된 평가를 삭제한다. 평가자는 '시작 전' 상태에서 처음부터 다시 응답한다.
export function deleteEvaluation(key) {
  delete db.evaluations[key]
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
