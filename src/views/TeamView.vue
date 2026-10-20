<script setup>
import { computed, ref, watch } from 'vue'
import {
  store, userById, leadersOf, membersOf, roleLabel, teamName, resolveTeam, toast, confirmDialog,
} from '../store'
import AppModal from '../components/AppModal.vue'
import CsvButton from '../components/CsvButton.vue'
import TeamSelect from '../components/TeamSelect.vue'

const csvChoices = [
  { key: 'leader', label: '팀장 파일', desc: '파일의 모든 사람을 팀장으로 넣습니다.' },
  { key: 'member', label: '팀원 파일', desc: '파일의 모든 사람을 팀원으로 넣습니다.' },
  { key: 'both', label: '팀장 + 팀원 통합 파일', desc: "파일의 '구분' 열(팀장/팀원)을 보고 나누어 넣습니다." },
]

const selectedId = ref(store.teams[0]?.id ?? null)
const editing = ref(false) // 편집 모드: 행마다 체크박스와 수정·삭제 버튼 표시
const checked = ref([])
const form = ref(null) // { ids, single, name, empNo, role, teamId, newTeam }
const formError = ref('')
const addOpen = ref(false)
const addChecked = ref([])
const settingsOpen = ref(false)
const draftView = ref('list')

const selected = computed(() => store.teams.find((t) => t.id === selectedId.value))
const people = computed(() => (selected.value ? [...leadersOf(selected.value.id), ...membersOf(selected.value.id)] : []))
const allChecked = computed({
  get: () => people.value.length > 0 && checked.value.length === people.value.length,
  set: (v) => { checked.value = v ? people.value.map((p) => p.id) : [] },
})
const addCandidates = computed(() => store.users.filter((u) => u.teamId !== selectedId.value))

watch(selectedId, () => { editing.value = false; checked.value = [] })

function selectTeam(id) {
  selectedId.value = id
}

function toggleEditing() {
  editing.value = !editing.value
  checked.value = []
}

// ---- 수정 ----
function openEditOne(u) {
  form.value = { ids: [u.id], single: true, name: u.name, empNo: u.empNo, role: u.role, teamId: u.teamId, newTeam: '' }
  formError.value = ''
}
function openEditMany() {
  if (!checked.value.length) return toast('수정할 사람을 먼저 체크해 주세요.', 'warning')
  form.value = { ids: [...checked.value], single: false, role: '', teamId: '', newTeam: '' }
  formError.value = ''
}

function saveForm() {
  const f = form.value
  if (f.single) {
    if (!f.name.trim() || !f.empNo.trim()) { formError.value = '이름과 사번을 모두 입력해 주세요.'; return }
    if (store.users.some((u) => u.empNo === f.empNo.trim() && u.id !== f.ids[0])) { formError.value = '이미 사용 중인 사번입니다.'; return }
  }
  if (f.teamId === 'new' && !f.newTeam.trim()) { formError.value = '새 팀 이름을 입력해 주세요.'; return }
  if (!f.single && f.role === '' && f.teamId === '') { formError.value = '바꿀 값을 하나 이상 선택해 주세요.'; return }

  const teamId = f.teamId === '' ? undefined : resolveTeam(f.teamId, f.newTeam)
  f.ids.forEach((id) => {
    const u = userById(id)
    if (f.single) { u.name = f.name.trim(); u.empNo = f.empNo.trim() }
    if (f.role) u.role = f.role
    if (teamId !== undefined) u.teamId = teamId
  })
  toast(f.single ? '정보를 수정했습니다.' : `${f.ids.length}명의 정보를 한 번에 수정했습니다.`)
  checked.value = []
  form.value = null
}

// ---- 삭제(팀에서 제외) ----
async function removeFromTeam(ids) {
  if (!ids.length) return toast('삭제할 사람을 먼저 체크해 주세요.', 'warning')
  const names = ids.map((id) => userById(id).name).join(', ')
  const ok = await confirmDialog({
    title: '팀에서 삭제',
    message: `${names}님을 ${selected.value.name}에서 삭제하시겠습니까?\n사원 관리 목록에는 '미배정'으로 남습니다.`,
    okText: '삭제',
    danger: true,
  })
  if (!ok) return
  ids.forEach((id) => { userById(id).teamId = null })
  checked.value = checked.value.filter((id) => !ids.includes(id))
  toast(`${ids.length}명을 팀에서 삭제했습니다.`)
}

// ---- 팀에 사원 추가 ----
function openAdd() {
  addChecked.value = []
  addOpen.value = true
}
function saveAdd() {
  if (!addChecked.value.length) return toast('추가할 사람을 선택해 주세요.', 'warning')
  addChecked.value.forEach((id) => { userById(id).teamId = selectedId.value })
  toast(`${addChecked.value.length}명을 ${selected.value.name}에 추가했습니다.`)
  addOpen.value = false
}

