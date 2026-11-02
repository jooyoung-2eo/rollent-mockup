<script setup>
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  db, toast, confirmDialog, responseCount, userById, teamName, sortUsers, isEvalTarget, stagesFor, evaluatorsFor,
  leadersOf, membersOf, execSourceOf, commitItems,
} from '../store'
import { STAGES, STAGE_KEYS, ROLE_STAGES, ANSWER_TYPES, DEFAULT_CHOICE_LABELS, POLICY_OPTIONS, roleLabel, stageLabel } from '../constants'
import { weightCheck, computeResults } from '../scoring'
import { POLICIES, blockedCount, getPath, setPath } from '../policies'
import { pointsReport, totalText, POINTS_TARGET } from '../points'
import InlineText from '../components/InlineText.vue'
import QuestionSettings from '../components/QuestionSettings.vue'
import ExecAssignModal from '../components/ExecAssignModal.vue'

const route = useRoute()
const router = useRouter()
const tab = ref(['questions', 'stages', 'weights', 'policies'].includes(route.query.tab) ? route.query.tab : 'questions')

// =========================================================
// 0. 정책 설정 현황
// =========================================================
const policyResults = computed(() => computeResults())
const policyRows = computed(() => POLICIES.map((p) => ({ ...p, st: p.status(), blocked: blockedCount(p, policyResults.value) })))
const unsetCount = computed(() => policyRows.value.filter((p) => !p.st.set).length)
function setPolicyPath(path, v) {
  setPath(path, v || null)
  toast('정책 설정을 저장했습니다.')
}
function goPolicy(p) {
  if (p.control.to === '/eval-settings') { tab.value = p.control.tab; return }
  router.push({ path: p.control.to, query: p.control.tab ? { tab: p.control.tab } : {} })
}
const clone = (x) => JSON.parse(JSON.stringify(x))

// =========================================================
// 1. 평가 문항 및 항목 (초안에서 고치고 '저장'으로 반영)
// =========================================================
const draft = ref(clone(db.items))
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(db.items))
const settingsQuestion = ref(null)
let seq = 0
const uid = (p) => `${p}${Date.now().toString(36)}${seq++}`

watch(() => db.items, (v) => { if (!dirty.value) draft.value = clone(v) }, { deep: true })

function addItem(name = '새 평가 항목') {
  draft.value.push({ id: uid('i'), name, points: null, stages: ['self'], questions: [newQuestion()] })
}
// 평가항목 관리: 저장된 값과 비교해 이름이 바뀌었는지, 새 항목인지 표시
const savedItem = (id) => db.items.find((it) => it.id === id)
const itemState = (it) => (!savedItem(it.id) ? 'new' : savedItem(it.id).name !== it.name ? 'renamed' : null)
const newItemName = ref('')
const itemError = ref('')
const openItem = ref(null)
function addItemByName() {
  const name = newItemName.value.trim()
  itemError.value = ''
  if (!name) { itemError.value = '평가항목명을 입력해 주세요.'; return }
  if (draft.value.some((it) => it.name === name)) { itemError.value = `'${name}'은(는) 이미 있는 평가항목명입니다.`; return }
  addItem(name)
  newItemName.value = ''
  toast(`'${name}' 항목을 추가했습니다. 배점과 문항 내용을 입력한 뒤 저장하세요.`)
}
const itemResponses = (it) => it.questions.reduce((a, q) => a + responseCount(q.id), 0)
function newQuestion() {
  const id = uid('q')
  return { id, text: '', type: 'choice', required: true, maxLength: null, shareInInterview: false, choices: DEFAULT_CHOICE_LABELS.map((label, i) => ({ id: `${id}-c${i + 1}`, label, score: null, deleted: false })) }
}
function addQuestion(item) {
  item.questions.push(newQuestion())
}
async function removeQuestion(item, q) {
  const n = responseCount(q.id)
  if (n) {
    const ok = await confirmDialog({ title: '문항 삭제', message: `이 문항에는 응답이 ${n}건 있습니다.\n삭제해도 기존 응답 기록은 보존되지만, 결과 계산과 평가 화면에서는 빠집니다.`, okText: '삭제', danger: true })
    if (!ok) return
  }
  item.questions = item.questions.filter((x) => x !== q)
}
async function removeItem(item) {
  const n = item.questions.reduce((a, q) => a + responseCount(q.id), 0)
  const ok = await confirmDialog({ title: '평가 항목 삭제', message: `'${item.name}' 항목과 연결된 문항 ${item.questions.length}개를 평가표에서 뺍니다.${n ? `\n이 항목에 응답 ${n}건이 있습니다. 응답 기록은 지워지지 않고 보존되지만, 평가 화면과 결과 계산(배점 ${item.points ?? 0}점)에서는 빠집니다.` : ''}\n저장을 눌러야 실제로 반영됩니다.`, okText: '삭제', danger: true })
  if (ok) draft.value = draft.value.filter((x) => x !== item)
}
function toggleStage(item, stage) {
  item.stages = item.stages.includes(stage) ? item.stages.filter((s) => s !== stage) : STAGE_KEYS.filter((s) => s === stage || item.stages.includes(s))
}
function changeType(q, type) {
  if (type === 'choice' && !q.choices.some((c) => !c.deleted)) q.choices = DEFAULT_CHOICE_LABELS.map((label, i) => ({ id: `${q.id}-c${Date.now().toString(36)}${i}`, label, score: null, deleted: false }))
  q.type = type
}

