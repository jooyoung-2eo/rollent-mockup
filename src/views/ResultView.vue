<script setup>
import { computed, ref } from 'vue'
import { store, EVAL_TYPES, teamName, typeScore, finalScore, isTypeComplete, toast } from '../store'
import AppModal from '../components/AppModal.vue'
import DonutChart from '../components/DonutChart.vue'
import SortableList from '../components/SortableList.vue'

const filters = [
  { key: 'all', label: '전체' },
  { key: 'team', label: '팀별' },
  { key: 'leader', label: '팀장별' },
  { key: 'member', label: '사원별' },
]
const filter = ref('all')
const teamIds = ref(store.teams.map((t) => t.id))
const teamMenuOpen = ref(false)
const personView = ref('summary') // summary | detail
const expanded = ref([])
const showReport = ref(false)
// 리포트 구성 항목. 배열 순서대로 미리보기와 CSV가 만들어진다
const reportParts = ref([
  { key: 'team', label: '팀별 평가 점수', on: true },
  { key: 'person', label: '개인별 점수', on: true },
  { key: 'rank', label: '전체 점수 순위', on: true },
  { key: 'response', label: '응답률', on: true },
])

const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)

const people = computed(() =>
  store.users
    .filter((u) => {
      if (filter.value === 'team') return teamIds.value.includes(u.teamId)
      if (filter.value === 'leader') return u.role === 'leader'
      if (filter.value === 'member') return u.role === 'member'
      return true
    })
    .map((u) => ({
      ...u,
      team: teamName(u.teamId),
      roleText: u.role === 'leader' ? '팀장' : '사원',
      scores: EVAL_TYPES.map((t) => typeScore(u.id, t.key)),
      final: finalScore(u.id),
      doneTypes: EVAL_TYPES.filter((t) => isTypeComplete(u.id, t.key)).length,
    })),
)

const responseRate = (list) =>
  list.length ? Math.round((list.reduce((s, p) => s + p.doneTypes, 0) / (list.length * EVAL_TYPES.length)) * 100) : 0

const teamRows = computed(() =>
  store.teams
    .map((t) => {
      const list = people.value.filter((p) => p.teamId === t.id)
      return {
        id: t.id,
        name: t.name,
        count: list.length,
        scores: EVAL_TYPES.map((_, i) => avg(list.map((p) => p.scores[i]).filter((s) => s !== null))),
        final: avg(list.map((p) => p.final).filter((s) => s !== null)),
        rate: responseRate(list),
      }
    })
    .filter((r) => r.count > 0),
)

const ranked = computed(() =>
  [...people.value].filter((p) => p.final !== null).sort((a, b) => b.final - a.final),
)
const rankOf = (id) => {
  const i = ranked.value.findIndex((p) => p.id === id)
  return i < 0 ? '-' : i + 1
}

const summary = computed(() => ({
  count: people.value.length,
  done: people.value.filter((p) => p.final !== null).length,
  avgFinal: avg(people.value.map((p) => p.final).filter((s) => s !== null)),
  rate: responseRate(people.value),
}))

const teamLabel = computed(() =>
  teamIds.value.length === store.teams.length ? '전체 팀' : teamIds.value.length ? `${teamIds.value.length}개 팀 선택` : '팀 선택 안 함',
)
function toggleAllTeams(e) {
  teamIds.value = e.target.checked ? store.teams.map((t) => t.id) : []
}
function toggleExpand(id) {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter((x) => x !== id) : [...expanded.value, id]
}

const fmt = (v) => (v === null || v === undefined ? '-' : v)

// ---- 리포트 ----
const reportSections = computed(() => {
  const typeHeads = EVAL_TYPES.map((t) => t.label)
  const build = {
    response: () => ({ head: ['구분', '응답률(%)'], rows: [['전체', summary.value.rate], ...teamRows.value.map((r) => [r.name, r.rate])] }),
    team: () => ({ head: ['팀', '인원', ...typeHeads, '최종 점수'], rows: teamRows.value.map((r) => [r.name, r.count, ...r.scores.map(fmt), fmt(r.final)]) }),
    person: () => ({ head: ['이름', '역할', '팀', ...typeHeads, '최종 점수'], rows: people.value.map((p) => [p.name, p.roleText, p.team, ...p.scores.map(fmt), fmt(p.final)]) }),
    rank: () => ({ head: ['순위', '이름', '팀', '최종 점수'], rows: ranked.value.map((p, i) => [i + 1, p.name, p.team, p.final]) }),
  }
  return reportParts.value.filter((p) => p.on).map((p) => ({ title: p.label, ...build[p.key]() }))
})

const IS_SHARED = !!import.meta.env.VITE_SHARED

