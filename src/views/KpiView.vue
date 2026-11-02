<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  db, toast, confirmDialog, teamName, userById, currentUser, canOverride,
  saveDeptCorrection, savePersonCorrection, saveOverride,
} from '../store'
import { POLICY_OPTIONS, localDateTime } from '../constants'
import { computeResults, fmt } from '../scoring'
import AppModal from '../components/AppModal.vue'

const route = useRoute()
const tab = ref(['kpi', 'dept', 'person', 'override', 'history'].includes(route.query.tab) ? route.query.tab : 'kpi')
const results = computed(() => computeResults())
const resultTeams = computed(() => db.teams.filter((t) => results.value.rows.some((r) => r.user.teamId === t.id)))
const cell = (v) => (v.value === null ? v.reason : fmt(v.value))
const sign = (v) => (v === null || v === undefined ? '미입력' : `${v > 0 ? '+' : ''}${v}점`)
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)

// 보정 적용 상태 표시
const APPLIED = {
  none: { text: '보정값 없음', cls: 'text-bg-light border' },
  saved: { text: '저장됨 · 미적용', cls: 'text-bg-warning' },
  applied: { text: '적용됨', cls: 'text-bg-success' },
  pending: { text: '앞 단계 보류', cls: 'text-bg-secondary' },
}

// =========================================================
// 1. KPI 반영 (기존 기능)
// =========================================================
function setKpi(teamId, v) {
  if (v === '') {
    delete db.kpiScores[teamId]
    toast(`${teamName(teamId)} KPI 점수를 지웠습니다.`, 'warning')
    return
  }
  const n = Number(v)
  if (Number.isNaN(n)) return toast('KPI 점수는 숫자로 입력해 주세요.', 'warning')
  db.kpiScores[teamId] = n
  toast(`${teamName(teamId)} KPI 점수를 ${n}점으로 저장했습니다.`)
}
const teamRows = (teamId) => results.value.rows.filter((r) => r.user.teamId === teamId)
const teamSummary = (teamId) => {
  const rows = teamRows(teamId)
  const applied = rows.filter((r) => r.kpiAfter.value !== null)
  return { total: rows.length, applied: applied.length, before: avg(applied.map((r) => r.kpiBefore.value)), after: avg(applied.map((r) => r.kpiAfter.value)) }
}
function setPolicy(key, v) {
  db.settings[key] = v === '' ? null : key === 'kpiMixRatio' ? Number(v) : v
  toast('정책 설정을 저장했습니다.')
}
const kpiPolicyMissing = computed(() => {
  const s = db.settings
  const out = []
  if (!s.kpiMethod) out.push('KPI 반영 공식')
  if (!s.kpiBase) out.push('기준 점수')
  if (s.kpiMethod === 'mix' && typeof s.kpiMixRatio !== 'number') out.push('반영 비율')
  if (['multiply', 'mix'].includes(s.kpiMethod) && !resultTeams.value.every((t) => typeof db.kpiScores[t.id] === 'number')) out.push('일부 부서 KPI 점수')
  return out
})
const kpiState = (r) => (r.kpiAfter.value !== null ? (db.settings.kpiMethod === 'none' ? '반영 안 함(정책)' : '반영됨') : r.weighted.value === null ? '평가 미완료' : '보류')
const teamF = ref('all')
const kpiRows = computed(() => results.value.rows.filter((r) => teamF.value === 'all' || r.user.teamId === teamF.value))

// =========================================================
// 2. 부서별 보정
// =========================================================
const deptDraft = ref({})
function loadDeptDraft() {
  deptDraft.value = Object.fromEntries(resultTeams.value.map((t) => [t.id, { value: db.deptCorrections[t.id]?.value ?? '', reason: db.deptCorrections[t.id]?.reason ?? '' }]))
}
loadDeptDraft()
const deptOpen = ref(null)
const draftNum = (teamId) => {
  const v = deptDraft.value[teamId]?.value
  return v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v)
}
const deptDirty = (teamId) => {
  const saved = db.deptCorrections[teamId]
  const d = deptDraft.value[teamId] ?? { value: '', reason: '' }
  return String(saved?.value ?? '') !== String(d.value) || (saved?.reason ?? '') !== d.reason
}
// 이 부서 보정값을 단독 적용했을 때의 예상 (입력 중인 값 기준)
const deptPreview = (teamId) => teamRows(teamId).map((r) => ({
  row: r,
  before: r.kpiAfter.value,
  after: r.kpiAfter.value === null || draftNum(teamId) === null ? null : Math.round((r.kpiAfter.value + draftNum(teamId)) * 100) / 100,
}))
const deptApplied = (teamId) => {
  if (!db.deptCorrections[teamId]) return APPLIED.none
  const rows = teamRows(teamId)
  if (rows.some((r) => r.corr.applied === 'applied')) return APPLIED.applied
  if (rows.every((r) => r.corr.applied === 'pending')) return APPLIED.pending
  return APPLIED.saved
}

