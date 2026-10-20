<script setup>
import { ref } from 'vue'

// 끌어서 순서를 바꾸는 목록. v-model로 배열을 주고받는다.
const props = defineProps({
  modelValue: { type: Array, required: true },
  itemKey: { type: String, default: 'key' },
})
const emit = defineEmits(['update:modelValue'])
const dragKey = ref(null)
const overKey = ref(null)

function onDrop(target) {
  const list = [...props.modelValue]
  const from = list.findIndex((x) => x[props.itemKey] === dragKey.value)
  const to = list.findIndex((x) => x[props.itemKey] === target[props.itemKey])
  dragKey.value = null
  overKey.value = null
  if (from < 0 || to < 0 || from === to) return
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  emit('update:modelValue', list)
}
</script>

<template>
  <ul class="sortable-list">
    <li
      v-for="(item, i) in modelValue" :key="item[itemKey]" draggable="true"
      :class="{ dragging: dragKey === item[itemKey], over: overKey === item[itemKey] && dragKey !== item[itemKey] }"
      @dragstart="dragKey = item[itemKey]" @dragend="dragKey = null; overKey = null"
      @dragover.prevent="overKey = item[itemKey]" @drop="onDrop(item)"
    >
      <span class="handle" title="끌어서 순서 변경">≡</span>
      <span class="order">{{ i + 1 }}</span>
      <slot :item="item" />
    </li>
  </ul>
</template>

<style scoped>
.sortable-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.sortable-list li {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border: 1px solid var(--card-border); border-radius: 8px; background: #fff; cursor: grab;
}
.sortable-list li.dragging { opacity: 0.4; }
.sortable-list li.over { border-color: var(--brand); box-shadow: 0 0 0 2px #cfe0f6; }
.handle { color: #9aa0b4; font-size: 1.1rem; user-select: none; }
.order { color: var(--text-muted); font-size: 0.8rem; min-width: 14px; }
</style>
