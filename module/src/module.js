import { io } from "socket.io-client";
import html2canvas from "html2canvas";

const MODULE_ID = "foundry-stream";

let socket = null;
let foundryId = null;

const getSetting = (k) => game.settings.get(MODULE_ID, k);

const setFoundryId = async (id) => {
  foundryId = id || null;
  await game.settings.set(MODULE_ID, "foundryId", foundryId ?? "");
};

const disconnectRelay = async () => {
  try { socket?.disconnect(); } catch {}
  socket = null;
  foundryId = null;
  await game.settings.set(MODULE_ID, "foundryId", "");
};

const pushSettings = () => {
  if (!socket?.connected) return;
  socket.emit("settings:setBattlemap", !!getSetting("allowBattlemap"));
  socket.emit("settings:setViewChat", !!getSetting("allowViewChat"));
  socket.emit("settings:setSendChat", !!getSetting("allowSendChat"));
};

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

async function resolveActorFromUuid(actorUuid) {
  if (!actorUuid) return { actor: null, token: null };

  const doc = await fromUuid(actorUuid).catch(() => null);
  if (!doc) return { actor: null, token: null };

  if (doc.documentName === "Actor") {
    const actor = doc;
    const token = findTokenForActor(actor);
    return { actor, token };
  }

  if (doc.documentName === "Token" || doc.documentName === "TokenDocument") {
    const tokenDoc = doc.documentName === "Token" ? doc.document : doc;
    const token = canvas?.tokens?.placeables?.find((t) => t.document?.uuid === tokenDoc.uuid) ?? null;
    const actor = token?.actor ?? tokenDoc.actor ?? null;
    return { actor, token };
  }

  return { actor: null, token: null };
}

function findTokenForActor(actor) {
  if (!canvas?.ready || !actor) return null;
  const tokens = canvas.tokens?.placeables ?? [];
  return tokens.find((t) => t?.actor?.id === actor.id) ?? null;
}

async function getActorNameFromUuid(actorUuid) {
  try {
    const doc = await fromUuid(actorUuid);
    if (!doc) return "Unknown";
    if (doc.documentName === "Actor") return doc.name ?? "Unknown";
    if (doc.documentName === "Token" || doc.documentName === "TokenDocument") {
      const actor = doc.actor ?? doc?.document?.actor;
      return actor?.name ?? "Unknown";
    }
    return doc.name ?? "Unknown";
  } catch {
    return "Unknown";
  }
}

function getSpeakerFromActorToken(actor, token) {
  return ChatMessage.getSpeaker({
    actor: actor ?? undefined,
    token: token?.document ?? undefined
  });
}

async function runChatCommand(text) {
  const cmd = String(text ?? "").trim();
  if (!cmd.startsWith("/")) return false;
  if (ui?.chat?.processMessage) {
    await ui.chat.processMessage(cmd);
    return true;
  }
  return false;
}

function forceExpanded(el) {
  if (!el) return;

  el.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;

    const s = node.style;
    if (s.display === "none") s.display = "block";
    if (s.visibility === "hidden") s.visibility = "visible";
    if (s.opacity === "0") s.opacity = "1";

    if (node.classList.contains("dice-tooltip")) {
      s.display = "block";
      s.position = "static";
      s.maxHeight = "none";
      s.visibility = "visible";
      s.opacity = "1";
    }
  });

  el.querySelectorAll(".dice-tooltip").forEach((d) => {
    if (!(d instanceof HTMLElement)) return;
    d.style.display = "block";
    d.style.position = "static";
    d.style.visibility = "visible";
    d.style.opacity = "1";
  });

  el.querySelectorAll(".hidden").forEach((h) => h.classList.remove("hidden"));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getChatLogElement() {
  const chat = document.getElementById("chat");
  const log = chat?.getElementsByClassName("chat-log")?.[0];
  return log instanceof HTMLElement ? log : null;
}

function findMessageElementInChatLog(messageId) {
  const log = getChatLogElement();
  if (!log) return null;
  const el = log.querySelector(`li.chat-message[data-message-id="${messageId}"]`);
  return el instanceof HTMLElement ? el : null;
}

