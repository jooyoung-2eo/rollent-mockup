<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../store'
import { i18n, LANGS, setLang, t, dt, roleName } from '../i18n'
import { homeOf } from '../router'
import RollentLogo from '../components/RollentLogo.vue'
import AppModal from '../components/AppModal.vue'

const router = useRouter()
const loginName = ref('')
const password = ref('')
const showPw = ref(false)
const error = ref('')
const showFindPw = ref(false)
const langOpen = ref(false)
const showAccounts = ref(false)

// 시연용 테스트 계정(가상 인물)
const TEST_ACCOUNTS = computed(() => [
  { label: t('login.adminAccount'), name: '관리자', empNo: '0000' },
  { label: `${roleName('member')} (${dt('생산팀')})`, name: '이서준', empNo: '2019102' },
  { label: `${roleName('leader')} (${dt('생산팀')})`, name: '박성호', empNo: '2015001' },
  { label: roleName('exec'), name: '강태호', empNo: '2008002' },
])
function fillAccount(a) {
  loginName.value = a.name
  password.value = a.empNo
}

function onSubmit() {
  if (!loginName.value.trim() || !password.value) {
    error.value = t('login.needBoth')
    return
  }
  const result = login(loginName.value, password.value)
  if (!result.ok) {
    error.value = result.message
    return
  }
  error.value = ''
  router.push(homeOf(result.kind))
}

// 고른 언어는 로그인 화면과 사원·팀장·임원 화면에 적용된다
function selectLang(item) {
  setLang(item.key)
  langOpen.value = false
  error.value = ''
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" novalidate @submit.prevent="onSubmit">
      <div class="text-center mb-4">
        <RollentLogo :size="72" />
        <h1 class="brand">ROLLENT</h1>
      </div>

      <label class="form-label small" for="loginName">{{ t('login.id') }}</label>
      <input id="loginName" v-model="loginName" class="form-control mb-3" :placeholder="t('login.idPh')" autocomplete="username" />

      <label class="form-label small" for="pw">{{ t('login.pw') }}</label>
      <div class="input-group mb-2">
        <input
          id="pw" v-model="password" :type="showPw ? 'text' : 'password'" class="form-control"
          :placeholder="t('login.pwPh')" autocomplete="current-password"
        />
        <button type="button" class="btn btn-light border" @click="showPw = !showPw">{{ showPw ? t('login.hide') : t('login.show') }}</button>
      </div>

      <div v-if="error" class="login-error mb-2" role="alert">{{ error }}</div>

      <button type="submit" class="btn btn-primary w-100 mt-2">{{ t('login.submit') }}</button>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <button type="button" class="btn btn-link link-light p-0 small" @click="showFindPw = true">{{ t('login.findPw') }}</button>
        <div class="position-relative">
          <button type="button" class="btn btn-sm btn-outline-light" data-testid="lang-toggle" @click="langOpen = !langOpen">
            🌐 {{ LANGS.find((l) => l.key === i18n.pref).label }} ▾
          </button>
          <ul v-if="langOpen" class="lang-menu">
            <li v-for="l in LANGS" :key="l.key">
              <button type="button" :class="{ active: l.key === i18n.pref }" :data-lang="l.key" @click="selectLang(l)">{{ l.label }}</button>
            </li>
          </ul>
        </div>
      </div>

      <div class="test-note">
        <button type="button" class="btn btn-link link-light p-0 small" @click="showAccounts = !showAccounts">
          {{ showAccounts ? t('login.accountsHide') : t('login.accountsShow') }}
        </button>
        <div v-if="showAccounts" class="accounts">
          <p class="mb-1">{{ t('login.accountsNote') }}</p>
          <button v-for="a in TEST_ACCOUNTS" :key="a.label" type="button" class="account" @click="fillAccount(a)">
            {{ a.label }}: {{ a.name }} / {{ a.empNo }}
          </button>
        </div>
      </div>
    </form>

    <AppModal v-if="showFindPw" :title="t('login.findPw')" size="sm" @close="showFindPw = false">
      <p>{{ t('login.pwIs') }}</p>
      <p class="mb-0">{{ t('login.pwHelp') }}</p>
      <template #footer>
        <button class="btn btn-primary" @click="showFindPw = false">{{ t('common.ok') }}</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--surface); }
.login-card { width: 100%; max-width: 380px; background: var(--navy); color: #fff; border-radius: 14px; padding: 36px 32px 24px; box-shadow: 0 12px 40px rgba(20, 24, 60, 0.25); }
.brand { font-family: Georgia, "Times New Roman", serif; font-size: 1.7rem; font-weight: 400; letter-spacing: 0.14em; margin: 12px 0 0; }
.form-label { color: #c9cce6; }
.login-error { color: #ffb4b4; font-size: 0.85rem; }
.lang-menu { position: absolute; right: 0; bottom: calc(100% + 4px); list-style: none; padding: 4px; margin: 0; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); min-width: 120px; z-index: 10; }
.lang-menu button { width: 100%; text-align: left; border: 0; background: none; padding: 6px 10px; border-radius: 6px; color: #23263a; font-size: 0.9rem; }
.lang-menu button:hover { background: #f1f4fa; }
.lang-menu button.active { font-weight: 700; color: var(--brand); }
.test-note { margin: 18px 0 0; font-size: 0.78rem; color: #9ea2c8; text-align: center; }
.accounts { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.account { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e4e6f7; border-radius: 6px; padding: 4px 8px; font-size: 0.8rem; }
.account:hover { background: rgba(255, 255, 255, 0.16); }
</style>
