<script setup>
import { computed, ref } from 'vue'
import {
  db, teamName, userById, resolveTeam, newId, toast, confirmDialog, sortUsers, leadersOf, membersOf,
  hasEvaluationRecords, targetStatus, deptTeams, isEvalTarget, isPeriodTarget, setPeriodTarget, setExecFor, execSourceOf,
} from '../store'
import { POSITIONS, ROLES, roleLabel, roleFromPosition } from '../constants'
import AppModal from '../components/AppModal.vue'
import TeamSelect from '../components/TeamSelect.vue'
import CsvImport from '../components/CsvImport.vue'
import ExecAssignModal from '../components/ExecAssignModal.vue'
import SortTh from '../components/SortTh.vue'

// 세 목록(임원·부서·직원)은 모두 같은 db.users / db.teams / db.execAssign 을 본다.

// =========================================================
// 1. 임원 목록
// =========================================================
const execs = computed(() => db.users.filter((u) => u.role === 'exec').sort((a, b) => a.name.localeCompare(b.name, 'ko')))
const targetsOf = (execId) => sortUsers(db.users.filter((u) => db.execAssign[u.id] === execId))
const assignExec = ref(null)
async function unassign(u) {
  const ok = await confirmDialog({ title: '담당 배정 해제', message: `${u.name}님을 ${userById(db.execAssign[u.id]).name} 임원의 담당에서 해제합니다.\n직원 정보는 지워지지 않으며, 이 직원의 임원평가는 '배정 필요' 상태가 됩니다.`, okText: '배정 해제' })
  if (!ok) return
  setExecFor(u.id, null)
  toast(`${u.name}님의 담당 임원 배정을 해제했습니다.`)
}

// =========================================================
// 2. 부서 목록 (임원 그룹 제외)
// =========================================================
const teamFilter = ref('all')
const newTeam = ref('')
const teamError = ref('')
const depts = computed(() => deptTeams())
const activeCount = (teamId) => db.users.filter((u) => u.teamId === teamId && u.active).length

function addTeam() {
  const name = newTeam.value.trim()
  teamError.value = ''
  if (!name) { teamError.value = '부서명을 입력해 주세요.'; return }
  if (db.teams.some((t) => t.name === name)) { teamError.value = `'${name}'은(는) 이미 있는 부서명입니다.`; return }
  db.teams.push({ id: newId(), name, kind: 'dept' })
  newTeam.value = ''
  toast(`'${name}' 부서를 추가했습니다. '구성원 배정'에서 팀장과 사원을 배정하세요.`)
}
async function removeTeam(team) {
  const count = db.users.filter((u) => u.teamId === team.id).length
  if (count) return toast(`'${team.name}'에 직원 ${count}명(비활성 포함)이 있어 삭제할 수 없습니다. '구성원 배정'에서 다른 부서로 옮기거나 소속을 해제한 뒤 삭제하세요.`, 'warning')
  const extras = [db.kpiScores[team.id] !== undefined && 'KPI 점수', db.deptCorrections[team.id] && '부서별 보정값'].filter(Boolean)
  const ok = await confirmDialog({
    title: '부서 삭제',
    message: `'${team.name}' 부서를 삭제합니다. 직원은 삭제되지 않습니다.${extras.length ? `\n이 부서에 저장된 ${extras.join('·')}도 함께 지워집니다(변경 이력은 남음).` : ''}`,
    okText: '부서 삭제', danger: true,
  })
  if (!ok) return
  db.teams = db.teams.filter((t) => t.id !== team.id)
  delete db.kpiScores[team.id]
  delete db.deptCorrections[team.id]
  if (teamFilter.value === team.id) teamFilter.value = 'all'
  toast(`'${team.name}' 부서를 삭제했습니다.`)
}

