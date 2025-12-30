<script setup lang="ts">
import { computed, onMounted, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  connect,
  requestBattlemap,
  sendChatMessage,
  currentSocket,
  chatMessages,
  battlemapBase64,
} from "./client.ts";

const fid = ref("");
const character = ref("");

const isConnecting = ref(false);
const connectError = ref<string | null>(null);

const chatInput = ref("");
const isSending = ref(false);
const sendError = ref<string | null>(null);

const isRequestingMap = ref(false);
const mapError = ref<string | null>(null);

const chatScrollEl = ref<HTMLElement | null>(null);

const isConnected = computed(() => !!currentSocket.value?.connected);

const mapOpen = ref(false);

type Macro = { id: string; text: string };
const MACROS_KEY = "foundrystream:macros:v1";
const macros = ref<Macro[]>([]);
const macroInput = ref("");
const macroError = ref<string | null>(null);

function loadMacros(): void {
  try {
    const raw = localStorage.getItem(MACROS_KEY);
    if (!raw) {
      macros.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      macros.value = parsed
        .map((m: any) => ({
          id: String(m?.id ?? ""),
          text: String(m?.text ?? ""),
        }))
        .filter((m: Macro) => m.id && m.text.trim().length > 0);
    } else {
      macros.value = [];
    }
  } catch {
    macros.value = [];
  }
}

function saveMacros(): void {
  localStorage.setItem(MACROS_KEY, JSON.stringify(macros.value));
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function addMacro(): void {
  macroError.value = null;
  const t = macroInput.value.trim();
  if (!t) {
    macroError.value = "Enter a macro text.";
    return;
  }
  macros.value.unshift({ id: makeId(), text: t });
  macroInput.value = "";
  saveMacros();
}

function removeMacro(id: string): void {
  macros.value = macros.value.filter((m) => m.id !== id);
  saveMacros();
}

async function runMacro(text: string): Promise<void> {
  if (!isConnected.value) return;
  sendError.value = null;
  isSending.value = true;
  try {
    const res = await sendChatMessage(text);
    if (res === "NOT_CONNECTED") sendError.value = "Not connected.";
    if (res === "NOT_ALLOWED") sendError.value = "Sending chat is not allowed.";
  } catch (e: any) {
    sendError.value = e?.message ?? "Failed to send message.";
  } finally {
    isSending.value = false;
  }
}

function readQuery(): void {
  const qp = new URLSearchParams(window.location.search);
  const qFid = qp.get("fid");
  const qChar = qp.get("char");
  if (!fid.value && qFid) fid.value = qFid;
  if (!character.value && qChar) character.value = qChar;
}

async function scrollChatToBottom(): Promise<void> {
  await nextTick();
  if (!chatScrollEl.value) return;
  chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight;
}

watch(
  () => chatMessages.value.length,
  async () => {
    await scrollChatToBottom();
  }
);

async function onConnect(): Promise<void> {
  connectError.value = null;

  const f = fid.value.trim();
  const c = character.value.trim();

  if (!f || !c) {
    connectError.value = "Please enter both Foundry ID and Character.";
    return;
  }

  isConnecting.value = true;
  try {
    await connect(f, c);
    await scrollChatToBottom();
  } catch (e: any) {
    connectError.value = e?.message ?? "Failed to connect.";
  } finally {
    isConnecting.value = false;
  }
}

function onDisconnect(): void {
  try {
    currentSocket.value?.disconnect();
  } catch {}
}

async function onSend(): Promise<void> {
  sendError.value = null;
  const msg = chatInput.value.trim();
  if (!msg) return;

  isSending.value = true;
  try {
    const res = await sendChatMessage(msg);
    if (res === "NOT_CONNECTED") sendError.value = "Not connected.";
    if (res === "NOT_ALLOWED") sendError.value = "Sending chat is not allowed.";
    if (res === "SUCCESS") chatInput.value = "";
  } catch (e: any) {
    sendError.value = e?.message ?? "Failed to send message.";
  } finally {
    isSending.value = false;
  }
}

async function onRequestMap(): Promise<void> {
  mapError.value = null;

  isRequestingMap.value = true;
  try {
    const res = await requestBattlemap();
    if (res === "NOT_CONNECTED") mapError.value = "Not connected.";
    if (res === "NOT_ALLOWED") mapError.value = "Battlemap streaming is not allowed.";
  } catch (e: any) {
    mapError.value = e?.message ?? "Failed to request battlemap.";
  } finally {
    isRequestingMap.value = false;
  }
}

function onChatKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSend();
  }
}

function onMacroKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addMacro();
  }
}

function openMap(): void {
  if (!battlemapBase64.value) return;
  mapOpen.value = true;
  document.documentElement.style.overflow = "hidden";
}

function closeMap(): void {
  mapOpen.value = false;
  document.documentElement.style.overflow = "";
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && mapOpen.value) closeMap();
}

watch(mapOpen, (v) => {
  if (!v) return;
  nextTick(() => {
    const overlay = document.getElementById("map-overlay");
    overlay?.focus?.();
  });
});