function downloadCsv() {
  if (!reportSections.value.length) {
    toast('내보낼 항목을 하나 이상 선택해 주세요.', 'warning')
    return
  }
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
  const lines = []
  reportSections.value.forEach((s) => {
    lines.push(esc(s.title), s.head.map(esc).join(','), ...s.rows.map((r) => r.map(esc).join(',')), '')
  })
  // claude.ai 공유용 빌드에서는 파일 내려받기가 막혀 있어 클립보드로 복사한다
  if (IS_SHARED) {
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast('CSV 내용을 클립보드에 복사했습니다. 엑셀이나 메모장에 붙여 넣으세요.'),
      () => toast('이 환경에서는 복사할 수 없습니다. 로컬에서 실행하면 CSV 파일로 내려받을 수 있습니다.', 'warning'),
    )
    return
  }
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'rollent_최종리포트_목업.csv'
  a.click()
  URL.revokeObjectURL(a.href)
  toast('가상 데이터로 만든 CSV 파일을 내려받았습니다.')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">응답결과</h1>
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <div class="btn-group btn-group-sm" role="group" aria-label="결과 필터">
          <button
            v-for="f in filters" :key="f.key" class="btn"
            :class="filter === f.key ? 'btn-primary' : 'btn-outline-primary'" @click="filter = f.key; teamMenuOpen = f.key === 'team'"
          >{{ f.label }}</button>
        </div>
        <div v-if="filter === 'team'" class="position-relative">
          <button class="btn btn-sm btn-light border" @click="teamMenuOpen = !teamMenuOpen">{{ teamLabel }} ▾</button>
          <div v-if="teamMenuOpen" class="team-menu">
            <div class="form-check">
              <input id="tm-all" class="form-check-input" type="checkbox" :checked="teamIds.length === store.teams.length" @change="toggleAllTeams" />
              <label class="form-check-label" for="tm-all">전체</label>
            </div>
            <div v-for="t in store.teams" :key="t.id" class="form-check">
              <input :id="'tm-' + t.id" v-model="teamIds" class="form-check-input" type="checkbox" :value="t.id" />
              <label class="form-check-label" :for="'tm-' + t.id">{{ t.name }}</label>
            </div>
            <button class="btn btn-primary btn-sm w-100 mt-2" @click="teamMenuOpen = false">적용</button>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="panel stat"><div class="stat-label">대상 인원</div><div class="stat-value">{{ summary.count }}명</div></div></div>
      <div class="col-6 col-lg-3"><div class="panel stat"><div class="stat-label">평가 완료</div><div class="stat-value">{{ summary.done }}명</div></div></div>
      <div class="col-6 col-lg-3"><div class="panel stat"><div class="stat-label">응답률</div><div class="stat-value">{{ summary.rate }}%</div></div></div>
      <div class="col-6 col-lg-3"><div class="panel stat"><div class="stat-label">평균 최종 점수</div><div class="stat-value">{{ fmt(summary.avgFinal) }}</div></div></div>
    </div>

    <div class="panel mb-3">
      <div class="panel-head">
        <h2 class="panel-title">응답 현황</h2>
        <span class="panel-sub">응답률 = 완료된 평가 수 ÷ (인원 × 평가 유형 3개)</span>
      </div>
      <div v-if="people.length" class="donuts">
        <DonutChart :value="summary.rate" label="전체" color="#1e2054" />
        <DonutChart v-for="r in teamRows" :key="r.id" :value="r.rate" :label="r.name" :detail="`${r.name} ${r.count}명 · 응답률 ${r.rate}%`" />
      </div>
      <div v-else class="empty-hint">선택한 조건에 해당하는 인원이 없습니다.</div>
    </div>

    <div class="panel mb-3">
      <div class="panel-head">
        <h2 class="panel-title">팀별 최종 점수</h2>
        <span class="panel-sub">가중치 자기평가 {{ store.weights.self }}% · 팀장평가 {{ store.weights.leader }}% · 임원평가 {{ store.weights.exec }}%</span>
      </div>
      <div class="table-responsive">
        <table class="table table-clean">
          <thead><tr><th>팀</th><th class="text-end">인원</th><th v-for="t in EVAL_TYPES" :key="t.key" class="text-end">{{ t.label }} 평균</th><th class="text-end">최종 점수 평균</th></tr></thead>
          <tbody>
            <tr v-for="r in teamRows" :key="r.id">
              <td class="fw-semibold">{{ r.name }}</td>
              <td class="text-end">{{ r.count }}</td>
              <td v-for="(s, i) in r.scores" :key="i" class="text-end">{{ fmt(s) }}</td>
              <td class="text-end fw-bold">{{ fmt(r.final) }}</td>
            </tr>
            <tr v-if="!teamRows.length"><td colspan="6" class="text-muted">표시할 팀이 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel mb-4">
      <div class="panel-head">
        <h2 class="panel-title">개인별 최종 점수</h2>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn" :class="personView === 'summary' ? 'btn-primary' : 'btn-outline-primary'" @click="personView = 'summary'">요약 버전</button>
          <button class="btn" :class="personView === 'detail' ? 'btn-primary' : 'btn-outline-primary'" @click="personView = 'detail'">상세 버전</button>
        </div>
      </div>
      <p v-if="personView === 'summary'" class="panel-sub">이름을 누르면 평가 유형별 점수를 펼쳐 볼 수 있습니다.</p>
      <div class="table-responsive">
        <table class="table table-clean">
          <thead>
            <tr>
              <th>순위</th><th>이름</th><th>역할</th><th>팀</th>
              <template v-if="personView === 'detail'"><th v-for="t in EVAL_TYPES" :key="t.key" class="text-end">{{ t.label }}</th></template>
              <th class="text-end">최종 점수</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in people" :key="p.id">
              <tr>
                <td>{{ rankOf(p.id) }}</td>
                <td>
                  <button v-if="personView === 'summary'" class="btn btn-link p-0 fw-semibold" @click="toggleExpand(p.id)">
                    {{ expanded.includes(p.id) ? '▾' : '▸' }} {{ p.name }}
                  </button>
                  <span v-else class="fw-semibold">{{ p.name }}</span>
                </td>
                <td>{{ p.roleText }}</td>
                <td>{{ p.team }}</td>
                <template v-if="personView === 'detail'"><td v-for="(s, i) in p.scores" :key="i" class="text-end">{{ fmt(s) }}</td></template>
                <td class="text-end fw-bold">{{ fmt(p.final) }}</td>
              </tr>
              <tr v-if="personView === 'summary' && expanded.includes(p.id)" class="expand-row">
                <td></td>
                <td colspan="4">
                  <span v-for="(t, i) in EVAL_TYPES" :key="t.key" class="me-4">{{ t.label }} <strong>{{ fmt(p.scores[i]) }}</strong></span>
                </td>
              </tr>
            </template>
            <tr v-if="!people.length"><td colspan="8" class="text-muted">표시할 인원이 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="text-center">
      <button class="btn btn-csv btn-lg px-5" @click="showReport = true">최종 리포트 내보내기</button>
    </div>

    <AppModal v-if="showReport" title="최종 리포트 미리보기" size="lg" @close="showReport = false">
      <p class="small text-muted mb-2">포함할 항목을 체크하고, 끌어서 순서를 바꾸세요. 미리보기와 CSV가 이 순서대로 구성됩니다.</p>
      <div class="report-parts mb-3">
        <SortableList v-model="reportParts">
          <template #default="{ item }">
            <div class="form-check m-0">
              <input :id="'rp-' + item.key" v-model="item.on" class="form-check-input" type="checkbox" />
              <label class="form-check-label" :for="'rp-' + item.key">{{ item.label }}</label>
            </div>
          </template>
        </SortableList>
      </div>
      <p class="small text-muted">현재 필터({{ filters.find((f) => f.key === filter).label }}) 기준의 가상 데이터입니다.</p>
      <div v-if="!reportSections.length" class="empty-hint">리포트에 포함할 항목을 선택하세요.</div>
      <div v-for="s in reportSections" :key="s.title" class="mb-3">
        <h6 class="fw-bold">{{ s.title }}</h6>
        <table class="table table-sm table-bordered small mb-0">
          <thead class="table-light"><tr><th v-for="h in s.head" :key="h">{{ h }}</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in s.rows" :key="i"><td v-for="(c, j) in r" :key="j">{{ c }}</td></tr>
            <tr v-if="!s.rows.length"><td :colspan="s.head.length" class="text-muted">데이터가 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <button class="btn btn-light" @click="showReport = false">닫기</button>
        <button class="btn btn-primary" @click="downloadCsv">{{ IS_SHARED ? 'CSV 복사하기' : 'CSV로 내려받기' }}</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.stat { padding: 14px 18px; }
.stat-label { color: var(--text-muted); font-size: 0.85rem; }
.stat-value { font-size: 1.6rem; font-weight: 700; }
.donuts { display: flex; flex-wrap: wrap; gap: 28px; }
.team-menu { position: absolute; right: 0; top: calc(100% + 4px); background: #fff; border: 1px solid var(--card-border); border-radius: 8px; padding: 10px 14px; z-index: 20; min-width: 180px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }
.report-parts { max-width: 360px; }
.expand-row td { background: #f6f8fc; font-size: 0.9rem; }
</style>