async function waitForMessageElement(messageId, tries = 12, delayMs = 80) {
  for (let i = 0; i < tries; i++) {
    const el = findMessageElementInChatLog(messageId);
    if (el) return el;
    await sleep(delayMs);
  }
  return null;
}

function applyDarkRenderSkin(root) {
  if (!(root instanceof HTMLElement)) return;

  root.style.background = "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.98))";
  root.style.color = "rgba(255,255,255,0.92)";
  root.style.border = "1px solid rgba(255,255,255,0.16)";
  root.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.08)";
  root.style.borderRadius = "10px";
  root.style.overflow = "hidden";
  root.style.padding = "0.6rem 0.75rem";

  root.querySelectorAll("*").forEach((n) => {
    if (!(n instanceof HTMLElement)) return;

    const tag = n.tagName.toLowerCase();
    if (tag === "a") {
      n.style.color = "rgba(150,220,255,0.95)";
      n.style.textDecoration = "underline";
      n.style.textUnderlineOffset = "2px";
    }

    if (n.classList.contains("message-header")) {
      n.style.borderBottom = "1px solid rgba(255,255,255,0.14)";
      n.style.marginBottom = "0.5rem";
      n.style.paddingBottom = "0.45rem";
    }

    if (n.classList.contains("message-content")) {
      n.style.color = "rgba(255,255,255,0.92)";
    }

    if (n.classList.contains("dice-formula") || n.classList.contains("dice-total") || n.classList.contains("dice-result")) {
      n.style.background = "rgba(0,0,0,0.35)";
      n.style.border = "1px solid rgba(255,255,255,0.16)";
      n.style.borderRadius = "6px";
      n.style.padding = "0.35rem 0.45rem";
    }
  });
}

async function renderChatMessageToPngBase64(chatMessage) {
  const messageId = chatMessage?.id;
  if (!messageId) return null;

  await sleep(180);
  await new Promise(requestAnimationFrame);

  const liveEl = await waitForMessageElement(messageId, 18, 80);
  if (!liveEl) return null;

  const html = liveEl.outerHTML;
  if (!html || html.length < 20) return null;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "420px";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  host.innerHTML = html;

  const target = host.firstElementChild;
  if (!(target instanceof HTMLElement)) {
    host.remove();
    console.log("FoundryStream: Chat message element not found after cloning.");
    return null;
  }

  forceExpanded(target);
  applyDarkRenderSkin(target);

  await sleep(60);
  await new Promise(requestAnimationFrame);

  const canvasEl = await html2canvas(target, {
    useCORS: true,
    backgroundColor: "#0b0f12",
    logging: false,
    scale: Math.min(2, window.devicePixelRatio || 1),
    ignoreElements: (element) => {
      const t = element?.tagName;
      if (!t) return false;
      return t === "IFRAME" || t === "VIDEO" || t === "CANVAS";
    },
    onclone: (doc) => {
      doc.querySelectorAll("iframe,video,canvas").forEach((n) => n.remove());
      doc.querySelectorAll(".dice-tooltip").forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        n.style.display = "block";
        n.style.position = "static";
        n.style.visibility = "visible";
        n.style.opacity = "1";
      });
    }
  }).catch((e) => {
    console.error("FoundryStream chat message render failed:", e);
    return null;
  });

  host.remove();

  if (!canvasEl) return null;
  const dataUrl = canvasEl.toDataURL("image/png");
  return dataUrl.split(",")[1] || null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toAbsoluteImgSrc(src) {
  if (!src) return "";
  const s = String(src).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:") || s.startsWith("blob:")) return s;

  const base = window.location.origin;
  if (s.startsWith("/")) return base + s;
  return base + "/" + s;
}

function text(el) {
  return (el?.textContent ?? "").trim();
}

function isDiceMessage(liveEl) {
  return !!liveEl?.querySelector?.(".dice-roll, .dice-result, .dice-tooltip, .dice-total, .dice-formula");
}

