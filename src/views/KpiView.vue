<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  db, toast, confirmDialog, teamName, userById, currentUser, canOverride,
  savePersonCorrection, saveOverride, periodList, switchPeriod,
} from '../store'
import { localDateTime, RATIO_ELEMENTS, ROLE_RATIO_ELEMENTS, roleLabel } from '../constants'
import { computeResults, fmt, teamKpiData, teamKpiOf, indicatorRate, indicatorScore, ratioCheck } from '../scoring'
import AppModal from '../components/AppModal.vue'

const route = useRoute()
const tab = ref(['team', 'ratio', 'person', 'override'].includes(route.query.tab) ? route.query.tab : 'team')
const results = computed(() => computeResults())
const resultTeams = computed(() => db.teams.filter((t) => results.value.rows.some((r) => r.user.teamId === t.id)))
const cell = (v) => (v.value === null ? v.reason : fmt(v.value))
const sign = (v) => (v === null || v === undefined ? '미입력' : `${v > 0 ? '+' : ''}${v}점`)
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)

// 보정 적용 상태 표시
const APPLIED = {
  none: { text: '보정값 없음', cls: 'text-bg-light border' },
  applied: { text: '적용됨', cls: 'text-bg-success' },
  pending: { text: '앞 단계 보류', cls: 'text-bg-secondary' },
}

// =========================================================
// 1. 팀별 KPI (지표: 목표·실적·가중치 → 달성률 → 환산점수, 또는 점수 직접 입력)
// =========================================================
const selTeam = ref(db.teams[0]?.id ?? null)
const selData = computed(() => teamKpiData(selTeam.value))
const selScore = computed(() => teamKpiOf(selTeam.value))
const indicators = computed(() => (selData.value?.mode === 'direct' ? [] : selData.value?.indicators ?? []))
const weightSum = computed(() => Math.round(indicators.value.reduce((a, i) => a + (Number(i.weight) || 0), 0) * 100) / 100)
function ensureTeam(teamId) {
  const p = (db.teamKpi[db.period.id] ??= {})
  return (p[teamId] ??= { mode: 'indicators', direct: null, indicators: [] })
}
function listState(t) {
  const d = teamKpiData(t.id)
  if (d?.mode === 'direct') return { sub: '직접 입력', score: teamKpiOf(t.id) }
  if (!d?.indicators?.length) return { none: true }
  return { sub: `지표 ${d.indicators.length}개`, score: teamKpiOf(t.id) }
}
const pct1 = (v) => (v === null ? '-' : `${(Math.round(v * 10) / 10).toFixed(1)}%`)
const one = (v) => (v === null || v === undefined ? '-' : (Math.round(v * 10) / 10).toFixed(1))
const UNITS = ['%', '점', '건', '시간', '일', '원', '명']

const kForm = ref(null)
const kError = ref('')
function openIndicator(ind) {
  kForm.value = ind ? { ...ind } : { name: '', scope: '전체 직무', target: '', actual: '', unit: '%', direction: 'higher', weight: '' }
  kError.value = ''
}
function saveIndicator() {
  const f = kForm.value
  const num = (v) => (v === '' || v === null ? NaN : Number(v))
  if (!f.name.trim()) { kError.value = '지표명을 입력해 주세요.'; return }
  if (!(num(f.target) > 0)) { kError.value = '목표는 0보다 큰 숫자여야 합니다.'; return }
  if (!(num(f.actual) >= 0)) { kError.value = '실적은 0 이상의 숫자여야 합니다.'; return }
  if (!(num(f.weight) >= 0 && num(f.weight) <= 100)) { kError.value = '가중치는 0~100 사이 숫자여야 합니다.'; return }
  const data = { name: f.name.trim(), scope: f.scope.trim() || '전체 직무', target: num(f.target), actual: num(f.actual), unit: f.unit, direction: f.direction, weight: num(f.weight) }
  const t = ensureTeam(selTeam.value)
  t.mode = 'indicators'
  if (f.id) Object.assign(t.indicators.find((i) => i.id === f.id), data)
  else t.indicators.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data })
  toast(f.id ? `'${data.name}' 지표를 수정했습니다.` : `'${data.name}' 지표를 추가했습니다.`)
  kForm.value = null
}
async function removeIndicator(ind) {
  const ok = await confirmDialog({ title: '지표 삭제', message: `'${ind.name}' 지표를 삭제합니다.`, okText: '삭제', danger: true })
  if (!ok) return
  const t = ensureTeam(selTeam.value)
  t.indicators = t.indicators.filter((i) => i.id !== ind.id)
  toast('지표를 삭제했습니다.')
}
function setMode(mode) {
  ensureTeam(selTeam.value).mode = mode
}
function setDirect(v) {
  const t = ensureTeam(selTeam.value)
  t.direct = v === '' ? null : Number(v)
  toast(`${teamName(selTeam.value)} KPI 점수를 ${v === '' ? '지웠습니다' : `${Number(v)}점으로 저장했습니다`}.`)
}

