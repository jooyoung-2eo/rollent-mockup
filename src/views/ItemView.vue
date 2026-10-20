<script setup>
import { computed, ref } from 'vue'
import { store, EVAL_TYPES, ANSWER_TYPES, itemsOfType, answerTypeLabel, newId, toast, confirmDialog } from '../store'
import AppModal from '../components/AppModal.vue'
import CsvButton from '../components/CsvButton.vue'

const NEW_NAME = '__new__'
const activeType = ref('self')
const mode = ref(null) // 'edit' | 'delete' — 버튼을 먼저 누르고 대상을 고른다
const checked = ref([])
const form = ref(null) // { id?, name, newName, content, answerType, types: [] }
const formError = ref('')
const dragId = ref(null)
const weights = ref({ ...store.weights })

const list = computed(() => itemsOfType(activeType.value))
const typeLabel = (key) => EVAL_TYPES.find((t) => t.key === key).label
const weightSum = computed(() => EVAL_TYPES.reduce((s, t) => s + (Number(weights.value[t.key]) || 0), 0))
const weightsDirty = computed(() => EVAL_TYPES.some((t) => Number(weights.value[t.key]) !== store.weights[t.key]))

function changeType(key) {
  activeType.value = key
  // 수정 모드는 '완료'를 누를 때까지 유지하고, 삭제 선택만 초기화한다
  if (mode.value === 'delete') mode.value = null
  checked.value = []
}

function startMode(action) {
  checked.value = []
  mode.value = mode.value === action ? null : action
}

// 수정 모드에서는 파란 밑줄 이름을 눌러야 수정 폼이 열린다(행 클릭은 무시)
function onRowClick(item) {
  if (mode.value === 'delete') {
    checked.value = checked.value.includes(item.id) ? checked.value.filter((id) => id !== item.id) : [...checked.value, item.id]
  }
}

function openAdd() {
  form.value = { name: '', newName: '', content: '', answerType: 'scale', types: [activeType.value] }
  formError.value = ''
}
function openEdit(item) {
  form.value = { ...item, newName: '', types: [...item.types] }
  formError.value = ''
}

// 선택 목록 맨 아래 '항목 추가하기'로 새 이름을 목록에 넣는다
function addItemName() {
  const name = form.value.newName.trim()
  if (!name) { formError.value = '추가할 항목 이름을 입력해 주세요.'; return false }
  if (!store.itemNames.includes(name)) store.itemNames.push(name)
  form.value.name = name
  form.value.newName = ''
  formError.value = ''
  return true
}

const allTypesChecked = computed({
  get: () => form.value && form.value.types.length === EVAL_TYPES.length,
  set: (v) => { form.value.types = v ? EVAL_TYPES.map((t) => t.key) : [] },
})

function save() {
  const f = form.value
  if (f.name === NEW_NAME && !addItemName()) return
  if (!f.name) { formError.value = '항목 이름을 선택해 주세요.'; return }
  if (!f.types.length) { formError.value = '적용할 평가 유형을 하나 이상 선택해 주세요.'; return }
  const data = { name: f.name.trim(), content: f.content.trim(), answerType: f.answerType, types: EVAL_TYPES.map((t) => t.key).filter((k) => f.types.includes(k)) }
  if (f.id) Object.assign(store.items.find((it) => it.id === f.id), data)
  else store.items.push({ id: newId(), ...data })
  toast(f.id ? '평가항목을 수정했습니다.' : '평가항목을 추가했습니다.')
  form.value = null
}

async function remove() {
  if (!checked.value.length) {
    toast('삭제할 항목을 먼저 체크해 주세요.', 'warning')
    return
  }
  const ok = await confirmDialog({
    title: '평가항목 삭제',
    message: `선택한 항목 ${checked.value.length}개를 ${typeLabel(activeType.value)}에서 삭제하시겠습니까?`,
    okText: '삭제',
    danger: true,
  })
  if (!ok) return
  store.items.forEach((it) => {
    if (checked.value.includes(it.id)) it.types = it.types.filter((t) => t !== activeType.value)
  })
  // 어느 평가에도 쓰이지 않는 항목은 완전히 지운다
  store.items = store.items.filter((it) => it.types.length)
  checked.value = []
  mode.value = null
  toast('평가항목을 삭제했습니다.')
}