// 부서 구성원 배정
const memberTeam = ref(null)
const pickLeader = ref('')
const pickMember = ref('')
const staff = computed(() => sortUsers(db.users.filter((u) => u.role !== 'exec')))
const teamPeople = computed(() => (memberTeam.value ? sortUsers(db.users.filter((u) => u.teamId === memberTeam.value.id && u.role !== 'exec')) : []))
async function assignToTeam(asLeader) {
  const id = asLeader ? pickLeader.value : pickMember.value
  const u = userById(id)
  if (!u) return toast('배정할 직원을 선택해 주세요.', 'warning')
  const t = memberTeam.value
  const changes = []
  if (u.teamId !== t.id) changes.push(`소속: ${teamName(u.teamId)} → ${t.name}`)
  if (asLeader && u.role !== 'leader') changes.push(`역할: ${roleLabel(u.role)} → 팀장 (직급 '팀장')`)
  if (!asLeader && u.role !== 'member') changes.push(`역할: ${roleLabel(u.role)} → 사원${u.position === '팀장' ? " (직급 '팀장' → '사원')" : ''}`)
  if (!changes.length) return toast(`${u.name}님은 이미 ${t.name} ${asLeader ? '팀장' : '사원'}입니다.`, 'warning')
  const ok = await confirmDialog({
    title: `${t.name} ${asLeader ? '팀장' : '사원'} 배정`,
    message: `${u.name}\n${changes.join('\n')}${hasEvaluationRecords(u.id) ? '\n\n기존 평가 기록은 보존되고, 평가자 배정(팀장평가·팀원평가)은 새 소속·역할 기준으로 다시 계산됩니다.' : ''}`,
    okText: '배정',
  })
  if (!ok) return
  u.teamId = t.id
  if (asLeader) Object.assign(u, { role: 'leader', position: '팀장' })
  else Object.assign(u, { role: 'member', position: u.position === '팀장' ? '사원' : u.position })
  pickLeader.value = ''
  pickMember.value = ''
  toast(`${u.name}님을 ${t.name} ${asLeader ? '팀장' : '사원'}으로 배정했습니다.`)
}
async function releaseFromTeam(u) {
  const ok = await confirmDialog({ title: '소속 해제', message: `${u.name}님을 ${memberTeam.value.name}에서 빼고 '미배정'으로 둡니다. 직원 정보는 그대로입니다.`, okText: '소속 해제' })
  if (!ok) return
  u.teamId = null
  toast(`${u.name}님의 소속을 해제했습니다.`)
}

// =========================================================
// 3. 직원 목록 (팀장·사원)
// =========================================================
const q = ref('')
const positionFilter = ref('all')
const roleFilter = ref('all')
const activeFilter = ref('all')
const targetFilter = ref('all')
const sort = ref({ key: null, dir: 'asc' })
const checked = ref([])

const teamIndex = (id) => { const i = db.teams.findIndex((t) => t.id === id); return i < 0 ? 999 : i }
// 기본 정렬: 팀장 → 사원, 그룹 안에서는 기존 방식(부서 순 → 이름)
const defaultCmp = (a, b) => (a.role === b.role ? 0 : a.role === 'leader' ? -1 : 1) || teamIndex(a.teamId) - teamIndex(b.teamId) || a.name.localeCompare(b.name, 'ko')
const execName = (u) => userById(db.execAssign[u.id])?.name ?? ''
const SORTERS = {
  team: (a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId), 'ko'),
  position: (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position),
  name: (a, b) => a.name.localeCompare(b.name, 'ko'),
  role: (a, b) => (a.role === b.role ? 0 : a.role === 'leader' ? -1 : 1),
  exec: (a, b) => (execName(a) || '힣').localeCompare(execName(b) || '힣', 'ko'),
  target: (a, b) => Number(isPeriodTarget(b)) - Number(isPeriodTarget(a)),
  active: (a, b) => Number(b.active) - Number(a.active),
}
const list = computed(() => {
  const rows = db.users.filter((u) => u.role !== 'exec'
    && (teamFilter.value === 'all' || (teamFilter.value === 'none' ? !u.teamId : u.teamId === teamFilter.value))
    && (positionFilter.value === 'all' || u.position === positionFilter.value)
    && (roleFilter.value === 'all' || u.role === roleFilter.value)
    && (activeFilter.value === 'all' || (activeFilter.value === 'active' ? u.active : !u.active))
    && (targetFilter.value === 'all' || (targetFilter.value === 'yes' ? isPeriodTarget(u) : !isPeriodTarget(u)))
    && (!q.value.trim() || u.name.includes(q.value.trim())))
  const { key, dir } = sort.value
  if (!key) return rows.sort(defaultCmp)
  const sign = dir === 'asc' ? 1 : -1
  return rows.sort((a, b) => sign * SORTERS[key](a, b) || defaultCmp(a, b))
})
function onSort(s) { sort.value = s }
function resetSort() { sort.value = { key: null, dir: 'asc' } }

