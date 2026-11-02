<script setup>
import { computed } from 'vue'
import { responseCount } from '../store'
import { DEFAULT_CHOICE_LABELS, EXAMPLE_CHOICE_SCORES, answerTypeLabel } from '../constants'
import AppModal from './AppModal.vue'
import SortableList from './SortableList.vue'

// 문항 하나의 설정(필수 여부, 글자 수, 면담 공개, 객관식 선택지)을 고친다.
// question은 평가 관리 화면의 '저장 전 초안'이므로 여기서 바로 바꾸고, 실제 반영은 그 화면의 저장 버튼에서 한다.
const props = defineProps({ question: { type: Object, required: true } })
const emit = defineEmits(['close'])
const q = props.question
let seq = 0
const newChoiceId = () => `${q.id}-n${Date.now().toString(36)}${seq++}`

const active = computed({
  get: () => q.choices.filter((c) => !c.deleted),
  // 정렬 결과를 반영할 때 삭제 표시된 선택지는 뒤에 그대로 둔다
  set: (list) => { q.choices = [...list, ...q.choices.filter((c) => c.deleted)] },
})
const deleted = computed(() => q.choices.filter((c) => c.deleted))
const errors = computed(() => {
  if (q.type !== 'choice') return []
  const out = []
  if (!active.value.length) out.push('선택지가 하나 이상 있어야 합니다.')
  if (active.value.some((c) => !c.label.trim())) out.push('비어 있는 선택지 문구가 있습니다.')
  const labels = active.value.map((c) => c.label.trim())
  if (new Set(labels).size !== labels.length) out.push('같은 문구의 선택지가 있습니다.')
  return out
})

function addChoice() {
  active.value = [...active.value, { id: newChoiceId(), label: '', score: null, deleted: false }]
}
function removeChoice(c) {
  const n = responseCount(q.id, c.id)
  if (n) c.deleted = true // 응답이 있으면 기록 보존을 위해 숨김 처리
  else q.choices = q.choices.filter((x) => x !== c)
}
function restoreChoice(c) {
  c.deleted = false
}
function fillDefaults() {
  active.value = [...active.value, ...DEFAULT_CHOICE_LABELS.filter((l) => !active.value.some((c) => c.label === l)).map((label) => ({ id: newChoiceId(), label, score: null, deleted: false }))]
}
// 현재 표시 순서대로 5, 4, 3, 2, 1 예시 점수를 넣는다(관리자가 누를 때만)
function fillExampleScores() {
  active.value.forEach((c, i) => { c.score = EXAMPLE_CHOICE_SCORES[i] ?? null })
}
function setScore(c, v) {
  c.score = v === '' || v === null ? null : Number(v)
}
function close() {
  if (errors.value.length) return
  emit('close')
}
</script>

<template>
  <AppModal :title="`문항 설정 · ${answerTypeLabel(q.type)}`" @close="close">
    <p class="small text-muted mb-3">{{ q.text || '(문항 내용 없음)' }}</p>

    <div class="d-flex flex-wrap gap-3 mb-3">
      <label class="form-check-label"><input v-model="q.required" type="checkbox" class="form-check-input me-1" />필수 응답</label>
      <label v-if="q.type !== 'choice'" class="form-check-label">
        <input v-model="q.shareInInterview" type="checkbox" class="form-check-input me-1" />팀장 면담 보고서에 응답 포함
      </label>
    </div>
    <div v-if="q.type !== 'choice'" class="mb-2">
      <label class="form-label small" for="qs-max">최대 글자 수 (비우면 제한 없음)</label>
      <input id="qs-max" class="form-control form-control-sm" style="max-width: 160px" type="number" min="1" :value="q.maxLength ?? ''" @input="q.maxLength = $event.target.value ? Number($event.target.value) : null" />
      <p class="small text-muted mt-2 mb-0">
        주관식·서술형은 채점 기준이 없어 점수에 반영하지 않습니다.
        면담 보고서 포함 여부는 공개 정책이 정해지지 않아 기본값이 '포함 안 함'입니다. 포함하더라도 평가자 이름은 표시하지 않습니다.
      </p>
    </div>

    <template v-if="q.type === 'choice'">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong class="small">선택지 (끌어서 순서 변경)</strong>
        <div class="d-flex gap-1">
          <button class="btn btn-outline-secondary btn-sm" @click="fillDefaults">기본 선택지 넣기</button>
          <button class="btn btn-outline-secondary btn-sm" @click="fillExampleScores">예시 점수(5→1) 채우기</button>
        </div>
      </div>
      <SortableList v-model="active" item-key="id">
        <template #default="{ item }">
          <input v-model="item.label" class="form-control form-control-sm" placeholder="선택지 문구" aria-label="선택지 문구" />
          <input
            class="form-control form-control-sm score" type="number" step="0.5" :value="item.score ?? ''" placeholder="미설정"
            aria-label="선택지 점수" @input="setScore(item, $event.target.value)"
          />
          <span v-if="responseCount(q.id, item.id)" class="badge text-bg-light border text-nowrap" title="이 선택지를 고른 응답 수">응답 {{ responseCount(q.id, item.id) }}</span>
          <button class="btn btn-link btn-sm text-danger p-0 text-nowrap" @click="removeChoice(item)">삭제</button>
        </template>
      </SortableList>
      <button class="btn btn-outline-primary btn-sm mt-2" @click="addChoice">+ 선택지 추가</button>
      <p class="small text-muted mt-2 mb-0">
        점수는 선택지마다 따로 저장되어, 순서나 문구를 바꿔도 기존 응답의 점수가 바뀌지 않습니다. 점수를 비워 두면 '미설정'으로 계산되지 않습니다.
        응답이 있는 선택지 문구를 크게 바꾸면 기존 응답의 의미가 달라질 수 있습니다.
      </p>
      <div v-if="deleted.length" class="mt-3 small">
        <strong>삭제된 선택지 (기존 응답 보존용)</strong>
        <div v-for="c in deleted" :key="c.id" class="d-flex gap-2 align-items-center mt-1 text-muted">
          <span>{{ c.label }} · {{ c.score ?? '점수 미설정' }}점 · 응답 {{ responseCount(q.id, c.id) }}건</span>
          <button class="btn btn-link btn-sm p-0" @click="restoreChoice(c)">되살리기</button>
        </div>
        <div class="text-muted mt-1">기존 응답은 이 선택지로 남아 점수도 유지되며, 새 응답에서는 고를 수 없습니다.</div>
      </div>
    </template>

    <div v-if="errors.length" class="alert alert-danger small py-2 mt-3 mb-0">
      <div v-for="e in errors" :key="e">{{ e }}</div>
    </div>
    <template #footer>
      <button class="btn btn-primary" :disabled="errors.length > 0" @click="close">확인</button>
    </template>
  </AppModal>
</template>

<style scoped>
.score { max-width: 90px; }
</style>