function parseDiceFromMessage(liveEl) {
  const content = liveEl?.querySelector?.(".message-content") ?? liveEl;

  const formulaEl = content?.querySelector?.(".dice-formula");
  const formula = text(formulaEl);

  const totals = Array.from(content?.querySelectorAll?.("h4.dice-total") ?? []);
  const primaryTotal = totals.length ? text(totals[0]) : "";
  const outcomeEl = totals.length > 1 ? totals[totals.length - 1] : null;
  const outcomeText = outcomeEl ? text(outcomeEl) : "";
  const outcomeColor = outcomeEl instanceof HTMLElement ? (outcomeEl.style?.color || "") : "";

  const diceLis = Array.from(content?.querySelectorAll?.("ol.dice-rolls > li.roll") ?? []);
  const dice = diceLis.map((li) => {
    const value = parseInt(text(li), 10);
    const classes = li.className || "";
    const isSuccess = classes.includes("success") || value >= 6;
    const isCrit = classes.includes("max") || value === 10;
    const isFail = classes.includes("min") || value === 1;
    return { value, isSuccess, isCrit, isFail };
  });

  const senderEl = liveEl?.querySelector?.(".message-sender");
  const sender = text(senderEl) || "Unknown";

  const timeEl = liveEl?.querySelector?.(".message-timestamp");
  const timestamp = text(timeEl) || "";

  const portraitImg = liveEl?.querySelector?.(".message-header .portrait img");
  const portrait = toAbsoluteImgSrc(portraitImg?.getAttribute?.("src") ?? "");

  const headerName = content?.querySelector?.("div[style*='display:flex'] span");
  const characterName = text(headerName) || sender;

  const userItalic = content?.querySelector?.("div[style*='display:flex'] i");
  const userName = text(userItalic) || sender;

  return {
    sender,
    timestamp,
    portrait,
    characterName,
    userName,
    formula,
    primaryTotal,
    outcomeText,
    outcomeColor,
    dice
  };
}

function buildFallbackDiceHtmlFromLiveEl(liveEl) {
  if (!liveEl) return null;

  const d = parseDiceFromMessage(liveEl);

  const outcomeColor = d.outcomeColor || (d.outcomeText.toLowerCase().includes("success") ? "#39d07a" : "#ff6a6a");

  const diceHtml = d.dice
    .map((x) => {
      const bg =
        x.isCrit ? "rgba(80,200,255,0.18)" :
          x.isSuccess ? "rgba(80,255,170,0.14)" :
            x.isFail ? "rgba(255,120,120,0.14)" :
              "rgba(255,255,255,0.06)";

      const border =
        x.isCrit ? "rgba(120,220,255,0.45)" :
          x.isSuccess ? "rgba(120,255,170,0.38)" :
            x.isFail ? "rgba(255,160,160,0.40)" :
              "rgba(255,255,255,0.16)";

      const color =
        x.isCrit ? "rgba(170,240,255,0.98)" :
          x.isSuccess ? "rgba(170,255,210,0.98)" :
            x.isFail ? "rgba(255,180,180,0.98)" :
              "rgba(255,255,255,0.92)";

      return `
        <div style="
          width:34px;height:34px;
          border-radius:10px;
          display:flex;align-items:center;justify-content:center;
          background:${bg};
          border:1px solid ${border};
          color:${color};
          font-weight:900;
          letter-spacing:0.2px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        ">${escapeHtml(x.value)}</div>
      `;
    })
    .join("");

  const portrait = d.portrait
    ? `<img src="${escapeHtml(d.portrait)}" style="width:44px;height:44px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.25)" alt="">`
    : `<div style="width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06)"></div>`;

  const html = `
  <div style="
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji','Segoe UI Emoji';
    color: rgba(255,255,255,0.92);
    background: linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.98));
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 22px rgba(0,0,0,0.45);
  ">
    <div style="
      display:flex;align-items:center;gap:12px;
      padding:12px 12px 10px 12px;
      border-bottom:1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.22);
    ">
      ${portrait}
      <div style="min-width:0;flex:1">
        <div style="font-weight:900;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(d.characterName || d.sender)}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.62);display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <span style="font-style:italic">${escapeHtml(d.userName || d.sender)}</span>
          ${d.timestamp ? `<span style="opacity:0.9">•</span><span>${escapeHtml(d.timestamp)}</span>` : ""}
        </div>
      </div>
    </div>

    <div style="padding:12px">
      ${d.formula ? `
        <div style="
          display:inline-flex;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          font-weight:800;
          font-size:12px;
          letter-spacing:0.2px;
          margin-bottom:10px;
        ">
          ${escapeHtml(d.formula)}
        </div>
      ` : ""}

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        ${diceHtml || `<div style="color:rgba(255,255,255,0.65)">No dice details</div>`}
      </div>

      <div style="
        display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
        padding:10px 10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.25);
      ">
        <div style="font-weight:900">
          ${escapeHtml(d.primaryTotal || "")}
        </div>
        <div style="font-weight:900;color:${escapeHtml(outcomeColor)}">
          ${escapeHtml(d.outcomeText || "")}
        </div>
      </div>
    </div>
  </div>
  `.trim();

  return html;
}