function toggleCheck(id) {
  checked.value = checked.value.includes(id) ? checked.value.filter((x) => x !== id) : [...checked.value, id]
}
const allChecked = computed({
  get: () => list.value.length > 0 && list.value.every((u) => checked.value.includes(u.id)),
  set: (v) => { checked.value = v ? list.value.map((u) => u.id) : [] },
})

// 담당 임원 (직원 목록에서 수정)
const execEdit = ref(null) // { user, execId }
function openExecEdit(u) {
  execEdit.value = { user: u, execId: db.execAssign[u.id] ?? '' }
}
async function saveExecEdit() {
  const { user, execId } = execEdit.value
  const cur = db.execAssign[user.id] ?? ''
  if (execId === cur) { execEdit.value = null; return }
  setExecFor(user.id, execId || null)
  toast(execId ? `${user.name}님의 담당 임원을 ${userById(execId).name}(으)로 바꿨습니다.` : `${user.name}님의 담당 임원 배정을 해제했습니다.`)
  execEdit.value = null
}

// =========================================================
// 등록·수정 폼 (임원·직원 공통)
// =========================================================
const form = ref(null)
const formError = ref('')
const csvOpen = ref(false)

function openAdd() {
  form.value = { name: '', empNo: '', teamId: typeof teamFilter.value === 'number' ? teamFilter.value : depts.value[0]?.id ?? null, newTeam: '', position: '사원', role: 'member', periodTarget: true, active: true }
  formError.value = ''
}
function openEdit(u) {
  form.value = { ...u, newTeam: '', periodTarget: isPeriodTarget(u) }
  formError.value = ''
}
function onPositionChange() {
  form.value.role = roleFromPosition(form.value.position)
}

const formImpacts = computed(() => {
  const f = form.value
  if (!f?.id) return []
  const u = userById(f.id)
  const out = []
  const moved = f.teamId !== u.teamId
  const roleChanged = f.role !== u.role
  if ((moved || roleChanged || !f.active) && hasEvaluationRecords(u.id)) out.push('이 직원의 기존 평가 기록은 삭제되지 않고 그대로 보존됩니다.')
  if (moved || roleChanged) out.push('평가자 배정(팀장평가·팀원평가)은 새 소속과 역할 기준으로 다시 계산됩니다.')
  const myTargets = Object.values(db.execAssign).filter((id) => id === u.id).length
  if (u.role === 'exec' && (f.role !== 'exec' || !f.active) && myTargets) out.push(`이 임원이 담당하던 직원 ${myTargets}명이 '배정 필요' 상태가 됩니다.`)
  if (isPeriodTarget(u) && !f.periodTarget) out.push(`이번 회차(${db.period.name}) 평가 대상에서 빠집니다. 기존 응답은 보존됩니다.`)
  if (db.finalized[u.id] && (moved || roleChanged)) out.push('이미 최종 확정된 결과는 그대로 남고, 평가 결과 화면에 재계산 다름으로 표시될 수 있습니다.')
  return out
})

async function save() {
  const f = form.value
  if (!f.name.trim() || !f.empNo.trim()) { formError.value = '이름과 사번은 필수입니다.'; return }
  if (!/^[A-Za-z0-9-]{3,20}$/.test(f.empNo.trim())) { formError.value = '사번은 영문·숫자·하이픈 3~20자여야 합니다.'; return }
  if (db.users.some((u) => u.empNo === f.empNo.trim() && u.id !== f.id) || db.admins.some((a) => a.empNo === f.empNo.trim())) { formError.value = '이미 사용 중인 사번입니다.'; return }
  if (f.teamId === 'new' && !f.newTeam.trim()) { formError.value = '새 부서 이름을 입력해 주세요.'; return }
  if (formImpacts.value.length) {
    const ok = await confirmDialog({ title: '변경 내용 확인', message: formImpacts.value.join('\n') + '\n\n저장하시겠습니까?', okText: '저장' })
    if (!ok) return
  }
  const data = { name: f.name.trim(), empNo: f.empNo.trim(), teamId: resolveTeam(f.teamId, f.newTeam), position: f.position, role: f.role, active: f.active }
  let id = f.id
  if (id) Object.assign(userById(id), data)
  else { id = newId(); db.users.push({ id, ...data }) }
  setPeriodTarget(id, f.periodTarget)
  toast(f.id ? `${data.name}님의 정보를 저장했습니다.` : `${data.name}님을 등록했습니다.`)
  form.value = null
}