const problems = computed(() => {
  const out = []
  draft.value.forEach((it) => {
    if (!it.name.trim()) out.push('이름이 비어 있는 평가 항목이 있습니다.')
    if (!it.stages.length) out.push(`'${it.name}'에 적용 평가 단계가 없습니다.`)
    if (!it.questions.length) out.push(`'${it.name}'에 문항이 없습니다.`)
    it.questions.forEach((q) => {
      if (!q.text.trim()) out.push(`'${it.name}'에 내용이 비어 있는 문항이 있습니다.`)
      if (q.type === 'choice') {
        const act = q.choices.filter((c) => !c.deleted)
        if (!act.length) out.push(`'${q.text || it.name}' 객관식 문항에 선택지가 없습니다.`)
        if (act.some((c) => !c.label.trim())) out.push(`'${q.text || it.name}'에 비어 있는 선택지가 있습니다.`)
      }
    })
  })
  return [...new Set([...out, ...pointsState.value.itemErrors])]
})
// 평가표(단계)별 배점 합계: 입력할 때마다 다시 계산한다
const pointsState = computed(() => pointsReport(draft.value, db.settings))
const pointsBad = computed(() => pointsState.value.stages.filter((x) => !x.ok))

// 저장 전 영향 확인: 응답이 있는 문항이 바뀌었는지
const impacts = computed(() => {
  const before = Object.fromEntries(db.items.flatMap((it) => it.questions.map((q) => [q.id, { q, it }])))
  const after = Object.fromEntries(draft.value.flatMap((it) => it.questions.map((q) => [q.id, { q, it }])))
  const out = []
  Object.entries(before).forEach(([id, { q }]) => {
    const n = responseCount(id)
    if (!n) return
    const a = after[id]?.q
    if (!a) out.push(`삭제: '${q.text}' (응답 ${n}건 보존, 계산 제외)`)
    else if (a.text !== q.text) out.push(`문항 내용 변경: '${q.text}' → '${a.text}' (응답 ${n}건)`)
    else if (a.type !== q.type) out.push(`답변 유형 변경: '${q.text}' (응답 ${n}건)`)
    else if (JSON.stringify(a.choices) !== JSON.stringify(q.choices)) out.push(`선택지 변경: '${q.text}' (응답 ${n}건, 선택지별 점수 연결은 유지)`)
  })
  return out
})

async function saveItems() {
  if (problems.value.length) return toast('저장할 수 없습니다. 아래 오류를 먼저 고쳐 주세요.', 'warning')
  if (pointsBad.value.length) return toast(`배점 합계가 ${POINTS_TARGET}점이 아닌 평가표가 있습니다: ${pointsBad.value.map((x) => `${x.label} ${x.total}점`).join(', ')}`, 'warning')
  if (impacts.value.length) {
    const ok = await confirmDialog({ title: '응답이 있는 문항 변경', message: `${impacts.value.join('\n')}\n\n기존 응답은 삭제되지 않습니다. 저장하시겠습니까?`, okText: '저장' })
    if (!ok) return
  }
  try {
    commitItems(draft.value) // 저장 처리에서도 배점 합계를 다시 검사한다
  } catch (e) {
    return toast(`저장하지 못했습니다: ${e.message}`, 'warning')
  }
  toast('평가 문항을 저장했습니다. 평가 화면과 결과 계산에 바로 반영됩니다.')
}
function cancelItems() {
  draft.value = clone(db.items)
  toast('저장하지 않은 변경을 취소했습니다.', 'warning')
}
const choiceSummary = (q) => {
  const act = q.choices.filter((c) => !c.deleted)
  const unscored = act.filter((c) => typeof c.score !== 'number').length
  return `선택지 ${act.length}개${unscored ? ` · 점수 미설정 ${unscored}` : ''}`
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return confirmDialog({ title: '저장하지 않은 변경', message: '평가 문항에 저장하지 않은 변경이 있습니다. 나가면 사라집니다.', okText: '나가기', danger: true })
})

// =========================================================
// 2. 평가 단계 및 평가자 배정
// =========================================================
const execs = computed(() => db.users.filter((u) => u.role === 'exec' && u.active))
const assignable = computed(() => sortUsers(db.users.filter((u) => isEvalTarget(u) && (u.role === 'member' || u.role === 'leader'))))
const selectedExec = ref(null)
const testCount = computed(() => Object.keys(db.execAssign).filter((id) => execSourceOf(id) === 'test').length)
const targetsOf = (execId) => assignable.value.filter((u) => db.execAssign[u.id] === execId)
const unassigned = computed(() => assignable.value.filter((u) => !evaluatorsFor(u, 'exec').length))