async function relayChatMessage(chatMessage) {
  if (!socket?.connected) return;
  if (!getSetting("allowViewChat")) return;

  const png = await renderChatMessageToPngBase64(chatMessage);
  if (png) {
    socket.emit("chat:message", '@png:' + png);
    return;
  }

  const liveEl = await waitForMessageElement(chatMessage.id, 18, 80);
  if (!liveEl) return;

  if (isDiceMessage(liveEl)) {
    const html = buildFallbackDiceHtmlFromLiveEl(liveEl);
    if (html) socket.emit("chat:message", '@html:' + html);
    return;
  }

  const html = liveEl.outerHTML;
  socket.emit("chat:message", '@html:' + html);
}

async function captureBattlemapBase64() {
  try {
    if (!canvas?.ready) return null;

    await new Promise(requestAnimationFrame);

    const renderer = canvas.app.renderer;
    const stage = canvas.app.stage;

    const w = Math.floor(renderer.screen.width);
    const h = Math.floor(renderer.screen.height);
    const resolution = renderer.resolution ?? window.devicePixelRatio ?? 1;

    const rt = PIXI.RenderTexture.create({
      width: w,
      height: h,
      resolution
    });

    renderer.render(stage, { renderTexture: rt, clear: true });

    const outCanvas = renderer.extract.canvas(rt);
    rt.destroy(true);

    const ctx = outCanvas.getContext("2d");
    if (ctx) {
      const copy = document.createElement("canvas");
      copy.width = outCanvas.width;
      copy.height = outCanvas.height;
      const c2 = copy.getContext("2d");
      if (c2) {
        c2.fillStyle = "#000";
        c2.fillRect(0, 0, copy.width, copy.height);
        c2.drawImage(outCanvas, 0, 0);
        const dataUrl = copy.toDataURL("image/png");
        return dataUrl.split(",")[1] || null;
      }
    }

    const dataUrl = outCanvas.toDataURL("image/png");
    return dataUrl.split(",")[1] || null;
  } catch (e) {
    console.error("FoundryStream battlemap capture failed:", e);
    return null;
  }
}