async function saveDept(team) {
  const d = deptDraft.value[team.id]
  if (d.value === '' || Number.isNaN(Number(d.value))) return toast('보정값을 숫자로 입력해 주세요. 0도 입력할 수 있습니다. 값을 없애려면 초기화를 누르세요.', 'warning')
  const value = Number(d.value)
  const preview = deptPreview(team.id)
  const ok = await confirmDialog({
    title: `${team.name} 부서별 보정값 저장`,
    message: `${team.name} 직원 ${preview.length}명에게만 연결됩니다. 보정값 ${sign(value)}\n` +
      `저장해도 개인평가 점수와 KPI 반영 결과는 바뀌지 않습니다.\n` +
      (db.settings.correctionRule ? `보정 적용 규칙(${POLICY_OPTIONS.correctionRule.find((o) => o.key === db.settings.correctionRule).label})에 따라 결과에 반영됩니다.` : '보정 적용 규칙이 미설정이라 저장만 되고 최종 점수에는 반영되지 않습니다.'),
    okText: '저장',
  })
  if (!ok) return
  saveDeptCorrection(team.id, value, d.reason.trim(), preview.map((p) => ({ userId: p.row.user.id, name: p.row.user.name, before: p.before, after: p.after })))
  toast(`${team.name} 부서별 보정값을 저장했습니다.`)
}
async function resetDept(team) {
  if (!db.deptCorrections[team.id]) { loadDeptDraft(); return }
  const ok = await confirmDialog({ title: '부서별 보정값 초기화', message: `${team.name}의 보정값(${sign(db.deptCorrections[team.id].value)})을 지워 '미입력' 상태로 되돌립니다. 변경 이력은 남습니다.`, okText: '초기화', danger: true })
  if (!ok) return
  saveDeptCorrection(team.id, null, '초기화', [])
  deptDraft.value[team.id] = { value: '', reason: '' }
  toast(`${team.name} 부서별 보정값을 초기화했습니다.`, 'warning')
}

// =========================================================
// 3. 개인별 보정
// =========================================================
const pTeam = ref('all')
const pQ = ref('')
const pOnly = ref(false)
const personRows = computed(() => results.value.rows.filter((r) =>
  (pTeam.value === 'all' || r.user.teamId === pTeam.value) && (!pQ.value.trim() || r.user.name.includes(pQ.value.trim()))
  && (!pOnly.value || r.corr.person !== null)))
const pForm = ref(null) // { userId, value, reason, mode: 'save' | 'reset' }
const pRow = computed(() => (pForm.value ? results.value.byId[pForm.value.userId] : null))
const pExpected = computed(() => {
  const r = pRow.value
  const v = pForm.value?.value
  if (!r || r.kpiAfter.value === null || v === '' || Number.isNaN(Number(v))) return null
  return Math.round((r.kpiAfter.value + Number(v)) * 100) / 100
})
const pError = ref('')
function openPerson(r, mode = 'save') {
  pForm.value = { userId: r.user.id, value: r.corr.person ?? '', reason: mode === 'save' ? r.corr.personReason : '', mode }
  pError.value = ''
}
function savePerson() {
  const f = pForm.value
  if (!f.reason.trim()) { pError.value = `${f.mode === 'reset' ? '초기화' : '보정'} 사유를 입력해 주세요.`; return }
  const r = pRow.value
  if (f.mode === 'reset') {
    savePersonCorrection(f.userId, null, f.reason.trim(), r.kpiAfter.value, r.kpiAfter.value)
    toast(`${r.user.name}님의 개인별 보정값을 초기화했습니다.`, 'warning')
  } else {
    if (f.value === '' || Number.isNaN(Number(f.value))) { pError.value = '보정값을 숫자로 입력해 주세요(0 가능).'; return }
    savePersonCorrection(f.userId, Number(f.value), f.reason.trim(), r.kpiAfter.value, pExpected.value)
    toast(`${r.user.name}님의 개인별 보정값을 저장했습니다.`)
  }
  pForm.value = null
}

