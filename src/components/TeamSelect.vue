<script setup>
import { db } from '../store'

// 소속 팀 선택. '새 팀 직접 입력'을 고르면 팀 이름 입력란이 나타난다.
// v-model: 팀 id | null(미배정) | 'new' | ''(변경 안 함, keepOption일 때)
defineProps({
  modelValue: { type: [Number, String, null], default: null },
  newName: { type: String, default: '' },
  keepOption: { type: Boolean, default: false },
  id: { type: String, default: 'team-select' },
})
const emit = defineEmits(['update:modelValue', 'update:newName'])
</script>

<template>
  <select :id="id" class="form-select" :value="modelValue ?? 'none'" @change="emit('update:modelValue', $event.target.value === 'none' ? null : $event.target.value === 'new' || $event.target.value === '' ? $event.target.value : Number($event.target.value))">
    <option v-if="keepOption" value="">변경 안 함</option>
    <option value="none">미배정</option>
    <option v-for="t in db.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
    <option value="new">+ 새 팀 직접 입력</option>
  </select>
  <input
    v-if="modelValue === 'new'" :value="newName" class="form-control mt-2" placeholder="새 팀 이름 (예: 마케팅팀)"
    aria-label="새 팀 이름" @input="emit('update:newName', $event.target.value)"
  />
</template>