// ---- 보기 설정 ----
function openSettings() {
  draftView.value = store.teamViewMode
  settingsOpen.value = true
}
function saveSettings() {
  store.teamViewMode = draftView.value
  settingsOpen.value = false
  toast(`보기 형식을 ${draftView.value === 'list' ? '목록형' : '조직도형'}으로 바꿨습니다.`)
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">팀 관리</h1>
      <div class="d-flex gap-2 align-items-center">
        <CsvButton :choices="csvChoices" />
        <button class="btn btn-light border gear" title="보기 설정" aria-label="보기 설정" @click="openSettings">⚙</button>
      </div>
    </div>

    <div v-if="store.teamViewMode === 'list'" class="row g-3">
      <div class="col-lg-4">
        <div class="panel h-100">
          <div class="panel-head">
            <h2 class="panel-title">팀 구성</h2>
            <span class="panel-sub">팀은 사원 관리에서 소속 팀을 지정하면 만들어집니다.</span>
          </div>
          <div class="select-list">
            <div
              v-for="t in store.teams" :key="t.id" class="list-row" :class="{ active: t.id === selectedId }"
              tabindex="0" @click="selectTeam(t.id)" @keydown.enter="selectTeam(t.id)"
            >
              <span class="fw-semibold" style="min-width: 110px">{{ t.name }}</span>
              <span class="text-muted">{{ leadersOf(t.id).map((l) => l.name).join(', ') || '팀장 미지정' }}</span>
              <span class="ms-auto small text-muted">{{ leadersOf(t.id).length + membersOf(t.id).length }}명</span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-8">
        <div class="panel h-100">
          <template v-if="selected">
            <div class="panel-head">
              <h2 class="panel-title">{{ selected.name }} 상세 정보</h2>
              <div class="d-flex gap-1">
                <button class="btn btn-primary btn-sm" @click="openAdd">+ 추가</button>
                <button class="btn btn-sm" :class="editing ? 'btn-secondary' : 'btn-outline-primary'" @click="toggleEditing">
                  {{ editing ? '편집 완료' : '편집' }}
                </button>
              </div>
            </div>

            <div v-if="editing" class="edit-bar">
              <span>{{ checked.length }}명 선택</span>
              <button class="btn btn-outline-primary btn-sm" :disabled="!checked.length" @click="openEditMany">선택 수정</button>
              <button class="btn btn-outline-danger btn-sm" :disabled="!checked.length" @click="removeFromTeam(checked)">선택 삭제</button>
            </div>

            <table class="table table-clean">
              <thead>
                <tr>
                  <th v-if="editing" style="width: 36px"><input v-model="allChecked" class="form-check-input" type="checkbox" aria-label="전체 선택" /></th>
                  <th>역할</th><th>이름</th><th>사번</th>
                  <th v-if="editing" class="text-end">관리</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in people" :key="p.id" :class="{ active: checked.includes(p.id) }">
                  <td v-if="editing"><input v-model="checked" class="form-check-input" type="checkbox" :value="p.id" :aria-label="p.name + ' 선택'" /></td>
                  <td><span class="badge" :class="p.role === 'leader' ? 'text-bg-primary' : 'text-bg-light border'">{{ roleLabel(p.role) }}</span></td>
                  <td>{{ p.name }}</td>
                  <td>{{ p.empNo }}</td>
                  <td v-if="editing" class="text-end text-nowrap">
                    <button class="btn btn-outline-primary btn-sm me-1" @click="openEditOne(p)">수정</button>
                    <button class="btn btn-outline-danger btn-sm" @click="removeFromTeam([p.id])">삭제</button>
                  </td>
                </tr>
                <tr v-if="!people.length">
                  <td :colspan="editing ? 5 : 3" class="text-muted">소속된 사람이 없습니다. 추가 버튼으로 사원을 넣으세요.</td>
                </tr>
              </tbody>
            </table>
          </template>
          <div v-else class="empty-hint">왼쪽 목록에서 팀을 선택하세요.</div>
        </div>
      </div>
    </div>

    <div v-else class="panel">
      <div class="panel-head"><h2 class="panel-title">조직도</h2></div>
      <div class="org-root">Rollent</div>
      <div class="org-teams">
        <div v-for="t in store.teams" :key="t.id" class="org-team">
          <div class="org-team-name">{{ t.name }}</div>
          <div v-for="l in leadersOf(t.id)" :key="l.id" class="org-leader">팀장 {{ l.name }}</div>
          <div v-if="!leadersOf(t.id).length" class="org-leader">팀장 미지정</div>
          <div v-for="m in membersOf(t.id)" :key="m.id" class="org-member">{{ m.name }}</div>
        </div>
      </div>
    </div>

    <!-- 수정 폼 (한 명 / 여러 명) -->
    <AppModal v-if="form" :title="form.single ? '정보 수정' : `${form.ids.length}명 한 번에 수정`" @close="form = null">
      <template v-if="form.single">
        <div class="row g-3 mb-3">
          <div class="col-6">
            <label class="form-label" for="f-name">이름</label>
            <input id="f-name" v-model="form.name" class="form-control" />
          </div>
          <div class="col-6">
            <label class="form-label" for="f-emp">사번</label>
            <input id="f-emp" v-model="form.empNo" class="form-control" />
          </div>
        </div>
      </template>
      <p v-else class="small text-muted">선택한 사람 모두에게 같은 값이 적용됩니다. ({{ form.ids.map((id) => userById(id).name).join(', ') }})</p>
      <div class="row g-3">
        <div class="col-6">
          <label class="form-label" for="f-role">역할</label>
          <select id="f-role" v-model="form.role" class="form-select">
            <option v-if="!form.single" value="">변경 안 함</option>
            <option value="leader">팀장</option>
            <option value="member">사원</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label" for="f-team">소속 팀</label>
          <TeamSelect id="f-team" v-model="form.teamId" v-model:newName="form.newTeam" :keepOption="!form.single" />
        </div>
      </div>
      <div v-if="formError" class="text-danger small mt-2">{{ formError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="form = null">취소</button>
        <button class="btn btn-primary" @click="saveForm">저장</button>
      </template>
    </AppModal>

    <!-- 팀에 사원 추가 -->
    <AppModal v-if="addOpen" :title="`${selected.name}에 사원 추가`" @close="addOpen = false">
      <p class="small text-muted">사원 관리에 등록된 사람 중에서 고르세요. 다른 팀 소속이면 이 팀으로 옮겨집니다.</p>
      <div class="add-list">
        <label v-for="u in addCandidates" :key="u.id" class="add-row">
          <input v-model="addChecked" class="form-check-input" type="checkbox" :value="u.id" />
          <span class="fw-semibold">{{ u.name }}</span>
          <span class="badge" :class="u.role === 'leader' ? 'text-bg-primary' : 'text-bg-light border'">{{ roleLabel(u.role) }}</span>
          <span class="ms-auto small text-muted">{{ teamName(u.teamId) }} · {{ u.empNo }}</span>
        </label>
        <div v-if="!addCandidates.length" class="empty-hint">추가할 수 있는 사람이 없습니다.</div>
      </div>
      <template #footer>
        <button class="btn btn-light" @click="addOpen = false">취소</button>
        <button class="btn btn-primary" @click="saveAdd">{{ addChecked.length }}명 추가</button>
      </template>
    </AppModal>

    <!-- 보기 설정 -->
    <AppModal v-if="settingsOpen" title="팀 관리 보기 설정" size="sm" @close="settingsOpen = false">
      <p class="small text-muted">팀 관리 화면의 보기 형식을 선택하세요.</p>
      <div class="form-check mb-2">
        <input id="v-list" v-model="draftView" class="form-check-input" type="radio" value="list" />
        <label class="form-check-label" for="v-list">목록형 <span class="small text-muted">(기본)</span></label>
      </div>
      <div class="form-check">
        <input id="v-org" v-model="draftView" class="form-check-input" type="radio" value="org" />
        <label class="form-check-label" for="v-org">조직도형</label>
      </div>
      <template #footer>
        <button class="btn btn-light" @click="settingsOpen = false">취소</button>
        <button class="btn btn-primary" @click="saveSettings">저장</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.gear { font-size: 1.3rem; line-height: 1; padding: 6px 10px; }
.edit-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 10px; background: #f4f7fc; border: 1px solid #d6e3f5; border-radius: 8px; font-size: 0.9rem; }
.add-list { display: flex; flex-direction: column; gap: 4px; max-height: 360px; overflow-y: auto; }
.add-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.add-row:hover { background: #f4f7fc; }
.org-root { margin: 0 auto 24px; width: 160px; text-align: center; padding: 10px; border-radius: 8px; background: var(--navy); color: #fff; font-weight: 700; }
.org-teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.org-team { border: 1px solid var(--card-border); border-top: 4px solid var(--brand); border-radius: 8px; padding: 12px; background: #fafbfd; }
.org-team-name { font-weight: 700; margin-bottom: 6px; }
.org-leader { background: #d9e8fa; border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; font-size: 0.9rem; }
.org-member { padding: 3px 8px; font-size: 0.88rem; color: #4a4f63; }
</style>