// =========================================================
// 4. 최종 점수 직접 수정 (권한 계정만)
// =========================================================
const me = computed(() => currentUser())
const oCandidates = computed(() => results.value.rows.filter((r) => r.weighted.value !== null))
const oForm = ref({ userId: '', score: '', reason: '' })
const oRow = computed(() => results.value.byId[oForm.value.userId])
const oError = ref('')
const overridden = computed(() => results.value.rows.filter((r) => r.override))
// 직접 수정 전 최종 점수: 보정까지 반영된 계산 결과
const beforeOverride = (r) => r.corrected
async function saveOverrideForm() {
  const f = oForm.value
  const r = oRow.value
  if (!r) { oError.value = '대상 직원을 선택해 주세요.'; return }
  if (f.score === '' || Number.isNaN(Number(f.score))) { oError.value = '수정할 최종 점수를 숫자로 입력해 주세요.'; return }
  if (!f.reason.trim()) { oError.value = '수정 사유를 입력해 주세요.'; return }
  const before = beforeOverride(r)
  const ok = await confirmDialog({
    title: '최종 점수 직접 수정',
    message: `${r.user.name} (${r.teamName})\n수정 전 최종 점수: ${before.value === null ? `계산 보류 (${before.reason})` : fmt(before.value)}\n수정 후 최종 점수: ${Number(f.score)}\n사유: ${f.reason.trim()}\n\n개인평가 점수·KPI 반영 결과·보정값은 그대로 남습니다.`,
    okText: '수정 저장',
  })
  if (!ok) return
  try {
    saveOverride(r.user.id, Number(f.score), f.reason.trim(), before.value)
    toast(`${r.user.name}님의 최종 점수를 직접 수정했습니다.`)
    oForm.value = { userId: '', score: '', reason: '' }
    oError.value = ''
  } catch (e) {
    oError.value = e.message
  }
}
const cancelForm = ref(null) // { userId, reason }
function cancelOverride() {
  const f = cancelForm.value
  if (!f.reason.trim()) return toast('취소 사유를 입력해 주세요.', 'warning')
  const r = results.value.byId[f.userId]
  try {
    saveOverride(f.userId, null, f.reason.trim(), r.override.score)
    toast(`${r.user.name}님의 직접 수정을 취소했습니다. 계산된 최종 점수로 돌아갑니다.`, 'warning')
    cancelForm.value = null
  } catch (e) {
    toast(e.message, 'warning')
  }
}

// =========================================================
// 5. 변경 이력
// =========================================================
const KIND = { dept: '부서별 보정', person: '개인별 보정', override: '최종 점수 직접 수정', legacy: '이전 방식 조정(보존 기록)' }
const hKind = ref('all')
const hQ = ref('')
const history = computed(() => [...db.auditLog].reverse().filter((a) => (hKind.value === 'all' || a.kind === hKind.value)
  && (!hQ.value.trim() || (a.userId && userById(a.userId)?.name.includes(hQ.value.trim())) || (a.kind === 'dept' && teamName(a.teamId).includes(hQ.value.trim())))))