// =========================================================
// 직급별 최종 반영 비율
// =========================================================
const RATIO_ROLES = ['member', 'leader', 'exec']
const ELEMENT_ORDER = ['personal', 'kpi']
const clone = (x) => JSON.parse(JSON.stringify(x))
const ratioDraft = ref(clone(db.roleRatios))
const ratioDirty = computed(() => JSON.stringify(ratioDraft.value) !== JSON.stringify(db.roleRatios))
const activeSum = (role) => Math.round(ROLE_RATIO_ELEMENTS[role].reduce((a, e) => a + (ratioDraft.value[role]?.[e]?.on ? Number(ratioDraft.value[role][e].value) || 0 : 0), 0) * 100) / 100
const ratioValid = computed(() => RATIO_ROLES.every((r) => ratioCheck(r, ratioDraft.value[r]).valid))
function setRatioValue(role, e, v) {
  ratioDraft.value[role][e].value = v === '' ? null : Number(v)
}
function saveRatios() {
  const bad = RATIO_ROLES.filter((r) => !ratioCheck(r, ratioDraft.value[r]).valid)
  if (bad.length) return toast(`${bad.map(roleLabel).join(', ')}의 활성 합계가 100%가 아닙니다.`, 'warning')
  db.roleRatios = clone(ratioDraft.value)
  toast('직급별 반영 비율을 저장했습니다. 결과 계산에 바로 반영됩니다.')
}

// =========================================================
// 2. 개인별 보정
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
// 3. 최종 점수 직접 수정 (권한 계정만)
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
    message: `${r.user.name} (${r.teamName})\n수정 전 최종 점수: ${before.value === null ? `계산 보류 (${before.reason})` : fmt(before.value)}\n수정 후 최종 점수: ${Number(f.score)}\n사유: ${f.reason.trim()}\n\n개인평가 점수·비율 반영 점수·보정값은 그대로 남습니다.`,
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