function setStageToggle(key, value) {
  db.settings[key] = value
  toast(`${key === 'execSelfEnabled' ? '임원 자기평가' : '팀원평가'}를 ${value ? '켰습니다' : '껐습니다'}. 기존 응답은 보존됩니다.`)
}
function openAssign(exec) {
  selectedExec.value = exec.id
}
async function markAllAdmin() {
  const ok = await confirmDialog({ title: '테스트 배정 전환', message: `테스트용 가상 배정 ${testCount.value}건을 '관리자 지정' 배정으로 바꿉니다. 실제 배정표와 같은지 확인한 뒤 진행하세요.`, okText: '전환' })
  if (!ok) return
  Object.keys(db.execAssignSource).forEach((k) => { db.execAssignSource[k] = 'admin' })
  toast('테스트 배정을 관리자 지정 배정으로 전환했습니다.')
}
async function clearAssignments() {
  const ok = await confirmDialog({ title: '배정 모두 해제', message: '모든 임원 배정을 해제합니다. 이미 제출된 임원평가 응답은 보존됩니다.', okText: '모두 해제', danger: true })
  if (!ok) return
  db.execAssign = {}
  db.execAssignSource = {}
  toast('임원 배정을 모두 해제했습니다.')
}

// 데이터 관계 검증
const relationIssues = computed(() => {
  const out = []
  db.teams.forEach((t) => {
    const leaders = leadersOf(t.id)
    const members = membersOf(t.id)
    if (members.length && !leaders.length) out.push(`${t.name}: 팀장이 없어 팀원 ${members.length}명의 팀장평가를 진행할 수 없습니다.`)
    if (leaders.length > 1) out.push(`${t.name}: 팀장이 ${leaders.length}명입니다. 팀원은 팀장 모두에게 평가받습니다(다수 평가자 합산 방식 필요).`)
    if (leaders.length && !members.length && db.settings.memberEvalEnabled) out.push(`${t.name}: 팀원이 없어 팀장의 팀원평가를 진행할 수 없습니다.`)
  })
  if (unassigned.value.length) out.push(`임원 미배정 대상 ${unassigned.value.length}명 (임원평가 필수)`)
  Object.entries(db.execAssign).forEach(([tid, eid]) => {
    const e = userById(eid)
    if (!e || !e.active || e.role !== 'exec') out.push(`${userById(Number(tid))?.name ?? '알 수 없음'}: 배정된 임원이 비활성이거나 임원이 아닙니다.`)
  })
  return out
})

const relationRows = computed(() => sortUsers(db.users.filter(isEvalTarget)).map((u) => ({
  user: u,
  stages: STAGE_KEYS.map((s) => ({
    stage: s,
    on: stagesFor(u).includes(s),
    evaluators: stagesFor(u).includes(s) ? evaluatorsFor(u, s) : [],
  })),
})))
const relQuery = ref('')
const relFiltered = computed(() => relationRows.value.filter((r) => !relQuery.value.trim() || r.user.name.includes(relQuery.value.trim()) || teamName(r.user.teamId).includes(relQuery.value.trim())))
const evaluatorText = (s) => {
  if (!s.on) return '해당 없음'
  if (!s.evaluators.length) return '배정 필요'
  if (s.stage === 'self') return '본인'
  if (s.evaluators.length > 2) return `${s.evaluators[0].name} 외 ${s.evaluators.length - 1}명`
  return s.evaluators.map((e) => e.name).join(', ')
}

// =========================================================
// 3. 가중치와 계산 규칙
// =========================================================
const WEIGHT_ROLES = ['member', 'leader']
const weightDraft = ref(clone(db.weights))
const activeStagesOf = (role) => ROLE_STAGES[role].filter((s) => s !== 'members' || db.settings.memberEvalEnabled)
const draftSum = (role) => activeStagesOf(role).reduce((a, s) => a + (typeof weightDraft.value[role][s] === 'number' ? weightDraft.value[role][s] : 0), 0)
const draftErrors = (role) => {
  const w = weightDraft.value[role]
  const stages = activeStagesOf(role)
  const out = []
  if (stages.some((s) => typeof w[s] !== 'number')) out.push('모든 단계의 가중치를 입력해 주세요.')
  if (stages.some((s) => typeof w[s] === 'number' && (w[s] < 0 || w[s] > 100))) out.push('가중치는 0~100 사이여야 합니다.')
  if (!out.length && Math.abs(draftSum(role) - 100) > 0.001) out.push(`합계가 ${draftSum(role)}%입니다. 100%가 되어야 저장할 수 있습니다.`)
  return out
}
function setWeight(role, stage, v) {
  weightDraft.value[role][stage] = v === '' ? null : Number(v)
}
function saveWeights(role) {
  const errs = draftErrors(role)
  if (errs.length) return toast(errs[0], 'warning')
  db.weights[role] = clone(weightDraft.value[role])
  toast(`${roleLabel(role)} 평가 가중치를 저장했습니다. 결과 계산에 바로 반영됩니다.`)
}
async function clearWeights(role) {
  const ok = await confirmDialog({ title: '가중치 미설정으로', message: `${roleLabel(role)} 가중치를 모두 지우고 미설정 상태로 되돌립니다.`, okText: '지우기', danger: true })
  if (!ok) return
  Object.keys(db.weights[role]).forEach((k) => { db.weights[role][k] = null })
  weightDraft.value[role] = clone(db.weights[role])
}
const savedCheck = (role) => weightCheck(role, activeStagesOf(role))