const target = (a) => (a.kind === 'dept' ? `${teamName(a.teamId)} (부서)` : `${userById(a.userId)?.name ?? '(삭제된 직원)'} · ${teamName(userById(a.userId)?.teamId)}`)
const valText = (a, v) => (a.kind === 'override' ? (v === null ? '없음' : `${v}점`) : a.kind === 'legacy' ? (v ?? '-') : sign(v))
const scoreText = (v) => (v === null || v === undefined ? '-' : fmt(v))
const openAffected = ref(null)
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">부서 KPI 관리</h1></div>

    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'kpi' }" @click="tab = 'kpi'">KPI 반영</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'dept' }" @click="tab = 'dept'; loadDeptDraft()">부서별 보정</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'person' }" @click="tab = 'person'">개인별 보정</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'override' }" @click="tab = 'override'">최종 점수 직접 수정</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'history' }" @click="tab = 'history'">변경 이력 <span class="badge text-bg-light border">{{ db.auditLog.length }}</span></button></li>
    </ul>

    <!-- ================= 1. KPI 반영 ================= -->
    <template v-if="tab === 'kpi'">
      <div class="row g-3 mb-3">
        <section class="col-lg-6">
          <div class="panel h-100">
            <h2 class="panel-title mb-1">부서별 KPI 점수</h2>
            <p class="panel-sub">개인 평가와 별도로 관리합니다. 입력하면 바로 저장됩니다.</p>
            <div class="table-responsive">
            <table class="table table-clean">
              <thead><tr><th>부서</th><th style="width: 140px">KPI 점수</th><th>적용 현황</th></tr></thead>
              <tbody>
                <tr v-for="t in resultTeams" :key="t.id" :data-team="t.name">
                  <td class="fw-semibold">{{ t.name }}</td>
                  <td>
                    <div class="input-group input-group-sm">
                      <input :id="`kpi-${t.id}`" type="number" class="form-control" :value="db.kpiScores[t.id] ?? ''" placeholder="미입력" :aria-label="`${t.name} KPI 점수`" @change="setKpi(t.id, $event.target.value)" />
                      <span class="input-group-text">점</span>
                    </div>
                  </td>
                  <td class="small">
                    {{ teamSummary(t.id).applied }} / {{ teamSummary(t.id).total }}명 반영
                    <div v-if="teamSummary(t.id).applied" class="text-muted">평균 {{ fmt(teamSummary(t.id).before) }} → {{ fmt(teamSummary(t.id).after) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </section>
        <section class="col-lg-6">
          <div class="panel h-100">
            <h2 class="panel-title mb-1">KPI 반영 정책</h2>
            <p class="panel-sub">반영 공식은 아직 정해지지 않았습니다. 미설정이면 KPI 반영 후 점수를 계산하지 않습니다.</p>
            <div v-if="kpiPolicyMissing.length" class="alert alert-warning small py-2">설정 필요: {{ kpiPolicyMissing.join(', ') }}</div>
            <div v-else class="alert alert-success small py-2">KPI 반영에 필요한 설정이 모두 되어 있습니다.</div>
            <div class="mb-2">
              <label class="form-label small" for="k-method">반영 공식</label>
              <select id="k-method" class="form-select form-select-sm" :value="db.settings.kpiMethod ?? ''" @change="setPolicy('kpiMethod', $event.target.value)">
                <option value="">미설정</option>
                <option v-for="o in POLICY_OPTIONS.kpiMethod" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
              <div class="small text-muted mt-1">{{ POLICY_OPTIONS.kpiMethod.find((o) => o.key === db.settings.kpiMethod)?.desc ?? '' }}</div>
            </div>
            <div class="mb-2">
              <label class="form-label small" for="k-base">기준 점수 (KPI를 적용할 점수)</label>
              <select id="k-base" class="form-select form-select-sm" :value="db.settings.kpiBase ?? ''" @change="setPolicy('kpiBase', $event.target.value)">
                <option value="">미설정</option>
                <option v-for="o in POLICY_OPTIONS.kpiBase" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
            </div>
            <div v-if="db.settings.kpiMethod === 'mix'">
              <label class="form-label small" for="k-ratio">KPI 반영 비율</label>
              <div class="input-group input-group-sm" style="max-width: 160px">
                <input id="k-ratio" type="number" min="0" max="100" class="form-control" :value="db.settings.kpiMixRatio ?? ''" placeholder="미설정" @change="setPolicy('kpiMixRatio', $event.target.value)" />
                <span class="input-group-text">%</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">KPI 반영 전후 비교</h2>
          <select v-model="teamF" class="form-select form-select-sm w-auto" aria-label="부서 필터">
            <option value="all">전체 부서</option>
            <option v-for="t in resultTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="table-responsive scroll">
          <table class="table table-clean table-sm" data-testid="kpi-table">
            <thead><tr><th>이름</th><th>부서</th><th class="text-end">개인평가 점수</th><th class="text-end">KPI 반영 전</th><th class="text-end">부서 KPI</th><th>KPI 반영 여부</th><th class="text-end">KPI 반영 후</th></tr></thead>
            <tbody>
              <tr v-for="r in kpiRows" :key="r.user.id" :data-user="r.user.name">
                <td class="fw-semibold">{{ r.user.name }}</td>
                <td>{{ r.teamName }}</td>
                <td class="text-end num" :class="{ muted: r.weighted.value === null }">{{ cell(r.weighted) }}</td>
                <td class="text-end num" :class="{ muted: r.kpiBefore.value === null }">{{ cell(r.kpiBefore) }}</td>
                <td class="text-end num">{{ r.kpiScore ?? '-' }}</td>
                <td><span class="badge" :class="kpiState(r) === '반영됨' ? 'text-bg-success' : kpiState(r) === '보류' ? 'text-bg-warning' : 'text-bg-light border'">{{ kpiState(r) }}</span></td>
                <td class="text-end num" :class="{ muted: r.kpiAfter.value === null }">{{ cell(r.kpiAfter) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="panel-sub mt-2 mb-0">KPI 반영 결과는 개인평가 점수와 따로 저장되며, KPI 설정을 바꿔도 평가 응답과 개인평가 점수는 바뀌지 않습니다.</p>
      </section>
    </template>

    <!-- 보정 적용 규칙 (부서별·개인별 탭 공통) -->
    <section v-if="tab === 'dept' || tab === 'person'" class="panel mb-3 rule-card">
      <div class="d-flex flex-wrap gap-3 align-items-center">
        <div>
          <strong>보정 적용 규칙</strong>
          <div class="small text-muted">부서별 보정값과 개인별 보정값을 최종 점수에 어떻게 반영할지 정합니다.</div>
        </div>
        <select id="c-rule" class="form-select form-select-sm w-auto" :value="db.settings.correctionRule ?? ''" aria-label="보정 적용 규칙" @change="setPolicy('correctionRule', $event.target.value)">
          <option value="">미설정</option>
          <option v-for="o in POLICY_OPTIONS.correctionRule" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
        <span v-if="!db.settings.correctionRule" class="badge text-bg-warning">미설정: 보정값은 저장만 되고 최종 점수에 반영되지 않습니다</span>
        <span v-else class="small text-muted">{{ POLICY_OPTIONS.correctionRule.find((o) => o.key === db.settings.correctionRule).desc }}</span>
      </div>
      <p class="small text-muted mt-2 mb-0">보정값은 KPI 반영 후 점수에 더하는 점수(±)입니다. 아래 '예상 점수'는 그 보정값 하나만 적용했을 때의 값이며, 두 보정값을 합치는 계산은 규칙이 정해진 뒤에만 합니다.</p>
    </section>

    <!-- ================= 2. 부서별 보정 ================= -->
    <section v-if="tab === 'dept'" class="panel">
      <h2 class="panel-title mb-2">부서별 보정값</h2>
      <div class="table-responsive">
        <table class="table table-clean align-middle" data-testid="dept-table">
          <thead>
            <tr><th>부서</th><th class="text-end">직원 수</th><th class="text-end">평균 개인평가</th><th class="text-end">평균 KPI 반영 후</th><th style="width: 130px">보정값</th><th>사유 (선택)</th><th>저장</th><th>적용</th><th></th></tr>
          </thead>
          <tbody>
            <template v-for="t in resultTeams" :key="t.id">
              <tr :data-team="t.name">
                <td class="fw-semibold">{{ t.name }}</td>
                <td class="text-end">{{ teamRows(t.id).length }}명</td>
                <td class="text-end num">{{ fmt(avg(teamRows(t.id).map((r) => r.weighted.value).filter((x) => x !== null))) }}</td>
                <td class="text-end num">{{ fmt(avg(teamRows(t.id).map((r) => r.kpiAfter.value).filter((x) => x !== null))) }}</td>
                <td>
                  <div class="input-group input-group-sm">
                    <input v-model="deptDraft[t.id].value" type="number" step="0.5" class="form-control" placeholder="미입력" :aria-label="`${t.name} 보정값`" />
                    <span class="input-group-text">점</span>
                  </div>
                </td>
                <td><input v-model="deptDraft[t.id].reason" class="form-control form-control-sm" :aria-label="`${t.name} 보정 사유`" /></td>
                <td class="small text-nowrap">
                  <span v-if="deptDirty(t.id)" class="badge text-bg-info">저장 안 됨</span>
                  <span v-else-if="db.deptCorrections[t.id]" class="badge text-bg-primary">저장됨 {{ sign(db.deptCorrections[t.id].value) }}</span>
                  <span v-else class="badge text-bg-light border">미입력</span>
                </td>
                <td><span class="badge" :class="deptApplied(t.id).cls">{{ deptApplied(t.id).text }}</span></td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-link btn-sm p-0 me-2" @click="deptOpen = deptOpen === t.id ? null : t.id">{{ deptOpen === t.id ? '영향 닫기' : '영향 보기' }}</button>
                  <button class="btn btn-primary btn-sm me-1" @click="saveDept(t)">저장</button>
                  <button class="btn btn-light border btn-sm" @click="resetDept(t)">초기화</button>
                </td>
              </tr>
              <tr v-if="deptOpen === t.id" class="preview-row">
                <td colspan="9">
                  <div class="small mb-1"><strong>{{ t.name }}</strong> 직원에게만 연결됩니다. 입력 중인 보정값 <strong>{{ draftNum(t.id) === null ? '미입력' : sign(draftNum(t.id)) }}</strong>을 단독 적용했을 때의 예상입니다.</div>
                  <table class="table table-sm mb-0 small" data-testid="dept-preview">
                    <thead><tr><th>이름</th><th class="text-end">개인평가 점수</th><th class="text-end">보정 적용 전 (KPI 반영 후)</th><th class="text-end">부서 보정 적용 후 예상</th><th class="text-end">현재 보정 적용 결과</th></tr></thead>
                    <tbody>
                      <tr v-for="p in deptPreview(t.id)" :key="p.row.user.id">
                        <td>{{ p.row.user.name }}</td>
                        <td class="text-end num">{{ cell(p.row.weighted) }}</td>
                        <td class="text-end num">{{ cell(p.row.kpiAfter) }}</td>
                        <td class="text-end num expected">{{ p.after === null ? '-' : fmt(p.after) }}</td>
                        <td class="text-end num">{{ cell(p.row.corrected) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">보정값을 비워 두면 '미입력'이며 0과 다릅니다. 저장·초기화는 모두 변경 이력에 남고, 개인평가 점수와 KPI 반영 결과는 바뀌지 않습니다.</p>
    </section>

    <!-- ================= 3. 개인별 보정 ================= -->
    <section v-if="tab === 'person'" class="panel">
      <div class="panel-head">
        <h2 class="panel-title">개인별 보정값</h2>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <input v-model="pQ" class="form-control form-control-sm" style="width: 140px" placeholder="이름 검색" aria-label="이름 검색" />
          <select v-model="pTeam" class="form-select form-select-sm w-auto" aria-label="부서 필터">
            <option value="all">전체 부서</option>
            <option v-for="t in resultTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <label class="small"><input v-model="pOnly" type="checkbox" class="form-check-input me-1" />보정값 있는 직원만</label>
        </div>
      </div>
      <div class="table-responsive scroll">
        <table class="table table-clean table-sm" data-testid="person-table">
          <thead>
            <tr>
              <th>이름</th><th>부서</th><th class="text-end">개인평가</th><th class="text-end">백분위</th><th class="text-end">KPI 반영 후 (보정 전)</th>
              <th class="text-end">부서 보정</th><th class="text-end">개인 보정</th><th class="text-end">개인 보정 적용 예상</th><th class="text-end">보정 적용 결과</th><th>사유</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in personRows" :key="r.user.id" :data-user="r.user.name">
              <td class="fw-semibold">{{ r.user.name }}</td>
              <td>{{ r.teamName }}</td>
              <td class="text-end num" :class="{ muted: r.weighted.value === null }">{{ cell(r.weighted) }}</td>
              <td class="text-end num" :class="{ muted: r.percentile.value === null }">{{ cell(r.percentile) }}</td>
              <td class="text-end num" :class="{ muted: r.kpiAfter.value === null }">{{ cell(r.kpiAfter) }}</td>
              <td class="text-end num">{{ sign(r.corr.dept) }}</td>
              <td class="text-end num fw-semibold">{{ sign(r.corr.person) }}</td>
              <td class="text-end num expected">{{ r.corr.expectPerson === null ? '-' : fmt(r.corr.expectPerson) }}</td>
              <td class="text-end num" :class="{ muted: r.corrected.value === null }">{{ cell(r.corrected) }}</td>
              <td class="small reason">{{ r.corr.personReason || '-' }}</td>
              <td><span class="badge" :class="APPLIED[r.corr.applied].cls">{{ APPLIED[r.corr.applied].text }}</span></td>
              <td class="text-end text-nowrap">
                <button class="btn btn-link btn-sm p-0 me-2" @click="openPerson(r)">{{ r.corr.person === null ? '입력' : '수정' }}</button>
                <button v-if="r.corr.person !== null" class="btn btn-link btn-sm p-0 text-danger" @click="openPerson(r, 'reset')">초기화</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">개인별 보정값은 그 직원에게만 연결됩니다. '보정 적용 결과'는 보정 적용 규칙이 정해진 뒤에만 계산되며, 그 전에는 '보정 적용 규칙 미설정'으로 보류됩니다.</p>
    </section>

    <!-- ================= 4. 최종 점수 직접 수정 ================= -->
    <template v-if="tab === 'override'">
      <section class="panel mb-3">
        <h2 class="panel-title mb-1">최종 점수 직접 수정</h2>
        <p class="panel-sub">대표자 등 권한이 있는 계정이 최종 결과를 검토한 뒤 최종 점수를 직접 정합니다. 보정과는 별개이며, 개인평가 점수·KPI 결과·보정값을 덮어쓰지 않습니다.</p>
        <div class="alert alert-secondary small py-2">허용 범위와 승인 절차는 정해지지 않았습니다. 범위를 제한하지 않고, 승인 단계 없이 저장 즉시 반영되며, 모든 수정은 변경 이력에 남습니다.</div>
        <div v-if="!canOverride()" class="alert alert-warning small py-2" data-testid="no-permission">
          현재 계정({{ me?.name }})에는 최종 점수 직접 수정 권한이 없습니다. 권한이 있는 계정(대표자)으로 로그인해야 수정할 수 있습니다. 아래 수정 내역은 볼 수 있습니다.
        </div>
        <div v-else class="override-form">
          <div>
            <label class="form-label small" for="o-user">대상 직원 (3단계 평가 완료자)</label>
            <select id="o-user" v-model="oForm.userId" class="form-select form-select-sm">
              <option value="">선택하세요</option>
              <option v-for="r in oCandidates" :key="r.user.id" :value="r.user.id">{{ r.user.name }} · {{ r.teamName }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small" for="o-score">수정할 최종 점수</label>
            <input id="o-score" v-model="oForm.score" type="number" step="0.5" class="form-control form-control-sm" />
          </div>
          <div class="reason-col">
            <label class="form-label small" for="o-reason">수정 사유 <span class="text-danger">*</span></label>
            <input id="o-reason" v-model="oForm.reason" class="form-control form-control-sm" />
          </div>
          <div class="align-self-end"><button class="btn btn-primary btn-sm" @click="saveOverrideForm">수정 저장</button></div>
        </div>
        <div v-if="canOverride() && oRow" class="small mt-2 steps">
          개인평가 <strong>{{ cell(oRow.weighted) }}</strong> → KPI 반영 후 <strong>{{ cell(oRow.kpiAfter) }}</strong>
          → 보정 적용 결과 <strong>{{ cell(oRow.corrected) }}</strong> → 현재 최종 <strong class="final">{{ cell(oRow.final) }}</strong>
          <span v-if="oRow.override" class="badge text-bg-danger ms-1">이미 직접 수정됨</span>
        </div>
        <div v-if="oError" class="text-danger small mt-2" role="alert">{{ oError }}</div>
      </section>
      <section class="panel">
        <h2 class="panel-title mb-2">직접 수정된 직원 <span class="panel-sub">{{ overridden.length }}명</span></h2>
        <div class="table-responsive">
        <table class="table table-clean table-sm" data-testid="override-table">
          <thead><tr><th>이름</th><th>부서</th><th class="text-end">개인평가 (유지)</th><th class="text-end">보정 적용 결과 (유지)</th><th class="text-end">수정 전 최종</th><th class="text-end">수정 후 최종</th><th>사유</th><th>수정자</th><th>시각</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in overridden" :key="r.user.id" :data-user="r.user.name">
              <td class="fw-semibold">{{ r.user.name }}</td><td>{{ r.teamName }}</td>
              <td class="text-end num">{{ cell(r.weighted) }}</td>
              <td class="text-end num">{{ cell(r.corrected) }}</td>
              <td class="text-end num">{{ r.override.before === null ? '계산 보류' : fmt(r.override.before) }}</td>
              <td class="text-end num final">{{ fmt(r.override.score) }}</td>
              <td class="small">{{ r.override.reason }}</td><td class="small">{{ r.override.by }}</td><td class="small text-nowrap">{{ localDateTime(r.override.at) }}</td>
              <td class="text-end"><button v-if="canOverride()" class="btn btn-link btn-sm p-0 text-danger" @click="cancelForm = { userId: r.user.id, reason: '' }">수정 취소</button></td>
            </tr>
            <tr v-if="!overridden.length"><td colspan="10" class="text-muted">직접 수정한 직원이 없습니다.</td></tr>
          </tbody>
        </table>
        </div>
      </section>
    </template>

    <!-- ================= 5. 변경 이력 ================= -->
    <section v-if="tab === 'history'" class="panel">
      <div class="panel-head">
        <h2 class="panel-title">보정·점수 변경 이력</h2>
        <div class="d-flex gap-2">
          <input v-model="hQ" class="form-control form-control-sm" style="width: 160px" placeholder="직원·부서 검색" aria-label="이력 검색" />
          <select v-model="hKind" class="form-select form-select-sm w-auto" aria-label="변경 유형">
            <option value="all">전체 유형</option>
            <option v-for="(label, key) in KIND" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
      </div>
      <div class="table-responsive scroll">
        <table class="table table-clean table-sm" data-testid="audit-table">
          <thead><tr><th>시각</th><th>유형</th><th>대상</th><th class="text-end">변경 전 값</th><th class="text-end">변경 후 값</th><th class="text-end">변경 전 점수</th><th class="text-end">변경 후 점수</th><th>사유</th><th>변경자</th></tr></thead>
          <tbody>
            <template v-for="a in history" :key="a.id">
              <tr :data-kind="a.kind">
                <td class="text-nowrap small">{{ localDateTime(a.at) }}</td>
                <td><span class="badge" :class="{ dept: 'text-bg-primary', person: 'text-bg-info', override: 'text-bg-danger', legacy: 'text-bg-secondary' }[a.kind]">{{ KIND[a.kind] }}</span></td>
                <td>{{ target(a) }}</td>
                <td class="text-end num">{{ valText(a, a.beforeValue) }}</td>
                <td class="text-end num">{{ valText(a, a.afterValue) }}</td>
                <template v-if="a.kind === 'dept'">
                  <td colspan="2" class="text-end small">
                    <button v-if="a.affected?.length" class="btn btn-link btn-sm p-0" @click="openAffected = openAffected === a.id ? null : a.id">영향 {{ a.affected.length }}명 {{ openAffected === a.id ? '닫기' : '보기' }}</button>
                    <span v-else class="text-muted">-</span>
                  </td>
                </template>
                <template v-else>
                  <td class="text-end num">{{ scoreText(a.beforeScore) }}</td>
                  <td class="text-end num">{{ scoreText(a.afterScore) }}</td>
                </template>
                <td class="small">{{ a.reason || '-' }}</td>
                <td class="small text-nowrap">{{ a.by }}</td>
              </tr>
              <tr v-if="openAffected === a.id" class="preview-row">
                <td colspan="9" class="small">
                  <span v-for="x in a.affected" :key="x.userId" class="me-3">{{ x.name }} {{ scoreText(x.before) }} → {{ scoreText(x.after) }}</span>
                  <div class="text-muted">당시 '부서 보정값만 적용했을 때' 예상 점수입니다.</div>
                </td>
              </tr>
            </template>
            <tr v-if="!history.length"><td colspan="9" class="text-muted">변경 이력이 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">
        이력은 지우지 않고 계속 쌓입니다. 다만 이 목업은 브라우저 localStorage에 저장하므로, 다른 기기와 공유되지 않고 개발자 도구로 바꿀 수 있어 실제 감사 로그나 위변조 방지를 보장하지 않습니다.
        개인별 보정의 점수는 '그 보정값 하나만 적용했을 때' 예상 점수입니다.
      </p>
    </section>

    <!-- 개인별 보정 입력 -->
    <AppModal v-if="pForm" :title="`${pRow.user.name} 개인별 보정${pForm.mode === 'reset' ? ' 초기화' : ''}`" @close="pForm = null">
      <table class="table table-sm small mb-3">
        <tbody>
          <tr><th>개인평가 점수</th><td>{{ cell(pRow.weighted) }}</td><th>백분위</th><td>{{ cell(pRow.percentile) }}</td></tr>
          <tr><th>KPI 반영 후 (보정 전)</th><td>{{ cell(pRow.kpiAfter) }}</td><th>부서 보정 ({{ pRow.teamName }})</th><td>{{ sign(pRow.corr.dept) }}</td></tr>
          <tr><th>현재 개인 보정</th><td>{{ sign(pRow.corr.person) }}</td><th>보정 적용 결과</th><td>{{ cell(pRow.corrected) }}</td></tr>
        </tbody>
      </table>
      <template v-if="pForm.mode === 'save'">
        <label class="form-label" for="p-value">개인별 보정값 (점, ±)</label>
        <input id="p-value" v-model="pForm.value" type="number" step="0.5" class="form-control mb-2" placeholder="예: 1.5 또는 -2" />
        <div class="small mb-2">이 보정값만 적용했을 때 예상: <strong class="expected">{{ pExpected === null ? '-' : fmt(pExpected) }}</strong></div>
      </template>
      <p v-else class="small">개인별 보정값({{ sign(pRow.corr.person) }})을 지워 '미입력' 상태로 되돌립니다. 이전 기록은 변경 이력에 남습니다.</p>
      <label class="form-label" for="p-reason">{{ pForm.mode === 'reset' ? '초기화' : '보정' }} 사유 <span class="text-danger">*</span></label>
      <input id="p-reason" v-model="pForm.reason" class="form-control" />
      <div v-if="pError" class="text-danger small mt-2" role="alert">{{ pError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="pForm = null">취소</button>
        <button class="btn" :class="pForm.mode === 'reset' ? 'btn-danger' : 'btn-primary'" @click="savePerson">{{ pForm.mode === 'reset' ? '초기화' : '저장' }}</button>
      </template>
    </AppModal>

    <AppModal v-if="cancelForm" title="직접 수정 취소" size="sm" @close="cancelForm = null">
      <p class="small">직접 수정한 점수를 없애고 계산된 최종 점수로 되돌립니다. 이력은 남습니다.</p>
      <label class="form-label" for="c-reason">취소 사유 <span class="text-danger">*</span></label>
      <input id="c-reason" v-model="cancelForm.reason" class="form-control" />
      <template #footer>
        <button class="btn btn-light" @click="cancelForm = null">닫기</button>
        <button class="btn btn-danger" @click="cancelOverride">수정 취소</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.scroll { max-height: 520px; overflow-y: auto; }
.num { font-variant-numeric: tabular-nums; }
.muted { color: #9aa0b4; font-size: 0.8rem; }
.expected { color: #6a3d8f; font-style: italic; }
.final { color: var(--navy); font-weight: 800; }
.reason { max-width: 180px; }
.rule-card { padding: 12px 18px; }
.preview-row td { background: #f6f8fc; }
.override-form { display: grid; grid-template-columns: 2fr 1fr 3fr auto; gap: 10px; }
@media (max-width: 900px) { .override-form { grid-template-columns: 1fr 1fr; } .reason-col { grid-column: 1 / -1; } }
</style>
