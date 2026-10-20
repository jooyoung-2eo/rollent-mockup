<script setup>
import { computed, ref } from 'vue'
import {
  store, teamName, userById, roleLabel, resolveTeam, newId, toast, confirmDialog, progressStatus, stageLabel,
} from '../store'
import AppModal from '../components/AppModal.vue'
import CsvButton from '../components/CsvButton.vue'
import TeamSelect from '../components/TeamSelect.vue'

const selectedId = ref(null)
const mode = ref(null) // { role, action: 'edit' | 'delete' } — 버튼을 먼저 누르고 대상을 고른다
const checked = ref([])
const form = ref(null) // { id?, name, empNo, role, teamId, newTeam }
const formError = ref('')

const groups = computed(() => [
  { role: 'leader', title: '팀장 관리', list: store.users.filter((u) => u.role === 'leader') },
  { role: 'member', title: '사원 관리', list: store.users.filter((u) => u.role === 'member') },
])
const selected = computed(() => userById(selectedId.value))
const isMode = (role, action) => mode.value?.role === role && mode.value?.action === action

function startMode(role, action) {
  checked.value = []
  mode.value = isMode(role, action) ? null : { role, action }
}

// 수정 모드에서는 파란 밑줄 이름을 눌러야 수정 폼이 열린다(행 클릭은 무시)
function onRowClick(u) {
  if (isMode(u.role, 'edit')) return
  if (isMode(u.role, 'delete')) {
    checked.value = checked.value.includes(u.id) ? checked.value.filter((id) => id !== u.id) : [...checked.value, u.id]
  } else {
    selectedId.value = u.id
  }
}

function openAdd(role) {
  form.value = { name: '', empNo: '', role, teamId: store.teams[0]?.id ?? null, newTeam: '' }
  formError.value = ''
}
function openEdit(u) {
  form.value = { ...u, newTeam: '' }
  formError.value = ''
}

function save() {
  const f = form.value
  if (!f.name.trim() || !f.empNo.trim()) { formError.value = '이름과 사번을 모두 입력해 주세요.'; return }
  if (store.users.some((u) => u.empNo === f.empNo.trim() && u.id !== f.id)) { formError.value = '이미 사용 중인 사번입니다.'; return }
  if (f.teamId === 'new' && !f.newTeam.trim()) { formError.value = '새 팀 이름을 입력해 주세요.'; return }

  // 새 팀 이름을 입력했으면 팀 관리에도 팀이 만들어진다
  const teamCountBefore = store.teams.length
  const data = { name: f.name.trim(), empNo: f.empNo.trim(), role: f.role, teamId: resolveTeam(f.teamId, f.newTeam) }
  if (f.id) {
    Object.assign(userById(f.id), data)
    selectedId.value = f.id
  } else {
    const id = newId()
    store.users.push({ id, ...data })
    store.answers[id] = { self: {}, leader: {}, exec: {} }
    selectedId.value = id
  }
  const created = store.teams.length > teamCountBefore ? ` 팀 관리에 '${teamName(data.teamId)}'이 추가되었습니다.` : ''
  toast((f.id ? '사용자 정보를 수정했습니다.' : '사용자를 추가했습니다.') + created)
  form.value = null
}