</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">부서 KPI 관리</h1>
      <div class="period-box">
        <label class="small text-muted" for="kpi-period">평가 회차</label>
        <select id="kpi-period" class="form-select form-select-sm w-auto" :value="db.period.id" @change="switchPeriod($event.target.value)"><option v-for="p in periodList()" :key="p.id" :value="p.id">{{ p.name }}</option></select>
        <span class="small text-muted">기준 기간</span> <strong class="small">{{ db.period.start }} ~ {{ db.period.end }}</strong>
      </div>
    </div>

    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'team' }" @click="tab = 'team'">팀별 KPI</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'ratio' }" @click="tab = 'ratio'; ratioDraft = clone(db.roleRatios)">직급별 비율</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'person' }" @click="tab = 'person'">개인별 보정</button></li>
      <li class="nav-item"><button class="nav-link" :class="{ active: tab === 'override' }" @click="tab = 'override'">최종 점수 직접 수정</button></li>
    </ul>

    <!-- ================= 1. 팀별 KPI ================= -->
    <div v-if="tab === 'team'" class="row g-3">
      <section class="col-lg-4">
        <div class="panel">
          <h2 class="panel-title mb-2">팀별 KPI 점수</h2>
          <div class="team-list" data-testid="kpi-team-list">
            <button v-for="t in db.teams" :key="t.id" type="button" class="team-item" :class="{ on: selTeam === t.id }" :data-team="t.name" @click="selTeam = t.id">
              <span>
                <strong>{{ t.name }}</strong><span v-if="t.kind === 'exec'" class="small text-muted"> (임원)</span>
                <span v-if="!listState(t).none" class="d-block small text-muted">{{ listState(t).sub }}</span>
              </span>
              <span v-if="listState(t).none" class="badge-none">지표 없음</span>
              <span v-else-if="listState(t).score.value !== null" class="score"><strong>{{ one(listState(t).score.value) }}</strong>점</span>
              <span v-else class="small text-warning-emphasis text-end">{{ listState(t).score.reason }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="col-lg-8">
        <div v-if="selTeam" class="panel p-0 detail">
          <div class="detail-head">
            <div class="text-center">
              <div class="h5 fw-bold mb-0">{{ teamName(selTeam) }}</div>
              <div class="small text-muted">{{ selData?.mode === 'direct' ? '직접 입력' : `지표 ${indicators.length}개` }}</div>
            </div>
            <div class="text-center">
              <div class="small text-muted">팀 KPI 점수</div>
              <div v-if="selScore.value !== null" class="big" data-testid="team-kpi-score">{{ one(selScore.value) }}<small>점</small></div>
              <div v-else class="small text-warning-emphasis" data-testid="team-kpi-score">{{ selScore.reason }}</div>
            </div>
            <div class="d-flex flex-column gap-1 align-items-center">
              <button v-if="selData?.mode !== 'direct'" class="btn btn-primary add-btn" @click="openIndicator()">+ 지표 추가</button>
              <button class="btn btn-link btn-sm p-0" @click="setMode(selData?.mode === 'direct' ? 'indicators' : 'direct')">{{ selData?.mode === 'direct' ? '지표로 계산하기' : '점수 직접 입력' }}</button>
            </div>
          </div>

          <div class="detail-body">
            <div v-if="selData?.mode === 'direct'" class="direct">
              <label class="form-label" for="kpi-direct">팀 KPI 점수 직접 입력</label>
              <div class="input-group" style="max-width: 200px">
                <input id="kpi-direct" type="number" class="form-control" :value="selData.direct ?? ''" placeholder="미입력" @change="setDirect($event.target.value)" />
                <span class="input-group-text">점</span>
              </div>
            </div>
            <template v-else>
              <div v-for="ind in indicators" :key="ind.id" class="ind" :data-indicator="ind.name">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <h3 class="ind-name">{{ ind.name }}</h3>
                  <span class="small text-muted fw-semibold">{{ ind.scope }}</span>
                  <button class="btn btn-outline-primary btn-sm ms-auto" @click="openIndicator(ind)">✎ 수정</button>
                  <button class="btn btn-outline-danger btn-sm" @click="removeIndicator(ind)">✕ 삭제</button>
                </div>
                <div class="cards">
                  <div class="kcard"><div class="k">목표</div><div class="v">{{ ind.target }}{{ ind.unit }}</div></div>
                  <div class="kcard"><div class="k">실적</div><div class="v">{{ ind.actual ?? '미입력' }}{{ ind.actual === null || ind.actual === undefined ? '' : ind.unit }}</div></div>
                  <div class="kcard"><div class="k">달성률</div><div class="v rate">{{ pct1(indicatorRate(ind)) }}</div></div>
                  <div class="kcard"><div class="k">가중치</div><div class="v">{{ ind.weight }}%</div></div>
                </div>
                <div class="small mt-2">
                  <span class="text-muted">{{ ind.direction === 'lower' ? '낮을수록 좋음 (목표 ÷ 실적)' : '높을수록 좋음 (실적 ÷ 목표)' }}</span>
                  <span class="ms-3">환산점수 <strong>{{ one(indicatorScore(ind)) }}</strong></span>
                </div>
              </div>
              <div v-if="!indicators.length" class="empty-hint">등록된 지표가 없습니다. '+ 지표 추가'로 지표를 만드세요.</div>
              <div v-else class="text-end small pt-2">가중치 합계 <strong :class="weightSum === 100 ? 'text-success' : 'text-danger'">{{ weightSum }}%</strong></div>
            </template>
          </div>
        </div>
        <p class="panel-sub mt-2 mb-0">팀 KPI 점수 = Σ(지표 환산점수 × 가중치). 환산점수는 달성률이며 최대 100점입니다. 이 점수는 직급별 비율에 따라 개인평가 점수에 반영됩니다.</p>
      </section>
    </div>

    <!-- ================= 직급별 비율 ================= -->
    <section v-if="tab === 'ratio'" class="panel p-0">
      <h2 class="panel-title px-3 pt-3 mb-2">직급별 부서 KPI 반영 비율</h2>
      <div class="table-responsive">
        <table class="table ratio-table mb-0" data-testid="ratio-table">
          <thead><tr><th class="text-center">직급</th><th class="text-center">반영 요소</th><th class="text-center">활성 합계</th></tr></thead>
          <tbody>
            <tr v-for="role in RATIO_ROLES" :key="role" :data-role="role">
              <td class="text-center fw-semibold">{{ roleLabel(role) }}</td>
              <td>
                <div class="elements">
                  <span v-for="e in ELEMENT_ORDER" :key="e" class="el">
                    <template v-if="ROLE_RATIO_ELEMENTS[role].includes(e)">
                      <input :id="`r-${role}-${e}-on`" v-model="ratioDraft[role][e].on" type="checkbox" class="form-check-input" />
                      <label :for="`r-${role}-${e}-on`" :title="RATIO_ELEMENTS[e].desc">{{ RATIO_ELEMENTS[e].label }}</label>
                      <input
                        :id="`r-${role}-${e}`" type="number" min="0" max="100" class="form-control form-control-sm pct"
                        :value="ratioDraft[role][e].value ?? ''" :disabled="!ratioDraft[role][e].on" :aria-label="`${roleLabel(role)} ${RATIO_ELEMENTS[e].label} 비율`"
                        @input="setRatioValue(role, e, $event.target.value)"
                      />%
                    </template>
                  </span>
                </div>
              </td>
              <td class="text-center" :class="activeSum(role) === 100 ? 'text-success' : 'text-danger fw-bold'" :data-sum="role">{{ activeSum(role) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="d-flex align-items-center p-3 border-top">
        <span class="small text-muted me-auto">개인평가 = 1·2·3차 평가 단계 점수를 단계 가중치로 합친 점수 (팀장의 팀원평가, 임원의 상향평가 포함)</span>
        <button class="btn btn-primary" :disabled="!ratioDirty || !ratioValid" @click="saveRatios">저장</button>
      </div>
    </section>

    <!-- ================= 2. 개인별 보정 ================= -->
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
              <th>이름</th><th>부서</th><th class="text-end">개인평가</th><th class="text-end">KPI 반영 후 (보정 전)</th>
              <th class="text-end">개인 보정</th><th class="text-end">보정 적용 결과</th><th>사유</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in personRows" :key="r.user.id" :data-user="r.user.name">
              <td class="fw-semibold">{{ r.user.name }}</td>
              <td>{{ r.teamName }}</td>
              <td class="text-end num" :class="{ muted: r.weighted.value === null }">{{ cell(r.weighted) }}</td>
              <td class="text-end num" :class="{ muted: r.kpiAfter.value === null }">{{ cell(r.kpiAfter) }}</td>
              <td class="text-end num fw-semibold">{{ sign(r.corr.person) }}</td>
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
      <p class="panel-sub mt-2 mb-0">개인별 보정값은 그 직원에게만 연결되며, 부서 KPI 반영 점수에 더해(±) 바로 반영됩니다. 비워 두면 '미입력'이며 0과 다릅니다.</p>
    </section>

    <!-- ================= 3. 최종 점수 직접 수정 ================= -->
    <template v-if="tab === 'override'">
      <section class="panel mb-3">
        <h2 class="panel-title mb-1">최종 점수 직접 수정</h2>
        <p class="panel-sub">관리자가 최종 결과를 검토한 뒤 최종 점수를 직접 정합니다. 보정과는 별개이며, 개인평가 점수·KPI 결과·보정값을 덮어쓰지 않습니다.</p>
        <div class="alert alert-secondary small py-2">허용 범위와 승인 절차는 정해지지 않았습니다. 범위를 제한하지 않고, 승인 단계 없이 저장 즉시 반영됩니다.</div>
        <div v-if="!canOverride()" class="alert alert-warning small py-2" data-testid="no-permission">
          현재 계정({{ me?.name }})에는 최종 점수 직접 수정 권한이 없습니다. 권한이 있는 관리자 계정으로 로그인해야 수정할 수 있습니다. 아래 수정 내역은 볼 수 있습니다.
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

    <!-- 팀 KPI 지표 추가·수정 -->
    <AppModal v-if="kForm" :title="kForm.id ? '지표 수정' : `${teamName(selTeam)} 지표 추가`" @close="kForm = null">
      <div class="row g-3">
        <div class="col-8">
          <label class="form-label" for="k-name">지표명 <span class="text-danger">*</span></label>
          <input id="k-name" v-model="kForm.name" class="form-control" placeholder="예: 과제 달성률" />
        </div>
        <div class="col-4">
          <label class="form-label" for="k-scope">적용 직무</label>
          <input id="k-scope" v-model="kForm.scope" class="form-control" />
        </div>
        <div class="col-4">
          <label class="form-label" for="k-target">목표 <span class="text-danger">*</span></label>
          <input id="k-target" v-model="kForm.target" type="number" step="any" class="form-control" />
        </div>
        <div class="col-4">
          <label class="form-label" for="k-actual">실적 <span class="text-danger">*</span></label>
          <input id="k-actual" v-model="kForm.actual" type="number" step="any" class="form-control" />
        </div>
        <div class="col-4">
          <label class="form-label" for="k-unit">단위</label>
          <select id="k-unit" v-model="kForm.unit" class="form-select">
            <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
          </select>
        </div>
        <div class="col-8">
          <label class="form-label" for="k-direction">평가 방향</label>
          <select id="k-direction" v-model="kForm.direction" class="form-select">
            <option value="higher">높을수록 좋음 (실적 ÷ 목표)</option>
            <option value="lower">낮을수록 좋음 (목표 ÷ 실적)</option>
          </select>
        </div>
        <div class="col-4">
          <label class="form-label" for="k-weight">가중치 <span class="text-danger">*</span></label>
          <div class="input-group">
            <input id="k-weight" v-model="kForm.weight" type="number" min="0" max="100" class="form-control" />
            <span class="input-group-text">%</span>
          </div>
        </div>
      </div>
      <p class="small text-muted mt-3 mb-0">달성률이 100%를 넘어도 환산점수는 100점까지만 반영합니다. 팀의 지표 가중치 합계가 100%여야 팀 KPI 점수가 계산됩니다.</p>
      <div v-if="kError" class="text-danger small mt-2" role="alert">{{ kError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="kForm = null">취소</button>
        <button class="btn btn-primary" @click="saveIndicator">저장</button>
      </template>
    </AppModal>

    <!-- 개인별 보정 입력 -->
    <AppModal v-if="pForm" :title="`${pRow.user.name} 개인별 보정${pForm.mode === 'reset' ? ' 초기화' : ''}`" @close="pForm = null">
      <table class="table table-sm small mb-3">
        <tbody>
          <tr><th>개인평가 점수</th><td colspan="3">{{ cell(pRow.weighted) }}</td></tr>
          <tr><th>KPI 반영 후 (보정 전)</th><td colspan="3">{{ cell(pRow.kpiAfter) }}</td></tr>
          <tr><th>현재 개인 보정</th><td>{{ sign(pRow.corr.person) }}</td><th>보정 적용 결과</th><td>{{ cell(pRow.corrected) }}</td></tr>
        </tbody>
      </table>
      <template v-if="pForm.mode === 'save'">
        <label class="form-label" for="p-value">개인별 보정값 (점, ±)</label>
        <input id="p-value" v-model="pForm.value" type="number" step="0.5" class="form-control mb-2" placeholder="예: 1.5 또는 -2" />
        <div class="small mb-2">보정 적용 후 예상: <strong class="expected">{{ pExpected === null ? '-' : fmt(pExpected) }}</strong></div>
      </template>
      <p v-else class="small">개인별 보정값({{ sign(pRow.corr.person) }})을 지워 '미입력' 상태로 되돌립니다. </p>
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
.period-box { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--card-border); border-radius: 12px; padding: 8px 14px; flex-wrap: wrap; }
.team-list { display: flex; flex-direction: column; gap: 4px; }
.team-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; text-align: left; border: 1px solid transparent; background: none; border-radius: 10px; padding: 10px 12px; }
.team-item:hover { background: #f4f7fc; }
.team-item.on { background: #e3f1f8; border-color: #a9d3e6; }
.team-item .score strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.badge-none { background: #fde8e8; color: #b42318; border: 1px solid #f5b5b5; border-radius: 999px; padding: 2px 10px; font-size: 0.85rem; white-space: nowrap; }
.detail { overflow: hidden; }
.detail-head { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; gap: 12px; padding: 18px 20px; background: #f4f6fa; border-bottom: 1px solid var(--card-border); }
.big { font-size: 2rem; font-weight: 800; color: var(--navy); font-variant-numeric: tabular-nums; line-height: 1.1; }
.big small { font-size: 0.85rem; font-weight: 600; margin-left: 2px; }
.add-btn { background: linear-gradient(135deg, #1f5fae, #1e2054); border: 0; font-weight: 700; padding: 8px 18px; }
.detail-body { padding: 16px 20px; }
.ind { padding: 12px 0 16px; border-bottom: 1px solid var(--card-border); }
.ind-name { font-size: 1.05rem; font-weight: 700; margin: 0; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 700px) { .cards { grid-template-columns: 1fr 1fr; } .detail-head { grid-template-columns: 1fr; } }
.kcard { background: #f3f4f7; border-radius: 10px; padding: 10px 14px; }
.kcard .k { color: #4a4f63; font-size: 0.9rem; }
.kcard .v { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.kcard .v.rate { color: #2a8fa0; }
.ratio-table th { background: #f1f4f9; }
.ratio-table td { vertical-align: middle; }
.elements { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.el { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.el .pct { width: 70px; text-align: center; }
.override-form { display: grid; grid-template-columns: 2fr 1fr 3fr auto; gap: 10px; }
@media (max-width: 900px) { .period-box { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--card-border); border-radius: 12px; padding: 8px 14px; flex-wrap: wrap; }
.team-list { display: flex; flex-direction: column; gap: 4px; }
.team-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; text-align: left; border: 1px solid transparent; background: none; border-radius: 10px; padding: 10px 12px; }
.team-item:hover { background: #f4f7fc; }
.team-item.on { background: #e3f1f8; border-color: #a9d3e6; }
.team-item .score strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.badge-none { background: #fde8e8; color: #b42318; border: 1px solid #f5b5b5; border-radius: 999px; padding: 2px 10px; font-size: 0.85rem; white-space: nowrap; }
.detail { overflow: hidden; }
.detail-head { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; gap: 12px; padding: 18px 20px; background: #f4f6fa; border-bottom: 1px solid var(--card-border); }
.big { font-size: 2rem; font-weight: 800; color: var(--navy); font-variant-numeric: tabular-nums; line-height: 1.1; }
.big small { font-size: 0.85rem; font-weight: 600; margin-left: 2px; }
.add-btn { background: linear-gradient(135deg, #1f5fae, #1e2054); border: 0; font-weight: 700; padding: 8px 18px; }
.detail-body { padding: 16px 20px; }
.ind { padding: 12px 0 16px; border-bottom: 1px solid var(--card-border); }
.ind-name { font-size: 1.05rem; font-weight: 700; margin: 0; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 700px) { .cards { grid-template-columns: 1fr 1fr; } .detail-head { grid-template-columns: 1fr; } }
.kcard { background: #f3f4f7; border-radius: 10px; padding: 10px 14px; }
.kcard .k { color: #4a4f63; font-size: 0.9rem; }
.kcard .v { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.kcard .v.rate { color: #2a8fa0; }
.ratio-table th { background: #f1f4f9; }
.ratio-table td { vertical-align: middle; }
.elements { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.el { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.el .pct { width: 70px; text-align: center; }
.override-form { grid-template-columns: 1fr 1fr; } .reason-col { grid-column: 1 / -1; } }
</style>
