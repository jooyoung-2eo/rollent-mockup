<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  store, PAGES, EVAL_TYPES, teamName, isTypeComplete, currentStage, stageLabel, toast,
} from '../store'
import AppModal from '../components/AppModal.vue'
import BarChart from '../components/BarChart.vue'
import SortableList from '../components/SortableList.vue'

const router = useRouter()
const showSettings = ref(false)
const draftWidgets = ref([])

const series = [
  { label: '자기평가', color: 'var(--series-self)' },
  { label: '팀장평가', color: 'var(--series-leader)' },
  { label: '임원평가', color: 'var(--series-exec)' },
]

const recentColors = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4']
const widgetCols = { recent: 'col-lg-4', chart: 'col-lg-8', progress: 'col-12' }

const visibleWidgets = computed(() => store.homeWidgets.filter((w) => w.visible))

const progressRows = computed(() =>
  store.users.map((u) => ({ ...u, team: teamName(u.teamId), stage: currentStage(u.id), stageText: stageLabel(u.id) })),
)

const chartGroups = computed(() =>
  store.teams
    .map((t) => {
      const members = store.users.filter((u) => u.teamId === t.id)
      return {
        label: t.name,
        count: members.length,
        values: EVAL_TYPES.map((et) =>
          members.length ? Math.round((members.filter((u) => isTypeComplete(u.id, et.key)).length / members.length) * 100) : 0,
        ),
      }
    })
    .filter((g) => g.count > 0),
)

const doneCount = computed(() => progressRows.value.filter((r) => r.stage === 'done').length)

function openSettings() {
  draftWidgets.value = store.homeWidgets.map((w) => ({ ...w }))
  showSettings.value = true
}
function saveSettings() {
  store.homeWidgets = draftWidgets.value.map((w) => ({ ...w }))
  showSettings.value = false
  toast('홈 화면 설정을 저장했습니다.')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">안녕하세요, {{ store.userName }}님</h1>
      <button class="btn btn-light border gear" title="홈 화면 설정" aria-label="홈 화면 설정" @click="openSettings">⚙</button>
    </div>

    <div class="row g-3">
      <div v-for="w in visibleWidgets" :key="w.key" :class="widgetCols[w.key]" :data-widget="w.key">
        <div v-if="w.key === 'recent'" class="panel h-100">
          <div class="panel-head"><h2 class="panel-title">최근 사용 항목</h2></div>
          <div class="select-list">
            <div v-for="(p, i) in store.recent" :key="p" class="list-row" role="link" tabindex="0" @click="router.push({ name: p })" @keydown.enter="router.push({ name: p })">
              <span class="status-dot" :style="{ background: recentColors[i % recentColors.length] }"></span>
              <span>{{ PAGES[p] }}</span>
              <span class="ms-auto text-muted small">이동 ›</span>
            </div>
          </div>
        </div>

        <div v-else-if="w.key === 'chart'" class="panel h-100">
          <div class="panel-head">
            <h2 class="panel-title">팀별 평가 진행률</h2>
            <span class="panel-sub">전체 {{ store.users.length }}명 중 {{ doneCount }}명 평가 완료</span>
          </div>
          <BarChart :groups="chartGroups" :series="series" />
        </div>

        <div v-else-if="w.key === 'progress'" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">직원 평가 진행 현황</h2>
            <span class="panel-sub">이름을 누르면 관리자 평가 화면으로 이동합니다.</span>
          </div>
          <div class="table-responsive">
            <table class="table table-clean table-hover">
              <thead><tr><th>이름</th><th>소속부서</th><th>현재 단계</th></tr></thead>
              <tbody>
                <tr v-for="r in progressRows" :key="r.id" class="clickable" @click="router.push({ name: 'admin-eval', query: { user: r.id } })">
                  <td class="fw-semibold">{{ r.name }}</td>
                  <td>{{ r.team }}</td>
                  <td><span class="stage-badge" :class="'stage-' + r.stage">{{ r.stageText }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="!visibleWidgets.length" class="col-12">
        <div class="panel empty-hint">표시할 위젯이 없습니다. 오른쪽 위 설정 아이콘에서 위젯을 선택하세요.</div>
      </div>
    </div>

    <AppModal v-if="showSettings" title="홈 화면 설정" size="sm" @close="showSettings = false">
      <p class="small text-muted">표시할 위젯을 선택하고, 끌어서 순서를 바꾸세요. 위에 있는 위젯부터 표시됩니다.</p>
      <SortableList v-model="draftWidgets">
        <template #default="{ item }">
          <div class="form-check m-0">
            <input :id="'w-' + item.key" v-model="item.visible" class="form-check-input" type="checkbox" />
            <label class="form-check-label" :for="'w-' + item.key">{{ item.label }}</label>
          </div>
        </template>
      </SortableList>
      <template #footer>
        <button class="btn btn-light" @click="showSettings = false">취소</button>
        <button class="btn btn-primary" @click="saveSettings">저장</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.gear { font-size: 1.3rem; line-height: 1; padding: 6px 10px; }
</style>