onMounted(() => {
  readQuery();
  loadMacros();
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <div class="app">
    <header class="topbar container">
      <div class="brand">
        <img src="/logo.png" alt="" aria-hidden="true" />
        <div class="brand__text">
          <div class="brand__name">FoundryStream</div>
          <div class="brand__tag">Live viewer for Foundry</div>
        </div>
      </div>

      <div class="status">
        <span class="badge" :class="{ 'badge--on': isConnected }">
          <span class="badge__dot" aria-hidden="true" />
          {{ isConnected ? "Connected" : "Disconnected" }}
        </span>

        <button v-if="isConnected" class="btn btn--ghost btn--sm" type="button" @click="onDisconnect">
          Disconnect
        </button>
      </div>
    </header>

    <main class="container main">
      <section v-if="!isConnected" class="card auth">
        <div class="auth__head">
          <h1 class="h1">Connect</h1>
          <p class="p">Enter a Foundry ID and your character ID (UUID).</p>
        </div>

        <div class="grid">
          <label class="field">
            <span class="field__label">Foundry ID</span>
            <input v-model="fid" class="input" autocomplete="off" placeholder="e.g. 6f2c9a1b..." />
          </label>

          <label class="field">
            <span class="field__label">Character (Actor UUID)</span>
            <input
              v-model="character"
              class="input"
              autocomplete="off"
              placeholder="Actor.xxxxx or Compendium...Actor..."
            />
          </label>
        </div>

        <div class="actions">
          <button class="btn btn--primary" type="button" :disabled="isConnecting" @click="onConnect">
            {{ isConnecting ? "Connecting..." : "Connect" }}
          </button>

          <div v-if="connectError" class="hint hint--error">{{ connectError }}</div>
        </div>
      </section>

      <section v-else class="layout">
        <section class="card panel chat">
          <div class="panel__head">
            <div class="panel__title">Chat</div>
          </div>

          <div ref="chatScrollEl" class="chat__log" role="log" aria-live="polite">
            <div v-if="chatMessages.length === 0" class="empty">No messages yet.</div>

            <article v-for="(m, i) in chatMessages" :key="i" class="fv-msg fv-msg--img">
              <img
                v-if="m.startsWith('@png:')"
                class="fv-msg__img"
                :src="`data:image/png;base64,${m.slice(5)}`"
                alt="Chat message"
                loading="lazy"
                decoding="async"
              />
              <div v-else-if="m.startsWith('@html:')" class="fv-msg__html" v-html="m.slice(6)"></div>
            </article>
          </div>

          <div class="chat__composer">
            <div class="composer">
              <textarea
                v-model="chatInput"
                class="input composer__input"
                rows="1"
                placeholder="Type a message… (use /commands too)"
                @keydown="onChatKeydown"
              />
              <button
                class="btn btn--primary composer__btn"
                type="button"
                :disabled="isSending || !chatInput.trim()"
                @click="onSend"
              >
                {{ isSending ? "Sending..." : "Send" }}
              </button>
            </div>

            <div v-if="sendError" class="hint hint--error">{{ sendError }}</div>

            <div class="macrobar">
              <div class="macrobar__top">
                <div class="macrobar__title">Macros</div>
                <div class="macrobar__sub">Tap to send</div>
              </div>

              <div class="macrobar__chips" aria-label="Macros">
                <button
                  v-for="m in macros"
                  :key="m.id"
                  class="chip"
                  type="button"
                  :disabled="isSending"
                  @click="runMacro(m.text)"
                  :title="m.text"
                >
                  <span class="chip__text">{{ m.text }}</span>
                  <span class="chip__x" role="button" aria-label="Remove macro" @click.stop="removeMacro(m.id)">×</span>
                </button>
              </div>

              <div class="macrobar__add">
                <input
                  v-model="macroInput"
                  class="input macrobar__input"
                  placeholder="New macro text…"
                  @keydown="onMacroKeydown"
                />
                <button class="btn btn--ghost btn--sm macrobar__btn" type="button" @click="addMacro">
                  Add
                </button>
              </div>

              <div v-if="macroError" class="hint hint--error">{{ macroError }}</div>
            </div>
          </div>
        </section>

        <section class="card panel map map--big">
          <div class="panel__head panel__head--row">
            <div>
              <div class="panel__title">Battlemap</div>
              <div class="panel__sub">Tap to view fullscreen</div>
            </div>

            <button class="btn btn--ghost btn--sm" type="button" :disabled="isRequestingMap" @click="onRequestMap">
              {{ isRequestingMap ? "Requesting..." : "Request" }}
            </button>
          </div>

          <button
            class="map__stage map__stage--button"
            type="button"
            :disabled="!battlemapBase64"
            @click="openMap"
            :aria-disabled="!battlemapBase64"
            :title="battlemapBase64 ? 'Open fullscreen' : ''"
          >
            <div v-if="!battlemapBase64" class="empty">
              No battlemap yet. Tap <span class="mono">Request</span>.
            </div>

            <img
              v-else
              class="map__img"
              :src="`data:image/png;base64,${battlemapBase64}`"
              alt="Battlemap"
              loading="eager"
            />

            <div v-if="battlemapBase64" class="map__hint">Click / tap to expand</div>
          </button>

          <div v-if="mapError" class="hint hint--error">{{ mapError }}</div>
        </section>
      </section>
    </main>

    <div
      v-if="mapOpen"
      id="map-overlay"
      class="overlay"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Battlemap fullscreen"
      @click.self="closeMap"
    >
      <div class="overlay__top">
        <div class="overlay__title">Battlemap</div>
        <button class="btn btn--ghost btn--sm" type="button" @click="closeMap">Close</button>
      </div>

      <div class="overlay__stage">
        <img
          v-if="battlemapBase64"
          class="overlay__img"
          :src="`data:image/png;base64,${battlemapBase64}`"
          alt="Battlemap fullscreen"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem 0;
}

.container {
  width: min(100% - 2rem, var(--max, 1100px));
  margin-inline: auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;

  img {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    object-fit: cover;
    flex-shrink: 0;
  }
}

.brand__text {
  min-width: 0;
}

.brand__name {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand__tag {
  font-size: 0.92rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.main {
  flex: 1;
  display: grid;
  gap: 1rem;
}

.h1 {
  font-size: clamp(1.25rem, 2.2vw, 1.55rem);
  font-weight: 900;
  letter-spacing: 0.2px;
}

.p {
  color: var(--muted);
  margin-top: 0.35rem;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field__label {
  font-weight: 800;
  font-size: 0.92rem;
  color: rgba(255, 255, 255, 0.8);
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
}

.actions {
  display: grid;
  gap: 0.6rem;
  align-items: start;
  margin-top: 0.75rem;
}

.hint {
  font-size: 0.92rem;
  color: var(--muted);
}

.hint--error {
  color: rgba(255, 160, 160, 0.95);
}

.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
  min-height: 0;
}

.panel {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 0;
}

.panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.85rem;
}

.panel__head--row {
  align-items: center;
}

.panel__title {
  font-weight: 900;
  letter-spacing: 0.2px;
  font-size: 1.05rem;
}

.panel__sub {
  color: var(--muted);
  font-size: 0.92rem;
  margin-top: 0.15rem;
}

.chat__log {
  border-radius: 16px;
  border: 1px solid rgba(120, 200, 255, 0.14);
  background: rgba(0, 0, 0, 0.18);
  padding: 0.85rem;
  overflow: auto;
  min-height: 220px;
}

.empty {
  color: rgba(255, 255, 255, 0.58);
  text-align: center;
  padding: 1.1rem 0.75rem;
}

.chat__composer {
  padding-top: 0.85rem;
  display: grid;
  gap: 0.55rem;
}

.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.7rem;
  align-items: end;
}

.composer__input {
  resize: none;
  min-height: 44px;
  max-height: 140px;
}

.composer__btn {
  height: 44px;
  padding-inline: 1rem;
}

.fv-msg--img {
  margin-top: 0.65rem;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.22);
}