function setPolicy(key, v) {
  db.settings[key] = v || null
  toast('계산 규칙을 저장했습니다.')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">평가 관리</h1>
    </div>

    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'questions' }" @click="tab = 'questions'">평가 문항 및 항목 <span v-if="dirty" class="badge text-bg-warning ms-1">저장 안 됨</span></button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'stages' }" @click="tab = 'stages'">평가 단계 및 평가자 배정 <span v-if="relationIssues.length" class="badge text-bg-warning ms-1">{{ relationIssues.length }}</span></button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'weights' }" @click="tab = 'weights'">가중치 및 계산 규칙</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'policies' }" @click="tab = 'policies'">정책 설정 현황 <span class="badge text-bg-warning ms-1">미설정 {{ unsetCount }}</span></button></li>
    </ul>

    <!-- 0. 정책 설정 현황 -->
    <section v-if="tab === 'policies'" class="panel">
      <h2 class="panel-title mb-1">정책 설정 현황</h2>
      <p class="panel-sub">
        계산에 필요한 업무 규칙과 현재 상태입니다. 선택지는 후보일 뿐이며 자동으로 고르지 않습니다.
        미설정 정책이 있으면 그 정책이 필요한 계산 단계만 보류되고, 다른 단계의 값과 입력 화면은 그대로 쓸 수 있습니다.
      </p>
      <div class="table-responsive">
        <table class="table table-clean align-middle" data-testid="policy-table">
          <thead><tr><th>정책</th><th>현재 상태</th><th style="width: 260px">설정 (후보 선택)</th><th>필요한 계산 단계</th><th class="text-end">보류 중</th></tr></thead>
          <tbody>
            <tr v-for="p in policyRows" :key="p.key" :data-policy="p.key">
              <td class="fw-semibold">{{ p.label }}<div v-if="p.note" class="small text-muted fw-normal">{{ p.note }}</div></td>
              <td><span class="badge" :class="p.st.set ? 'text-bg-success' : 'text-bg-warning'">{{ p.st.set ? '설정됨' : '미설정' }}</span> <span class="small">{{ p.st.text }}</span></td>
              <td>
                <select v-if="p.control.type === 'select'" class="form-select form-select-sm" :value="getPath(p.control.path) ?? ''" :aria-label="p.label" @change="setPolicyPath(p.control.path, $event.target.value)">
                  <option value="">미설정</option>
                  <option v-for="o in POLICY_OPTIONS[p.control.group]" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
                <button v-else-if="p.control.type === 'link'" class="btn btn-link btn-sm p-0" @click="goPolicy(p)">{{ p.control.label }}에서 설정 →</button>
                <span v-else class="small text-muted">후보 없음 · 정책 확정 후 추가</span>
              </td>
              <td class="small">{{ p.steps }}</td>
              <td class="text-end">
                <span v-if="p.blocked === null" class="text-muted small">-</span>
                <span v-else-if="p.blocked" class="badge text-bg-warning">{{ p.blocked }}명 보류</span>
                <span v-else class="small text-success">없음</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mb-0">'보류 중'은 지금 이 정책이 비어 있어 계산이 멈춘 직원 수입니다. 평가가 끝나지 않아 아직 그 단계에 이르지 않은 직원은 세지 않습니다.</p>
    </section>

    <!-- 1. 문항 -->
    <section v-if="tab === 'questions'" class="panel">
      <div class="save-bar" :class="{ dirty }">
        <span v-if="dirty"><strong>저장하지 않은 변경이 있습니다.</strong> 저장해야 평가 화면과 결과 계산에 반영됩니다.</span>
        <span v-else class="text-muted">모든 변경이 저장되었습니다. 점선 밑줄이 있는 글자를 누르면 바로 고칠 수 있습니다.</span>
        <div class="ms-auto d-flex gap-2">
          <button class="btn btn-light btn-sm" :disabled="!dirty" @click="cancelItems">변경 취소</button>
          <button class="btn btn-primary btn-sm" :disabled="!dirty || !pointsState.ok" :title="pointsState.ok ? '' : '배점 합계를 100점으로 맞춰야 저장할 수 있습니다'" @click="saveItems">저장</button>
        </div>
      </div>
      <!-- 평가표(평가 단계)별 배점 합계 -->
      <div class="points-bar" :class="{ bad: !pointsState.ok }" data-testid="points-bar">
        <strong class="me-1">평가표별 배점 합계</strong>
        <span v-for="p in pointsState.stages" :key="p.stage" class="points-chip" :class="p.ok ? 'ok' : 'ng'" :data-stage="p.stage" :title="p.items.map((i) => `${i.name} ${i.points}점`).join(' + ') || '점수 항목 없음'">
          {{ p.label }} · {{ p.ok ? `${p.total}점 / ${POINTS_TARGET}점 ✓` : totalText(p) }}
        </span>
        <div v-if="pointsBad.length" class="w-100 small text-danger mt-1" role="alert">
          배점 합계가 정확히 {{ POINTS_TARGET }}점이어야 저장할 수 있습니다. {{ pointsBad.map((x) => `${x.label} 평가표는 ${Math.abs(x.diff)}점 ${x.diff < 0 ? '늘려' : '줄여'}`).join(', ') }} {{ POINTS_TARGET }}점으로 맞추세요.
          한 항목이 여러 평가표에 쓰이면 그 평가표들의 합계가 함께 바뀝니다.
        </div>
      </div>
      <div v-if="problems.length" class="alert alert-danger small py-2">
        <div v-for="p in problems" :key="p">{{ p }}</div>
      </div>

      <!-- 평가항목 관리 -->
      <h2 class="panel-title mb-1">평가항목 관리</h2>
      <p class="panel-sub">항목명을 누르면 바로 고칠 수 있고, 위 막대의 '저장'을 눌러야 반영됩니다. 항목명을 바꿔도 문항·배점·기존 응답은 그대로 연결됩니다.</p>
      <div class="table-responsive mb-4">
        <table class="table table-clean table-sm" data-testid="item-list">
          <thead><tr><th>평가항목명</th><th class="text-end">배점</th><th>적용 평가 단계</th><th class="text-end">문항</th><th class="text-end">응답</th><th></th></tr></thead>
          <tbody>
            <template v-for="it in draft" :key="it.id">
              <tr :data-item="it.name">
                <td class="fw-semibold">
                  <InlineText v-model="it.name" label="평가항목명" />
                  <span v-if="itemState(it) === 'renamed'" class="badge text-bg-warning ms-2" :title="`저장된 이름: ${savedItem(it.id).name}`">수정됨 · 이전 '{{ savedItem(it.id).name }}'</span>
                  <span v-if="itemState(it) === 'new'" class="badge text-bg-info ms-2">새 항목 · 저장 전</span>
                </td>
                <td class="text-end">{{ it.points ?? '배점 없음' }}</td>
                <td class="small">{{ it.stages.map((k) => STAGES[k].label).join(', ') || '없음' }}</td>
                <td class="text-end">{{ it.questions.length }}개</td>
                <td class="text-end">{{ itemResponses(it) }}건</td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-link btn-sm p-0 me-3" @click="openItem = openItem === it.id ? null : it.id">{{ openItem === it.id ? '문항 닫기' : '연결 문항 보기' }}</button>
                  <button class="btn btn-link btn-sm p-0 text-danger" @click="removeItem(it)">삭제</button>
                </td>
              </tr>
              <tr v-if="openItem === it.id" class="sub-row">
                <td colspan="6" class="small">
                  <div v-for="(q, i) in it.questions" :key="q.id">{{ i + 1 }}. {{ q.text || '(내용 없음)' }} <span class="text-muted">· {{ ANSWER_TYPES.find((a) => a.key === q.type).label }} · 응답 {{ responseCount(q.id) }}건</span></div>
                  <div v-if="!it.questions.length" class="text-danger">연결된 문항이 없습니다. 아래 표에서 문항을 추가하세요.</div>
                </td>
              </tr>
            </template>
            <tr class="add-row">
              <td colspan="5">
                <input v-model="newItemName" class="form-control form-control-sm" placeholder="새 평가항목명을 입력하세요." aria-label="새 평가항목명" @keydown.enter="addItemByName" />
                <div v-if="itemError" class="small text-danger mt-1" role="alert">{{ itemError }}</div>
              </td>
              <td class="text-end"><button class="btn btn-primary btn-sm" @click="addItemByName">추가</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="panel-title mb-2">평가 문항</h2>

      <div class="table-responsive">
        <table class="table table-clean q-table" data-testid="question-table">
          <thead>
            <tr><th style="width: 90px">항목 배점</th><th style="width: 150px">평가 항목명</th><th>문항 내용</th><th style="width: 170px">답변 유형</th><th style="width: 190px">적용 평가 단계</th><th style="width: 60px"></th></tr>
          </thead>
          <tbody v-for="it in draft" :key="it.id" class="item-group" :data-item="it.name">
            <tr v-for="(q, qi) in it.questions" :key="q.id">
              <template v-if="qi === 0">
                <td :rowspan="it.questions.length + 1" class="item-cell">
                  <InlineText v-model="it.points" type="number" label="항목 배점" empty-text="배점 없음" />
                  <div v-if="it.points !== null" class="small text-muted">점</div>
                </td>
                <td :rowspan="it.questions.length + 1" class="item-cell fw-semibold">
                  <InlineText v-model="it.name" label="평가 항목명" />
                  <div v-if="itemState(it) === 'renamed'" class="badge text-bg-warning mt-1">수정됨</div>
                  <div class="mt-2"><button class="btn btn-link btn-sm p-0 text-danger" @click="removeItem(it)">항목 삭제</button></div>
                </td>
              </template>
              <td>
                <InlineText v-model="q.text" multiline label="문항 내용" placeholder="문항 내용을 입력하세요" />
                <span v-if="q.required" class="badge text-bg-light border ms-1">필수</span>
                <span v-if="responseCount(q.id)" class="badge text-bg-info ms-1" title="이 문항의 응답 수">응답 {{ responseCount(q.id) }}</span>
              </td>
              <td>
                <select class="form-select form-select-sm" :value="q.type" aria-label="답변 유형" @change="changeType(q, $event.target.value)">
                  <option v-for="a in ANSWER_TYPES" :key="a.key" :value="a.key">{{ a.label }}</option>
                </select>
                <button class="btn btn-link btn-sm p-0 mt-1" @click="settingsQuestion = q">
                  {{ q.type === 'choice' ? choiceSummary(q) + ' · 편집' : '설정' + (q.shareInInterview ? ' · 면담 포함' : '') }}
                </button>
              </td>
              <template v-if="qi === 0">
                <td :rowspan="it.questions.length + 1" class="item-cell">
                  <div class="stage-chips">
                    <button
                      v-for="(s, key) in STAGES" :key="key" type="button" class="stage-chip" :class="{ on: it.stages.includes(key) }"
                      :aria-pressed="it.stages.includes(key)" @click="toggleStage(it, key)"
                    >{{ s.label }}</button>
                  </div>
                </td>
              </template>
              <td class="text-end"><button class="btn btn-link btn-sm p-0 text-danger" :aria-label="'문항 삭제: ' + q.text" @click="removeQuestion(it, q)">삭제</button></td>
            </tr>
            <tr v-if="!it.questions.length">
              <td class="item-cell"><InlineText v-model="it.points" type="number" label="항목 배점" empty-text="배점 없음" /></td>
              <td class="item-cell"><InlineText v-model="it.name" label="평가 항목명" /></td>
              <td colspan="4" class="text-danger small">문항이 없습니다.</td>
            </tr>
            <!-- 항목 칸(배점·항목명·단계)이 이 줄까지 이어지므로 남은 칸은 문항·유형·삭제 3칸이다 -->
            <tr class="add-row">
              <td :colspan="it.questions.length ? 2 : 6"><button class="btn btn-link btn-sm p-0" @click="addQuestion(it)">+ 이 항목에 문항 추가</button></td>
              <td v-if="it.questions.length"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-outline-primary btn-sm" @click="addItem()">+ 평가 항목 추가</button>
      <p class="panel-sub mt-3 mb-0">
        배점은 평가 항목 단위로 매깁니다. 배점이 없거나 객관식 문항이 없는 항목은 점수 계산에서 빠집니다.
        항목 안 여러 문항을 항목 점수로 바꾸는 방법은 '가중치 및 계산 규칙' 탭에서 정합니다.
      </p>
    </section>

    <!-- 2. 단계와 배정 -->
    <template v-if="tab === 'stages'">
      <section class="panel mb-3">
        <h2 class="panel-title mb-3">직급별 평가 단계</h2>
        <div class="table-responsive">
          <table class="table table-clean">
            <thead><tr><th>평가 대상자</th><th>1차</th><th>2차</th><th>3차</th></tr></thead>
            <tbody>
              <tr><td>사원</td><td>자기평가</td><td>팀장평가 (소속 팀장)</td><td>임원평가 (배정된 임원, 필수)</td></tr>
              <tr>
                <td>팀장</td><td>자기평가</td>
                <td>
                  팀원평가 (소속 팀원 전원)
                  <label class="form-check form-switch d-inline-flex align-items-center gap-2 ms-2 mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" :checked="db.settings.memberEvalEnabled" aria-label="팀원평가 사용" @change="setStageToggle('memberEvalEnabled', $event.target.checked)" />
                    <span class="small">{{ db.settings.memberEvalEnabled ? '사용' : '사용 안 함' }}</span>
                  </label>
                </td>
                <td>임원평가 (배정된 임원, 필수)</td>
              </tr>
              <tr>
                <td>임원</td>
                <td>
                  자기평가 (선택)
                  <label class="form-check form-switch d-inline-flex align-items-center gap-2 ms-2 mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" :checked="db.settings.execSelfEnabled" aria-label="임원 자기평가 사용" @change="setStageToggle('execSelfEnabled', $event.target.checked)" />
                    <span class="small">{{ db.settings.execSelfEnabled ? '사용' : '사용 안 함' }}</span>
                  </label>
                </td>
                <td class="text-muted">해당 없음</td><td class="text-muted">해당 없음</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="panel-sub mb-0">
          임원이 배정된 사원·팀장을 평가하는 것은 필수라 끌 수 없습니다. 단계를 꺼도 가중치는 자동으로 바뀌지 않으며, 꺼진 단계는 결과 계산과 미완료 집계에서 빠집니다.
        </p>
      </section>

      <section class="panel mb-3">
        <div class="panel-head">
          <h2 class="panel-title">임원별 평가 대상자 배정</h2>
          <button class="btn btn-outline-danger btn-sm" @click="clearAssignments">배정 모두 해제</button>
        </div>
        <div v-if="testCount" class="alert alert-info small py-2 d-flex align-items-center gap-2">
          <span><strong>테스트용 가상 배정 {{ testCount }}건</strong>이 섞여 있습니다(직원별 '테스트' 표시). 관리자가 바꾼 배정은 '관리자 지정'으로 따로 표시됩니다.</span>
          <button class="btn btn-sm btn-outline-secondary ms-auto text-nowrap" @click="markAllAdmin">테스트 배정을 관리자 지정으로 전환</button>
        </div>
        <div class="exec-grid">
          <div v-for="e in execs" :key="e.id" class="exec-card" :data-exec="e.name">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>{{ e.name }} <span class="text-muted small">{{ e.position }}</span></strong>
              <button class="btn btn-outline-primary btn-sm" @click="openAssign(e)">대상 배정</button>
            </div>
            <div class="small text-muted mb-1">
              사원 {{ targetsOf(e.id).filter((u) => u.role === 'member').length }}명 · 팀장 {{ targetsOf(e.id).filter((u) => u.role === 'leader').length }}명
            </div>
            <div class="assigned">
              <span v-for="u in targetsOf(e.id)" :key="u.id" class="chip" :class="{ leader: u.role === 'leader', test: execSourceOf(u.id) === 'test' }">{{ u.name }}<small> {{ teamName(u.teamId) }}</small></span>
              <span v-if="!targetsOf(e.id).length" class="text-muted small">배정된 대상 없음</span>
            </div>
          </div>
        </div>
        <div class="mt-3">
          <strong class="small">미배정 대상 {{ unassigned.length }}명</strong>
          <div class="assigned mt-1">
            <span v-for="u in unassigned" :key="u.id" class="chip warn">{{ u.name }}<small> {{ teamName(u.teamId) }} {{ roleLabel(u.role) }}</small></span>
            <span v-if="!unassigned.length" class="text-success small">모든 사원·팀장에게 임원이 배정되었습니다.</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">평가자 관계 확인</h2>
          <input v-model="relQuery" class="form-control form-control-sm" style="width: 200px" placeholder="이름·부서 검색" aria-label="평가자 관계 검색" />
        </div>
        <div v-if="relationIssues.length" class="alert alert-warning small py-2">
          <div v-for="m in relationIssues" :key="m">{{ m }}</div>
        </div>
        <div v-else class="alert alert-success small py-2">평가 대상자와 평가자 연결에 문제가 없습니다.</div>
        <div class="table-responsive rel-table">
          <table class="table table-clean table-sm">
            <thead><tr><th>평가 대상자</th><th>부서</th><th>역할</th><th v-for="(s, key) in STAGES" :key="key">{{ s.label }}</th></tr></thead>
            <tbody>
              <tr v-for="r in relFiltered" :key="r.user.id">
                <td class="fw-semibold">{{ r.user.name }}</td><td>{{ teamName(r.user.teamId) }}</td><td>{{ roleLabel(r.user.role) }}</td>
                <td v-for="s in r.stages" :key="s.stage" :class="{ 'text-muted': !s.on, 'text-danger fw-semibold': s.on && !s.evaluators.length }">{{ evaluatorText(s) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- 3. 가중치 -->
    <template v-if="tab === 'weights'">
      <section class="panel mb-3">
        <h2 class="panel-title mb-1">평가 단계별 가중치</h2>
        <p class="panel-sub">단계별 점수(100점 기준)에 곱해 개인평가 점수를 만듭니다. 사원은 2차 작업 지시에 따라 본인 20% · 팀장 40% · 본부장(임원) 40%를 기준값으로 넣었습니다. 팀장은 2차가 팀원평가라 확정 전까지 미설정입니다.</p>
        <div class="row g-3">
          <div v-for="role in WEIGHT_ROLES" :key="role" class="col-lg-6">
            <div class="weight-card" :data-role="role">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>{{ roleLabel(role) }} 평가</strong>
                <span v-if="savedCheck(role).valid" class="badge text-bg-success">저장됨 · 적용 중</span>
                <span v-else class="badge text-bg-secondary">{{ savedCheck(role).reason }}</span>
              </div>
              <div v-for="s in ROLE_STAGES[role]" :key="s" class="weight-row">
                <label :for="`w-${role}-${s}`">{{ stageLabel(s) }}</label>
                <template v-if="activeStagesOf(role).includes(s)">
                  <div class="input-group input-group-sm">
                    <input :id="`w-${role}-${s}`" type="number" min="0" max="100" class="form-control" :value="weightDraft[role][s] ?? ''" placeholder="미설정" @input="setWeight(role, s, $event.target.value)" />
                    <span class="input-group-text">%</span>
                  </div>
                </template>
                <span v-else class="small text-muted">꺼짐 · 계산에서 제외</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mt-2">
                <span>합계 <strong :class="Math.abs(draftSum(role) - 100) < 0.001 ? 'text-success' : 'text-danger'">{{ draftSum(role) }}%</strong></span>
                <div class="d-flex gap-1">
                  <button class="btn btn-light btn-sm" @click="clearWeights(role)">미설정으로</button>
                  <button class="btn btn-primary btn-sm" @click="saveWeights(role)">저장</button>
                </div>
              </div>
              <div v-for="e in draftErrors(role)" :key="e" class="small text-danger mt-1">{{ e }}</div>
            </div>
          </div>
        </div>
        <p class="panel-sub mt-3 mb-0">임원은 자기평가만 진행하며 가중치·등급 산출 대상이 아닙니다.</p>
      </section>

      <section class="panel">
        <h2 class="panel-title mb-1">점수 계산 규칙</h2>
        <p class="panel-sub">정해지지 않은 규칙은 '미설정'으로 두면 해당 점수를 계산하지 않고 '미확정'으로 표시합니다.</p>
        <div class="policy-row">
          <label for="p-item">항목 점수 계산 (한 항목에 여러 문항)</label>
          <select id="p-item" class="form-select form-select-sm" :value="db.settings.itemScoreRule ?? ''" @change="setPolicy('itemScoreRule', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.itemScoreRule" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <span class="small text-muted">{{ POLICY_OPTIONS.itemScoreRule.find((o) => o.key === db.settings.itemScoreRule)?.desc ?? '' }}</span>
        </div>
        <div class="policy-row">
          <label for="p-multi">다수 평가자 점수 합산 (팀원평가 등)</label>
          <select id="p-multi" class="form-select form-select-sm" :value="db.settings.multiEvaluatorRule ?? ''" @change="setPolicy('multiEvaluatorRule', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.multiEvaluatorRule" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <span class="small text-muted">{{ POLICY_OPTIONS.multiEvaluatorRule.find((o) => o.key === db.settings.multiEvaluatorRule)?.desc ?? '' }}</span>
        </div>
        <p class="panel-sub mt-2 mb-0">단계 점수는 (단계 원점수 ÷ 단계 배점 합계) × 100으로 100점 기준 점수를 만든 뒤 가중치를 곱합니다. 백분위·KPI·등급 규칙은 '평가 결과'와 '부서 KPI 관리'에서 정합니다.</p>
      </section>
    </template>

    <QuestionSettings v-if="settingsQuestion" :question="settingsQuestion" @close="settingsQuestion = null" />

    <ExecAssignModal v-if="selectedExec" :exec-id="selectedExec" @close="selectedExec = null" />
  </div>
</template>

<style scoped>
.save-bar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; background: #f4f7fc; border: 1px solid #d6e3f5; margin-bottom: 12px; font-size: 0.9rem; flex-wrap: wrap; }
.save-bar.dirty { background: #fff8e6; border-color: #f0d48a; }
.points-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid #cfe3d6; background: #f3faf5; margin-bottom: 12px; font-size: 0.88rem; }
.points-bar.bad { border-color: #f1c0c0; background: #fdf4f4; }
.points-chip { padding: 2px 10px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.points-chip.ok { background: #e3f4ea; color: #1d7a45; }
.points-chip.ng { background: #fbe1e1; color: #a12a2a; font-weight: 700; }
.q-table td { vertical-align: top; }
.item-group { border-top: 2px solid #d6dbe6; }
.item-cell { background: #fafbfd; }
.add-row td { border-bottom: 0; padding-top: 2px; }
[data-testid=item-list] .add-row td { background: #fafbfd; padding-top: 8px; }
.sub-row td { background: #f6f8fc; }
.stage-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.stage-chip { border: 1px solid #c9d0de; background: #fff; color: #6b7080; border-radius: 999px; padding: 2px 10px; font-size: 0.8rem; }
.stage-chip.on { background: var(--brand); border-color: var(--brand); color: #fff; }
.exec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.exec-card { border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; background: #fafbfd; }
.assigned { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { background: #e8eef8; border-radius: 999px; padding: 2px 10px; font-size: 0.82rem; }
.chip.leader { background: #d9e8fa; font-weight: 600; }
.chip.warn { background: #fff1d6; }
.chip.test { outline: 1px dashed #5aa9c9; }
.chip small { color: #6b7080; }
.rel-table { max-height: 420px; overflow-y: auto; }
.assign-list { max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; }
.assign-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.assign-row:hover { background: #f4f7fc; }
.weight-card { border: 1px solid var(--card-border); border-radius: 8px; padding: 14px; height: 100%; }
.weight-row { display: grid; grid-template-columns: 90px 1fr; gap: 12px; align-items: center; padding: 4px 0; }
.policy-row { display: grid; grid-template-columns: 240px 260px 1fr; gap: 12px; align-items: center; padding: 6px 0; }
@media (max-width: 900px) { .policy-row { grid-template-columns: 1fr; } }
</style>
