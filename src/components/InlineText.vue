<script setup>
import { nextTick, ref } from 'vue'

// 클릭하면 바로 고칠 수 있는 글자. Enter 또는 바깥 클릭으로 반영, Esc로 취소.
const props = defineProps({
  modelValue: { type: [String, Number, null], default: '' },
  multiline: { type: Boolean, default: false },
  type: { type: String, default: 'text' }, // text | number
  placeholder: { type: String, default: '클릭해서 입력' },
  label: { type: String, default: '' }, // 접근성용 이름
  emptyText: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const editing = ref(false)
const draft = ref('')
const input = ref(null)

async function start() {
  draft.value = props.modelValue ?? ''
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select?.()
}
function commit() {
  if (!editing.value) return
  editing.value = false
  let v = draft.value
  if (props.type === 'number') v = v === '' || v === null ? null : Number(v)
  else v = String(v).trim()
  if (v !== props.modelValue) emit('update:modelValue', v)
}
function cancel() {
  editing.value = false
}
</script>

<template>
  <template v-if="editing">
    <textarea
      v-if="multiline" ref="input" v-model="draft" class="form-control form-control-sm" rows="2" :aria-label="label"
      @blur="commit" @keydown.esc.prevent="cancel" @keydown.enter.exact.prevent="commit"
    ></textarea>
    <input
      v-else ref="input" v-model="draft" :type="type" class="form-control form-control-sm" :aria-label="label"
      @blur="commit" @keydown.esc.prevent="cancel" @keydown.enter.prevent="commit"
    />
  </template>
  <button v-else type="button" class="inline-text" :title="`클릭해서 수정${label ? ': ' + label : ''}`" @click="start">
    <span v-if="modelValue !== null && modelValue !== ''">{{ modelValue }}</span>
    <span v-else class="placeholder-text">{{ emptyText || placeholder }}</span>
  </button>
</template>

<style scoped>
.inline-text {
  background: none; border: 0; padding: 2px 4px; margin: -2px -4px; text-align: left; color: inherit; font: inherit;
  border-radius: 4px; border-bottom: 1px dashed #b9c2d6; cursor: text; max-width: 100%;
}
.inline-text:hover, .inline-text:focus-visible { background: #eef4fc; border-bottom-color: var(--brand); outline: none; }
.placeholder-text { color: #a0a6b8; font-style: italic; }
</style>