.fv-msg__img {
  width: 100%;
  height: auto;
  display: block;
}

.fv-msg__html {
  padding: 0.75rem;
}

.macrobar {
  margin-top: 0.7rem;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  padding-top: 0.7rem;
  display: grid;
  gap: 0.55rem;
}

.macrobar__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.macrobar__title {
  font-weight: 900;
  letter-spacing: 0.2px;
  font-size: 0.95rem;
}

.macrobar__sub {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.88rem;
}

.macrobar__chips {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(120, 200, 255, 0.18);
  background: rgba(0, 0, 0, 0.22);
  padding: 0.35rem 0.55rem 0.35rem 0.6rem;
  color: rgba(255, 255, 255, 0.9);
  max-width: 100%;
}

.chip:disabled {
  opacity: 0.75;
}

.chip__text {
  font-weight: 800;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(320px, 70vw);
}

.chip__x {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.macrobar__add {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.6rem;
}

.macrobar__btn {
  height: 44px;
}

.macrobar__input {
  height: 44px;
}

.map--big {
  grid-template-rows: auto 1fr auto;
}

.map__stage {
  border-radius: 16px;
  border: 1px solid rgba(120, 200, 255, 0.14);
  background: rgba(0, 0, 0, 0.18);
  overflow: hidden;
  min-height: 380px;
  display: grid;
  place-items: center;
  position: relative;
}

.map__stage--button {
  width: 100%;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.map__stage--button:disabled {
  cursor: default;
  opacity: 0.9;
}

.map__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.map__hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.85rem;
  backdrop-filter: blur(10px);
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(10px);
  display: grid;
  grid-template-rows: auto 1fr;
  z-index: 9999;
}

.overlay__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
}

.overlay__title {
  font-weight: 900;
  letter-spacing: 0.2px;
}

.overlay__stage {
  display: grid;
  place-items: center;
  padding: 0.75rem;
}

.overlay__img {
  width: 100%;
  height: 100%;
  max-height: calc(100svh - 70px);
  object-fit: contain;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.22);
}

@media (min-width: 900px) {
  .layout {
    grid-template-columns: 1.15fr 0.85fr;
    align-items: stretch;
  }
  .map__stage {
    min-height: 520px;
  }
}
</style>
