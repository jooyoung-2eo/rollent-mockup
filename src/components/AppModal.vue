<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
})
const emit = defineEmits(['close'])
const widths = { sm: '420px', md: '560px', lg: '820px' }

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="modal-backdrop-mock" @mousedown.self="emit('close')">
    <div class="modal-box" :style="{ maxWidth: widths[props.size] }" role="dialog" aria-modal="true">
      <div class="modal-box-head">
        <h5 class="m-0 fw-bold">{{ title }}</h5>
        <button type="button" class="btn-close" aria-label="닫기" @click="emit('close')"></button>
      </div>
      <div class="modal-box-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="modal-box-foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
