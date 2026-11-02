<script setup>
import { computed, ref } from 'vue'
import { db, store, toast, confirmDialog, teamName, membersOf, leadersOf } from '../store'
import { GRADES, POLICY_OPTIONS, stageLabel, roleLabel, localDate, localDateTime } from '../constants'
import { computeResults, gradeCheck, snapshotOf, snapshotDiffers, fmt, gradeRuleText, policyName } from '../scoring'
import { toCsvLine } from '../csv'
import AppModal from '../components/AppModal.vue'
import SortableList from '../components/SortableList.vue'
import FinalReport from '../components/FinalReport.vue'
import InterviewReport from '../components/InterviewReport.vue'

const results = computed(() => computeResults())

// 값 대신 상태를 보여줄 때 미완료 / 미설정 / 미확정을 구분한다
function stateOf(v) {
  if (v.value !== null) return null
  const r = v.reason || ''
  if (/미완료|배정|미응답/.test(r)) return '미완료'
  if (/미설정|미입력|필요\)|합계/.test(r)) return '미설정'
  return '미확정'
}
const STATE_CLS = { 미완료: 'st-incomplete', 미설정: 'st-unset', 미확정: 'st-pending' }

// ---- 1. 백분위·등급 기준 ----
const ratioDraft = ref({ ...db.settings.grade.ratios })
const ratioSum = computed(() => GRADES.reduce((a, g) => a + (typeof ratioDraft.value[g] === 'number' ? ratioDraft.value[g] : 0), 0))
const ratioErrors = computed(() => {
  const out = []
  if (GRADES.some((g) => typeof ratioDraft.value[g] !== 'number')) out.push('A~D 비율을 모두 입력해 주세요.')
  else if (GRADES.some((g) => ratioDraft.value[g] < 0)) out.push('비율은 0 이상이어야 합니다.')
  else if (Math.abs(ratioSum.value - 100) > 0.001) out.push(`비율 합계가 ${ratioSum.value}%입니다. 100%가 되어야 합니다.`)
  return out
})
function setRatio(g, v) { ratioDraft.value[g] = v === '' ? null : Number(v) }
function saveRatios() {
  if (ratioErrors.value.length) return toast(ratioErrors.value[0], 'warning')
  db.settings.grade.ratios = { ...ratioDraft.value }
  toast('등급 비율을 저장했습니다.')
}
function setGradePolicy(key, v) {
  db.settings.grade[key] = v || null
  toast('등급 산출 규칙을 저장했습니다.')
}
function setPolicy(key, v) {
  db.settings[key] = v || null
  toast('백분위 환산 규칙을 저장했습니다.')
}
const gradeCounts = computed(() => {
  const graded = results.value.rows.filter((r) => r.grade?.value)
  return GRADES.map((g) => {
    const n = graded.filter((r) => r.grade.value === g).length
    return { g, n, pct: graded.length ? Math.round((n / graded.length) * 1000) / 10 : 0 }
  })
})
const gradedTotal = computed(() => results.value.rows.filter((r) => r.grade?.value).length)

// ---- 2. 결과 표 ----
const q = ref('')
const teamF = ref('all')
const statusF = ref('all')
const gradeF = ref('all')
const rows = computed(() => results.value.rows.filter((r) =>
  (!q.value.trim() || r.user.name.includes(q.value.trim()))
  && (teamF.value === 'all' || r.user.teamId === teamF.value)
  && (statusF.value === 'all' || r.status === statusF.value)
  && (gradeF.value === 'all' || (gradeF.value === 'none' ? !r.grade.value : r.grade.value === gradeF.value)),
))
const checked = ref([])
const allChecked = computed({
  get: () => rows.value.length > 0 && rows.value.every((r) => checked.value.includes(r.user.id)),
  set: (v) => { checked.value = v ? rows.value.map((r) => r.user.id) : [] },
})

// ---- 3. 최종 확정 ----
const canFinalize = (r) => (r.status === '완료' || r.status === '최종 확정')
  && ['weighted', 'percentile', 'kpiAfter', 'final', 'grade'].every((k) => r[k].value !== null)