async function connectRelay() {
  if (!game.user.isGM) return;
  if (!getSetting("enabled")) return;

  const url = String(getSetting("serverUrl") || "").trim();
  if (!url) return ui.notifications.warn("FoundryStream: Server URL is not set.");
  if (socket?.connected) return;

  socket = io(url, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    timeout: 8000
  });

  socket.on("connect", async () => {
    await setFoundryId(socket.id);
    socket.emit("hello", { type: "foundry" });
    pushSettings();
    ui.notifications.info("FoundryStream: Connected.");
    navigator.clipboard.writeText(String(getSetting("foundryId") || foundryId || "")).catch(() => {});
  });

  socket.on("disconnect", () => ui.notifications.warn("FoundryStream: Disconnected."));
  socket.on("connect_error", (err) => ui.notifications.error(`FoundryStream: ${err?.message ?? err}`));

  socket.on("battlemap:request", async (watcherId, actorUuid) => {
    if (!getSetting("allowBattlemap")) return;

    const name = await getActorNameFromUuid(String(actorUuid ?? ""));
    const content = `<p>The player of actor "<b>${name}</b>" requests a battlemap screenshot.</p>`;

    const accepted = await Dialog.confirm({
      title: "FoundryStream",
      content,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });

    if (!accepted) return;

    const b64img = await captureBattlemapBase64();
    if (!b64img) return;

    socket.emit("battlemap:send", watcherId, b64img);
  });

  socket.on("chat:message", async (watcherId, actorUuid, message) => {
    if (!getSetting("allowSendChat")) return;

    const content = String(message ?? "").trim();
    if (!content) return;

    if (content.startsWith("/")) {
      const ok = await runChatCommand(content);
      if (ok) return;
    }

    const { actor, token } = await resolveActorFromUuid(String(actorUuid ?? ""));
    const speaker = getSpeakerFromActorToken(actor, token);

    await ChatMessage.create({
      speaker,
      content,
      user: game.user.id
    });
  });
}

function registerSettings() {
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable Relay",
    hint: "Connect this GM world to the relay server.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: async (v) => {
      if (!game.user.isGM) return;
      if (v) await connectRelay();
      else await disconnectRelay();
    }
  });

  game.settings.register(MODULE_ID, "serverUrl", {
    name: "Relay Server URL",
    hint: "Example: https://your-server.tld or http://localhost:3000",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: async () => {
      if (!game.user.isGM) return;
      if (getSetting("enabled")) {
        await disconnectRelay();
        await connectRelay();
      }
    }
  });

  game.settings.register(MODULE_ID, "allowBattlemap", {
    name: "Allow Battlemap",
    hint: "Watchers can request a battlemap image (camera pans to actor token if available).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: pushSettings
  });

  game.settings.register(MODULE_ID, "allowViewChat", {
    name: "Allow View Chat",
    hint: "Send chat messages to watchers as PNG images (expanded tooltips).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: pushSettings
  });

  game.settings.register(MODULE_ID, "allowSendChat", {
    name: "Allow Send Chat",
    hint: "Allow watchers to send chat or run slash commands.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: pushSettings
  });

  game.settings.register(MODULE_ID, "foundryId", {
    name: "Relay ID (Read-only)",
    hint: "Share it via stream codes.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
}

function patchFoundryIdReadonly() {
  Hooks.on("renderSettingsConfig", (app, html) => {
    const input = html.find(`input[name="${MODULE_ID}.foundryId"]`);
    if (!input?.length) return;
    input.prop("readonly", true);
    input.css({ opacity: "0.85" });
  });
}

function addActorContextMenu() {
  Hooks.on("getActorDirectoryEntryContext", (html, entries) => {
    entries.push({
      name: "Copy Stream Code",
      icon: '<i class="fas fa-copy"></i>',
      condition: () => game.user.isGM,
      callback: async (li) => {
        const actorId =
          li?.data?.("documentId") ??
          li?.attr?.("data-document-id") ??
          li?.attr?.("data-entity-id") ??
          null;

        const actor = actorId ? game.actors?.get(String(actorId)) : null;
        if (!actor) return ui.notifications.error("FoundryStream: Actor not found.");

        const id = String(getSetting("foundryId") || foundryId || "").trim();
        if (!id) return ui.notifications.warn("FoundryStream: Connect relay first.");

        const raw = `relay ${id};${actor.uuid}`;
        const code = b64(raw);

        await navigator.clipboard.writeText(code);
        ui.notifications.info("FoundryStream: Stream code copied.");
      }
    });
  });
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", async () => {
  patchFoundryIdReadonly();
  addActorContextMenu();

  if (game.user.isGM && getSetting("enabled")) {
    await connectRelay();
  }

  Hooks.on("createChatMessage", (message) => {
    relayChatMessage(message);
  });
});
