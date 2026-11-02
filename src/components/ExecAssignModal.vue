<script setup>
import { computed, ref } from 'vue'
import { db, userById, teamName, sortUsers, isEvalTarget, setExecFor, execSourceOf, confirmDialog, toast } from '../store'
import { roleLabel } from '../constants'
import AppModal from './AppModal.vue'

// 임원 한 명의 담당 대상(사원·팀장)을 고른다. 평가 관리와 직원 및 부서 관리에서 같이 쓴다.
// 한 직원은 임원 1명에게만 배정된다(복수 배정 정책 미설정).
const props = defineProps({ execId: { type: Number, required: true } })
const emit = defineEmits(['close'])

const exec = computed(() => userById(props.execId))
const assignable = computed(() => sortUsers(db.users.filter((u) => isEvalTarget(u) && (u.role === 'member' || u.role === 'leader'))))
const current = () => assignable.value.filter((u) => db.execAssign[u.id] === props.execId).map((u) => u.id)
const checked = ref(current())
const q = ref('')
const shown = computed(() => assignable.value.filter((u) => !q.value.trim() || u.name.includes(q.value.trim()) || teamName(u.teamId).includes(q.value.trim())))

async function save() {
  const moving = checked.value.filter((id) => db.execAssign[id] && db.execAssign[id] !== props.execId && userById(db.execAssign[id])?.active)
  if (moving.length) {
    const lines = moving.map((id) => `${userById(id).name}: 현재 ${userById(db.execAssign[id]).name} 담당`)
    const ok = await confirmDialog({ title: '중복 배정 확인', message: `다른 임원에게 이미 배정된 직원이 있습니다.\n${lines.join('\n')}\n\n이 임원에게 옮기시겠습니까? (한 직원은 임원 한 명만 담당합니다)`, okText: '옮기기' })
    if (!ok) return
  }
  const before = current()
  before.filter((id) => !checked.value.includes(id)).forEach((id) => setExecFor(id, null)) // 배정 해제(직원 정보는 그대로)
  checked.value.filter((id) => db.execAssign[id] !== props.execId).forEach((id) => setExecFor(id, props.execId))
  toast(`${exec.value.name} 임원의 담당 직원을 ${checked.value.length}명으로 저장했습니다.`)
  emit('close')
}
</script>

<template>
  <AppModal :title="`${exec.name} 임원 담당 직원 배정`" size="lg" @close="emit('close')">
    <p class="small text-muted mb-2">
      체크한 사원·팀장을 이 임원이 평가합니다. 체크를 풀면 배정만 해제되고 직원 정보는 지워지지 않습니다.
      한 직원은 임원 한 명에게만 배정됩니다(복수 배정은 정책이 정해지지 않아 지원하지 않음).
    </p>
    <input v-model="q" class="form-control form-control-sm mb-2" placeholder="이름·부서 검색" aria-label="배정 대상 검색" />
    <div class="assign-list">
      <label v-for="u in shown" :key="u.id" class="assign-row" :data-user="u.name">
        <input v-model="checked" class="form-check-input" type="checkbox" :value="u.id" />
        <span class="fw-semibold">{{ u.name }}</span>
        <span class="small text-muted">{{ teamName(u.teamId) }} · {{ roleLabel(u.role) }}</span>
        <span class="ms-auto small" :class="db.execAssign[u.id] && db.execAssign[u.id] !== execId ? 'text-warning-emphasis' : 'text-muted'">
          {{ db.execAssign[u.id] ? (db.execAssign[u.id] === execId ? '이 임원' : `${userById(db.execAssign[u.id])?.name} 담당`) : '미배정' }}
          <span v-if="execSourceOf(u.id) === 'test'" class="badge text-bg-info ms-1">테스트</span>
        </span>
      </label>
    </div>
    <template #footer>
      <span class="small text-muted me-auto">{{ checked.length }}명 선택</span>
      <button class="btn btn-light" @click="emit('close')">취소</button>
      <button class="btn btn-primary" @click="save">배정 저장</button>
    </template>
  </AppModal>
</template>

<style scoped>
.assign-list { max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; }
.assign-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.assign-row:hover { background: #f4f7fc; }
</style>