function finalizeRow(r) {
  const prev = db.finalized[r.user.id]
  db.finalized[r.user.id] = {
    at: new Date().toISOString(),
    values: snapshotOf(r),
    history: prev ? [...(prev.history ?? []), { at: prev.at, values: prev.values }] : [],
  }
}
async function finalizeOne(r) {
  const re = !!db.finalized[r.user.id]
  const ok = await confirmDialog({
    title: re ? '다시 확정' : '최종 확정',
    message: re ? `${r.user.name}님의 결과를 현재 계산값으로 다시 확정합니다.\n이전 확정값은 이력으로 남습니다.` : `${r.user.name}님의 결과를 최종 확정합니다.\n이후 설정이 바뀌어도 확정값은 그대로 남습니다.`,
    okText: re ? '다시 확정' : '확정',
  })
  if (!ok) return
  finalizeRow(r)
  toast(`${r.user.name}님의 결과를 ${re ? '다시 ' : ''}확정했습니다.`)
}
async function finalizeChecked() {
  const list = results.value.rows.filter((r) => checked.value.includes(r.user.id) && canFinalize(r) && (!db.finalized[r.user.id] || snapshotDiffers(r)))
  if (!list.length) return toast('선택한 인원 중 확정할 수 있는 사람이 없습니다. 평가 완료와 모든 계산 규칙 설정이 필요합니다.', 'warning')
  const ok = await confirmDialog({ title: '선택 인원 최종 확정', message: `${list.length}명의 결과를 확정합니다. (완료되지 않았거나 계산되지 않은 인원은 제외)`, okText: '확정' })
  if (!ok) return
  list.forEach(finalizeRow)
  toast(`${list.length}명의 결과를 확정했습니다.`)
}
async function unfinalize(r) {
  const ok = await confirmDialog({ title: '확정 취소', message: `${r.user.name}님의 최종 확정을 취소합니다. 취소한 확정값은 이력에 남지 않으니 필요하면 먼저 보고서를 출력하세요.`, okText: '확정 취소', danger: true })
  if (!ok) return
  delete db.finalized[r.user.id]
  toast('최종 확정을 취소했습니다.', 'warning')
}

// ---- 4. 상세 ----
const detailId = ref(null)
const detail = computed(() => (detailId.value ? results.value.byId[detailId.value] : null))
const val = (v) => (v.value === null ? `${stateOf(v)} · ${v.reason}` : fmt(v.value))
const signed = (v) => (v === null || v === undefined ? '미입력' : `${v > 0 ? '+' : ''}${v}`)
// 1차·2차·3차 단계 (팀장의 2차는 팀원평가)
const stageAt = (r, n) => r.stages.find((s) => (n === 1 ? s.stage === 'self' : n === 2 ? ['leader', 'members'].includes(s.stage) : s.stage === 'exec'))
// 최종 점수가 보류된 이유별 인원 (평가 미완료와 정책 미설정을 나눠 보여준다)
const blockedSummary = computed(() => {
  const map = {}
  results.value.rows.filter((r) => r.final.value === null).forEach((r) => {
    const key = r.weighted.value === null ? '평가 미완료 또는 개인평가 점수 계산 보류' : r.final.reason
    map[key] = (map[key] ?? 0) + 1
  })
  return Object.entries(map).sort((a, b) => b[1] - a[1])
})
const STAGE_MARK = { done: '완료', progress: '진행 중', todo: '시작 전', unassigned: '배정 필요' }

// ---- 5. 보고서 ----
const finalOpen = ref(false)
const finalIds = computed(() => checked.value.filter((id) => db.finalized[id]))
const finalExcluded = computed(() => checked.value.filter((id) => !db.finalized[id]).map((id) => results.value.byId[id]?.user.name).filter(Boolean))
function openFinal() {
  if (!checked.value.length) return toast('보고서를 만들 직원을 표에서 체크해 주세요.', 'warning')
  finalOpen.value = true
}
function printFinal() {
  if (!finalIds.value.length) return toast('최종 확정된 직원이 없어 출력할 수 없습니다.', 'warning')
  store.printJob = { kind: 'final', userIds: [...finalIds.value] }
}

const interviewOpen = ref(false)
const ivTeam = ref(null)
const ivChecked = ref([])
const ivTeams = computed(() => db.teams.filter((t) => leadersOf(t.id).length && membersOf(t.id).length))
const ivMembers = computed(() => (ivTeam.value ? membersOf(ivTeam.value).filter((m) => results.value.byId[m.id]) : []))
const ivNotesFor = ref(null)
function openInterview() {
  ivTeam.value = ivTeams.value[0]?.id ?? null
  ivChecked.value = []
  ivNotesFor.value = null
  interviewOpen.value = true
}
function toggleNotes(id) {
  if (!db.interviewNotes[id]) db.interviewNotes[id] = { strengths: '', improvements: '', checkpoints: '' }
  ivNotesFor.value = ivNotesFor.value === id ? null : id
}
function printInterview() {
  if (!ivChecked.value.length) return toast('면담 보고서를 만들 팀원을 선택해 주세요.', 'warning')
  store.printJob = { kind: 'interview', userIds: [...ivChecked.value] }
}

