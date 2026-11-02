<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { store } from '../store'
import { computeResults } from '../scoring'
import FinalReport from './FinalReport.vue'
import InterviewReport from './InterviewReport.vue'

// 인쇄 전용 영역. store.printJob이 생기면 보고서를 그리고 브라우저 인쇄(PDF로 저장)를 연다.
// 한 사람의 보고서는 한 페이지에서 시작한다(여러 명을 고르면 PDF 하나에 사람별로 페이지가 나뉜다).
const rows = computed(() => (store.printJob?.kind === 'interview' ? computeResults().byId : {}))

watch(() => store.printJob, async (job) => {
  if (!job) return
  await nextTick()
  window.print()
})
const clear = () => { store.printJob = null }
onMounted(() => window.addEventListener('afterprint', clear))
onBeforeUnmount(() => window.removeEventListener('afterprint', clear))
</script>

<template>
  <div class="print-area" aria-hidden="true">
    <template v-if="store.printJob?.kind === 'final'">
      <FinalReport v-for="id in store.printJob.userIds" :key="id" :user-id="id" />
    </template>
    <template v-else-if="store.printJob?.kind === 'interview'">
      <InterviewReport v-for="id in store.printJob.userIds.filter((x) => rows[x])" :key="id" :row="rows[id]" />
    </template>
  </div>
</template>