// 끌어서 순서 바꾸기
function onDrop(target) {
  const from = store.items.findIndex((it) => it.id === dragId.value)
  const to = store.items.findIndex((it) => it.id === target.id)
  dragId.value = null
  if (from < 0 || to < 0 || from === to) return
  const [moved] = store.items.splice(from, 1)
  store.items.splice(to, 0, moved)
}

function saveWeights() {
  if (weightSum.value !== 100) {
    toast('가중치의 합계가 100%가 되도록 조정해 주세요.', 'warning')
    return
  }
  EVAL_TYPES.forEach((t) => { store.weights[t.key] = Number(weights.value[t.key]) })
  toast('가중치를 저장했습니다.')
}
function clampWeight(key) {
  const v = Math.round(Number(weights.value[key]) || 0)
  weights.value[key] = Math.min(100, Math.max(0, v))
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">평가항목</h1>
    </div>

    <div class="panel mb-3">
      <ul class="nav nav-tabs mb-3">
        <li v-for="t in EVAL_TYPES" :key="t.key" class="nav-item">
          <button class="nav-link" :class="{ active: activeType === t.key }" @click="changeType(t.key)">
            {{ t.label }} <span class="badge text-bg-light border ms-1">{{ itemsOfType(t.key).length }}</span>
          </button>
        </li>
      </ul>

      <div class="panel-head">
        <span class="panel-sub">항목을 끌어서 순서를 바꿀 수 있습니다.</span>
        <div class="d-flex gap-1 flex-wrap">
          <button class="btn btn-primary btn-sm" @click="openAdd">+ 추가하기</button>
          <button class="btn btn-sm" :class="mode === 'edit' ? 'btn-primary' : 'btn-outline-primary'" @click="startMode('edit')">{{ mode === 'edit' ? '완료' : '수정' }}</button>
          <button class="btn btn-sm" :class="mode === 'delete' ? 'btn-danger' : 'btn-outline-danger'" @click="startMode('delete')">삭제</button>
          <CsvButton />
        </div>
      </div>

      <div v-if="mode === 'edit'" class="mode-bar">
        <span>파란색 항목 이름을 누르면 수정할 수 있습니다. 수정을 마치면 '완료'를 누르세요.</span>
      </div>
      <div v-if="mode === 'delete'" class="mode-bar danger">
        <span>삭제할 항목을 체크하세요. ({{ checked.length }}개 선택)</span>
        <button class="btn btn-danger btn-sm ms-auto" :disabled="!checked.length" @click="remove">선택 삭제</button>
        <button class="btn btn-light btn-sm" @click="mode = null">취소</button>
      </div>

      <div class="table-responsive">
        <table class="table table-clean">
          <thead><tr><th style="width: 36px"></th><th>유형</th><th>항목 이름</th><th>내용</th><th>적용 평가</th></tr></thead>
          <tbody>
            <tr
              v-for="it in list" :key="it.id" :class="{ clickable: mode === 'delete', active: checked.includes(it.id), dragging: dragId === it.id }"
              draggable="true"
              @click="onRowClick(it)"
              @dragstart="dragId = it.id" @dragend="dragId = null" @dragover.prevent @drop="onDrop(it)"
            >
              <td v-if="mode === 'delete'">
                <input class="form-check-input" type="checkbox" :checked="checked.includes(it.id)" :aria-label="it.name + ' 선택'" @click.stop="onRowClick(it)" />
              </td>
              <td v-else class="handle" title="끌어서 순서 변경">≡</td>
              <td><span class="badge text-bg-secondary">{{ answerTypeLabel(it.answerType) }}</span></td>
              <td class="fw-semibold">
                <button v-if="mode === 'edit'" type="button" class="edit-link" @click.stop="openEdit(it)">{{ it.name }}</button>
                <template v-else>{{ it.name }}</template>
              </td>
              <td class="text-muted">{{ it.content }}</td>
              <td class="small">{{ it.types.map(typeLabel).join(', ') }}</td>
            </tr>
            <tr v-if="!list.length"><td colspan="5" class="empty-hint">등록된 평가항목이 없습니다. 추가하기를 눌러 항목을 만드세요.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2 class="panel-title">가중치 설정</h2>
        <span class="panel-sub">슬라이더를 끌거나 숫자를 입력하세요. 가중치의 합계는 100%여야 합니다.</span>
      </div>
      <div v-for="t in EVAL_TYPES" :key="t.key" class="weight-row">
        <label :for="'w-' + t.key" class="weight-label">{{ t.label }}</label>
        <input :id="'w-' + t.key" v-model.number="weights[t.key]" type="range" min="0" max="100" step="5" class="form-range" />
        <div class="input-group input-group-sm weight-input">
          <input v-model.number="weights[t.key]" type="number" min="0" max="100" class="form-control" :aria-label="t.label + ' 가중치'" @change="clampWeight(t.key)" />
          <span class="input-group-text">%</span>
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-between mt-3 flex-wrap gap-2">
        <div>
          합계 <strong :class="weightSum === 100 ? 'text-success' : 'text-danger'">{{ weightSum }}%</strong>
          <span v-if="weightSum === 100" class="text-success small ms-2">✓ 100%를 충족합니다.</span>
          <span v-else class="text-danger small ms-2">⚠ 합계가 100%가 아닙니다. ({{ weightSum > 100 ? weightSum - 100 + '% 초과' : 100 - weightSum + '% 부족' }})</span>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-light btn-sm" :disabled="!weightsDirty" @click="weights = { ...store.weights }">되돌리기</button>
          <button class="btn btn-primary btn-sm" @click="saveWeights">가중치 저장</button>
        </div>
      </div>
    </div>

    <AppModal v-if="form" :title="form.id ? '평가항목 수정' : '평가항목 추가'" @close="form = null">
      <div class="mb-3">
        <label class="form-label d-block">응답 유형</label>
        <div class="btn-group" role="group">
          <template v-for="a in ANSWER_TYPES" :key="a.key">
            <input :id="'at-' + a.key" v-model="form.answerType" type="radio" class="btn-check" :value="a.key" />
            <label class="btn btn-outline-primary btn-sm" :for="'at-' + a.key">{{ a.label }}</label>
          </template>
        </div>
        <div class="form-text">Y/N과 1~5점은 점수에 반영되고, 주관식과 서술형은 의견으로만 기록됩니다.</div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="i-name">항목 이름</label>
        <select id="i-name" v-model="form.name" class="form-select">
          <option value="" disabled>항목을 선택하세요</option>
          <option v-for="n in store.itemNames" :key="n" :value="n">{{ n }}</option>
          <option :value="NEW_NAME">+ 항목 추가하기</option>
        </select>
        <div v-if="form.name === NEW_NAME" class="input-group mt-2">
          <input v-model="form.newName" class="form-control" placeholder="새 항목 이름 (예: 리더십)" aria-label="새 항목 이름" @keydown.enter.prevent="addItemName" />
          <button class="btn btn-outline-primary" type="button" @click="addItemName">추가</button>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="i-content">내용</label>
        <textarea id="i-content" v-model="form.content" class="form-control" rows="2" placeholder="평가자에게 보여 줄 설명을 입력하세요"></textarea>
      </div>
      <div>
        <label class="form-label d-block">적용할 평가 (중복 선택 가능)</label>
        <div class="form-check form-check-inline">
          <input id="tp-all" v-model="allTypesChecked" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="tp-all">전체</label>
        </div>
        <div v-for="t in EVAL_TYPES" :key="t.key" class="form-check form-check-inline">
          <input :id="'tp-' + t.key" v-model="form.types" class="form-check-input" type="checkbox" :value="t.key" />
          <label class="form-check-label" :for="'tp-' + t.key">{{ t.label }}</label>
        </div>
      </div>
      <div v-if="formError" class="text-danger small mt-2">{{ formError }}</div>
      <template #footer>
        <button class="btn btn-light" @click="form = null">취소</button>
        <button class="btn btn-primary" @click="save">저장</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.handle { cursor: grab; color: #9aa0b4; font-size: 1.1rem; text-align: center; user-select: none; }
tr.dragging td { opacity: 0.4; }
.weight-row { display: grid; grid-template-columns: 90px 1fr 110px; gap: 16px; align-items: center; padding: 6px 0; }
.weight-label { font-weight: 600; }
.weight-input { width: 110px; }
</style>