async function removeChecked() {
  if (!checked.value.length) return toast('삭제할 사용자를 목록에서 체크해 주세요.', 'warning')
  const names = checked.value.map((id) => userById(id).name).join(', ')
  const ok = await confirmDialog({
    title: '사용자 삭제',
    message: `${names}님을 삭제하시겠습니까?\n해당 사용자의 평가 데이터도 함께 삭제됩니다.`,
    okText: '삭제',
    danger: true,
  })
  if (!ok) return
  const ids = checked.value
  store.users = store.users.filter((u) => !ids.includes(u.id))
  ids.forEach((id) => delete store.answers[id])
  if (ids.includes(selectedId.value)) selectedId.value = null
  toast(`${ids.length}명을 삭제했습니다.`)
  checked.value = []
  mode.value = null
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">사원 관리</h1>
      <div class="d-flex align-items-center gap-2">
        <span class="panel-sub d-none d-md-inline">팀장과 사원이 모두 있는 파일</span>
        <CsvButton label="전체 CSV 불러오기" />
      </div>
    </div>

    <div class="row g-3">
      <div class="col-lg-7 d-flex flex-column gap-3">
        <div v-for="g in groups" :key="g.role" class="panel" :data-group="g.role">
          <div class="panel-head">
            <h2 class="panel-title">{{ g.title }} <span class="panel-sub">{{ g.list.length }}명</span></h2>
            <div class="d-flex gap-1 flex-wrap">
              <button class="btn btn-primary btn-sm" @click="openAdd(g.role)">추가</button>
              <button class="btn btn-sm" :class="isMode(g.role, 'edit') ? 'btn-primary' : 'btn-outline-primary'" @click="startMode(g.role, 'edit')">
                {{ isMode(g.role, 'edit') ? '완료' : '수정' }}
              </button>
              <button class="btn btn-sm" :class="isMode(g.role, 'delete') ? 'btn-danger' : 'btn-outline-danger'" @click="startMode(g.role, 'delete')">삭제</button>
              <CsvButton />
            </div>
          </div>

          <div v-if="isMode(g.role, 'edit')" class="mode-bar">
            <span>파란색 이름을 누르면 수정할 수 있습니다. 수정을 마치면 '완료'를 누르세요.</span>
          </div>
          <div v-if="isMode(g.role, 'delete')" class="mode-bar danger">
            <span>삭제할 {{ roleLabel(g.role) }}을 체크하세요. ({{ checked.length }}명 선택)</span>
            <button class="btn btn-danger btn-sm ms-auto" :disabled="!checked.length" @click="removeChecked">선택 삭제</button>
            <button class="btn btn-light btn-sm" @click="mode = null">취소</button>
          </div>

          <div class="table-responsive">
            <table class="table table-clean table-hover">
              <thead>
                <tr><th v-if="isMode(g.role, 'delete')" style="width: 36px"></th><th>소속 팀</th><th>이름</th><th>사번</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in g.list" :key="u.id"
                  :class="{ clickable: !isMode(g.role, 'edit'), active: isMode(g.role, 'delete') ? checked.includes(u.id) : !mode && u.id === selectedId }"
                  @click="onRowClick(u)"
                >
                  <td v-if="isMode(g.role, 'delete')">
                    <input class="form-check-input" type="checkbox" :checked="checked.includes(u.id)" :aria-label="u.name + ' 선택'" @click.stop="onRowClick(u)" />
                  </td>
                  <td>{{ teamName(u.teamId) }}</td>
                  <td class="fw-semibold">
                    <button v-if="isMode(g.role, 'edit')" type="button" class="edit-link" @click.stop="openEdit(u)">{{ u.name }}</button>
                    <template v-else>{{ u.name }}</template>
                  </td>
                  <td>{{ u.empNo }}</td>
                </tr>
                <tr v-if="!g.list.length"><td colspan="4" class="text-muted">등록된 사용자가 없습니다.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="panel detail">
          <h2 class="panel-title mb-3">사용자 상세 정보</h2>
          <dl v-if="selected" class="row mb-0">
            <dt class="col-4">이름</dt><dd class="col-8">{{ selected.name }}</dd>
            <dt class="col-4">사번</dt><dd class="col-8">{{ selected.empNo }}</dd>
            <dt class="col-4">역할</dt><dd class="col-8">{{ roleLabel(selected.role) }}</dd>
            <dt class="col-4">소속 팀</dt><dd class="col-8">{{ teamName(selected.teamId) }}</dd>
            <dt class="col-4">평가 상태</dt><dd class="col-8">{{ progressStatus(selected.id) }} · {{ stageLabel(selected.id) }}</dd>
          </dl>
          <div v-else class="empty-hint">목록에서 사용자를 선택하세요.</div>
        </div>
      </div>
    </div>

    <AppModal v-if="form" :title="form.id ? '사용자 수정' : `${roleLabel(form.role)} 추가`" @close="form = null">
      <div class="mb-3">
        <label class="form-label" for="u-name">이름</label>
        <input id="u-name" v-model="form.name" class="form-control" placeholder="예: H 사원" />
      </div>
      <div class="mb-3">
        <label class="form-label" for="u-emp">사번</label>
        <input id="u-emp" v-model="form.empNo" class="form-control" placeholder="예: 2024001" />
      </div>
      <div class="row g-3">
        <div class="col-6">
          <label class="form-label" for="u-role">역할</label>
          <select id="u-role" v-model="form.role" class="form-select">
            <option value="leader">팀장</option>
            <option value="member">사원</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label" for="u-team">소속 팀</label>
          <TeamSelect id="u-team" v-model="form.teamId" v-model:newName="form.newTeam" />
        </div>
      </div>
      <p class="small text-muted mt-3 mb-0">새 팀 이름을 입력하면 팀 관리에도 그 팀이 추가됩니다. 목업에서는 실제 계정을 만들지 않습니다.</p>
      <div v-if="formError" class="text-danger small mt-2">{{ formError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="form = null">취소</button>
        <button class="btn btn-primary" @click="save">저장</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.detail { position: sticky; top: 20px; }
dt { color: var(--text-muted); font-weight: 600; }
</style>