// ---- 6. 결과 요약 CSV (구성 순서 조정) ----
const IS_SHARED = !!import.meta.env.VITE_SHARED
const summaryOpen = ref(false)
const summaryParts = ref([
  { key: 'person', label: '개인별 결과', on: true },
  { key: 'team', label: '부서별 평균', on: true },
  { key: 'grade', label: '등급 분포', on: true },
  { key: 'progress', label: '평가 완료 현황', on: true },
])
const summarySections = computed(() => {
  const all = results.value.rows
  const avg = (list, k) => {
    const v = list.map((r) => r[k].value).filter((x) => x !== null)
    return v.length ? fmt(v.reduce((a, b) => a + b, 0) / v.length) : '-'
  }
  const build = {
    person: () => ({ head: ['이름', '부서', '직급', '상태', '개인평가 점수', '백분위', 'KPI 반영 후', '부서 보정', '개인 보정', '보정 적용 후', '직접 수정', '최종 점수', '등급'], rows: all.map((r) => [r.user.name, r.teamName, r.user.position, r.status, val(r.weighted), val(r.percentile), val(r.kpiAfter), signed(r.corr.dept), signed(r.corr.person), val(r.corrected), r.override ? r.override.score : '-', val(r.final), r.grade.value ?? stateOf(r.grade)]) }),
    team: () => ({ head: ['부서', '인원', '가중치 적용 평균', 'KPI 적용 후 평균', '최종 점수 평균'], rows: db.teams.map((t) => { const l = all.filter((r) => r.user.teamId === t.id); return l.length ? [t.name, l.length, avg(l, 'weighted'), avg(l, 'kpiAfter'), avg(l, 'final')] : null }).filter(Boolean) }),
    grade: () => ({ head: ['등급', '인원', '비율(%)'], rows: gradeCounts.value.map((g) => [g.g, g.n, g.pct]) }),
    progress: () => ({ head: ['상태', '인원'], rows: ['시작 전', '진행 중', '완료', '최종 확정'].map((s) => [s, all.filter((r) => r.status === s).length]) }),
  }
  return summaryParts.value.filter((p) => p.on).map((p) => ({ title: p.label, ...build[p.key]() }))
})
function exportSummary() {
  if (!summarySections.value.length) return toast('내보낼 항목을 하나 이상 선택해 주세요.', 'warning')
  const lines = []
  summarySections.value.forEach((s) => lines.push(toCsvLine([s.title]), toCsvLine(s.head), ...s.rows.map(toCsvLine), ''))
  if (IS_SHARED) {
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('CSV 내용을 클립보드에 복사했습니다.'), () => toast('이 환경에서는 복사할 수 없습니다.', 'warning'))
    return
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'rollent_평가결과_요약.csv'
  a.click()
  URL.revokeObjectURL(a.href)
  toast('결과 요약 CSV를 내려받았습니다.')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">평가 결과</h1>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-outline-primary btn-sm" @click="summaryOpen = true">결과 요약 CSV</button>
        <button class="btn btn-outline-primary btn-sm" @click="openInterview">팀장 면담용 보고서</button>
        <button class="btn btn-primary btn-sm" @click="openFinal">개인별 최종 보고서 ({{ checked.length }})</button>
      </div>
    </div>

    <!-- 기준 설정 -->
    <div class="row g-3 mb-3">
      <section class="col-lg-5">
        <div class="panel h-100">
          <h2 class="panel-title mb-1">백분위</h2>
          <p class="panel-sub">개인평가 점수(가중치 적용 점수)를 기준으로 따로 계산하며, KPI·보정 결과와 섞지 않습니다. 네 가지가 모두 정해져야 계산합니다.</p>
          <label class="form-label small" for="p-method">산출 공식</label>
          <select id="p-method" class="form-select form-select-sm mb-1" :value="db.settings.percentileMethod ?? ''" @change="setPolicy('percentileMethod', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.percentileMethod" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <div class="small text-muted mb-2">{{ POLICY_OPTIONS.percentileMethod.find((o) => o.key === db.settings.percentileMethod)?.desc }}</div>
          <label class="form-label small" for="p-group">비교 집단</label>
          <select id="p-group" class="form-select form-select-sm mb-2" :value="db.settings.percentileGroup ?? ''" @change="setPolicy('percentileGroup', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.percentileGroup" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <label class="form-label small" for="p-ties">동점자 처리</label>
          <select id="p-ties" class="form-select form-select-sm mb-2" :value="db.settings.percentileTies ?? ''" @change="setPolicy('percentileTies', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.percentileTies" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <label class="form-label small" for="p-excl">비교 대상 제외 기준 (미완료자 등)</label>
          <select id="p-excl" class="form-select form-select-sm" :value="db.settings.percentileExclusion ?? ''" @change="setPolicy('percentileExclusion', $event.target.value)">
            <option value="">미설정</option>
            <option v-for="o in POLICY_OPTIONS.percentileExclusion" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
          <div class="small text-muted mt-1">{{ POLICY_OPTIONS.percentileExclusion.find((o) => o.key === db.settings.percentileExclusion)?.desc }}</div>
        </div>
      </section>
      <section class="col-lg-7">
        <div class="panel h-100">
          <h2 class="panel-title mb-1">최종 등급 기준</h2>
          <p class="panel-sub">최종 점수(보정·직접 수정 반영 후) 순위에 비율을 적용합니다. 비율·반올림·동점자 처리는 정해지지 않아 처음에는 비어 있습니다.</p>
          <div class="ratios">
            <div v-for="g in GRADES" :key="g">
              <label class="form-label small" :for="'r-' + g">{{ g }}등급</label>
              <div class="input-group input-group-sm">
                <input :id="'r-' + g" type="number" min="0" max="100" class="form-control" :value="ratioDraft[g] ?? ''" placeholder="미설정" @input="setRatio(g, $event.target.value)" />
                <span class="input-group-text">%</span>
              </div>
            </div>
            <div class="align-self-end">
              <button class="btn btn-primary btn-sm" @click="saveRatios">비율 저장</button>
            </div>
          </div>
          <div class="small mt-1">합계 <strong :class="Math.abs(ratioSum - 100) < 0.001 ? 'text-success' : 'text-danger'">{{ ratioSum }}%</strong>
            <span v-for="e in ratioErrors" :key="e" class="text-danger ms-2">{{ e }}</span>
          </div>
          <div class="row g-2 mt-1">
            <div class="col-6">
              <label class="form-label small" for="g-round">비율 → 인원 계산</label>
              <select id="g-round" class="form-select form-select-sm" :value="db.settings.grade.rounding ?? ''" @change="setGradePolicy('rounding', $event.target.value)">
                <option value="">미설정</option>
                <option v-for="o in POLICY_OPTIONS.gradeRounding" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
            </div>
            <div class="col-6">
              <label class="form-label small" for="g-ties">동점자 처리</label>
              <select id="g-ties" class="form-select form-select-sm" :value="db.settings.grade.ties ?? ''" @change="setGradePolicy('ties', $event.target.value)">
                <option value="">미설정</option>
                <option v-for="o in POLICY_OPTIONS.gradeTies" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
            </div>
          </div>
          <div class="grade-dist mt-2" data-testid="grade-dist">
            <span v-if="!gradeCheck().valid" class="badge text-bg-secondary">{{ gradeCheck().reason }}</span>
            <template v-else>
              <span v-for="g in gradeCounts" :key="g.g" class="me-3"><strong>{{ g.g }}</strong> {{ g.n }}명 ({{ g.pct }}%)</span>
              <span class="text-muted small">등급 산출 {{ gradedTotal }}명 기준</span>
            </template>
          </div>
        </div>
      </section>
    </div>

    <!-- 결과 표 -->
    <section class="panel">
      <div class="filters mb-2">
        <input v-model="q" class="form-control form-control-sm" placeholder="이름 검색" aria-label="이름 검색" />
        <select v-model="teamF" class="form-select form-select-sm" aria-label="부서 필터">
          <option value="all">전체 부서</option>
          <option v-for="t in db.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <select v-model="statusF" class="form-select form-select-sm" aria-label="상태 필터">
          <option value="all">전체 상태</option>
          <option v-for="s in ['시작 전', '진행 중', '완료', '최종 확정']" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="gradeF" class="form-select form-select-sm" aria-label="등급 필터">
          <option value="all">전체 등급</option>
          <option v-for="g in GRADES" :key="g" :value="g">{{ g }}등급</option>
          <option value="none">등급 없음</option>
        </select>
      </div>
      <div class="mode-bar">
        <span>{{ checked.length }}명 선택</span>
        <button class="btn btn-outline-primary btn-sm ms-auto" :disabled="!checked.length" @click="finalizeChecked">선택 인원 최종 확정</button>
      </div>
      <div v-if="blockedSummary.length" class="alert alert-warning small py-2" data-testid="blocked-summary">
        <strong>최종 점수 계산 보류</strong>
        <span v-for="[reason, n] in blockedSummary" :key="reason" class="ms-3">{{ reason }}: {{ n }}명</span>
        <div class="text-muted mt-1">보류된 직원의 최종 점수는 확정된 값처럼 표시하지 않습니다. 정책은 '평가 관리 › 정책 설정 현황'에서 한눈에 볼 수 있습니다.</div>
      </div>
      <div class="legend small mb-2">
        <span class="st st-incomplete">미완료</span> 평가가 끝나지 않음 ·
        <span class="st st-unset">미설정</span> 관리자 설정(가중치·규칙·KPI)이 비어 있음 ·
        <span class="st st-pending">미확정</span> 앞 단계 값이 없어 계산 불가. 칸에 마우스를 올리면 이유가 보입니다.
      </div>
      <div class="table-responsive scroll">
        <table class="table table-clean table-sm result-table" data-testid="result-table">
          <thead>
            <tr>
              <th><input v-model="allChecked" class="form-check-input" type="checkbox" aria-label="전체 선택" /></th>
              <th>이름</th><th>부서</th><th class="text-center">1차</th><th class="text-center">2차</th><th class="text-center">3차</th>
              <th class="text-end">개인평가 점수</th><th class="text-end">백분위</th><th class="text-end">KPI 반영 후</th>
              <th class="text-end">부서 보정</th><th class="text-end">개인 보정</th><th class="text-end">보정 적용 후</th><th class="text-end">직접 수정</th>
              <th class="text-end final-col">최종 점수</th><th>등급</th><th>확정</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.user.id" :data-user="r.user.name" :class="{ active: checked.includes(r.user.id) }">
              <td><input v-model="checked" class="form-check-input" type="checkbox" :value="r.user.id" :aria-label="r.user.name + ' 선택'" /></td>
              <td><button class="edit-link" @click="detailId = r.user.id">{{ r.user.name }}</button></td>
              <td>{{ r.teamName }}</td>
              <td v-for="n in 3" :key="n" class="text-center" :title="stageAt(r, n)?.score100.reason || ''">
                <span v-if="!stageAt(r, n)" class="text-muted small">해당 없음</span>
                <span v-else class="done-mark" :class="stageAt(r, n).status">{{ STAGE_MARK[stageAt(r, n).status] }}</span>
              </td>
              <td v-for="k in ['weighted', 'percentile', 'kpiAfter']" :key="k" class="text-end num" :title="r[k].reason || ''">
                <template v-if="r[k].value !== null">{{ fmt(r[k].value) }}</template>
                <span v-else class="st" :class="STATE_CLS[stateOf(r[k])]">{{ stateOf(r[k]) }}</span>
              </td>
              <td class="text-end num">{{ signed(r.corr.dept) }}</td>
              <td class="text-end num" :title="r.corr.personReason">{{ signed(r.corr.person) }}</td>
              <td class="text-end num" :title="r.corrected.reason || ''">
                <template v-if="r.corrected.value !== null">{{ fmt(r.corrected.value) }}</template>
                <span v-else class="st" :class="STATE_CLS[stateOf(r.corrected)]">{{ stateOf(r.corrected) }}</span>
              </td>
              <td class="text-end num">
                <span v-if="r.override" class="badge text-bg-danger" :title="`사유: ${r.override.reason} (${r.override.by})`">{{ fmt(r.override.score) }}</span>
                <span v-else class="text-muted">-</span>
              </td>
              <td class="text-end num final-col" :title="r.final.reason || ''">
                <strong v-if="r.final.value !== null">{{ fmt(r.final.value) }}</strong>
                <span v-else class="st" :class="STATE_CLS[stateOf(r.final)]">{{ stateOf(r.final) }}</span>
              </td>
              <td :title="r.grade.reason || ''">
                <strong v-if="r.grade.value" class="grade">{{ r.grade.value }}</strong>
                <span v-else class="st" :class="STATE_CLS[stateOf(r.grade)]">{{ stateOf(r.grade) }}</span>
              </td>
              <td class="small text-nowrap">
                <span v-if="db.finalized[r.user.id]" class="text-primary">확정</span>
                <span v-else class="text-muted">미확정</span>
                <span v-if="db.finalized[r.user.id] && snapshotDiffers(r)" class="badge text-bg-warning ms-1" title="확정 후 설정·보정·응답이 바뀌어 현재 계산값이 다릅니다">재계산 다름</span>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="16" class="empty-hint">조건에 맞는 결과가 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">결과 산출 대상은 활성 평가 대상자 중 사원·팀장입니다. 이름을 누르면 점수가 어떤 과정을 거쳐 나왔는지 볼 수 있습니다.</p>
    </section>

    <!-- 상세 -->
    <AppModal v-if="detail" :title="`${detail.user.name} 평가 결과 상세`" size="lg" @close="detailId = null">
      <p class="small text-muted">{{ detail.teamName }} · {{ detail.user.position }} · {{ roleLabel(detail.user.role) }} · {{ db.period.name }} ({{ db.period.start }} ~ {{ db.period.end }}) · {{ detail.status }}</p>
      <h6 class="fw-bold">1. 평가 단계별 점수</h6>
      <table class="table table-sm table-clean small">
        <thead><tr><th>단계</th><th>상태</th><th>항목별 점수</th><th class="text-end">원점수 / 배점</th><th class="text-end">100점 기준</th><th class="text-end">가중치</th></tr></thead>
        <tbody>
          <tr v-for="s in detail.stages" :key="s.stage">
            <td>{{ stageLabel(s.stage) }}</td>
            <td>{{ { todo: '시작 전', progress: '진행 중', done: '완료', unassigned: '배정 필요' }[s.status] }}</td>
            <td><div v-for="i in s.items" :key="i.item.id">{{ i.item.name }}: {{ i.score.value !== null ? `${fmt(i.score.value)} / ${i.item.points}` : i.score.reason }}</div></td>
            <td class="text-end">{{ s.raw.value !== null ? `${fmt(s.raw.value)} / ${s.max}` : s.raw.reason }}</td>
            <td class="text-end">{{ val(s.score100) }}</td>
            <td class="text-end">{{ detail.weights.find((w) => w.stage === s.stage)?.weight ?? '미설정' }}{{ typeof detail.weights.find((w) => w.stage === s.stage)?.weight === 'number' ? '%' : '' }}</td>
          </tr>
        </tbody>
      </table>
      <h6 class="fw-bold">2. 산출 과정</h6>
      <table class="table table-sm table-clean small pipeline">
        <tbody>
          <tr><th>개인평가 점수</th><td>{{ val(detail.weighted) }}</td><td class="text-muted">Σ 단계 점수 × 가중치</td></tr>
          <tr><th>백분위</th><td>{{ val(detail.percentile) }}</td><td class="text-muted">{{ ['percentileMethod', 'percentileGroup', 'percentileTies', 'percentileExclusion'].map((k) => policyName(k, db.settings[k])).join(' / ') }}</td></tr>
          <tr><th>부서 KPI 적용 전</th><td>{{ val(detail.kpiBefore) }}</td><td class="text-muted">기준: {{ POLICY_OPTIONS.kpiBase.find((o) => o.key === db.settings.kpiBase)?.label ?? '미설정' }}</td></tr>
          <tr><th>부서 KPI 점수</th><td>{{ detail.kpiScore ?? '-' }}</td><td class="text-muted">{{ teamName(detail.user.teamId) }}</td></tr>
          <tr><th>부서 KPI 적용 후</th><td>{{ val(detail.kpiAfter) }}</td><td class="text-muted">{{ POLICY_OPTIONS.kpiMethod.find((o) => o.key === db.settings.kpiMethod)?.label ?? '미설정' }}</td></tr>
          <tr><th>부서별 보정값</th><td>{{ signed(detail.corr.dept) }}</td><td class="text-muted">{{ detail.teamName }}{{ detail.corr.deptReason ? ` · 사유: ${detail.corr.deptReason}` : '' }}</td></tr>
          <tr><th>개인별 보정값</th><td>{{ signed(detail.corr.person) }}</td><td class="text-muted">{{ detail.corr.personReason ? `사유: ${detail.corr.personReason}` : '-' }}</td></tr>
          <tr><th>보정 적용 후</th><td>{{ val(detail.corrected) }}</td><td class="text-muted">규칙: {{ policyName('correctionRule', db.settings.correctionRule) }}</td></tr>
          <tr><th>최종 점수 직접 수정</th><td>{{ detail.override ? `${detail.override.before === null ? '계산 보류' : fmt(detail.override.before)} → ${fmt(detail.override.score)}` : '없음' }}</td><td class="text-muted">{{ detail.override ? `${detail.override.reason} · ${detail.override.by} · ${localDateTime(detail.override.at)}` : '' }}</td></tr>
          <tr class="final-row"><th>최종 점수</th><td><strong>{{ val(detail.final) }}</strong></td><td class="text-muted">{{ detail.override ? '직접 수정값' : '보정 적용 후 점수' }}</td></tr>
          <tr><th>최종 등급</th><td><strong>{{ detail.grade.value ?? val(detail.grade) }}</strong></td><td class="text-muted">{{ gradeRuleText() }}</td></tr>
        </tbody>
      </table>
      <div v-if="db.finalized[detail.user.id]" class="alert alert-info small py-2">
        {{ localDateTime(db.finalized[detail.user.id].at) }}에 최종 확정됨 · 확정 점수 {{ fmt(db.finalized[detail.user.id].values.final) }} · 등급 {{ db.finalized[detail.user.id].values.grade }}
        <template v-if="snapshotDiffers(detail)"><br /><strong>확정 이후 계산값이 달라졌습니다.</strong> 확정값은 그대로이며, 필요하면 다시 확정하세요.</template>
        <div v-if="db.finalized[detail.user.id].history?.length" class="mt-1">이전 확정 {{ db.finalized[detail.user.id].history.length }}회: {{ db.finalized[detail.user.id].history.map((h) => `${localDate(h.at)} ${fmt(h.values.final)}점 ${h.values.grade}`).join(' / ') }}</div>
      </div>
      <template #footer>
        <button v-if="db.finalized[detail.user.id]" class="btn btn-outline-danger me-auto" @click="unfinalize(detail)">확정 취소</button>
        <button class="btn btn-light" @click="detailId = null">닫기</button>
        <button class="btn btn-primary" :disabled="!canFinalize(detail) || (db.finalized[detail.user.id] && !snapshotDiffers(detail))" @click="finalizeOne(detail)">
          {{ db.finalized[detail.user.id] ? '현재 값으로 다시 확정' : '최종 확정' }}
        </button>
      </template>
    </AppModal>

    <!-- 개인별 최종 보고서 -->
    <AppModal v-if="finalOpen" title="개인별 최종 평가 보고서" size="lg" @close="finalOpen = false">
      <p class="small">선택 {{ checked.length }}명 중 <strong>최종 확정된 {{ finalIds.length }}명</strong>의 보고서를 만듭니다. 한 사람마다 새 페이지에서 시작합니다.</p>
      <div v-if="finalExcluded.length" class="alert alert-warning small py-2">최종 확정되지 않아 제외: {{ finalExcluded.join(', ') }}</div>
      <div class="report-preview">
        <FinalReport v-for="id in finalIds" :key="id" :user-id="id" />
      </div>
      <p class="small text-muted mt-2 mb-0">'PDF로 저장'을 누르면 인쇄 창이 열립니다. 대상(프린터)을 'PDF로 저장'으로 고르세요. 여러 명은 PDF 파일 하나에 사람별 페이지로 나뉩니다.</p>
      <template #footer>
        <button class="btn btn-light" @click="finalOpen = false">닫기</button>
        <button class="btn btn-primary" :disabled="!finalIds.length" @click="printFinal">PDF로 저장 (인쇄)</button>
      </template>
    </AppModal>

    <!-- 팀장 면담용 보고서 -->
    <AppModal v-if="interviewOpen" title="팀장 면담용 보고서" size="lg" @close="interviewOpen = false">
      <div class="d-flex flex-wrap gap-2 align-items-end mb-2">
        <div>
          <label class="form-label small" for="iv-team">팀 (팀장)</label>
          <select id="iv-team" v-model="ivTeam" class="form-select form-select-sm" @change="ivChecked = []; ivNotesFor = null">
            <option v-for="t in ivTeams" :key="t.id" :value="t.id">{{ t.name }} ({{ leadersOf(t.id).map((l) => l.name).join(', ') }} 팀장)</option>
          </select>
        </div>
        <span class="small text-muted">면담 대상 {{ ivMembers.length }}명 · 선택 {{ ivChecked.length }}명</span>
      </div>
      <div class="iv-list">
        <div v-for="m in ivMembers" :key="m.id" class="iv-row">
          <label class="d-flex align-items-center gap-2 mb-0">
            <input v-model="ivChecked" class="form-check-input" type="checkbox" :value="m.id" />
            <strong>{{ m.name }}</strong><span class="small text-muted">{{ m.position }} · {{ results.byId[m.id].status }}</span>
          </label>
          <button class="btn btn-link btn-sm p-0 ms-auto" @click="toggleNotes(m.id)">강점·개선점 작성</button>
        </div>
      </div>
      <div v-if="ivNotesFor" class="notes-box">
        <strong class="small">{{ results.byId[ivNotesFor].user.name }} 면담 참고 내용 (관리자 작성, 자동 저장)</strong>
        <label class="form-label small mt-2" for="n-s">강점</label>
        <textarea id="n-s" v-model="db.interviewNotes[ivNotesFor].strengths" class="form-control form-control-sm" rows="2" placeholder="평가 결과에 근거한 강점을 적어 주세요"></textarea>
        <label class="form-label small mt-2" for="n-i">개선이 필요한 부분</label>
        <textarea id="n-i" v-model="db.interviewNotes[ivNotesFor].improvements" class="form-control form-control-sm" rows="2"></textarea>
        <label class="form-label small mt-2" for="n-c">면담 시 확인할 사항</label>
        <textarea id="n-c" v-model="db.interviewNotes[ivNotesFor].checkpoints" class="form-control form-control-sm" rows="2"></textarea>
      </div>
      <div v-if="ivChecked.length" class="report-preview mt-3">
        <InterviewReport v-for="id in ivChecked" :key="id" :row="results.byId[id]" />
      </div>
      <p class="small text-muted mt-2 mb-0">평가가 끝나지 않은 단계는 '미확정'으로 표시됩니다. 평가자 이름과 공개 설정되지 않은 서술형 응답은 넣지 않습니다.</p>
      <template #footer>
        <button class="btn btn-light" @click="interviewOpen = false">닫기</button>
        <button class="btn btn-primary" :disabled="!ivChecked.length" @click="printInterview">PDF로 저장 (인쇄)</button>
      </template>
    </AppModal>

    <!-- 결과 요약 CSV -->
    <AppModal v-if="summaryOpen" title="결과 요약 CSV" size="lg" @close="summaryOpen = false">
      <p class="small text-muted mb-2">포함할 항목을 체크하고 끌어서 순서를 바꾸세요. 미리보기와 CSV가 이 순서대로 구성됩니다.</p>
      <div style="max-width: 360px" class="mb-3">
        <SortableList v-model="summaryParts">
          <template #default="{ item }">
            <div class="form-check m-0">
              <input :id="'sp-' + item.key" v-model="item.on" class="form-check-input" type="checkbox" />
              <label class="form-check-label" :for="'sp-' + item.key">{{ item.label }}</label>
            </div>
          </template>
        </SortableList>
      </div>
      <div v-for="s in summarySections" :key="s.title" class="mb-3">
        <h6 class="fw-bold">{{ s.title }}</h6>
        <div class="table-responsive" style="max-height: 240px">
          <table class="table table-sm table-bordered small mb-0">
            <thead class="table-light"><tr><th v-for="h in s.head" :key="h">{{ h }}</th></tr></thead>
            <tbody><tr v-for="(row, i) in s.rows" :key="i"><td v-for="(c, j) in row" :key="j">{{ c }}</td></tr></tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-light" @click="summaryOpen = false">닫기</button>
        <button class="btn btn-primary" @click="exportSummary">{{ IS_SHARED ? 'CSV 복사하기' : 'CSV로 내려받기' }}</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.ratios { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 8px; }
@media (max-width: 700px) { .ratios { grid-template-columns: 1fr 1fr; } }
.filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; }
.scroll { max-height: 560px; overflow-y: auto; }
.num { font-variant-numeric: tabular-nums; }
.result-table td, .result-table th { white-space: nowrap; }
.grade { font-size: 1.05rem; color: var(--navy); }
.st { display: inline-block; font-size: 0.72rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.st-incomplete { background: #eef0f4; color: #6b7080; }
.st-unset { background: #fff1d6; color: #8a5200; }
.st-pending { background: #f3e9fb; color: #6a3d8f; }
.pipeline th { width: 160px; background: #f8f9fb; }
.pipeline .final-row th, .pipeline .final-row td { background: #eef3fb; }
.final-col { background: #eef3fb; }
.done-mark { font-size: 0.75rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #eef0f4; color: #6b7080; white-space: nowrap; }
.done-mark.done { background: #e3f4ea; color: #1d7a45; }
.done-mark.unassigned { background: #fff1d6; color: #8a5200; }
.report-preview { max-height: 460px; overflow-y: auto; border: 1px solid var(--card-border); border-radius: 8px; padding: 12px 16px; }
.iv-list { max-height: 220px; overflow-y: auto; border: 1px solid var(--card-border); border-radius: 8px; }
.iv-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #eef0f4; }
.notes-box { margin-top: 10px; padding: 10px 12px; background: #f6f8fc; border-radius: 8px; }
</style>
