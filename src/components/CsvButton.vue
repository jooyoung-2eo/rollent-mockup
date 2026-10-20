<script setup>
import { ref } from 'vue'
import { toast } from '../store'
import AppModal from './AppModal.vue'

// choices를 주면 파일을 고르기 전에 어떤 파일인지 먼저 선택하게 한다
const props = defineProps({
  label: { type: String, default: 'CSV 불러오기' },
  choices: { type: Array, default: () => [] }, // [{ key, label, desc }]
})
const input = ref(null)
const askOpen = ref(false)
const choice = ref(null)

function onClick() {
  if (!props.choices.length) return input.value.click()
  choice.value = props.choices[0].key
  askOpen.value = true
}

function pickFile() {
  askOpen.value = false
  input.value.click()
}

function onChange(e) {
  const file = e.target.files[0]
  if (file) {
    const kind = props.choices.find((c) => c.key === choice.value)
    const prefix = kind ? `[${kind.label}] ` : ''
    toast(`${prefix}'${file.name}' 파일을 선택했습니다. 목업에서는 파일 내용을 실제로 불러오지 않습니다.`, 'warning')
  }
  e.target.value = ''
}
</script>

<template>
  <button type="button" class="btn btn-csv btn-sm" @click="onClick">{{ label }}</button>
  <input ref="input" type="file" accept=".csv,text/csv" class="d-none" @change="onChange" />

  <AppModal v-if="askOpen" title="CSV 불러오기" size="sm" @close="askOpen = false">
    <p class="small text-muted">불러올 파일의 종류를 선택하세요.</p>
    <div v-for="c in choices" :key="c.key" class="form-check mb-2">
      <input :id="'csv-' + c.key" v-model="choice" class="form-check-input" type="radio" :value="c.key" />
      <label class="form-check-label" :for="'csv-' + c.key">
        {{ c.label }}
        <div v-if="c.desc" class="small text-muted">{{ c.desc }}</div>
      </label>
    </div>
    <template #footer>
      <button class="btn btn-light" @click="askOpen = false">취소</button>
      <button class="btn btn-primary" @click="pickFile">파일 선택</button>
    </template>
  </AppModal>
</template>