// =========================================================
// 일괄 작업 (체크한 직원만)
// =========================================================
const moveOpen = ref(false)
const moveTeam = ref(null)
const moveNewTeam = ref('')
async function moveChecked() {
  if (moveTeam.value === 'new' && !moveNewTeam.value.trim()) return toast('새 부서 이름을 입력해 주세요.', 'warning')
  const withRecords = checked.value.filter(hasEvaluationRecords).length
  const ok = await confirmDialog({
    title: '소속 변경',
    message: `${checked.value.length}명의 소속을 바꿉니다.${withRecords ? `\n이 중 ${withRecords}명은 평가 기록이 있으며, 기록은 보존되고 평가자 배정만 새 소속 기준으로 바뀝니다.` : ''}`,
    okText: '변경',
  })
  if (!ok) return
  const teamId = resolveTeam(moveTeam.value, moveNewTeam.value)
  checked.value.forEach((id) => { userById(id).teamId = teamId })
  toast(`${checked.value.length}명의 소속을 '${teamName(teamId)}'(으)로 바꿨습니다.`)
  moveOpen.value = false
  checked.value = []
}
async function setActiveChecked(active) {
  const ok = await confirmDialog({
    title: active ? '활성화' : '비활성화',
    message: active
      ? `${checked.value.length}명을 활성화합니다.`
      : `${checked.value.length}명을 비활성화합니다.\n로그인과 평가 진행에서 빠지며, 기존 평가 기록과 이번 회차 평가 대상 설정은 그대로 남습니다.`,
    okText: active ? '활성화' : '비활성화',
    danger: !active,
  })
  if (!ok) return
  checked.value.forEach((id) => { userById(id).active = active })
  toast(`${checked.value.length}명을 ${active ? '활성화' : '비활성화'}했습니다.`)
  checked.value = []
}
// 평가 기록이 없는 직원만 삭제한다. 기록이 있으면 비활성화를 안내한다.
async function deleteChecked() {
  const deletable = checked.value.filter((id) => !hasEvaluationRecords(id))
  const blocked = checked.value.length - deletable.length
  if (!deletable.length) return toast('선택한 직원 모두 평가 기록이 있어 삭제할 수 없습니다. 비활성화를 사용하세요.', 'warning')
  const ok = await confirmDialog({
    title: '직원 삭제',
    message: `${deletable.length}명을 삭제합니다. 되돌릴 수 없습니다.${blocked ? `\n평가 기록이 있는 ${blocked}명은 삭제하지 않습니다(비활성화를 사용하세요).` : ''}`,
    okText: '삭제', danger: true,
  })
  if (!ok) return
  db.users = db.users.filter((u) => !deletable.includes(u.id))
  Object.keys(db.execAssign).forEach((k) => { if (deletable.includes(Number(k)) || deletable.includes(db.execAssign[k])) setExecFor(Number(k), null) })
  toast(`${deletable.length}명을 삭제했습니다.`)
  checked.value = []
}
const sourceText = { test: '테스트', admin: '관리자 지정' }
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">직원 및 부서 관리</h1>
      <button class="btn btn-csv btn-sm" @click="csvOpen = true">CSV 일괄 등록</button>
    </div>

    <!-- 1. 임원 목록 -->
    <section class="panel mb-3" aria-labelledby="exec-title">
      <div class="panel-head">
        <h2 id="exec-title" class="panel-title">임원 목록 <span class="panel-sub">{{ execs.length }}명 · 이름을 누르면 정보를 수정합니다</span></h2>
        <span class="panel-sub">한 직원은 임원 1명에게만 배정됩니다(복수 배정 정책 미설정).</span>
      </div>
      <div class="table-responsive">
        <table class="table table-clean" data-testid="exec-table">
          <thead><tr><th>이름</th><th>직급</th><th class="text-end">담당 사원</th><th class="text-end">담당 팀장</th><th>담당 직원</th><th>상태</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in execs" :key="e.id" :data-exec="e.name">
              <td class="fw-semibold text-nowrap"><button class="edit-link" @click="openEdit(e)">{{ e.name }}</button></td>
              <td class="text-nowrap">{{ e.position }}</td>
              <td class="text-end text-nowrap">{{ targetsOf(e.id).filter((u) => u.role === 'member').length }}명</td>
              <td class="text-end text-nowrap">{{ targetsOf(e.id).filter((u) => u.role === 'leader').length }}명</td>
              <td>
                <div class="chips">
                  <span v-for="u in targetsOf(e.id)" :key="u.id" class="chip" :class="{ leader: u.role === 'leader', test: execSourceOf(u.id) === 'test' }" :title="sourceText[execSourceOf(u.id)]">
                    {{ u.name }}<small> {{ teamName(u.teamId) }}</small>
                    <button type="button" class="chip-x" :aria-label="`${u.name} 담당 해제`" @click="unassign(u)">×</button>
                  </span>
                  <span v-if="!targetsOf(e.id).length" class="text-muted small">담당 직원 없음</span>
                </div>
              </td>
              <td><span v-if="e.active" class="text-success small">활성</span><span v-else class="badge text-bg-secondary">비활성</span></td>
              <td class="text-end"><button class="btn btn-outline-primary btn-sm text-nowrap" @click="assignExec = e.id">담당 직원 배정</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">점선 테두리는 테스트용 가상 배정, 실선은 관리자가 지정한 배정입니다. × 를 누르면 배정만 해제되고 직원 정보는 지워지지 않습니다.</p>
    </section>

    <!-- 2. 부서 목록 -->
    <section class="panel mb-3" aria-labelledby="dept-title">
      <div class="panel-head">
        <h2 id="dept-title" class="panel-title">부서 목록 <span class="panel-sub">{{ depts.length }}개</span></h2>
        <span class="panel-sub">부서명은 여기서 수정할 수 없습니다. 추가와 삭제만 할 수 있습니다.</span>
      </div>
      <div class="table-responsive">
        <table class="table table-clean" data-testid="dept-list">
          <thead><tr><th>부서</th><th>팀장</th><th>관리</th><th class="text-end">인원(활성)</th></tr></thead>
          <tbody>
            <tr v-for="t in depts" :key="t.id" :data-team="t.name" :class="{ active: teamFilter === t.id }">
              <td class="fw-semibold">{{ t.name }}</td>
              <td>
                <span v-if="leadersOf(t.id).length">{{ leadersOf(t.id).map((l) => l.name).join(', ') }}</span>
                <span v-else class="badge text-bg-warning">팀장 없음</span>
              </td>
              <td class="text-nowrap">
                <button class="btn btn-link btn-sm p-0 me-3" @click="memberTeam = t; pickLeader = ''; pickMember = ''">구성원 배정</button>
                <button class="btn btn-link btn-sm p-0 me-3" @click="teamFilter = teamFilter === t.id ? 'all' : t.id">{{ teamFilter === t.id ? '전체 보기' : '직원 보기' }}</button>
                <button class="btn btn-link btn-sm p-0 text-danger" @click="removeTeam(t)">삭제</button>
              </td>
              <td class="text-end num">{{ activeCount(t.id) }}명</td>
            </tr>
            <!-- 맨 아래: 새 부서 추가 -->
            <tr class="add-row">
              <td colspan="3">
                <input v-model="newTeam" class="form-control form-control-sm" placeholder="새 부서명을 입력하세요." aria-label="새 부서명" @keydown.enter="addTeam" />
                <div v-if="teamError" class="small text-danger mt-1" role="alert">{{ teamError }}</div>
              </td>
              <td class="text-end"><button class="btn btn-primary btn-sm" @click="addTeam">추가</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 3. 직원 목록 -->
    <section class="panel" aria-labelledby="emp-title">
      <div class="panel-head">
        <h2 id="emp-title" class="panel-title">
          직원 목록 <span class="panel-sub">{{ list.length }}명{{ teamFilter !== 'all' ? ` · ${teamFilter === 'none' ? '미배정' : teamName(teamFilter)}` : '' }}</span>
        </h2>
        <div class="d-flex gap-2 align-items-center">
          <button v-if="sort.key" class="btn btn-link btn-sm p-0" @click="resetSort">기본 정렬(팀장 → 사원)로</button>
          <button class="btn btn-primary btn-sm" @click="openAdd">추가</button>
        </div>
      </div>

      <div class="filters">
        <input v-model="q" class="form-control form-control-sm" placeholder="이름 검색" aria-label="이름 검색" />
        <select v-model="teamFilter" class="form-select form-select-sm" aria-label="부서 필터">
          <option value="all">전체 부서</option>
          <option v-for="t in depts" :key="t.id" :value="t.id">{{ t.name }}</option>
          <option value="none">미배정</option>
        </select>
        <select v-model="positionFilter" class="form-select form-select-sm" aria-label="직급 필터">
          <option value="all">전체 직급</option>
          <option v-for="p in POSITIONS.filter((x) => roleFromPosition(x) !== 'exec')" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="roleFilter" class="form-select form-select-sm" aria-label="역할 필터">
          <option value="all">전체 역할</option>
          <option value="leader">팀장</option>
          <option value="member">사원</option>
        </select>
        <select v-model="targetFilter" class="form-select form-select-sm" aria-label="평가 대상 필터">
          <option value="all">평가 대상 전체</option>
          <option value="yes">이번 회차 대상</option>
          <option value="no">이번 회차 제외</option>
        </select>
        <select v-model="activeFilter" class="form-select form-select-sm" aria-label="상태 필터">
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
      </div>

      <div class="mode-bar" data-testid="bulk-bar">
        <span>{{ checked.length ? `${checked.length}명 선택` : '체크박스로 직원을 선택하면 일괄 작업을 할 수 있습니다.' }}</span>
        <button class="btn btn-outline-primary btn-sm ms-auto" :disabled="!checked.length" @click="moveTeam = depts[0]?.id ?? null; moveNewTeam = ''; moveOpen = true">소속 변경</button>
        <button class="btn btn-outline-secondary btn-sm" :disabled="!checked.length" @click="setActiveChecked(true)">활성화</button>
        <button class="btn btn-outline-warning btn-sm" :disabled="!checked.length" @click="setActiveChecked(false)">비활성화</button>
        <button class="btn btn-outline-danger btn-sm" :disabled="!checked.length" @click="deleteChecked">삭제</button>
      </div>

      <div class="table-responsive">
        <table class="table table-clean table-hover" data-testid="employee-table">
          <thead>
            <tr>
              <th style="width: 36px"><input v-model="allChecked" class="form-check-input" type="checkbox" aria-label="전체 선택" /></th>
              <SortTh label="소속팀" k="team" :sort="sort" @sort="onSort" />
              <SortTh label="직급" k="position" :sort="sort" @sort="onSort" />
              <SortTh label="이름" k="name" :sort="sort" @sort="onSort" />
              <SortTh label="역할" k="role" :sort="sort" @sort="onSort" />
              <SortTh label="담당 임원" k="exec" :sort="sort" @sort="onSort" />
              <SortTh label="이번 회차 평가 대상" k="target" :sort="sort" @sort="onSort" />
              <SortTh label="활성 상태" k="active" :sort="sort" @sort="onSort" />
              <th>평가 진행</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in list" :key="u.id" :data-user="u.name" :class="{ active: checked.includes(u.id), inactive: !u.active }">
              <td><input class="form-check-input" type="checkbox" :checked="checked.includes(u.id)" :aria-label="u.name + ' 선택'" @change="toggleCheck(u.id)" /></td>
              <td>{{ teamName(u.teamId) }}</td>
              <td>{{ u.position }}</td>
              <td class="fw-semibold"><button type="button" class="edit-link" :title="`${u.name} 정보 수정`" @click="openEdit(u)">{{ u.name }}</button></td>
              <td><span class="badge" :class="u.role === 'leader' ? 'text-bg-primary' : 'text-bg-light border'">{{ roleLabel(u.role) }}</span></td>
              <td>
                <button v-if="isEvalTarget(u)" type="button" class="exec-link" :title="'담당 임원 변경'" @click="openExecEdit(u)">
                  {{ execName(u) || '미배정' }}<span v-if="execSourceOf(u.id) === 'test'" class="badge text-bg-info ms-1">테스트</span>
                </button>
                <span v-else class="text-muted small" title="평가를 진행하지 않는 직원은 임원 배정이 없습니다">-</span>
              </td>
              <td>
                <span v-if="isPeriodTarget(u)">대상</span><span v-else class="text-muted">제외</span>
                <span v-if="isPeriodTarget(u) && !u.active" class="small text-muted"> (비활성이라 평가 안 함)</span>
              </td>
              <td><span v-if="u.active" class="text-success small">활성</span><span v-else class="badge text-bg-secondary">비활성</span></td>
              <td class="small text-muted">{{ targetStatus(u) }}</td>
            </tr>
            <tr v-if="!list.length"><td colspan="9" class="empty-hint">조건에 맞는 직원이 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">
        이름을 누르면 직원 정보를 수정합니다(사번 확인·변경 포함). 사번은 목록에 표시하지 않습니다.
        '활성 상태'는 시스템 사용(로그인) 여부, '이번 회차 평가 대상'은 {{ db.period.name }}의 평가 명단입니다.
      </p>
    </section>

    <!-- 등록·수정 폼 -->
    <AppModal v-if="form" :title="form.id ? `${roleLabel(form.role)} 정보 수정` : '직원 추가'" @close="form = null">
      <div class="row g-3">
        <div class="col-6">
          <label class="form-label" for="e-name">이름 <span class="text-danger">*</span></label>
          <input id="e-name" v-model="form.name" class="form-control" />
        </div>
        <div class="col-6">
          <label class="form-label" for="e-emp">사번 <span class="text-danger">*</span></label>
          <input id="e-emp" v-model="form.empNo" class="form-control" autocomplete="off" />
          <div class="form-text">로그인 비밀번호로 쓰입니다.</div>
        </div>
        <div class="col-6">
          <label class="form-label" for="e-team">소속</label>
          <TeamSelect id="e-team" v-model="form.teamId" v-model:newName="form.newTeam" />
        </div>
        <div class="col-6">
          <label class="form-label" for="e-pos">직급</label>
          <select id="e-pos" v-model="form.position" class="form-select" @change="onPositionChange">
            <option v-for="p in POSITIONS" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label" for="e-role">사용자 역할</label>
          <select id="e-role" v-model="form.role" class="form-select">
            <option v-for="(label, key) in ROLES" :key="key" :value="key">{{ label }}</option>
          </select>
          <div class="form-text">역할이 평가 단계와 화면을 정합니다. 직급을 고르면 자동으로 추천됩니다.</div>
        </div>
        <div class="col-6 d-flex flex-column justify-content-center gap-2">
          <label class="form-check-label"><input v-model="form.active" type="checkbox" class="form-check-input me-1" />활성 (시스템 사용·로그인)</label>
          <label class="form-check-label"><input v-model="form.periodTarget" type="checkbox" class="form-check-input me-1" />이번 회차 평가 대상</label>
          <div class="form-text mt-0">{{ db.period.name }} 기준. 비활성 직원은 대상이어도 평가에서 빠집니다.</div>
        </div>
      </div>
      <div v-if="formImpacts.length" class="alert alert-warning small py-2 mt-3 mb-0">
        <div v-for="m in formImpacts" :key="m">{{ m }}</div>
      </div>
      <div v-if="formError" class="text-danger small mt-2" role="alert">{{ formError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="form = null">취소</button>
        <button class="btn btn-primary" @click="save">저장</button>
      </template>
    </AppModal>

    <!-- 담당 임원 변경 (직원 목록) -->
    <AppModal v-if="execEdit" :title="`${execEdit.user.name} 담당 임원`" size="sm" @close="execEdit = null">
      <label class="form-label" for="x-exec">담당 임원</label>
      <select id="x-exec" v-model="execEdit.execId" class="form-select">
        <option value="">미배정</option>
        <option v-for="e in execs.filter((x) => x.active)" :key="e.id" :value="e.id">{{ e.name }} ({{ e.position }})</option>
      </select>
      <p class="small text-muted mt-2 mb-0">임원 목록의 담당 직원에도 바로 반영됩니다. 한 직원은 임원 1명에게만 배정됩니다.</p>
      <template #footer>
        <button class="btn btn-light" @click="execEdit = null">취소</button>
        <button class="btn btn-primary" @click="saveExecEdit">저장</button>
      </template>
    </AppModal>

    <!-- 부서 구성원 배정 -->
    <AppModal v-if="memberTeam" :title="`${memberTeam.name} 구성원 배정`" size="lg" @close="memberTeam = null">
      <div class="row g-2 mb-3">
        <div class="col-md-6">
          <label class="form-label small" for="pick-leader">팀장 배정</label>
          <div class="input-group input-group-sm">
            <select id="pick-leader" v-model="pickLeader" class="form-select">
              <option value="">직원 선택</option>
              <option v-for="u in staff.filter((x) => !(x.teamId === memberTeam.id && x.role === 'leader'))" :key="u.id" :value="u.id">{{ u.name }} · {{ teamName(u.teamId) }} {{ u.position }}</option>
            </select>
            <button class="btn btn-primary" @click="assignToTeam(true)">팀장으로 배정</button>
          </div>
        </div>
        <div class="col-md-6">
          <label class="form-label small" for="pick-member">사원 배정</label>
          <div class="input-group input-group-sm">
            <select id="pick-member" v-model="pickMember" class="form-select">
              <option value="">직원 선택</option>
              <option v-for="u in staff.filter((x) => !(x.teamId === memberTeam.id && x.role === 'member'))" :key="u.id" :value="u.id">{{ u.name }} · {{ teamName(u.teamId) }} {{ u.position }}</option>
            </select>
            <button class="btn btn-primary" @click="assignToTeam(false)">사원으로 배정</button>
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-clean table-sm" data-testid="team-members">
          <thead><tr><th>역할</th><th>이름</th><th>직급</th><th>상태</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in teamPeople" :key="u.id">
              <td><span class="badge" :class="u.role === 'leader' ? 'text-bg-primary' : 'text-bg-light border'">{{ roleLabel(u.role) }}</span></td>
              <td>{{ u.name }}</td><td>{{ u.position }}</td>
              <td>{{ u.active ? '활성' : '비활성' }}</td>
              <td class="text-end"><button class="btn btn-link btn-sm p-0 text-danger" @click="releaseFromTeam(u)">소속 해제</button></td>
            </tr>
            <tr v-if="!teamPeople.length"><td colspan="5" class="text-muted">소속 직원이 없습니다. 위에서 팀장과 사원을 배정하세요.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="small text-muted mb-0">팀장 배정 시 역할·직급이 '팀장'이 되고, 사원 배정 시 역할이 '사원'이 됩니다(직급이 '팀장'이었다면 '사원'). 소속 해제는 직원을 지우지 않습니다.</p>
      <template #footer><button class="btn btn-primary" @click="memberTeam = null">닫기</button></template>
    </AppModal>

    <AppModal v-if="moveOpen" :title="`${checked.length}명 소속 변경`" size="sm" @close="moveOpen = false">
      <label class="form-label" for="m-team">새 소속 부서</label>
      <TeamSelect id="m-team" v-model="moveTeam" v-model:newName="moveNewTeam" />
      <template #footer>
        <button class="btn btn-light" @click="moveOpen = false">취소</button>
        <button class="btn btn-primary" @click="moveChecked">변경</button>
      </template>
    </AppModal>

    <ExecAssignModal v-if="assignExec" :exec-id="assignExec" @close="assignExec = null" />
    <CsvImport v-if="csvOpen" @close="csvOpen = false" />
  </div>
</template>

<style scoped>
.filters { display: grid; grid-template-columns: 2fr repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
@media (max-width: 1100px) { .filters { grid-template-columns: 1fr 1fr 1fr; } }
tr.inactive td { color: #9aa0b4; }
.num { font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { background: #e8eef8; border-radius: 999px; padding: 2px 4px 2px 10px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 2px; }
.chip.leader { background: #d9e8fa; font-weight: 600; }
.chip.test { outline: 1px dashed #5aa9c9; }
.chip small { color: #6b7080; }
.chip-x { border: 0; background: none; color: #8a8fa3; font-size: 1rem; line-height: 1; padding: 0 4px; border-radius: 50%; }
.chip-x:hover { color: #c0392b; background: #fbe4e4; }
.exec-link { background: none; border: 0; padding: 0; color: var(--brand); border-bottom: 1px dashed var(--brand); }
.add-row td { background: #fafbfd; }
</style>
