const seed = { projects: [], globalBookmarks: [], agentSessions: [], notifications: [] };

const storeKey = 'atlas-browser-workspace-v1';
const profileStoreKey = 'atlas-browser-profiles-v1';
const projectStatuses = ['Active P1', 'Active P2', 'Active P3', 'Planning', 'Researching', 'On Hold', 'Cancelled', 'Abandoned'];
const completedTaskRetentionMs = 3 * 24 * 60 * 60 * 1000;
const legacyProjectColors = { violet: '#B026FF', cyan: '#00E5FF', amber: '#FFB000' };
const neonColorMigrations = { '#7256D6': '#B026FF', '#147D92': '#00E5FF', '#A76A18': '#FFB000' };
const neonProjectPalette = ['#B026FF', '#00E5FF', '#FF2BD6', '#39FF88', '#FFB000', '#7A5CFF', '#FF375F', '#00F0A8'];
const legacyWorkspace = JSON.parse(localStorage.getItem(storeKey) || 'null') || structuredClone(seed);
let profileStore = JSON.parse(localStorage.getItem(profileStoreKey) || 'null');
const freshInstall = !profileStore?.profiles?.length;
if (!profileStore?.profiles?.length) {
  const id = `profile-${Date.now()}`;
  profileStore = { activeProfileId: id, profiles: [{ id, name: 'Local Profile', email: 'local@atlas.invalid', image: '', settings: { walkthroughCompleted: false }, workspace: legacyWorkspace }] };
}

function normalizeWorkspace(workspace) {
  const normalized = workspace && typeof workspace === 'object' ? workspace : { projects: [] };
  normalized.projects ||= [];
  normalized.notifications ||= [];
  normalized.agentSessions ||= [];
  normalized.globalBookmarks ||= [];
  normalized.session ||= {};
  normalized.projects.forEach((project) => {
    if (project.status === 'Active') project.status = 'Active P3';
    else if (project.status === 'On hold') project.status = 'On Hold';
    else if (!projectStatuses.includes(project.status)) project.status = 'Planning';
    if (!/^#[0-9a-f]{6}$/i.test(project.color || '')) project.color = legacyProjectColors[project.accent] || '#B026FF';
    project.color = neonColorMigrations[String(project.color).toUpperCase()] || String(project.color).toUpperCase();
    project.image ||= '';
    project.iconMode = project.iconMode === 'emoji' ? 'emoji' : 'image';
    project.emoji ||= '🚀';
    project.tabs ||= [];
    project.bookmarks ||= [];
    project.resources ||= [];
    project.downloads ||= [];
    project.notes ||= [];
    project.tasks ||= [];
    project.agentMessages ||= [];
    project.tabs.forEach((tab) => {
      if (!tab.icon || /^https?:\/\//.test(tab.icon) || !/\p{Extended_Pictographic}/u.test(tab.icon)) tab.icon = '🌐';
      tab.iconMode = tab.iconMode === 'favicon' ? 'favicon' : 'emoji';
      tab.favicon ||= '';
    });
    project.bookmarks.forEach((bookmark) => {
      bookmark.id ||= `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      bookmark.title ||= 'Bookmark';
      bookmark.url ||= '';
      bookmark.color = /^#[0-9a-f]{6}$/i.test(String(bookmark.color || '')) ? String(bookmark.color).toUpperCase() : '#B026FF';
    });
    project.resources.forEach((resource) => {
      resource.id ||= `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!resource.type) {
        resource.type = resource.url ? 'url' : 'text';
        if (resource.type === 'text') resource.text = resource.text || resource.meta || '';
      }
      resource.createdAt ||= new Date().toISOString();
    });
    project.downloads.forEach((download) => {
      download.id ||= `download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      download.fileName ||= 'Downloaded file';
      download.state ||= 'completed';
      download.createdAt ||= new Date().toISOString();
      download.receivedBytes = Math.max(0, Number(download.receivedBytes) || 0);
      download.totalBytes = Math.max(0, Number(download.totalBytes) || 0);
      download.percent = Math.min(100, Math.max(0, Number(download.percent) || (download.state === 'completed' ? 100 : 0)));
    });
    project.notes.forEach((note) => {
      note.id ||= `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      note.title ||= 'Untitled note';
      note.html ||= String(note.body || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      note.createdAt ||= new Date().toISOString();
      note.updatedAt ||= note.createdAt;
    });
    project.agentMessages.forEach((message) => {
      message.id ||= `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      message.role = message.role === 'assistant' ? 'assistant' : 'user';
      message.text ||= '';
      message.createdAt ||= new Date().toISOString();
    });
    project.tasks.forEach((task) => {
      task.id ||= `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      task.priority ||= 'medium';
      task.dueAt ||= '';
      task.notifiedAt ||= '';
      if (task.done && !Number.isFinite(new Date(task.completedAt || '').getTime())) task.completedAt = new Date().toISOString();
      if (!task.done) task.completedAt = '';
    });
    project.tasks = project.tasks.filter((task) => !task.done || Date.now() - new Date(task.completedAt).getTime() < completedTaskRetentionMs);
  });
  normalized.agentSessions.forEach((session) => {
    session.id ||= `agent-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    session.title ||= 'New conversation';
    session.titleEdited = Boolean(session.titleEdited);
    session.scopeProjectId ||= null;
    session.messages ||= [];
    session.updatedAt ||= new Date().toISOString();
    session.tokenUsage ||= null;
    session.busy = false;
    session.compacting = false;
    session.providerId ||= 'codex';
  });
  const shared = new Map(normalized.globalBookmarks.filter((bookmark) => bookmark?.sharedId).map((bookmark) => [bookmark.sharedId, bookmark]));
  normalized.projects.flatMap((project) => project.bookmarks).filter((bookmark) => bookmark.sharedId).forEach((bookmark) => {
    if (!shared.has(bookmark.sharedId)) shared.set(bookmark.sharedId, { sharedId: bookmark.sharedId, title: bookmark.title, url: bookmark.url, color: bookmark.color });
  });
  normalized.globalBookmarks = [...shared.values()];
  normalized.projects.forEach((project) => normalized.globalBookmarks.forEach((globalBookmark) => {
    if (!project.bookmarks.some((bookmark) => bookmark.sharedId === globalBookmark.sharedId)) project.bookmarks.push({ id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...globalBookmark });
  }));
  return normalized;
}

profileStore.profiles.forEach((profile) => {
  profile.name ||= 'Local Profile';
  profile.email ||= 'local@atlas.invalid';
  profile.image ||= '';
  const existingWalkthroughState = profile.settings?.walkthroughCompleted;
  profile.settings = { compactionThreshold: 0.78, reasoningEffort: 'medium', ttsVoice: 'af_heart', ttsSpeed: 1, sttModel: 'base.en', autoSpeak: false, sidebarWidth: 268, agentTrayHeight: 76, defaultPageUrl: '', privacyMode: 'balanced', agentProvider: { id: 'codex', executable: 'codex', model: 'gpt-5.6-luna', effort: 'medium', usageMode: 'native', secretId: `${profile.id}:codex` }, ...(profile.settings || {}) };
  profile.settings.walkthroughCompleted = existingWalkthroughState === undefined ? !freshInstall : Boolean(existingWalkthroughState);
  profile.settings.agentProvider = { id: 'codex', executable: 'codex', model: 'gpt-5.6-luna', effort: profile.settings.reasoningEffort || 'medium', usageMode: 'native', secretId: `${profile.id}:codex`, ...(profile.settings.agentProvider || {}) };
  profile.settings.defaultPageUrl = String(profile.settings.defaultPageUrl || '').trim();
  profile.settings.sidebarWidth = Math.min(460, Math.max(210, Number(profile.settings.sidebarWidth) || 268));
  profile.settings.agentTrayHeight = Math.min(420, Math.max(72, Number(profile.settings.agentTrayHeight) || 76));
  if (!['low', 'medium', 'high', 'xhigh'].includes(profile.settings.reasoningEffort)) profile.settings.reasoningEffort = 'medium';
  if (!['off', 'balanced', 'strict'].includes(profile.settings.privacyMode)) profile.settings.privacyMode = 'balanced';
  profile.workspace = normalizeWorkspace(profile.workspace);
});
if (!profileStore.profiles.some((profile) => profile.id === profileStore.activeProfileId)) profileStore.activeProfileId = profileStore.profiles[0].id;
const activeProfile = () => profileStore.profiles.find((profile) => profile.id === profileStore.activeProfileId);
let state = activeProfile().workspace;
const validViews = new Set(['browser', 'tasks', 'agent', 'library', 'notes']);
let activeProjectId = state.projects.some((project) => project.id === state.session?.activeProjectId) ? state.session.activeProjectId : state.projects[0]?.id;
let activeTabId = state.projects.find((project) => project.id === activeProjectId)?.tabs.some((tab) => tab.id === state.session?.activeTabId) ? state.session.activeTabId : state.projects.find((project) => project.id === activeProjectId)?.tabs[0]?.id;
let activeView = validViews.has(state.session?.activeView) ? state.session.activeView : 'browser';
let activeAgentSessionId = state.agentSessions.some((session) => session.id === state.session?.activeAgentSessionId) ? state.session.activeAgentSessionId : state.agentSessions[0]?.id;
const isElectron = Boolean(window.atlasBrowser);
let lastDesktopUrl = '';
let editingProjectId = null;
let cropSource = null;
let cropBaseScale = 1;
let cropZoom = 1;
let cropOffset = { x: 0, y: 0 };
let cropDragging = false;
let cropDidDrag = false;
let cropPointer = { x: 0, y: 0 };
let projectIconMode = 'image';
let editingProjectEmoji = '🚀';
let emojiTabId = null;
let editingProfileId = null;
let profileCropSource = null;
let profileCropBaseScale = 1;
let profileCropZoom = 1;
let profileCropOffset = { x: 0, y: 0 };
let profileCropDragging = false;
let profileCropPointer = { x: 0, y: 0 };
let editingResourceId = null;
let pendingResourceFile = null;
let resourceViewerUrl = '';
let libraryObjectUrls = [];
let editingTaskId = null;
let editingNoteId = null;
let editingBookmarkId = null;
let notificationSnapshot = [];
let projectPointerDrag = null;
let suppressProjectClick = false;
let agentRuntimeStatus = { state: 'starting', message: 'Connecting to agent provider…', providerId: activeProfile().settings.agentProvider.id };
let agentUsage = null;
let privacyStatus = { mode: activeProfile().settings.privacyMode, blockedRequests: 0, cleanedLinks: 0 };
let providerTemplates = [];
let walkthroughStep = -1;
let walkthroughReplay = false;
let mediaRecorder = null;
let voiceChunks = [];
let conversationAnimationFrame = 0;
let conversationIdleTimer = 0;
let conversationTtsFinish = null;
let sidebarResizeStart = null;
let agentTrayResizeStart = null;
const downloadIndicators = new Map();
const downloadIndicatorTimers = new Map();
let downloadPopoverTimer = 0;
const conversationMode = { active: false, targetId: 'agent-input', sessionId: '', phase: 'off', stream: null, audioContext: null, analyser: null, speechDetected: false, speechStartedAt: 0, silenceStartedAt: 0, elevatedFrames: 0, noiseFloor: 0.008, calibrationUntil: 0 };
const CONVERSATION_IDLE_TIMEOUT_MS = 30000;
const CONVERSATION_END_SILENCE_MS = 950;
const CONVERSATION_MAX_UTTERANCE_MS = 90000;
let kokoroVoiceCatalog = [];
let activeTtsAudio = null;
let activeTtsUrl = '';
const emojiGroups = [
  { keywords: 'work office project productivity research study document file folder writing reading planning data chart', emojis: '🌐 🔎 🔍 📚 📖 📕 📗 📘 📙 📓 📔 📒 📃 📜 📄 📰 🗞️ 📝 ✏️ 🖊️ 🖋️ 🖌️ 🖍️ 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗂️ 📁 📂 🗃️ 🗄️ 📊 📈 📉 🧾 📋 ✅ ☑️ ✔️ ❌ ❎ 🗒️ 🗓️ 📆 📅' },
  { keywords: 'technology computer coding developer software hardware ai agent robot engineering security tool', emojis: '💡 🧠 🤖 🦾 🦿 ⚙️ 🛠️ 🔧 🔨 ⛏️ 🪛 🧰 🧲 🔩 ⚗️ 🔋 🪫 🔌 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 📱 ☎️ 📞 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 📡 🔐 🔒 🔓 🔑 🗝️ 🛡️ 🧯 ⚡ 🧮' },
  { keywords: 'science laboratory medical health space astronomy discovery experiment', emojis: '🔬 🧪 🧫 🧬 🔭 🛰️ 🩺 💊 💉 🩸 🩹 🩼 🦠 🫀 🫁 🦷 🦴 👁️ 🧠 ⚕️ ⚛️ ☢️ ☣️ 🌌 🪐 🌍 🌎 🌏 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 ☀️ 🌞 ⭐ 🌟 ✨ 💫 ☄️ 🚀 🛸 👨‍🚀 👩‍🚀' },
  { keywords: 'communication message social email notification announcement sound voice meeting', emojis: '💬 🗨️ 🗯️ 💭 🗣️ 👥 📣 📢 🔔 🔕 📧 📨 📩 📤 📥 📮 📫 📪 📬 📭 ✉️ ☎️ 📞 🎤 🎙️ 🔊 🔉 🔈 🔇 📯 🪧' },
  { keywords: 'time schedule status alert priority progress calendar deadline', emojis: '⌚ ⏰ ⏱️ ⏲️ 🕰️ ⌛ ⏳ 📅 📆 🗓️ 🛎️ 🚨 ⚠️ ⛔ 🚫 🛑 ❗ ❕ ❓ ❔ ‼️ ⁉️ 💯 🔄 🔁 🔂 ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏩ ⏪ 🔀 🆕 🆙 🆒 🆗 🆘' },
  { keywords: 'money finance business shopping payment banking sales investment reward', emojis: '💎 🪙 💰 💵 💴 💶 💷 💸 💳 🧾 🏦 🏧 💹 📈 📉 🛒 🛍️ 🎁 📦 🏷️ 🎫 🎟️ 🧧 🏆 🥇 🥈 🥉 🏅 🎖️ 👑' },
  { keywords: 'creative art design photography film music entertainment media', emojis: '🎨 🖌️ 🖍️ ✏️ 🎭 🎬 🎥 📹 📷 📸 🎞️ 📽️ 🎧 🎵 🎶 🎼 🎹 🎸 🪕 🎻 🥁 🪘 🎷 🎺 🪗 🪈 🎤 🎙️ 📻 📺 🪩 🎪 🎆 🎇' },
  { keywords: 'game sport fitness competition hobby recreation', emojis: '🎮 🕹️ 🎲 🧩 ♟️ 🃏 🀄 🎯 🪀 🪁 🏆 🏀 ⚽ 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪩 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🏹 🎣 🤿 🥊 🥋 ⛸️ 🎿 🛷 🏂 🏋️ 🤸 ⛹️ 🤺 🤾 🏊 🚴 🧗 🏎️' },
  { keywords: 'travel transportation vehicle map location building city home place', emojis: '🧭 🗺️ 🌍 🌎 🌏 🚀 ✈️ 🛩️ 🛫 🛬 🪂 🚁 🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🚂 🚆 🚇 🚊 🚉 🚢 ⛵ 🚤 🛥️ 🛳️ ⚓ 🛟 ⛽ 🚧 🚦 🚥 🏠 🏡 🏢 🏣 🏥 🏦 🏨 🏪 🏫 🏛️ ⛪ 🕌 🛕 🕍 🏭 🏗️ 🧱 🗼 🗽 🏰 🏯 🌁 🌆 🏙️ 🌃 🌉' },
  { keywords: 'weather nature environment plant flower landscape season outdoors', emojis: '⚡ 🔥 💧 🌊 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌫️ 🌋 🏔️ ⛰️ 🏕️ ⛺ 🏖️ 🏝️ 🏜️ 🌱 🌿 ☘️ 🍀 🍃 🍂 🍁 🌾 🌵 🌴 🌳 🌲 🪵 🪨 🍄 🪴 💐 🌷 🌹 🥀 🪻 🌺 🌸 🌼 🌻' },
  { keywords: 'animal pet wildlife bird fish insect creature', emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐻‍❄️ 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🦍 🦧 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🪼 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🦭 🐊 🐅 🐆 🦓 🫏 🦬 🐘 🦣 🦏 🦛 🐪 🐫 🦒 🦘 🫎 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🪽 🪶 🐉 🐲' },
  { keywords: 'food drink cooking meal fruit vegetable dessert restaurant', emojis: '☕ 🍵 🫖 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾 🧊 🥛 🍶 🍎 🍏 🍐 🍊 🍋 🍋‍🟩 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🫛 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🫚 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥜 🌰' },
  { keywords: 'face emotion mood reaction happy sad funny love', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 🙂‍↕️ 😏 😒 🙂‍↔️ 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🤥 😶 🫥 😐 🫤 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👻 💀 ☠️ 👽 👾 🤖 🎃' },
  { keywords: 'people hand gesture team person human action approval', emojis: '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 👃 👀 👁️ 👅 👄 🫦 🧑 👨 👩 🧒 👦 👧 🧓 👴 👵 👮 🕵️ 👷 🧑‍💻 🧑‍🔬 🧑‍🎨 🧑‍🚀 🧑‍🚒 🥷 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟' },
  { keywords: 'heart love color symbol shape arrow button mark', emojis: '❤️ 🧡 💛 💚 💙 💜 🩷 🩵 🩶 🤎 🖤 🤍 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ♾️ ⚕️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ✖️ ➗ ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↔️ ↕️ ↩️ ↪️ ⤴️ ⤵️ 🔃 🔄 🔙 🔚 🔛 🔜 🔝 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ ◼️ ◻️ ◾ ◽ ▪️ ▫️ 🔶 🔷 🔸 🔹 💠 🔘' }
];
const emojiAliases = {
  '🌐': 'web internet browser globe world', '🔎': 'search find investigate', '📚': 'books library learning', '📝': 'note write edit', '📌': 'pin save', '📊': 'analytics bar chart', '📈': 'growth up chart stock', '📉': 'decline down chart stock',
  '✅': 'done complete success check', '💡': 'idea lightbulb innovation', '🧠': 'brain intelligence thinking ai', '🤖': 'robot bot ai agent automation', '⚙️': 'settings gear configuration', '🛠️': 'tools build repair', '💻': 'laptop computer code', '🖥️': 'desktop monitor computer', '📱': 'phone mobile', '🔐': 'secure lock privacy', '🔑': 'key access password', '🛡️': 'shield security protection',
  '🔬': 'microscope research science', '🧪': 'test tube experiment chemistry', '🧬': 'dna genetics', '🔭': 'telescope astronomy', '🛰️': 'satellite space', '🌍': 'earth globe world europe africa', '🌎': 'earth globe world america', '🌏': 'earth globe world asia', '🪐': 'planet saturn space', '🚀': 'rocket launch space startup', '🛸': 'ufo alien spaceship',
  '💬': 'chat message conversation', '📧': 'email mail', '📣': 'megaphone announce', '🔔': 'bell notification alert', '🎤': 'microphone voice sing', '🎧': 'headphones audio music',
  '⏰': 'alarm clock deadline', '⏱️': 'timer stopwatch speed', '📅': 'calendar date schedule', '⚠️': 'warning caution', '🚨': 'emergency alert siren', '❗': 'important exclamation priority', '💯': 'hundred perfect complete',
  '💰': 'money bag cash', '💳': 'credit card payment', '🏦': 'bank finance', '🛒': 'shopping cart ecommerce', '📦': 'package box delivery', '🎁': 'gift present', '🏆': 'trophy winner achievement', '👑': 'crown king premium',
  '🎨': 'palette art design', '📷': 'camera photo image', '🎬': 'movie film cinema', '🎵': 'music note song', '🎮': 'video game controller gaming', '🧩': 'puzzle problem solution', '🎯': 'target goal focus',
  '🧭': 'compass direction navigation', '🗺️': 'map travel location', '✈️': 'airplane flight travel', '🚗': 'car auto vehicle', '🚲': 'bike bicycle cycle', '🚢': 'ship boat cruise', '🏠': 'house home', '🏢': 'office building company', '🏭': 'factory industry', '🏗️': 'construction building', '🏙️': 'city skyline',
  '⚡': 'lightning power fast energy', '🔥': 'fire hot trending', '💧': 'water drop', '🌊': 'wave ocean sea', '🌈': 'rainbow color pride', '☀️': 'sun sunny', '☁️': 'cloud weather', '❄️': 'snow cold winter', '🌱': 'seedling growth plant', '🌳': 'tree forest', '🌸': 'flower blossom spring',
  '🐶': 'dog puppy pet', '🐱': 'cat kitten pet', '🦊': 'fox', '🐻': 'bear', '🐼': 'panda', '🦁': 'lion', '🐯': 'tiger', '🦄': 'unicorn magic', '🦉': 'owl wisdom', '🦅': 'eagle bird', '🐝': 'bee honey', '🦋': 'butterfly', '🐙': 'octopus', '🐬': 'dolphin', '🐋': 'whale', '🦈': 'shark', '🐉': 'dragon fantasy',
  '☕': 'coffee cafe drink', '🍵': 'tea drink', '🍎': 'apple fruit', '🍋': 'lemon citrus', '🍇': 'grapes fruit', '🍉': 'watermelon fruit', '🥑': 'avocado', '🍕': 'pizza', '🍔': 'burger hamburger', '🍜': 'noodles ramen', '🍣': 'sushi', '🍪': 'cookie', '🍩': 'donut doughnut', '🎂': 'birthday cake celebration',
  '😀': 'happy smile grin', '😂': 'laugh tears funny', '😍': 'love heart eyes', '🤔': 'thinking question consider', '😎': 'cool sunglasses', '🥳': 'party celebrate', '😢': 'sad cry', '😭': 'cry sob', '😡': 'angry mad', '😱': 'scared scream', '😴': 'sleep tired', '🤑': 'money face rich', '👻': 'ghost spooky', '👽': 'alien space',
  '👋': 'wave hello goodbye', '👍': 'thumbs up approve yes like', '👎': 'thumbs down reject no dislike', '👏': 'clap applause', '🙌': 'celebrate raised hands', '🙏': 'pray please thanks', '💪': 'strong muscle strength', '🤝': 'handshake agreement partnership', '🫶': 'heart hands love support',
  '❤️': 'red heart love favorite', '💜': 'purple heart love', '🖤': 'black heart', '🤍': 'white heart', '♾️': 'infinity forever', '➕': 'plus add new', '➖': 'minus remove', '❌': 'cross close delete cancel', '🔴': 'red circle', '🟢': 'green circle', '🔵': 'blue circle', '🟣': 'purple circle'
};
const emojiCatalog = Array.from(emojiGroups.reduce((catalog, group) => {
  group.emojis.trim().split(/\s+/).forEach((emoji) => {
    const existing = catalog.get(emoji);
    const keywords = `${group.keywords} ${emojiAliases[emoji] || ''}`.trim();
    if (existing) existing.keywords += ` ${keywords}`;
    else catalog.set(emoji, { emoji, keywords });
  });
  return catalog;
}, new Map()).values());
const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
function sanitizeRichText(value = '') {
  const documentNode = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'SPAN', 'FONT', 'A']);
  Array.from(documentNode.body.querySelectorAll('*')).forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    Array.from(node.attributes).forEach((attribute) => {
      const allowed = (node.tagName === 'A' && attribute.name === 'href') || (node.tagName === 'FONT' && ['face', 'color', 'size'].includes(attribute.name));
      if (!allowed) node.removeAttribute(attribute.name);
    });
    if (node.tagName === 'A') {
      try {
        const url = new URL(node.getAttribute('href'), window.location.href);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link');
        node.setAttribute('href', url.href);
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      } catch { node.removeAttribute('href'); }
    }
  });
  return documentNode.body.innerHTML;
}
const normalizeHexColor = (value, fallback = '#B026FF') => /^#[0-9a-f]{6}$/i.test(String(value).trim()) ? String(value).trim().toUpperCase() : fallback;
const contrastText = (hex) => {
  const value = normalizeHexColor(hex).slice(1);
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) > 0.46 ? '#17131D' : '#FFFFFF';
};
const currentProject = () => state.projects.find((item) => item.id === activeProjectId);
const currentTab = () => currentProject()?.tabs.find((item) => item.id === activeTabId);
const saveProfiles = () => localStorage.setItem(profileStoreKey, JSON.stringify(profileStore));
const save = () => { state.session = { activeProjectId, activeTabId, activeView, activeAgentSessionId }; activeProfile().workspace = state; saveProfiles(); };
saveProfiles();
const toast = (message) => { const node = $('toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2300); };

const blobDatabase = new Promise((resolve, reject) => {
  const request = indexedDB.open('atlas-browser-files-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('blobs');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function putResourceBlob(key, blob) {
  const database = await blobDatabase;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('blobs', 'readwrite');
    transaction.objectStore('blobs').put(blob, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getResourceBlob(key) {
  const database = await blobDatabase;
  return new Promise((resolve, reject) => {
    const request = database.transaction('blobs').objectStore('blobs').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteResourceBlob(key) {
  if (!key) return;
  const database = await blobDatabase;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('blobs', 'readwrite');
    transaction.objectStore('blobs').delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function updateWebsiteSurface(tab) {
  const fallback = $('frame-fallback');
  const frame = $('website-frame');
  const desktop = $('desktop-surface');
  const empty = $('browser-empty');
  fallback.classList.remove('show');
  empty.classList.add('hidden');
  if (!tab?.url) {
    frame.classList.add('hidden');
    desktop.classList.add('hidden');
    empty.classList.remove('hidden');
    requestAnimationFrame(syncDesktopBounds);
    return;
  }
  if (isElectron) {
    frame.classList.add('hidden');
    desktop.classList.remove('hidden');
    if (lastDesktopUrl !== tab.url) { lastDesktopUrl = tab.url; window.atlasBrowser.navigate(tab.url); }
    requestAnimationFrame(syncDesktopBounds);
    return;
  }
  desktop.classList.add('hidden');
  frame.classList.remove('hidden');
  if (frame.src !== tab.url) frame.src = tab.url;
  try {
    const result = await fetch(`/api/embed-check?url=${encodeURIComponent(tab.url)}`).then((response) => response.json());
    if (currentTab()?.id === tab.id) fallback.classList.toggle('show', result.blocked);
  } catch {
    if (currentTab()?.id === tab.id) fallback.classList.add('show');
  }
}

function renderProjects() {
  const filter = $('project-filter').value.toLowerCase();
  const filtered = state.projects.filter((item) => item.name.toLowerCase().includes(filter));
  $('projects').innerHTML = filtered.length ? filtered.map((item) => {
    const usesEmoji = item.iconMode === 'emoji' && item.emoji;
    const image = usesEmoji ? `<span aria-hidden="true">${escapeHtml(item.emoji)}</span>` : item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : '<span aria-hidden="true">◈</span>';
    const color = normalizeHexColor(item.color);
    return `<div class="project-row ${item.id === activeProjectId ? 'selected' : ''}" data-project="${item.id}" role="button" tabindex="0" style="--project-color:${color};--project-ink:${contrastText(color)}"><span class="project-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span><span class="project-mini-icon ${usesEmoji ? 'project-emoji-icon' : item.image ? '' : 'placeholder'}">${image}</span><span class="project-row-copy"><span class="project-row-name">${escapeHtml(item.name)}</span><span class="project-row-state">${escapeHtml(item.status)}</span></span><button class="project-edit-button" type="button" data-project-edit="${item.id}" title="Edit ${escapeHtml(item.name)}" aria-label="Edit ${escapeHtml(item.name)}">⋮</button></div>`;
  }).join('') : '<div class="empty-projects">No projects found.</div>';
  const clearProjectDropIndicators = () => document.querySelectorAll('.project-row.drop-before, .project-row.drop-after').forEach((row) => row.classList.remove('drop-before', 'drop-after'));
  const finishProjectPointerDrag = (event, cancelled = false) => {
    const drag = projectPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-project]');
    const moved = drag.active && !cancelled && target && target.dataset.project !== drag.projectId;
    if (moved) {
      const dragged = state.projects.find((project) => project.id === drag.projectId);
      const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
      if (dragged) {
        state.projects = state.projects.filter((project) => project.id !== drag.projectId);
        const targetIndex = state.projects.findIndex((project) => project.id === target.dataset.project);
        state.projects.splice(Math.max(0, targetIndex + (after ? 1 : 0)), 0, dragged);
        save();
      }
    }
    try { drag.button.releasePointerCapture(event.pointerId); } catch {}
    drag.button.classList.remove('dragging');
    clearProjectDropIndicators();
    projectPointerDrag = null;
    if (moved) {
      renderProjects();
      toast('Project order saved');
    }
    setTimeout(() => { suppressProjectClick = false; }, 100);
  };
  document.querySelectorAll('[data-project]').forEach((button) => {
    button.addEventListener('click', (event) => { if (suppressProjectClick || event.target.closest('[data-project-edit]')) return; activeProjectId = button.dataset.project; activeTabId = currentProject().tabs[0]?.id; save(); render(); });
    button.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key) || event.target.closest('[data-project-edit]')) return; event.preventDefault(); activeProjectId = button.dataset.project; activeTabId = currentProject().tabs[0]?.id; save(); render(); });
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('[data-project-edit]')) return;
      projectPointerDrag = { projectId: button.dataset.project, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, button, active: false };
      try { button.setPointerCapture(event.pointerId); } catch {}
    });
    button.addEventListener('pointermove', (event) => {
      const drag = projectPointerDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;
      if (!drag.active) {
        drag.active = true;
        suppressProjectClick = true;
        drag.button.classList.add('dragging');
      }
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-project]');
      clearProjectDropIndicators();
      if (!target || target.dataset.project === drag.projectId) return;
      const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
      target.classList.add(after ? 'drop-after' : 'drop-before');
    });
    button.addEventListener('pointerup', (event) => finishProjectPointerDrag(event));
    button.addEventListener('pointercancel', (event) => finishProjectPointerDrag(event, true));
  });
  document.querySelectorAll('[data-project-edit]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const item = state.projects.find((project) => project.id === button.dataset.projectEdit);
    if (item) openProjectEditor(item);
  }));
}

function renderTabs(item) {
  $('tabs').innerHTML = item?.tabs?.length ? item.tabs.map((tab) => { const icon = tab.iconMode === 'favicon' && tab.favicon ? `<img src="${escapeHtml(tab.favicon)}" alt="" />` : `<span class="tab-emoji-glyph">${escapeHtml(tab.icon || '🌐')}</span>`; return `<div class="tab ${tab.id === activeTabId ? 'selected' : ''}" data-tab="${tab.id}"><button class="tab-icon ${tab.iconMode === 'favicon' ? 'uses-favicon' : ''}" data-tab-icon="${tab.id}" title="Choose tab icon">${icon}</button><span class="tab-title">${escapeHtml(tab.title)}</span><button class="tab-close" data-tab-close="${tab.id}" title="Close tab">×</button></div>`; }).join('') : '<div class="no-tabs">No tabs yet</div>';
  document.querySelectorAll('[data-tab]').forEach((node) => node.addEventListener('click', (event) => { if (event.target.closest('[data-tab-icon]') || event.target.closest('[data-tab-close]')) return; activeTabId = node.dataset.tab; activeView = 'browser'; save(); render(); }));
  document.querySelectorAll('[data-tab-icon]').forEach((button) => button.addEventListener('click', () => editTabIcon(button.dataset.tabIcon, button)));
  document.querySelectorAll('[data-tab-close]').forEach((button) => button.addEventListener('click', () => closeTab(button.dataset.tabClose)));
}

function renderBookmarks(item) {
  const bookmarks = item?.bookmarks || [];
  $('bookmark-buttons').innerHTML = bookmarks.map((bookmark) => {
    const color = normalizeHexColor(bookmark.color);
    return `<button class="bookmark-button" type="button" data-bookmark-open="${bookmark.id}" title="${escapeHtml(bookmark.url)}" style="--bookmark-color:${color};--bookmark-ink:${contrastText(color)}">${escapeHtml(bookmark.title)}</button>`;
  }).join('');
  $('bookmarks-bar').classList.toggle('no-project', !item);
  $('add-bookmark').disabled = !item;
  $('manage-bookmarks').disabled = !item;
  if (!$('bookmark-manager').classList.contains('hidden')) renderBookmarkManager();
  document.querySelectorAll('[data-bookmark-open]').forEach((button) => button.addEventListener('click', () => {
    const bookmark = currentProject()?.bookmarks.find((entry) => entry.id === button.dataset.bookmarkOpen);
    if (bookmark) openUrlInCurrentTab(bookmark.url, `Opening ${bookmark.title}`);
  }));
}

function formatTaskDue(task) {
  if (!task.dueAt) return task.due || 'NO DUE DATE';
  const value = new Date(task.dueAt);
  if (Number.isNaN(value.getTime())) return 'NO DUE DATE';
  return `DUE ${value.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase()}`;
}

function formatCompletedRetention(task) {
  const completedTime = new Date(task.completedAt).getTime();
  const remaining = Math.max(0, completedTaskRetentionMs - (Date.now() - completedTime));
  const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
  const retention = hours > 24 ? `${Math.ceil(hours / 24)} DAYS` : `${hours} HOUR${hours === 1 ? '' : 'S'}`;
  return `COMPLETED · AUTO-DELETES IN ${retention}`;
}

function taskRow(task, completed = false) {
  return `<div class="task ${completed ? 'completed' : ''}" data-task-id="${task.id}" role="button" tabindex="0"><button class="task-check ${task.done ? 'done' : ''}" data-task-check="${task.id}" title="Mark ${task.done ? 'incomplete' : 'complete'}">${task.done ? '✓' : ''}</button><div class="task-copy"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-due">${escapeHtml(completed ? formatCompletedRetention(task) : formatTaskDue(task))}</div></div><span class="priority ${task.priority}">${escapeHtml(task.priority)}</span></div>`;
}

function resourcePresentation(resource) {
  if (resource.type === 'url') return { mark: '🔗', meta: resource.url || 'Saved website' };
  if (resource.type === 'pdf') return { mark: 'PDF', meta: resource.fileName || 'PDF file' };
  if (resource.type === 'image') return { mark: 'IMG', meta: resource.fileName || 'Picture' };
  if (resource.type === 'file') {
    const mark = resource.linkedFileType === 'pdf' ? 'PDF' : resource.linkedFileType === 'image' ? 'IMG' : resource.linkedFileType === 'text' ? 'TXT' : 'FILE';
    return { mark, meta: `${resource.fileName || 'Downloaded file'} · Linked from Downloads` };
  }
  return { mark: 'TXT', meta: 'Editable text document' };
}

function downloadedResourceType(download) {
  const mimeType = String(download.mimeType || '').toLowerCase();
  const extension = String(download.fileName || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(extension)) return 'image';
  if (mimeType.startsWith('text/') || ['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'sh', 'log'].includes(extension)) return 'text';
  return 'file';
}

function linkCompletedDownload(project, download) {
  if (download.libraryResourceId || project.resources.some((resource) => resource.downloadId === download.id)) return;
  const resource = {
    id: `resource-download-${download.id}`,
    type: 'file',
    linkedFileType: downloadedResourceType(download),
    title: download.fileName,
    fileName: download.fileName,
    mimeType: download.mimeType || 'application/octet-stream',
    downloadId: download.id,
    downloadPath: download.savePath,
    sourceUrl: download.url,
    size: download.totalBytes || download.receivedBytes || 0,
    createdAt: download.completedAt || new Date().toISOString()
  };
  project.resources.unshift(resource);
  download.libraryResourceId = resource.id;
  saveProfiles();
  syncLibraryFileLinks();
}

function syncLibraryFileLinks() {
  if (!isElectron || !window.atlasBrowser.setLibraryFileLinks) return;
  const profile = activeProfile();
  const links = profile.workspace.projects.flatMap((project) => project.resources
    .filter((resource) => resource.downloadPath)
    .map((resource) => ({ profileId: profile.id, projectId: project.id, resourceId: resource.id, downloadPath: resource.downloadPath })));
  window.atlasBrowser.setLibraryFileLinks(links);
}

async function migrateCopiedDownloadsToLinks() {
  let changed = false;
  for (const profile of profileStore.profiles) {
    for (const project of profile.workspace.projects) {
      for (const resource of project.resources) {
        if (!resource.downloadId || !resource.downloadPath) continue;
        if (resource.blobKey || resource.text !== undefined) {
          try { await window.atlasBrowser.getLibraryFileStatus({ profileId: profile.id, projectId: project.id, resourceId: resource.id }); }
          catch { continue; }
        }
        if (!resource.linkedFileType) { resource.linkedFileType = downloadedResourceType(resource); changed = true; }
        if (resource.type !== 'file') changed = true;
        resource.type = 'file';
        if (resource.blobKey) {
          try { await deleteResourceBlob(resource.blobKey); } catch {}
          delete resource.blobKey;
          changed = true;
        }
        if (resource.text !== undefined) { delete resource.text; changed = true; }
      }
    }
  }
  if (changed) saveProfiles();
  syncLibraryFileLinks();
  if (changed) render();
}

async function hydrateLibraryPreviews() {
  libraryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  libraryObjectUrls = [];
  const projectId = activeProjectId;
  await Promise.all(Array.from(document.querySelectorAll('[data-resource-image]')).map(async (node) => {
    const resource = currentProject()?.resources.find((item) => item.id === node.dataset.resourceImage);
    if (!resource?.blobKey) return;
    try {
      const blob = await getResourceBlob(resource.blobKey);
      if (!blob || activeProjectId !== projectId || !document.body.contains(node)) return;
      const url = URL.createObjectURL(blob);
      libraryObjectUrls.push(url);
      node.innerHTML = `<img src="${url}" alt="" />`;
    } catch {}
  }));
}

function renderNotificationBadge() {
  const unread = (state.notifications || []).filter((notification) => !notification.read).length;
  $('notification-badge').textContent = unread > 99 ? '99+' : String(unread);
  $('notification-badge').classList.toggle('hidden', unread === 0);
  $('notification-button').classList.toggle('has-unread', unread > 0);
}

function formatDownloadSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (!value) return 'Size unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function renderDownloadIndicator() {
  const indicator = downloadIndicators.get(activeProjectId);
  const button = $('download-button');
  const visible = Boolean(indicator && ['progressing', 'completed', 'cancelled', 'interrupted'].includes(indicator.state));
  const percent = visible ? Math.min(100, Math.max(0, Number(indicator.percent) || 0)) : 0;
  button.style.setProperty('--download-ring-angle', `${percent * 3.6}deg`);
  button.classList.toggle('download-active', visible && indicator.state === 'progressing');
  button.classList.toggle('download-complete', visible && indicator.state === 'completed');
  button.classList.toggle('download-failed', visible && ['cancelled', 'interrupted'].includes(indicator.state));
  button.setAttribute('aria-label', visible && indicator.state === 'progressing' ? `Downloads, ${Math.round(percent)} percent complete` : 'Downloads');
}

function updateDownloadIndicator(download) {
  const projectId = String(download.projectId || '');
  if (!projectId) return;
  const previousTimer = downloadIndicatorTimers.get(projectId);
  if (previousTimer) clearTimeout(previousTimer);
  downloadIndicators.set(projectId, { id: download.id, state: download.state, percent: download.percent });
  if (download.event === 'done') {
    const timer = setTimeout(() => {
      if (downloadIndicators.get(projectId)?.id === download.id) downloadIndicators.delete(projectId);
      downloadIndicatorTimers.delete(projectId);
      renderDownloadIndicator();
    }, 3800);
    downloadIndicatorTimers.set(projectId, timer);
  }
  renderDownloadIndicator();
}

function renderDownloads() {
  const project = currentProject();
  const downloads = project?.downloads || [];
  $('download-project-label').textContent = project?.name || 'No project selected';
  renderDownloadIndicator();
  $('download-list').innerHTML = downloads.length ? downloads.map((download) => {
    const state = ['completed', 'cancelled', 'interrupted'].includes(download.state) ? download.state : 'progressing';
    const status = state === 'completed' ? `Finished · ${formatDownloadSize(download.totalBytes || download.receivedBytes)}` : state === 'progressing' ? `${Math.round(download.percent || 0)}% · ${formatDownloadSize(download.totalBytes)}` : state === 'cancelled' ? 'Download cancelled' : 'Download interrupted';
    const extension = String(download.fileName || '').match(/\.([^.]+)$/)?.[1]?.slice(0, 4).toUpperCase() || 'FILE';
    const dismiss = state === 'progressing' ? '<span></span>' : `<button class="download-dismiss" type="button" data-download-dismiss="${download.id}" title="Remove from this list" aria-label="Remove ${escapeHtml(download.fileName)} from downloads list">×</button>`;
    return `<article class="download-row ${state}" style="--download-progress:${Math.round(download.percent || 0)}%"><button class="download-file-button" type="button" data-download-open="${download.id}" ${state === 'completed' ? '' : 'disabled'} title="${state === 'completed' ? 'Open downloaded file' : status}"><span class="download-file-icon">${escapeHtml(extension)}</span><span class="download-copy"><strong>${escapeHtml(download.fileName)}</strong><small>${escapeHtml(status)}</small>${state === 'progressing' ? '<span class="download-progress"><i></i></span>' : ''}</span></button>${dismiss}</article>`;
  }).join('') : '<div class="empty-notifications">No downloads for this project.</div>';
}

function openDownloads(autoCloseMs = 0) {
  if (downloadPopoverTimer) { clearTimeout(downloadPopoverTimer); downloadPopoverTimer = 0; }
  closeNotifications();
  renderDownloads();
  $('download-popover').classList.remove('hidden');
  requestAnimationFrame(syncDesktopBounds);
  if (autoCloseMs) downloadPopoverTimer = setTimeout(() => { downloadPopoverTimer = 0; closeDownloads(); }, autoCloseMs);
}

function closeDownloads() {
  if (downloadPopoverTimer) { clearTimeout(downloadPopoverTimer); downloadPopoverTimer = 0; }
  $('download-popover').classList.add('hidden');
  requestAnimationFrame(syncDesktopBounds);
}

function dismissDownload(downloadId) {
  const project = currentProject();
  if (!project) return;
  project.downloads = project.downloads.filter((download) => download.id !== downloadId);
  save();
  renderDownloads();
  toast('Download removed from this list; the file and Library resource were kept');
}

async function openDownloadedFile(downloadId) {
  const download = currentProject()?.downloads.find((entry) => entry.id === downloadId);
  if (!download?.savePath || download.state !== 'completed') return;
  try { await window.atlasBrowser.openDownloadedFile(download.savePath); }
  catch (error) { toast(error.message || 'The downloaded file could not be opened'); }
}

async function handleDownloadEvent(payload) {
  const profile = profileStore.profiles.find((entry) => entry.id === payload?.profileId);
  const project = profile?.workspace?.projects?.find((entry) => entry.id === payload?.projectId);
  if (!profile || !project) return;
  updateDownloadIndicator(payload);
  project.downloads ||= [];
  let download = project.downloads.find((entry) => entry.id === payload.id);
  if (!download) {
    download = { id: payload.id };
    project.downloads.unshift(download);
  }
  const { event: downloadEvent, ...downloadState } = payload;
  Object.assign(download, downloadState);
  if (downloadEvent === 'started' || downloadEvent === 'done') saveProfiles();
  const isCurrentProject = profile.id === activeProfile().id && project.id === activeProjectId;
  if (isCurrentProject) renderDownloads();
  if (downloadEvent !== 'done') return;
  if (download.state === 'completed') {
    linkCompletedDownload(project, download);
    if (isCurrentProject) {
      render();
      openDownloads(6000);
      toast(`${download.fileName} downloaded and linked in ${project.name} Library`);
    }
  } else if (isCurrentProject) {
    openDownloads(6000);
    toast(`${download.fileName} did not finish downloading`);
  }
  saveProfiles();
}

function primaryCodexLimit(payload) {
  const rateLimits = payload?.rateLimits || payload;
  if (!rateLimits) return null;
  if (rateLimits.primary) return rateLimits;
  const buckets = rateLimits.rateLimitsByLimitId || payload?.rateLimitsByLimitId;
  return buckets?.codex || Object.values(buckets || {}).find((bucket) => bucket?.primary) || null;
}

function renderAgentUsage(payload = agentUsage) {
  const bucket = primaryCodexLimit(payload?.payload || payload);
  const window = bucket?.primary;
  const explicitRemaining = Number(payload?.remainingPercent);
  const usedPercent = Number(window?.usedPercent);
  const remainingPercent = Number.isFinite(explicitRemaining) ? Math.min(100, Math.max(0, explicitRemaining)) : Number.isFinite(usedPercent) ? 100 - Math.min(100, Math.max(0, usedPercent)) : 0;
  const available = Number.isFinite(explicitRemaining) || Number.isFinite(usedPercent);
  $('codex-usage-meter').style.width = `${remainingPercent}%`;
  $('codex-usage-percent').textContent = available ? `${Math.round(remainingPercent)}%` : 'Unavailable';
  $('codex-usage').classList.toggle('warning', available && remainingPercent <= 25);
  $('codex-usage').classList.toggle('critical', available && remainingPercent <= 10);
  const resetAt = Number(window?.resetsAt) * 1000;
  const resetText = Number.isFinite(resetAt) && resetAt > 0
    ? `Resets ${new Date(resetAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : available ? `${window.windowDurationMins || 'Current'} minute window` : 'Sign in to Codex to view usage';
  const providerName = agentRuntimeStatus.providerName || providerTemplates.find((provider) => provider.id === activeProfile().settings.agentProvider.id)?.name || 'Agent provider';
  $('codex-usage').title = available ? `${providerName} usage remaining: ${Math.round(remainingPercent)}%. ${resetText}.` : `${providerName} does not currently report remaining subscription usage. Configure a usage source in Settings.`;
}

async function refreshAgentUsage() {
  if (!isElectron || !window.atlasBrowser.getAgentUsage) return renderAgentUsage(null);
  try {
    agentUsage = await window.atlasBrowser.getAgentUsage();
    renderAgentUsage(agentUsage);
  } catch (error) {
    console.warn('Agent usage refresh failed', error);
    renderAgentUsage(null);
  }
}

const privacyModeDetails = {
  off: { title: 'Protection off', copy: 'Uses the compatibility user agent and does not block tracker requests or remove tracking parameters.' },
  balanced: { title: 'Balanced protection', copy: 'Blocks common advertising and analytics hosts, removes marketing parameters, sends Global Privacy Control, and suppresses high-entropy browser hints.' },
  strict: { title: 'Strict protection', copy: 'Adds telemetry blocking and a generic reduced user agent while withholding browser-brand and platform hints. This can trigger extra verification or break some websites.' }
};

const normalizePrivacyMode = (mode) => ['off', 'balanced', 'strict'].includes(mode) ? mode : 'balanced';

function renderPrivacyStatus(status = privacyStatus) {
  privacyStatus = { ...privacyStatus, ...(status || {}) };
  const mode = privacyStatus.mode || activeProfile().settings.privacyMode || 'balanced';
  const detail = privacyModeDetails[mode] || privacyModeDetails.balanced;
  if ($('privacy-mode')) $('privacy-mode').value = mode;
  $('privacy-mode-title').textContent = detail.title;
  $('privacy-mode-description').textContent = detail.copy;
  $('privacy-blocked-count').textContent = String(privacyStatus.blockedRequests || 0);
  $('privacy-cleaned-count').textContent = String(privacyStatus.cleanedLinks || 0);
  $('privacy-mode-card').classList.toggle('off', mode === 'off');
  $('privacy-mode-card').classList.toggle('strict', mode === 'strict');
}

async function configurePrivacyShield(mode = activeProfile().settings.privacyMode || 'balanced') {
  const normalizedMode = normalizePrivacyMode(mode);
  if (!isElectron || !window.atlasBrowser.setPrivacyMode) return renderPrivacyStatus({ mode: normalizedMode });
  try { renderPrivacyStatus(await window.atlasBrowser.setPrivacyMode(normalizedMode)); }
  catch (error) { toast(`Privacy shield unavailable: ${error.message}`); }
}

async function persistPrivacyMode(mode) {
  const profile = activeProfile();
  const normalizedMode = normalizePrivacyMode(mode);
  profile.settings.privacyMode = normalizedMode;
  saveProfiles();
  renderPrivacyStatus({ ...privacyStatus, mode: normalizedMode });
  await configurePrivacyShield(normalizedMode);
}

const activeAgentSession = () => state.agentSessions.find((session) => session.id === activeAgentSessionId);
const sessionScopeName = (session) => session?.scopeProjectId ? (state.projects.find((project) => project.id === session.scopeProjectId)?.name || 'Missing project') : 'All projects';

function renderAgentWorkspace() {
  const session = activeAgentSession();
  const configuredProvider = activeProfile().settings.agentProvider;
  const providerTemplate = providerTemplates.find((provider) => provider.id === configuredProvider.id);
  const providerName = agentRuntimeStatus.providerName || providerTemplate?.name || configuredProvider.id || 'Agent';
  $('agent-session-list').innerHTML = state.agentSessions.length ? state.agentSessions
    .slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((entry) => `<div class="agent-session-item ${entry.id === activeAgentSessionId ? 'selected' : ''}" data-agent-session="${entry.id}"><button class="agent-session-copy" data-agent-open="${entry.id}"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(sessionScopeName(entry))} · ${escapeHtml(providerTemplates.find((provider) => provider.id === entry.providerId)?.name || entry.providerId || 'Codex')} · ${new Date(entry.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></button><button class="agent-session-rename" data-agent-rename="${entry.id}" title="Rename conversation" aria-label="Rename ${escapeHtml(entry.title)}">✎</button><button class="agent-session-delete" data-agent-delete="${entry.id}" title="Delete session">×</button></div>`).join('')
    : '<div class="empty">No saved conversations.</div>';
  $('agent-project-scope').innerHTML = `<option value="">All projects</option>${state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('')}`;
  $('agent-project-scope').value = session?.scopeProjectId || '';
  $('agent-project-scope').disabled = Boolean(session?.messages?.length || session?.busy);
  $('agent-session-title').textContent = session?.title || 'New conversation';
  $('agent-project-label').textContent = sessionScopeName(session);
  const messages = session?.messages || [];
  $('agent-empty').classList.toggle('hidden', messages.length > 0);
  $('agent-messages').innerHTML = messages.map((message) => `<div class="agent-message ${message.role} ${message.pending ? 'pending' : ''}"><div class="agent-message-avatar">${message.role === 'assistant' ? '<img class="agent-brand-image" src="/assets/atlas-mark.png" alt="" />' : 'You'}</div><div class="agent-message-body"><div class="agent-message-name">${message.role === 'assistant' ? 'ATLAS Agent' : 'You'}</div><div class="agent-message-text">${escapeHtml(message.text).replace(/\n/g, '<br>')}</div></div></div>`).join('');
  const usage = session?.tokenUsage;
  const ratio = usage?.modelContextWindow ? Math.min(1, usage.total.totalTokens / usage.modelContextWindow) : 0;
  $('agent-context-meter').querySelector('i').style.width = `${Math.round(ratio * 100)}%`;
  $('agent-context-meter').querySelector('span').textContent = session?.compacting ? 'Compacting context…' : `${Math.round(ratio * 100)}% context`;
  $('agent-status').textContent = agentRuntimeStatus.state === 'ready' ? '● AGENT READY' : agentRuntimeStatus.state === 'error' ? '● ERROR' : '● CONNECTING';
  $('agent-status').classList.toggle('error', agentRuntimeStatus.state === 'error');
  $('agent-input').disabled = !session || agentRuntimeStatus.state !== 'ready' || Boolean(session.busy);
  $('send-agent').disabled = !session || agentRuntimeStatus.state !== 'ready' || Boolean(session.busy);
  $('voice-agent').disabled = !session || (!conversationMode.active && Boolean(session.busy));
  $('agent-activity').textContent = session?.busy ? 'Agent is working…' : agentRuntimeStatus.message || '';
  const effortLabels = { low: 'Light', medium: 'Medium', high: 'High', xhigh: 'Extra high' };
  $('agent-model-label').textContent = `${providerName} · ${configuredProvider.model || 'CLI default'} · ${effortLabels[activeProfile().settings.reasoningEffort] || 'Medium'}`;
  document.querySelectorAll('[data-agent-open]').forEach((button) => button.addEventListener('click', () => { activeAgentSessionId = button.dataset.agentOpen; save(); renderAgentWorkspace(); }));
  document.querySelectorAll('[data-agent-rename]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); renameAgentSession(button.dataset.agentRename); }));
  document.querySelectorAll('[data-agent-delete]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); deleteAgentSession(button.dataset.agentDelete); }));
  requestAnimationFrame(() => { $('agent-messages').scrollTop = $('agent-messages').scrollHeight; });
  renderAgentTray();
  renderConversationModeUI();
}

function renderAgentTray() {
  const tray = $('agent-tray');
  const project = currentProject();
  const session = project ? trayAgentSession(project.id) : null;
  const visible = activeView !== 'agent' && Boolean(project);
  tray.classList.toggle('hidden', !visible);
  if (!project) return;
  $('agent-tray-title').textContent = session?.title || 'New conversation';
  $('agent-tray-scope').textContent = `Scope: ${project.name}`;
  const lastAssistant = [...(session?.messages || [])].reverse().find((message) => message.role === 'assistant' && message.text);
  const previewText = session?.busy ? `Agent is working in ${project.name}…` : lastAssistant?.text || '';
  $('agent-tray-preview').textContent = previewText;
  $('agent-tray-preview').parentElement.classList.toggle('no-preview', !previewText);
  $('agent-tray-status').textContent = session?.busy ? 'WORKING' : agentRuntimeStatus.state === 'ready' ? 'READY' : 'OFFLINE';
  $('agent-tray-status').classList.toggle('working', Boolean(session?.busy));
  const unavailable = agentRuntimeStatus.state !== 'ready' || Boolean(session?.busy);
  $('agent-tray-input').disabled = unavailable;
  $('agent-tray-send').disabled = unavailable;
  $('agent-tray-voice').disabled = !conversationMode.active && unavailable;
  requestAnimationFrame(syncDesktopBounds);
}

function renderConversationModeUI() {
  const labels = {
    listening: 'Conversation mode · listening…',
    hearing: 'Conversation mode · hearing you…',
    transcribing: 'Whisper is transcribing locally…',
    thinking: 'Conversation mode · agent is working…',
    speaking: 'Conversation mode · agent is speaking…'
  };
  const active = conversationMode.active;
  document.querySelectorAll('#voice-agent, #agent-tray-voice').forEach((button) => {
    button.classList.toggle('conversation-active', active);
    button.classList.toggle('recording', active && ['hearing', 'transcribing'].includes(conversationMode.phase));
    button.classList.toggle('speaking', active && conversationMode.phase === 'speaking');
    button.textContent = active ? '■' : '◉';
    button.title = active ? 'End conversation mode' : 'Start conversation mode';
    button.setAttribute('aria-label', button.title);
  });
  if (!active) return;
  if ($('agent-activity')) $('agent-activity').textContent = labels[conversationMode.phase] || 'Conversation mode active';
  if (!$('agent-tray').classList.contains('hidden')) {
    $('agent-tray-status').textContent = conversationMode.phase === 'thinking' ? 'WORKING' : conversationMode.phase === 'speaking' ? 'SPEAKING' : 'LISTENING';
    $('agent-tray-status').classList.toggle('working', conversationMode.phase === 'thinking');
  }
}

function render() {
  const item = currentProject();
  if (isElectron) window.atlasBrowser.setDownloadContext({ profileId: activeProfile().id, projectId: item?.id || '', tabId: currentTab()?.id || '' });
  syncLibraryFileLinks();
  renderProfileHeader();
  renderProjects();
  document.querySelector('.workspace').classList.toggle('browser-workspace', activeView === 'browser');
  if (!item) {
    renderTabs(null);
    renderBookmarks(null);
    $('address').value = '';
    ['tab-count', 'task-count', 'resource-count', 'note-count'].forEach((id) => { $(id).textContent = ''; });
    updateWebsiteSurface(null);
    renderAgentWorkspace();
    renderDownloads();
    if (isElectron) requestAnimationFrame(syncDesktopBounds);
    return;
  }
  const tab = currentTab() || item.tabs[0];
  if (tab) activeTabId = tab.id;
  renderTabs(item);
  renderBookmarks(item);
  $('tab-count').textContent = item.tabs.length || '';
  $('task-count').textContent = item.tasks.filter((task) => !task.done).length || '';
  $('resource-count').textContent = item.resources.length || '';
  $('note-count').textContent = item.notes.length || '';
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('selected', button.dataset.view === activeView));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('hidden', view.id !== `${activeView}-view`));
  $('address').value = tab?.url || '';
  updateWebsiteSurface(tab);
  const activeTasks = item.tasks.filter((task) => !task.done);
  const completedTasks = item.tasks.filter((task) => task.done).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  $('task-list').innerHTML = `${activeTasks.length ? activeTasks.map((task) => taskRow(task)).join('') : '<div class="empty">No active tasks.</div>'}${completedTasks.length ? `<section class="completed-task-section"><div class="completed-task-head"><div><span>Temporary archive</span><h3>Completed</h3></div><small>Automatically removed after 3 days</small></div>${completedTasks.map((task) => taskRow(task, true)).join('')}</section>` : ''}`;
  $('resource-list').innerHTML = item.resources.length ? item.resources.map((resource) => { const display = resourcePresentation(resource); const preview = resource.type === 'image' ? `<span class="resource-preview image-preview" data-resource-image="${resource.id}"><span>IMG</span></span>` : `<span class="resource-preview ${resource.type}">${escapeHtml(display.mark)}</span>`; return `<div class="resource" data-resource-id="${resource.id}" role="button" tabindex="0">${preview}<span class="resource-copy"><span class="resource-title">${escapeHtml(resource.title)}</span><span class="resource-meta">${escapeHtml(display.meta)}</span></span><button class="resource-delete" data-resource-delete="${resource.id}" title="Remove resource">×</button><span class="resource-arrow">›</span></div>`; }).join('') : '<div class="empty">No resources yet. Save the current page or add a document.</div>';
  $('note-list').innerHTML = item.notes.length ? item.notes.map((note) => `<article class="note" data-note-id="${note.id}" role="button" tabindex="0"><div class="note-card-head"><h4>${escapeHtml(note.title)}</h4><span>✎</span></div><div class="note-body">${sanitizeRichText(note.html)}</div><small>UPDATED ${new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}</small></article>`).join('') : '<div class="empty">No notes yet.</div>';
  renderAgentWorkspace();
  document.querySelectorAll('[data-task-check]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const task = item.tasks.find((entry) => entry.id === button.dataset.taskCheck); if (!task) return; task.done = !task.done; task.completedAt = task.done ? new Date().toISOString() : ''; save(); render(); }));
  document.querySelectorAll('[data-task-id]').forEach((node) => node.addEventListener('click', () => openTaskEditor(item.tasks.find((task) => task.id === node.dataset.taskId))));
  document.querySelectorAll('[data-resource-id]').forEach((node) => node.addEventListener('click', (event) => { if (event.target.closest('[data-resource-delete]')) return; openResource(item.resources.find((resource) => resource.id === node.dataset.resourceId)); }));
  document.querySelectorAll('[data-resource-delete]').forEach((button) => button.addEventListener('click', () => removeResource(button.dataset.resourceDelete)));
  document.querySelectorAll('[data-note-id]').forEach((node) => node.addEventListener('click', () => openNoteEditor(item.notes.find((note) => note.id === node.dataset.noteId))));
  hydrateLibraryPreviews();
  renderNotificationBadge();
  renderDownloads();
  if (isElectron) requestAnimationFrame(syncDesktopBounds);
}

function syncDesktopBounds() {
  if (!isElectron) return;
  const rect = document.querySelector('.browser-canvas').getBoundingClientRect();
  const overlayOpen = ['project-modal', 'profile-modal', 'resource-modal', 'resource-viewer-modal', 'task-modal', 'note-modal', 'settings-modal', 'bookmark-modal', 'bookmark-manager', 'emoji-picker', 'download-popover', 'notification-popover', 'walkthrough-overlay'].some((id) => !$(id).classList.contains('hidden'));
  const trayHeight = !$('agent-tray').classList.contains('hidden') ? Math.ceil($('agent-tray').getBoundingClientRect().height + 18) : 0;
  window.atlasBrowser.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: Math.max(0, rect.height - trayHeight), visible: activeView === 'browser' && Boolean(currentTab()?.url) && !overlayOpen });
}

function sidebarWidthLimits() {
  return { min: 210, max: Math.max(210, Math.min(460, window.innerWidth - 680)) };
}

function applySidebarWidth(value, persist = false) {
  const limits = sidebarWidthLimits();
  const width = Math.round(Math.min(limits.max, Math.max(limits.min, Number(value) || 268)));
  document.querySelector('.app-shell').style.setProperty('--sidebar-width', `${width}px`);
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  const sidebar = document.querySelector('.project-sidebar');
  sidebar.classList.toggle('sidebar-compact', width < 245);
  sidebar.classList.toggle('sidebar-wide', width > 340);
  $('sidebar-resizer').setAttribute('aria-valuemax', String(limits.max));
  $('sidebar-resizer').setAttribute('aria-valuenow', String(width));
  if (persist) { activeProfile().settings.sidebarWidth = width; saveProfiles(); }
  requestAnimationFrame(syncDesktopBounds);
  return width;
}

function agentTrayHeightLimits() {
  return { min: 72, max: Math.max(160, Math.min(420, window.innerHeight - 220)) };
}

function applyAgentTrayHeight(value, persist = false) {
  const limits = agentTrayHeightLimits();
  const height = Math.round(Math.min(limits.max, Math.max(limits.min, Number(value) || 76)));
  const tray = $('agent-tray');
  tray.style.setProperty('--agent-tray-height', `${height}px`);
  tray.classList.toggle('tray-expanded', height > 118);
  tray.classList.toggle('tray-tall', height > 235);
  $('agent-tray-resizer').setAttribute('aria-valuemax', String(limits.max));
  $('agent-tray-resizer').setAttribute('aria-valuenow', String(height));
  if (persist) { activeProfile().settings.agentTrayHeight = height; saveProfiles(); }
  requestAnimationFrame(syncDesktopBounds);
  return height;
}

function setProjectColor(value) {
  const color = normalizeHexColor(value);
  const ink = contrastText(color);
  $('project-color').value = color;
  $('project-color-hex').value = color;
  $('project-color-sample').style.setProperty('--sample-color', color);
  $('project-color-sample').style.setProperty('--sample-ink', ink);
  $('project-emoji-preview')?.style.setProperty('--project-color', color);
}

function clampCrop() {
  if (!cropSource) return;
  const size = 220;
  const scale = cropBaseScale * cropZoom;
  const width = cropSource.naturalWidth * scale;
  const height = cropSource.naturalHeight * scale;
  cropOffset.x = Math.min(0, Math.max(size - width, cropOffset.x));
  cropOffset.y = Math.min(0, Math.max(size - height, cropOffset.y));
}

function drawCropPreview() {
  const preview = $('crop-preview');
  const context = preview.getContext('2d');
  context.clearRect(0, 0, preview.width, preview.height);
  context.fillStyle = '#25212e';
  context.fillRect(0, 0, preview.width, preview.height);
  if (!cropSource) return;
  const scale = cropBaseScale * cropZoom;
  const sourceX = -cropOffset.x / scale;
  const sourceY = -cropOffset.y / scale;
  const sourceSize = 220 / scale;
  context.drawImage(cropSource, sourceX, sourceY, sourceSize, sourceSize, 0, 0, preview.width, preview.height);
}

function renderCrop() {
  const image = $('crop-image');
  if (!cropSource) {
    image.classList.add('hidden');
    $('crop-placeholder').classList.remove('hidden');
    drawCropPreview();
    return;
  }
  clampCrop();
  const scale = cropBaseScale * cropZoom;
  image.classList.remove('hidden');
  $('crop-placeholder').classList.add('hidden');
  image.src = cropSource.src;
  image.style.width = `${cropSource.naturalWidth * scale}px`;
  image.style.height = `${cropSource.naturalHeight * scale}px`;
  image.style.transform = `translate(${cropOffset.x}px, ${cropOffset.y}px)`;
  drawCropPreview();
}

function loadCropImage(source) {
  if (!source) {
    cropSource = null;
    $('project-image-zoom').disabled = true;
    renderCrop();
    return;
  }
  const image = new Image();
  image.onload = () => {
    cropSource = image;
    cropBaseScale = Math.max(220 / image.naturalWidth, 220 / image.naturalHeight);
    cropZoom = 1;
    cropOffset = { x: (220 - image.naturalWidth * cropBaseScale) / 2, y: (220 - image.naturalHeight * cropBaseScale) / 2 };
    $('project-image-zoom').value = '1';
    $('project-image-zoom').disabled = false;
    renderCrop();
  };
  image.onerror = () => toast('That image could not be loaded');
  image.src = source;
}

function croppedProjectImage() {
  if (!cropSource) return '';
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const scale = cropBaseScale * cropZoom;
  context.drawImage(cropSource, -cropOffset.x / scale, -cropOffset.y / scale, 220 / scale, 220 / scale, 0, 0, 256, 256);
  return canvas.toDataURL('image/webp', 0.9);
}

function profileInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function renderProfileHeader() {
  const profile = activeProfile();
  const image = $('profile-avatar-image');
  const text = $('profile-avatar-text');
  $('profile-button').title = `${profile.name} · ${profile.email}`;
  if (profile.image) {
    image.src = profile.image;
    image.classList.remove('hidden');
    text.classList.add('hidden');
  } else {
    image.classList.add('hidden');
    text.classList.remove('hidden');
    text.textContent = profileInitials(profile.name);
  }
  renderNotificationBadge();
}

function renderProfileList() {
  $('profile-list').innerHTML = profileStore.profiles.map((profile) => {
    const avatar = profile.image ? `<img src="${escapeHtml(profile.image)}" alt="" />` : `<span>${escapeHtml(profileInitials(profile.name))}</span>`;
    return `<button type="button" class="profile-list-item ${profile.id === editingProfileId ? 'selected' : ''}" data-profile-id="${profile.id}"><span class="profile-list-avatar">${avatar}</span><span class="profile-list-copy"><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.email)}</small></span>${profile.id === profileStore.activeProfileId ? '<em>ACTIVE</em>' : ''}</button>`;
  }).join('');
}

function clampProfileCrop() {
  if (!profileCropSource) return;
  const size = 200;
  const scale = profileCropBaseScale * profileCropZoom;
  const width = profileCropSource.naturalWidth * scale;
  const height = profileCropSource.naturalHeight * scale;
  profileCropOffset.x = Math.min(0, Math.max(size - width, profileCropOffset.x));
  profileCropOffset.y = Math.min(0, Math.max(size - height, profileCropOffset.y));
}

function drawProfileCropPreview() {
  const preview = $('profile-crop-preview');
  const context = preview.getContext('2d');
  context.clearRect(0, 0, preview.width, preview.height);
  context.fillStyle = '#25212e';
  context.fillRect(0, 0, preview.width, preview.height);
  if (!profileCropSource) return;
  const scale = profileCropBaseScale * profileCropZoom;
  context.drawImage(profileCropSource, -profileCropOffset.x / scale, -profileCropOffset.y / scale, 200 / scale, 200 / scale, 0, 0, preview.width, preview.height);
}

function renderProfileCrop() {
  const image = $('profile-crop-image');
  if (!profileCropSource) {
    image.classList.add('hidden');
    $('profile-crop-placeholder').classList.remove('hidden');
    drawProfileCropPreview();
    return;
  }
  clampProfileCrop();
  const scale = profileCropBaseScale * profileCropZoom;
  image.classList.remove('hidden');
  $('profile-crop-placeholder').classList.add('hidden');
  image.src = profileCropSource.src;
  image.style.width = `${profileCropSource.naturalWidth * scale}px`;
  image.style.height = `${profileCropSource.naturalHeight * scale}px`;
  image.style.transform = `translate(${profileCropOffset.x}px, ${profileCropOffset.y}px)`;
  drawProfileCropPreview();
}

function loadProfileCropImage(source) {
  if (!source) {
    profileCropSource = null;
    $('profile-image-zoom').disabled = true;
    renderProfileCrop();
    return;
  }
  const image = new Image();
  image.onload = () => {
    profileCropSource = image;
    profileCropBaseScale = Math.max(200 / image.naturalWidth, 200 / image.naturalHeight);
    profileCropZoom = 1;
    profileCropOffset = { x: (200 - image.naturalWidth * profileCropBaseScale) / 2, y: (200 - image.naturalHeight * profileCropBaseScale) / 2 };
    $('profile-image-zoom').value = '1';
    $('profile-image-zoom').disabled = false;
    renderProfileCrop();
  };
  image.onerror = () => toast('That profile image could not be loaded');
  image.src = source;
}

function croppedProfileImage() {
  if (!profileCropSource) return '';
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const scale = profileCropBaseScale * profileCropZoom;
  context.drawImage(profileCropSource, -profileCropOffset.x / scale, -profileCropOffset.y / scale, 200 / scale, 200 / scale, 0, 0, 256, 256);
  return canvas.toDataURL('image/webp', 0.9);
}

function selectProfileEditor(profile = null) {
  editingProfileId = profile?.id || null;
  $('profile-name').value = profile?.name || '';
  $('profile-email').value = profile?.email || '';
  $('profile-image-input').value = '';
  $('use-profile').classList.toggle('hidden', !profile || profile.id === profileStore.activeProfileId);
  loadProfileCropImage(profile?.image || '');
  renderProfileList();
  requestAnimationFrame(() => $('profile-name').focus());
}

function openProfileManager() {
  $('profile-modal').classList.remove('hidden');
  selectProfileEditor(activeProfile());
  requestAnimationFrame(syncDesktopBounds);
}

function closeProfileManager() {
  $('profile-modal').classList.add('hidden');
  editingProfileId = null;
  profileCropSource = null;
  requestAnimationFrame(syncDesktopBounds);
}

function switchProfile(profileId) {
  save();
  if (conversationMode.active) stopConversationMode();
  const profile = profileStore.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  profileStore.activeProfileId = profile.id;
  state = normalizeWorkspace(profile.workspace);
  activeProjectId = state.projects.some((project) => project.id === state.session?.activeProjectId) ? state.session.activeProjectId : state.projects[0]?.id;
  activeTabId = state.projects.find((project) => project.id === activeProjectId)?.tabs.some((tab) => tab.id === state.session?.activeTabId) ? state.session.activeTabId : state.projects.find((project) => project.id === activeProjectId)?.tabs[0]?.id;
  activeView = validViews.has(state.session?.activeView) ? state.session.activeView : 'browser';
  activeAgentSessionId = state.agentSessions.some((session) => session.id === state.session?.activeAgentSessionId) ? state.session.activeAgentSessionId : state.agentSessions[0]?.id;
  applySidebarWidth(profile.settings.sidebarWidth);
  applyAgentTrayHeight(profile.settings.agentTrayHeight);
  lastDesktopUrl = '';
  closeNotifications();
  saveProfiles();
  closeProfileManager();
  render();
  migrateCopiedDownloadsToLinks();
  configureActiveAgentProvider();
  configurePrivacyShield(profile.settings.privacyMode);
  if (!profile.settings.walkthroughCompleted) setTimeout(() => startWalkthrough(false), 350);
  toast(`Switched to ${profile.name}`);
}

function saveProfileEditor(event) {
  event.preventDefault();
  const name = $('profile-name').value.trim();
  const email = $('profile-email').value.trim().toLowerCase();
  if (!name || !email || !$('profile-email').checkValidity()) return;
  const duplicate = profileStore.profiles.some((profile) => profile.email.toLowerCase() === email && profile.id !== editingProfileId);
  if (duplicate) return toast('That email already belongs to another profile');
  const image = croppedProfileImage();
  if (editingProfileId) {
    const profile = profileStore.profiles.find((item) => item.id === editingProfileId);
    if (!profile) return;
    profile.name = name;
    profile.email = email;
    if (image) profile.image = image;
    saveProfiles();
    if (profile.id === profileStore.activeProfileId) {
      closeProfileManager();
      render();
    } else {
      renderProfileList();
      renderProfileHeader();
    }
    toast('Profile updated');
  } else {
    const id = `profile-${Date.now()}`;
    const profile = { id, name, email, image, settings: { compactionThreshold: 0.78, reasoningEffort: 'medium', ttsVoice: 'af_heart', ttsSpeed: 1, sttModel: 'base.en', autoSpeak: false, sidebarWidth: 268, agentTrayHeight: 76, defaultPageUrl: '', privacyMode: 'balanced', walkthroughCompleted: false, agentProvider: { id: 'codex', executable: 'codex', model: 'gpt-5.6-luna', effort: 'medium', usageMode: 'native', secretId: `${id}:codex` } }, workspace: { projects: [], globalBookmarks: [], agentSessions: [], notifications: [] } };
    profileStore.profiles.push(profile);
    saveProfiles();
    switchProfile(profile.id);
  }
}

function updateResourceForm() {
  const type = $('resource-type').value;
  $('resource-url-field').classList.toggle('hidden', type !== 'url');
  $('resource-text-field').classList.toggle('hidden', type !== 'text');
  $('resource-file-field').classList.toggle('hidden', !['pdf', 'image'].includes(type));
  $('resource-url').required = type === 'url';
  $('resource-text').required = type === 'text';
  $('resource-file').required = ['pdf', 'image'].includes(type) && !editingResourceId;
  $('resource-file').accept = type === 'pdf' ? 'application/pdf,.pdf' : 'image/png,image/jpeg,image/webp,image/gif';
  $('resource-file-label').textContent = type === 'pdf' ? 'Choose PDF file' : 'Choose picture';
  $('resource-file-help').textContent = type === 'pdf' ? 'PDF, up to 50 MB' : 'PNG, JPG, WebP, or GIF, up to 25 MB';
}

function openResourceEditor(resource = null) {
  editingResourceId = resource?.id || null;
  pendingResourceFile = null;
  $('resource-modal-title').textContent = resource ? 'Edit text document' : 'Add resource';
  $('resource-type').value = resource?.type || 'url';
  $('resource-type').disabled = Boolean(resource);
  $('resource-title').value = resource?.title || '';
  $('resource-url').value = resource?.url || '';
  $('resource-text').value = resource?.text || '';
  $('resource-file').value = '';
  $('resource-selected-file').textContent = resource?.fileName || '';
  $('resource-selected-file').classList.toggle('hidden', !resource?.fileName);
  $('delete-resource').classList.toggle('hidden', !resource);
  updateResourceForm();
  $('resource-modal').classList.remove('hidden');
  requestAnimationFrame(() => { $('resource-title').focus(); syncDesktopBounds(); });
}

function closeResourceEditor() {
  $('resource-modal').classList.add('hidden');
  editingResourceId = null;
  pendingResourceFile = null;
  $('resource-type').disabled = false;
  requestAnimationFrame(syncDesktopBounds);
}

async function saveResourceEditor(event) {
  event.preventDefault();
  const project = currentProject();
  if (!project) return;
  const type = $('resource-type').value;
  const title = $('resource-title').value.trim();
  if (!title) return;
  if (editingResourceId) {
    const resource = project.resources.find((item) => item.id === editingResourceId);
    if (!resource) return;
    resource.title = title;
    if (resource.type === 'text') resource.text = $('resource-text').value;
    save();
    closeResourceEditor();
    render();
    return toast('Resource updated');
  }
  const resource = { id: `resource-${Date.now()}`, type, title, createdAt: new Date().toISOString() };
  if (type === 'url') {
    const url = normalizeAddress($('resource-url').value);
    if (!url) return;
    resource.url = url;
  } else if (type === 'text') {
    resource.text = $('resource-text').value;
  } else {
    if (!pendingResourceFile) return toast('Choose a file first');
    const sizeLimit = type === 'pdf' ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    if (pendingResourceFile.size > sizeLimit) return toast(`Choose a file under ${type === 'pdf' ? '50' : '25'} MB`);
    resource.fileName = pendingResourceFile.name;
    resource.mime = pendingResourceFile.type || (type === 'pdf' ? 'application/pdf' : 'application/octet-stream');
    resource.blobKey = `${activeProfile().id}:${resource.id}`;
    try { await putResourceBlob(resource.blobKey, pendingResourceFile); } catch { return toast('The file could not be stored'); }
  }
  project.resources.unshift(resource);
  save();
  closeResourceEditor();
  render();
  toast('Resource added to Library');
}

function captureCurrentPage() {
  const project = currentProject();
  const tab = currentTab();
  if (!project || !tab?.url) return toast('Open a website before saving it');
  const existing = project.resources.find((resource) => resource.type === 'url' && resource.url === tab.url);
  if (existing) return toast('This page is already in the Library');
  project.resources.unshift({ id: `resource-${Date.now()}`, type: 'url', title: tab.title || tab.url, url: tab.url, createdAt: new Date().toISOString() });
  save();
  render();
  toast('Current page saved to Library');
}

function saveWebSelectionToLibrary(payload) {
  const project = currentProject();
  if (!project) return toast('Choose a project before saving highlighted text');
  const selectedText = String(payload?.text || '').trim();
  if (!selectedText) return toast('No highlighted text was found');
  if (selectedText.length > 250000) return toast('That selection is too large. Highlight a smaller passage.');
  const savedAt = new Date();
  const savedDate = savedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  const sourceUrl = String(payload?.url || currentTab()?.url || '').trim();
  const pageTitle = String(payload?.title || currentTab()?.title || 'Web excerpt').trim();
  project.resources.unshift({
    id: `resource-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'text',
    title: `${pageTitle} · ${savedDate}`.slice(0, 140),
    text: `Saved: ${savedDate}\nSource URL: ${sourceUrl || 'Unknown'}\n\n${selectedText}`,
    sourceUrl,
    createdAt: savedAt.toISOString()
  });
  save();
  render();
  toast(`Highlighted text saved to ${project.name} Library`);
}

async function removeResource(resourceId) {
  const project = currentProject();
  const resource = project?.resources.find((item) => item.id === resourceId);
  if (!resource || !window.confirm(`Remove “${resource.title}” from this project?`)) return;
  if (resource.blobKey) {
    try { await deleteResourceBlob(resource.blobKey); } catch {}
  }
  project.resources = project.resources.filter((item) => item.id !== resourceId);
  save();
  if (!$('resource-modal').classList.contains('hidden')) closeResourceEditor();
  render();
  toast('Resource removed');
}

function openResourceUrl(resource) {
  const project = currentProject();
  let tab = project.tabs.find((item) => item.url === resource.url);
  if (!tab) {
    tab = { id: `tab-${Date.now()}`, title: resource.title, icon: '🔗', url: resource.url };
    project.tabs.push(tab);
  }
  activeTabId = tab.id;
  activeView = 'browser';
  save();
  render();
  toast('Opened Library link');
}

async function openResource(resource) {
  if (!resource) return;
  if (resource.type === 'url') return openResourceUrl(resource);
  if (resource.type === 'text') return openResourceEditor(resource);
  if (resource.type === 'file' && resource.downloadPath && isElectron) {
    try { await window.atlasBrowser.openLibraryFile({ profileId: activeProfile().id, projectId: activeProjectId, resourceId: resource.id }); }
    catch (error) { toast(error.message || 'The downloaded file could not be opened'); }
    return;
  }
  if (!resource.blobKey) return toast('This file is missing from local storage');
  try {
    const blob = await getResourceBlob(resource.blobKey);
    if (!blob) return toast('This file is missing from local storage');
    if (resourceViewerUrl) URL.revokeObjectURL(resourceViewerUrl);
    resourceViewerUrl = URL.createObjectURL(blob);
    $('resource-viewer-title').textContent = resource.title;
    $('resource-viewer-type').textContent = resource.type === 'pdf' ? resource.fileName || 'PDF file' : resource.fileName || 'Picture';
    $('resource-viewer-content').innerHTML = resource.type === 'pdf' ? `<embed src="${resourceViewerUrl}" type="application/pdf" />` : `<img src="${resourceViewerUrl}" alt="${escapeHtml(resource.title)}" />`;
    $('resource-viewer-modal').classList.remove('hidden');
    requestAnimationFrame(syncDesktopBounds);
  } catch { toast('The file could not be opened'); }
}

function closeResourceViewer() {
  $('resource-viewer-modal').classList.add('hidden');
  $('resource-viewer-content').innerHTML = '';
  if (resourceViewerUrl) URL.revokeObjectURL(resourceViewerUrl);
  resourceViewerUrl = '';
  requestAnimationFrame(syncDesktopBounds);
}

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function openTaskEditor(task = null) {
  editingTaskId = task?.id || null;
  $('task-modal-title').textContent = task ? 'Edit task' : 'Add task';
  $('task-title-input').value = task?.title || '';
  $('task-due-input').value = localDateTimeValue(task?.dueAt);
  $('task-priority-input').value = task?.priority || 'medium';
  $('delete-task').classList.toggle('hidden', !task);
  $('task-modal').classList.remove('hidden');
  requestAnimationFrame(() => { $('task-title-input').focus(); syncDesktopBounds(); });
}

function closeTaskEditor() {
  $('task-modal').classList.add('hidden');
  editingTaskId = null;
  requestAnimationFrame(syncDesktopBounds);
}

function saveTaskEditor(event) {
  event.preventDefault();
  const project = currentProject();
  if (!project) return;
  const title = $('task-title-input').value.trim();
  const dueInput = $('task-due-input').value;
  const dueAt = dueInput ? new Date(dueInput).toISOString() : '';
  const priority = $('task-priority-input').value;
  if (!title) return;
  if (editingTaskId) {
    const task = project.tasks.find((item) => item.id === editingTaskId);
    if (!task) return;
    if (task.dueAt !== dueAt) task.notifiedAt = '';
    task.title = title;
    task.dueAt = dueAt;
    task.priority = priority;
  } else {
    project.tasks.unshift({ id: `task-${Date.now()}`, title, dueAt, due: '', priority, done: false, notifiedAt: '' });
  }
  save();
  closeTaskEditor();
  render();
  checkDueTasks();
  toast('Task saved');
}

function deleteTask() {
  const project = currentProject();
  const task = project?.tasks.find((item) => item.id === editingTaskId);
  if (!task || !window.confirm(`Delete “${task.title}”?`)) return;
  project.tasks = project.tasks.filter((item) => item.id !== task.id);
  save();
  closeTaskEditor();
  render();
  toast('Task deleted');
}

function playNotificationChime() {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    gain.connect(context.destination);
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.12);
      oscillator.stop(context.currentTime + 0.5);
    });
    setTimeout(() => context.close(), 700);
  } catch {}
}

function checkDueTasks() {
  const now = Date.now();
  let activeDue = false;
  let changed = false;
  profileStore.profiles.forEach((profile) => {
    const taskCountBeforeNormalization = (profile.workspace?.projects || []).reduce((total, project) => total + (project.tasks || []).length, 0);
    const workspace = normalizeWorkspace(profile.workspace);
    const taskCountAfterNormalization = workspace.projects.reduce((total, project) => total + project.tasks.length, 0);
    if (taskCountAfterNormalization !== taskCountBeforeNormalization) changed = true;
    workspace.projects.forEach((project) => {
      const retainedTasks = project.tasks.filter((task) => !task.done || !task.completedAt || now - new Date(task.completedAt).getTime() < completedTaskRetentionMs);
      if (retainedTasks.length !== project.tasks.length) {
        project.tasks = retainedTasks;
        changed = true;
      }
      project.tasks.forEach((task) => {
      const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : NaN;
      if (task.done || task.notifiedAt || !Number.isFinite(dueTime) || dueTime > now) return;
      task.notifiedAt = new Date().toISOString();
      workspace.notifications.unshift({ id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, projectId: project.id, taskId: task.id, title: task.title, message: `Due in ${project.name}`, createdAt: new Date().toISOString(), read: false });
      changed = true;
      if (profile.id === profileStore.activeProfileId) activeDue = true;
      });
    });
  });
  if (changed) saveProfiles();
  if (activeDue) playNotificationChime();
  renderNotificationBadge();
  if (changed && activeView === 'tasks') render();
}

function openNotifications() {
  closeDownloads();
  notificationSnapshot = (state.notifications || []).filter((notification) => !notification.read);
  $('notification-list').innerHTML = notificationSnapshot.length ? notificationSnapshot.map((notification) => `<button type="button" data-notification-id="${notification.id}"><span>✓</span><span><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.message)}</small></span></button>`).join('') : '<div class="empty-notifications">No unread notifications.</div>';
  notificationSnapshot.forEach((notification) => { notification.read = true; });
  save();
  renderNotificationBadge();
  $('notification-popover').classList.remove('hidden');
  requestAnimationFrame(syncDesktopBounds);
}

function closeNotifications() { $('notification-popover').classList.add('hidden'); notificationSnapshot = []; requestAnimationFrame(syncDesktopBounds); }

function openNotification(notificationId) {
  const notification = notificationSnapshot.find((item) => item.id === notificationId) || state.notifications.find((item) => item.id === notificationId);
  if (!notification) return;
  if (state.projects.some((project) => project.id === notification.projectId)) {
    activeProjectId = notification.projectId;
    activeTabId = currentProject()?.tabs[0]?.id;
    activeView = 'tasks';
    render();
  }
  closeNotifications();
}

function matchingEmojiEntries(query = '') {
  const terms = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.length
    ? emojiCatalog.filter((entry) => terms.every((term) => `${entry.emoji} ${entry.keywords}`.toLowerCase().includes(term)))
    : emojiCatalog;
}

function renderProjectEmojiChoices(query = '') {
  const matches = matchingEmojiEntries(query);
  $('project-emoji-grid').innerHTML = matches.length
    ? matches.map((entry) => `<button type="button" class="${entry.emoji === editingProjectEmoji ? 'selected' : ''}" data-project-emoji="${escapeHtml(entry.emoji)}" title="Use ${escapeHtml(entry.emoji)}" aria-label="Use ${escapeHtml(entry.emoji)}">${escapeHtml(entry.emoji)}</button>`).join('')
    : '<div class="emoji-no-results">No matching emojis</div>';
  $('project-emoji-grid').scrollTop = 0;
  $('project-emoji-preview').textContent = editingProjectEmoji;
}

function setProjectIconMode(mode) {
  projectIconMode = mode === 'emoji' ? 'emoji' : 'image';
  document.querySelectorAll('[data-project-icon-mode]').forEach((button) => button.classList.toggle('selected', button.dataset.projectIconMode === projectIconMode));
  $('project-image-editor').classList.toggle('hidden', projectIconMode !== 'image');
  $('project-image-zoom-control').classList.toggle('hidden', projectIconMode !== 'image');
  $('project-emoji-editor').classList.toggle('hidden', projectIconMode !== 'emoji');
  if (projectIconMode === 'emoji') renderProjectEmojiChoices($('project-emoji-search').value);
}

function openProjectEditor(item = null) {
  editingProjectId = item?.id || null;
  $('project-modal-title').textContent = item ? 'Edit project' : 'Create project';
  $('project-name').value = item?.name || '';
  $('project-status').value = item?.status || 'Active P3';
  setProjectColor(item?.color || neonProjectPalette[state.projects.length % neonProjectPalette.length]);
  $('project-image-input').value = '';
  $('project-emoji-search').value = '';
  editingProjectEmoji = item?.emoji || '🚀';
  $('delete-project').classList.toggle('hidden', !item);
  $('project-modal').classList.remove('hidden');
  loadCropImage(item?.image || '');
  setProjectIconMode(item?.iconMode || 'image');
  syncDesktopBounds();
  requestAnimationFrame(() => { $('project-name').focus(); $('project-name').select(); });
}

function closeProjectEditor() {
  $('project-modal').classList.add('hidden');
  editingProjectId = null;
  cropSource = null;
  requestAnimationFrame(syncDesktopBounds);
}

function saveProjectEditor(event) {
  event.preventDefault();
  const name = $('project-name').value.trim();
  const status = $('project-status').value.trim();
  const color = normalizeHexColor($('project-color-hex').value);
  if (!name) { $('project-name').focus(); return toast('Enter a project name'); }
  if (!status) return toast('Choose a project status');
  const image = croppedProjectImage();
  if (editingProjectId) {
    const item = state.projects.find((project) => project.id === editingProjectId);
    if (!item) return;
    item.name = name;
    item.status = status;
    item.color = color;
    item.iconMode = projectIconMode;
    item.emoji = editingProjectEmoji;
    if (image) item.image = image;
    toast('Project updated');
  } else {
    const item = { id: `project-${Date.now()}`, name, image, iconMode: projectIconMode, emoji: editingProjectEmoji, color, status, description: 'A project workspace.', tabs: [], bookmarks: state.globalBookmarks.map((bookmark) => ({ ...bookmark, id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })), resources: [], downloads: [], notes: [], tasks: [] };
    state.projects.unshift(item);
    activeProjectId = item.id;
    activeTabId = undefined;
    activeView = 'browser';
    toast('Project created');
  }
  save();
  closeProjectEditor();
  render();
}

function deleteCurrentProject() {
  const item = state.projects.find((project) => project.id === editingProjectId);
  if (!item || !window.confirm(`Delete “${item.name}” and all of its saved project context? This cannot be undone.`)) return;
  state.projects = state.projects.filter((project) => project.id !== item.id);
  activeProjectId = state.projects[0]?.id;
  activeTabId = state.projects[0]?.tabs[0]?.id;
  save();
  closeProjectEditor();
  render();
  toast('Project deleted');
}

function editProject() { const item = currentProject(); if (item) openProjectEditor(item); }

function renderEmojiChoices(query = '') {
  const matches = matchingEmojiEntries(query);
  $('emoji-grid').innerHTML = matches.length
    ? matches.map((entry) => `<button type="button" data-emoji="${escapeHtml(entry.emoji)}" title="Use ${escapeHtml(entry.emoji)}" aria-label="Use ${escapeHtml(entry.emoji)}">${escapeHtml(entry.emoji)}</button>`).join('')
    : '<div class="emoji-no-results">No matching emojis</div>';
  $('emoji-grid').scrollTop = 0;
}

function openEmojiPicker(tabId, anchor) {
  emojiTabId = tabId;
  const tab = currentProject()?.tabs.find((item) => item.id === tabId);
  $('use-favicon').classList.toggle('selected', tab?.iconMode === 'favicon');
  $('favicon-option-preview').innerHTML = tab?.favicon ? `<img src="${escapeHtml(tab.favicon)}" alt="" />` : '🌐';
  $('emoji-search').value = '';
  renderEmojiChoices();
  const picker = $('emoji-picker');
  picker.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  const width = 330;
  picker.style.left = `${Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))}px`;
  picker.style.top = `${Math.max(12, Math.min(window.innerHeight - picker.offsetHeight - 12, rect.bottom + 8))}px`;
  requestAnimationFrame(() => { $('emoji-search').focus({ preventScroll: true }); syncDesktopBounds(); });
}

function closeEmojiPicker() { emojiTabId = null; $('emoji-picker').classList.add('hidden'); requestAnimationFrame(syncDesktopBounds); }
function editTabIcon(tabId, anchor) { openEmojiPicker(tabId, anchor); }
function closeTab(tabId) { const item = currentProject(); item.tabs = item.tabs.filter((tab) => tab.id !== tabId); activeTabId = item.tabs[0]?.id; save(); render(); toast('Tab closed'); }
function normalizeAddress(value) { const input = value.trim(); if (!input) return ''; if (/^https?:\/\//i.test(input)) return input; if (/^localhost(?::\d+)?(?:\/|$)/i.test(input) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/.test(input)) return `http://${input}`; if (/^[^\s]+\.[^\s]+/.test(input)) return `https://${input}`; return `https://www.google.com/search?q=${encodeURIComponent(input)}`; }
function isTransientMicrosoftAuthenticationUrl(value) {
  try {
    const url = new URL(String(value));
    return ['login.microsoft.com', 'login.microsoftonline.com'].includes(url.hostname.toLowerCase())
      && (/\/bridge\/fido\/?$/i.test(url.pathname) || /\/fido\//i.test(url.pathname));
  } catch { return false; }
}
function openUrlInCurrentTab(value, message = 'Opening website') {
  const item = currentProject();
  const url = normalizeAddress(String(value || ''));
  if (!item || !url) return;
  let tab = currentTab();
  if (!tab) {
    tab = { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: 'New tab', icon: '🌐', iconMode: 'emoji', favicon: '', url };
    item.tabs.push(tab);
    activeTabId = tab.id;
  } else {
    tab.url = url;
  }
  try { tab.title = new URL(url).hostname.replace(/^www\./, '') || tab.title; } catch {}
  activeView = 'browser';
  save();
  render();
  toast(message);
}
function navigateCurrentTab() { openUrlInCurrentTab($('address').value); }
function addTab() {
  const item = currentProject();
  if (!item) return openProjectEditor();
  const defaultUrl = activeProfile().settings.defaultPageUrl ? normalizeAddress(activeProfile().settings.defaultPageUrl) : '';
  let title = 'New tab';
  if (defaultUrl) { try { title = new URL(defaultUrl).hostname.replace(/^www\./, '') || title; } catch {} }
  const tab = { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, icon: '🌐', iconMode: 'emoji', favicon: '', url: defaultUrl };
  item.tabs.push(tab);
  activeTabId = tab.id;
  activeView = 'browser';
  save();
  render();
  requestAnimationFrame(() => { $('address').value = defaultUrl; if (!defaultUrl) $('address').focus(); });
}

function openExternalUrlInNewTab(value) {
  const item = currentProject();
  const url = normalizeAddress(String(value || ''));
  if (!item || !url) return;
  let title = 'New tab';
  try { title = new URL(url).hostname.replace(/^www\./, '') || title; } catch {}
  const tab = { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, icon: '🌐', iconMode: 'emoji', favicon: '', url };
  item.tabs.push(tab);
  activeTabId = tab.id;
  activeView = 'browser';
  save();
  render();
  toast('Opened link in a new tab');
}

function setBookmarkColor(value) {
  const color = normalizeHexColor(value);
  $('bookmark-color').value = color;
  $('bookmark-color-hex').value = color;
  $('bookmark-color-sample').style.setProperty('--sample-color', color);
  $('bookmark-color-sample').style.setProperty('--sample-ink', contrastText(color));
}

function openBookmarkEditor(bookmark = null) {
  if (!currentProject()) return;
  editingBookmarkId = bookmark?.id || null;
  $('bookmark-modal-title').textContent = bookmark ? 'Edit bookmark' : 'Add bookmark';
  $('bookmark-title').value = bookmark?.title || '';
  $('bookmark-url').value = bookmark?.url || currentTab()?.url || '';
  $('bookmark-apply-all').checked = false;
  $('bookmark-scope-state').textContent = 'This project only';
  setBookmarkColor(bookmark?.color || neonProjectPalette[(currentProject().bookmarks.length + 1) % neonProjectPalette.length]);
  closeBookmarkManager();
  $('bookmark-modal').classList.remove('hidden');
  requestAnimationFrame(() => { syncDesktopBounds(); $('bookmark-title').focus(); });
}

function closeBookmarkEditor() {
  editingBookmarkId = null;
  $('bookmark-modal').classList.add('hidden');
  requestAnimationFrame(syncDesktopBounds);
}

function saveBookmarkEditor(event) {
  event.preventDefault();
  const project = currentProject();
  if (!project) return closeBookmarkEditor();
  const title = $('bookmark-title').value.trim();
  const url = normalizeAddress($('bookmark-url').value);
  const color = normalizeHexColor($('bookmark-color-hex').value);
  const applyToAllProjects = $('bookmark-apply-all').checked;
  if (!title) return $('bookmark-title').focus();
  if (!url) return $('bookmark-url').focus();
  const existing = project.bookmarks.find((bookmark) => bookmark.id === editingBookmarkId);
  if (applyToAllProjects) {
    const sharedId = existing?.sharedId || `shared-bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const globalBookmark = state.globalBookmarks.find((bookmark) => bookmark.sharedId === sharedId);
    if (globalBookmark) Object.assign(globalBookmark, { title, url, color, sharedId });
    else state.globalBookmarks.push({ sharedId, title, url, color });
    state.projects.forEach((targetProject) => {
      targetProject.bookmarks ||= [];
      const targetBookmark = targetProject.id === project.id
        ? existing
        : targetProject.bookmarks.find((bookmark) => bookmark.sharedId === sharedId);
      if (targetBookmark) Object.assign(targetBookmark, { title, url, color, sharedId });
      else targetProject.bookmarks.push({ id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, sharedId, title, url, color });
    });
  } else if (existing) Object.assign(existing, { title, url, color });
  else project.bookmarks.push({ id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, url, color });
  save();
  closeBookmarkEditor();
  renderBookmarks(project);
  toast(applyToAllProjects ? `Bookmark ${existing ? 'updated' : 'added'} across all projects` : `Bookmark ${existing ? 'updated' : 'added'}`);
}

function renderBookmarkManager() {
  const bookmarks = currentProject()?.bookmarks || [];
  $('bookmark-manager-list').innerHTML = bookmarks.length ? bookmarks.map((bookmark) => {
    const color = normalizeHexColor(bookmark.color);
    return `<div class="bookmark-manager-row"><span class="bookmark-manager-color" style="--bookmark-color:${color}"></span><span class="bookmark-manager-copy"><strong>${escapeHtml(bookmark.title)}</strong><small>${escapeHtml(bookmark.url)}</small></span><button type="button" data-bookmark-edit="${bookmark.id}">Edit</button><button type="button" class="bookmark-remove" data-bookmark-remove="${bookmark.id}" title="Remove bookmark">×</button></div>`;
  }).join('') : '<div class="bookmark-manager-empty">No bookmarks saved for this project.</div>';
}

function openBookmarkManager() {
  if (!currentProject()) return;
  renderBookmarkManager();
  const manager = $('bookmark-manager');
  manager.classList.remove('hidden');
  const rect = $('manage-bookmarks').getBoundingClientRect();
  manager.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  manager.style.top = `${Math.min(window.innerHeight - manager.offsetHeight - 12, rect.bottom + 8)}px`;
  requestAnimationFrame(syncDesktopBounds);
}

function closeBookmarkManager() {
  $('bookmark-manager').classList.add('hidden');
  requestAnimationFrame(syncDesktopBounds);
}

function removeBookmark(bookmarkId) {
  const project = currentProject();
  const bookmark = project?.bookmarks.find((entry) => entry.id === bookmarkId);
  if (!project || !bookmark || !window.confirm(`Remove the “${bookmark.title}” bookmark?`)) return;
  if (bookmark.sharedId) {
    state.globalBookmarks = state.globalBookmarks.filter((entry) => entry.sharedId !== bookmark.sharedId);
    state.projects.forEach((targetProject) => { targetProject.bookmarks = targetProject.bookmarks.filter((entry) => entry.sharedId !== bookmark.sharedId); });
  } else project.bookmarks = project.bookmarks.filter((entry) => entry.id !== bookmarkId);
  save();
  renderBookmarks(project);
  renderBookmarkManager();
  toast('Bookmark removed');
}
function openNoteEditor(note = null) {
  editingNoteId = note?.id || null;
  $('note-modal-title').textContent = note ? 'Edit note' : 'New note';
  $('note-title-input').value = note?.title || '';
  $('note-editor').innerHTML = sanitizeRichText(note?.html || '');
  $('delete-note').classList.toggle('hidden', !note);
  $('note-modal').classList.remove('hidden');
  requestAnimationFrame(() => { syncDesktopBounds(); (note ? $('note-editor') : $('note-title-input')).focus(); });
}
function closeNoteEditor() {
  editingNoteId = null;
  $('note-modal').classList.add('hidden');
  $('note-form').reset();
  $('note-editor').innerHTML = '';
  requestAnimationFrame(syncDesktopBounds);
}
function saveNoteEditor(event) {
  event.preventDefault();
  const item = currentProject();
  if (!item) return;
  const title = $('note-title-input').value.trim();
  const html = sanitizeRichText($('note-editor').innerHTML).trim();
  if (!title || !$('note-editor').textContent.trim()) return toast('Add a title and some note text');
  const existing = item.notes.find((note) => note.id === editingNoteId);
  if (existing) Object.assign(existing, { title, html, updatedAt: new Date().toISOString() });
  else item.notes.unshift({ id: `note-${Date.now()}`, title, html, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  save();
  closeNoteEditor();
  render();
  toast(existing ? 'Note updated' : 'Note saved');
}
function deleteNote() {
  if (!editingNoteId || !currentProject() || !window.confirm('Delete this note?')) return;
  currentProject().notes = currentProject().notes.filter((note) => note.id !== editingNoteId);
  save();
  closeNoteEditor();
  render();
  toast('Note deleted');
}
function applyNoteCommand(command, value = null) {
  $('note-editor').focus();
  document.execCommand(command, false, value);
}

function createAgentSession(scopeProjectId = null) {
  if (conversationMode.active) stopConversationMode();
  const session = { id: `agent-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, threadId: '', providerId: activeProfile().settings.agentProvider.id, title: 'New conversation', titleEdited: false, scopeProjectId: scopeProjectId || null, messages: [], updatedAt: new Date().toISOString(), tokenUsage: null, busy: false, compacting: false };
  state.agentSessions.push(session);
  activeAgentSessionId = session.id;
  save();
  renderAgentWorkspace();
  $('agent-input').focus();
  return session;
}

function renameAgentSession(sessionId) {
  const session = state.agentSessions.find((entry) => entry.id === sessionId);
  if (!session) return;
  const title = window.prompt('Conversation name', session.title || 'New conversation');
  if (title === null) return;
  const normalizedTitle = title.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalizedTitle) return toast('Conversation name cannot be empty');
  session.title = normalizedTitle;
  session.titleEdited = true;
  session.updatedAt = new Date().toISOString();
  save();
  renderAgentWorkspace();
  toast('Conversation renamed');
}

function trayAgentSession(projectId = activeProjectId) {
  if (!projectId) return null;
  const active = activeAgentSession();
  if (active?.scopeProjectId === projectId) return active;
  return state.agentSessions
    .filter((session) => session.scopeProjectId === projectId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
}

function ensureTrayAgentSession() {
  const project = currentProject();
  if (!project) return null;
  let session = trayAgentSession(project.id);
  if (!session) {
    session = { id: `agent-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, threadId: '', providerId: activeProfile().settings.agentProvider.id, title: 'New conversation', titleEdited: false, scopeProjectId: project.id, messages: [], updatedAt: new Date().toISOString(), tokenUsage: null, busy: false, compacting: false };
    state.agentSessions.push(session);
  }
  activeAgentSessionId = session.id;
  save();
  return session;
}

async function deleteAgentSession(sessionId) {
  const session = state.agentSessions.find((entry) => entry.id === sessionId);
  if (!session || !window.confirm(`Delete “${session.title}”? This removes its saved agent conversation.`)) return;
  if (conversationMode.active && conversationMode.sessionId === sessionId) stopConversationMode();
  try { if (session.threadId && isElectron) await window.atlasBrowser.deleteAgentThread(session.threadId); } catch (error) { return toast(error.message); }
  state.agentSessions = state.agentSessions.filter((entry) => entry.id !== sessionId);
  if (activeAgentSessionId === sessionId) activeAgentSessionId = state.agentSessions[0]?.id;
  save();
  renderAgentWorkspace();
  toast('Agent session deleted');
}

function agentContextSnapshot(session) {
  const allowed = session.scopeProjectId ? state.projects.filter((project) => project.id === session.scopeProjectId) : state.projects;
  return {
    profile: { id: activeProfile().id, name: activeProfile().name },
    scope: session.scopeProjectId ? { type: 'project', projectId: session.scopeProjectId, projectName: sessionScopeName(session) } : { type: 'all-projects' },
    activeProjectId,
    activeTabId,
    projects: allowed.map((project) => ({
      id: project.id, name: project.name, status: project.status, description: project.description,
      tabs: project.tabs.map(({ id, title, url, icon, iconMode }) => ({ id, title, url, icon, iconMode })),
      tasks: project.tasks.map(({ id, title, priority, dueAt, done, completedAt }) => ({ id, title, priority, dueAt, done, completedAt })),
      notes: project.notes.map(({ id, title, html, updatedAt }) => ({ id, title, text: new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '', updatedAt })),
      resources: project.resources.map(({ id, type, title, url, text, fileName, mimeType, createdAt }) => ({ id, type, title, url, text: type === 'text' ? text : undefined, fileName, mimeType, createdAt }))
    }))
  };
}

function findAgentSessionByThread(threadId) {
  for (const profile of profileStore.profiles) {
    const session = profile.workspace?.agentSessions?.find((entry) => entry.threadId === threadId);
    if (session) return { profile, session };
  }
  return null;
}

async function speakAgentText(text, force = false) {
  if ((!force && !activeProfile().settings.autoSpeak) || !text || !isElectron) return;
  if (activeTtsAudio) { activeTtsAudio.pause(); activeTtsAudio = null; }
  if (conversationTtsFinish) { conversationTtsFinish(); conversationTtsFinish = null; }
  if (activeTtsUrl) { URL.revokeObjectURL(activeTtsUrl); activeTtsUrl = ''; }
  $('agent-activity').textContent = 'Kokoro is generating voice locally…';
  try {
    const result = await window.atlasBrowser.synthesizeSpeech({ text, voice: activeProfile().settings.ttsVoice || 'af_heart', speed: Number(activeProfile().settings.ttsSpeed) || 1 });
    const binary = atob(result.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    activeTtsUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType || 'audio/wav' }));
    activeTtsAudio = new Audio(activeTtsUrl);
    await new Promise((resolve, reject) => {
      conversationTtsFinish = resolve;
      activeTtsAudio.onended = resolve;
      activeTtsAudio.onerror = () => reject(new Error('The generated voice could not be played.'));
      activeTtsAudio.play().catch(reject);
    });
  } catch (error) { toast(`Local voice failed: ${error.message}`); }
  finally {
    conversationTtsFinish = null;
    if (activeTtsUrl) URL.revokeObjectURL(activeTtsUrl);
    activeTtsUrl = '';
    activeTtsAudio = null;
    $('agent-activity').textContent = '';
  }
}

async function maybeCompactAgentSession(session) {
  const usage = session.tokenUsage;
  const ratio = usage?.modelContextWindow ? usage.total.totalTokens / usage.modelContextWindow : 0;
  if (!session.threadId || session.busy || session.compacting || ratio < Number(activeProfile().settings.compactionThreshold || 0.78)) return;
  session.compacting = true;
  saveProfiles();
  renderAgentWorkspace();
  try { await window.atlasBrowser.compactAgentThread(session.threadId); }
  catch (error) { session.compacting = false; toast(`Compaction failed: ${error.message}`); }
}

async function sendAgentMessage(inputId = 'agent-input', suppliedText = '') {
  const input = $(inputId);
  const text = (suppliedText || input.value).trim();
  let session = inputId === 'agent-tray-input' ? ensureTrayAgentSession() : activeAgentSession();
  if (!text || !session || session.busy || !isElectron) return;
  const providerId = activeProfile().settings.agentProvider.id;
  if (session.providerId !== providerId) {
    const replacement = createAgentSession(inputId === 'agent-tray-input' ? activeProjectId : session.scopeProjectId);
    session = replacement;
  }
  session.messages.push({ id: `message-${Date.now()}`, role: 'user', text, createdAt: new Date().toISOString() });
  if (session.messages.length === 1 && !session.titleEdited) {
    const words = text.trim().replace(/\s+/g, ' ').split(' ');
    session.title = `${words.slice(0, 8).join(' ')}${words.length > 8 ? '…' : ''}`.slice(0, 80);
  }
  session.updatedAt = new Date().toISOString();
  session.busy = true;
  input.value = '';
  input.style.height = '';
  save();
  renderAgentWorkspace();
  try {
    if (!session.threadId) {
      const thread = await window.atlasBrowser.createAgentThread();
      session.threadId = thread.id;
      save();
    }
    await window.atlasBrowser.sendAgentTurn({ threadId: session.threadId, text, effort: activeProfile().settings.reasoningEffort || 'medium', context: agentContextSnapshot(session), history: session.messages.slice(0, -1).slice(-30).map(({ role, text: messageText }) => ({ role, text: messageText })) });
  } catch (error) {
    session.busy = false;
    session.messages.push({ id: `message-${Date.now()}`, role: 'assistant', text: `I could not start that request: ${error.message}`, createdAt: new Date().toISOString() });
    save();
    renderAgentWorkspace();
    if (conversationMode.active && conversationMode.sessionId === session.id) resumeConversationAfterFailure(`I could not start that request. ${error.message}`);
    return false;
  }
  return true;
}

async function executeAtlasAgentTool(request) {
  const located = findAgentSessionByThread(request.threadId);
  if (!located || located.profile.id !== activeProfile().id) throw new Error('This agent session is not in the active profile.');
  const { session } = located;
  const args = request.arguments || {};
  const requireProject = () => {
    const project = state.projects.find((entry) => entry.id === args.projectId);
    if (!project) throw new Error('Project not found.');
    if (session.scopeProjectId && project.id !== session.scopeProjectId) throw new Error(`Session is restricted to ${sessionScopeName(session)}.`);
    return project;
  };
  const requireActiveBrowserTab = async () => {
    const project = requireProject();
    const tab = project.tabs.find((entry) => entry.id === args.tabId);
    if (!tab) throw new Error('Browser tab not found.');
    if (activeProjectId !== project.id || activeTabId !== tab.id) throw new Error('That browser tab is not active. Navigate or open it before controlling the page.');
    if (!tab.url) throw new Error('The active browser tab is blank.');
    if (activeView !== 'browser') {
      activeView = 'browser'; save(); render();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    return { project, tab };
  };
  if (request.tool === 'atlas_get_context') return agentContextSnapshot(session);
  if (request.tool === 'atlas_read_current_page') {
    if (session.scopeProjectId && activeProjectId !== session.scopeProjectId) throw new Error(`The visible page is outside the session scope. Open a tab in ${sessionScopeName(session)} first.`);
    return window.atlasBrowser.readCurrentPage(args.maxChars);
  }
  if (request.tool === 'atlas_browser_inspect') {
    const { project, tab } = await requireActiveBrowserTab();
    return { projectId: project.id, tabId: tab.id, ...(await window.atlasBrowser.inspectPage({ maxElements: args.maxElements })) };
  }
  if (request.tool === 'atlas_browser_click') {
    const { project, tab } = await requireActiveBrowserTab();
    return { projectId: project.id, tabId: tab.id, ...(await window.atlasBrowser.clickPage({ ref: args.ref, doubleClick: args.doubleClick })) };
  }
  if (request.tool === 'atlas_browser_type') {
    const { project, tab } = await requireActiveBrowserTab();
    return { projectId: project.id, tabId: tab.id, ...(await window.atlasBrowser.typePage({ ref: args.ref, text: args.text, replace: args.replace !== false })) };
  }
  if (request.tool === 'atlas_browser_press_key') {
    const { project, tab } = await requireActiveBrowserTab();
    return { projectId: project.id, tabId: tab.id, ...(await window.atlasBrowser.pressPageKey({ ref: args.ref, key: args.key, modifiers: args.modifiers })) };
  }
  if (request.tool === 'atlas_browser_scroll') {
    const { project, tab } = await requireActiveBrowserTab();
    return { projectId: project.id, tabId: tab.id, ...(await window.atlasBrowser.scrollPage({ deltaX: args.deltaX, deltaY: args.deltaY })) };
  }
  if (request.tool === 'atlas_open_tab') {
    const project = requireProject();
    const url = normalizeAddress(args.url);
    if (!url) throw new Error('A valid URL is required.');
    const tab = { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: args.title || new URL(url).hostname, icon: args.emoji || '🌐', iconMode: 'emoji', favicon: '', url };
    project.tabs.push(tab); activeProjectId = project.id; activeTabId = tab.id; activeView = 'browser'; save(); render();
    return { success: true, projectId: project.id, tab };
  }
  if (request.tool === 'atlas_navigate_tab') {
    const project = requireProject();
    const tab = project.tabs.find((entry) => entry.id === args.tabId);
    if (!tab) throw new Error('Tab not found.');
    tab.url = normalizeAddress(args.url); activeProjectId = project.id; activeTabId = tab.id; activeView = 'browser'; save(); render();
    return { success: true, tab };
  }
  if (request.tool === 'atlas_create_task') {
    const project = requireProject();
    const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: String(args.title).trim(), priority: args.priority || 'medium', dueAt: args.dueAt || '', notifiedAt: '', done: false, completedAt: '' };
    project.tasks.push(task); save(); render(); return { success: true, task };
  }
  if (request.tool === 'atlas_update_task') {
    const project = requireProject(); const task = project.tasks.find((entry) => entry.id === args.taskId); if (!task) throw new Error('Task not found.');
    if (args.title !== undefined) task.title = String(args.title).trim(); if (args.priority !== undefined) task.priority = args.priority; if (args.dueAt !== undefined) { task.dueAt = args.dueAt; task.notifiedAt = ''; }
    if (args.done !== undefined) { task.done = args.done; task.completedAt = args.done ? new Date().toISOString() : ''; }
    save(); render(); return { success: true, task };
  }
  if (request.tool === 'atlas_delete_task') {
    const project = requireProject(); const before = project.tasks.length; project.tasks = project.tasks.filter((entry) => entry.id !== args.taskId); if (project.tasks.length === before) throw new Error('Task not found.'); save(); render(); return { success: true };
  }
  if (request.tool === 'atlas_save_current_page') {
    const project = requireProject(); const tab = currentTab(); if (!tab || activeProjectId !== project.id) throw new Error('That project does not have the currently visible page.');
    const resource = { id: `resource-${Date.now()}`, type: 'url', title: args.title || tab.title, url: tab.url, createdAt: new Date().toISOString() }; project.resources.push(resource); save(); render(); return { success: true, resource };
  }
  if (request.tool === 'atlas_add_url_resource') {
    const project = requireProject(); const resource = { id: `resource-${Date.now()}`, type: 'url', title: String(args.title).trim(), url: normalizeAddress(args.url), createdAt: new Date().toISOString() }; project.resources.push(resource); save(); render(); return { success: true, resource };
  }
  if (request.tool === 'atlas_read_resource') {
    const project = requireProject(); const resource = project.resources.find((entry) => entry.id === args.resourceId); if (!resource) throw new Error('Resource not found.');
    const result = { ...resource }; delete result.blobKey; delete result.downloadPath;
    if (resource.type === 'file' && resource.downloadPath) {
      const linkedType = resource.linkedFileType || downloadedResourceType(resource);
      if (linkedType === 'file') {
        const status = await window.atlasBrowser.getLibraryFileStatus({ profileId: activeProfile().id, projectId: project.id, resourceId: resource.id });
        result.file = { name: resource.fileName, mimeType: resource.mimeType, size: status.size, linkedFromDownloads: true, contentMode: 'metadata-only' };
        return result;
      }
      const maxBytes = linkedType === 'pdf' ? 50 * 1024 * 1024 : linkedType === 'image' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
      const payload = await window.atlasBrowser.readLibraryFile({ profileId: activeProfile().id, projectId: project.id, resourceId: resource.id, maxBytes });
      const bytes = payload.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload.bytes);
      result.file = { name: resource.fileName, mimeType: resource.mimeType, size: payload.size, linkedFromDownloads: true };
      if (linkedType === 'text') result.text = new TextDecoder().decode(bytes);
      if (linkedType === 'pdf') result.pdf = await window.atlasBrowser.extractPdfText(bytes);
      if (linkedType === 'image') {
        const imageUrl = await blobToDataUrl(new Blob([bytes], { type: resource.mimeType || 'application/octet-stream' }));
        return { _contentItems: [{ type: 'inputText', text: JSON.stringify(result) }, { type: 'inputImage', imageUrl }] };
      }
      return result;
    }
    if (resource.blobKey) {
      const blob = await getResourceBlob(resource.blobKey);
      result.file = blob ? { name: resource.fileName, mimeType: resource.mimeType, size: blob.size } : null;
      if (blob && resource.type === 'pdf') result.pdf = await window.atlasBrowser.extractPdfText(new Uint8Array(await blob.arrayBuffer()));
      if (blob && resource.type === 'image') {
        const metadata = JSON.stringify(result);
        return { _contentItems: [{ type: 'inputText', text: metadata }, { type: 'inputImage', imageUrl: await blobToDataUrl(blob) }] };
      }
    }
    return result;
  }
  if (request.tool === 'atlas_update_text_resource') {
    const project = requireProject(); const resource = project.resources.find((entry) => entry.id === args.resourceId); if (!resource || resource.type !== 'text') throw new Error('Text resource not found.');
    resource.text = String(args.text); if (args.title !== undefined) resource.title = String(args.title).trim(); resource.updatedAt = new Date().toISOString(); save(); render(); return { success: true, resource };
  }
  if (request.tool === 'atlas_add_note') {
    const project = requireProject(); const note = { id: `note-${Date.now()}`, title: String(args.title).trim(), html: escapeHtml(String(args.text)).replace(/\n/g, '<br>'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; project.notes.push(note); save(); render(); return { success: true, note: { ...note, html: undefined } };
  }
  if (request.tool === 'atlas_update_note') {
    const project = requireProject(); const note = project.notes.find((entry) => entry.id === args.noteId); if (!note) throw new Error('Note not found.');
    if (args.title !== undefined) note.title = String(args.title).trim(); if (args.text !== undefined) note.html = escapeHtml(String(args.text)).replace(/\n/g, '<br>'); note.updatedAt = new Date().toISOString(); save(); render(); return { success: true, note: { ...note, html: undefined } };
  }
  if (request.tool === 'atlas_delete_note') {
    const project = requireProject(); const before = project.notes.length; project.notes = project.notes.filter((entry) => entry.id !== args.noteId); if (before === project.notes.length) throw new Error('Note not found.'); save(); render(); return { success: true };
  }
  throw new Error(`Unknown ATLAS tool: ${request.tool}`);
}

function handleAgentEvent(message) {
  if (message.method === 'atlas/status') { agentRuntimeStatus = message.params; renderAgentWorkspace(); return; }
  if (message.method === 'account/rateLimits/updated') { agentUsage = { providerId: 'codex', source: 'native', payload: message.params }; renderAgentUsage(agentUsage); return; }
  const located = findAgentSessionByThread(message.params?.threadId);
  if (!located) return;
  const { profile, session } = located;
  if (message.method === 'atlas/providerTool') {
    if (profile.id === activeProfile().id) $('agent-activity').textContent = message.params.state === 'started' ? `Using ${message.params.tool}…` : message.params.state === 'failed' ? `${message.params.tool} failed` : 'Agent is working…';
  } else if (message.method === 'item/agentMessage/delta') {
    let response = session.messages.find((entry) => entry.itemId === message.params.itemId);
    if (!response) { response = { id: `message-${Date.now()}`, itemId: message.params.itemId, role: 'assistant', text: '', pending: true, createdAt: new Date().toISOString() }; session.messages.push(response); }
    response.text += message.params.delta;
  } else if (message.method === 'item/completed' && message.params.item?.type === 'agentMessage') {
    const response = session.messages.find((entry) => entry.itemId === message.params.item.id);
    if (response) { response.pending = false; if (!response.text && message.params.item.text) response.text = message.params.item.text; }
  } else if (message.method === 'thread/tokenUsage/updated') {
    session.tokenUsage = message.params.tokenUsage;
  } else if (message.method === 'turn/completed') {
    session.busy = false;
    session.messages.filter((entry) => entry.role === 'assistant').forEach((entry) => { entry.pending = false; });
    const latest = [...session.messages].reverse().find((entry) => entry.role === 'assistant');
    if (profile.id === activeProfile().id) {
      if (conversationMode.active && conversationMode.sessionId === session.id) continueConversationAfterTurn(latest?.text || 'I completed that request.');
      else speakAgentText(latest?.text || '');
      maybeCompactAgentSession(session);
    }
  } else if (message.method === 'thread/compacted') {
    session.compacting = false;
  }
  session.updatedAt = new Date().toISOString();
  saveProfiles();
  if (profile.id === activeProfile().id) renderAgentWorkspace();
}

async function populateKokoroVoices() {
  if (!kokoroVoiceCatalog.length && isElectron) kokoroVoiceCatalog = await window.atlasBrowser.getTtsVoices();
  $('tts-voice').innerHTML = kokoroVoiceCatalog.map((voice) => `<option value="${voice.id}">${escapeHtml(voice.name)} · ${escapeHtml(voice.detail)}</option>`).join('');
  const selected = kokoroVoiceCatalog.some((voice) => voice.id === activeProfile().settings.ttsVoice) ? activeProfile().settings.ttsVoice : 'af_heart';
  $('tts-voice').value = selected;
}

const commandLines = (value) => String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const commandText = (value) => Array.isArray(value) ? value.join('\n') : '';

function activeProviderTemplate(id = $('agent-provider')?.value || activeProfile().settings.agentProvider.id) {
  return providerTemplates.find((provider) => provider.id === id) || providerTemplates.find((provider) => provider.id === 'codex') || {};
}

function populateProviderForm(config = activeProfile().settings.agentProvider) {
  const template = activeProviderTemplate(config.id);
  const merged = { ...template, ...config };
  $('agent-provider').value = merged.id || 'codex';
  $('agent-provider-model').value = merged.model || '';
  $('agent-provider-executable').value = merged.executable || '';
  $('agent-provider-args').value = commandText(merged.args);
  $('agent-provider-auth-command').value = commandText(merged.authCommand);
  $('agent-provider-status-command').value = commandText(merged.statusCommand);
  $('agent-provider-base-url').value = merged.baseUrl || '';
  $('agent-provider-api-key').value = '';
  $('agent-usage-mode').value = merged.usageMode || 'none';
  $('agent-usage-command').value = commandText(merged.usageCommand);
  $('agent-usage-manual').value = Number.isFinite(Number(merged.manualUsageRemaining)) ? String(merged.manualUsageRemaining) : '';
  $('agent-reasoning-effort').value = merged.effort || activeProfile().settings.reasoningEffort || 'medium';
  const capabilities = [merged.transport === 'codex-app-server' ? 'Native app server' : merged.transport === 'openai-compatible' ? 'OpenAI tools' : 'Portable CLI adapter', merged.mcp ? 'MCP capable' : 'ATLAS tools', merged.usageMode === 'native' ? 'Native usage' : 'Configurable usage'];
  $('agent-provider-capabilities').innerHTML = capabilities.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
  $('openai-compatible-settings').classList.toggle('hidden', merged.transport !== 'openai-compatible');
  $('agent-usage-command-field').classList.toggle('hidden', merged.usageMode !== 'command');
  $('agent-usage-manual-field').classList.toggle('hidden', merged.usageMode !== 'manual');
  $('agent-provider-login').classList.toggle('hidden', !merged.authCommand?.length);
}

function providerConfigFromForm() {
  const template = activeProviderTemplate();
  const effort = $('agent-reasoning-effort').value || 'medium';
  return {
    ...template,
    id: template.id || 'codex',
    executable: $('agent-provider-executable').value.trim(),
    model: $('agent-provider-model').value.trim(),
    effort,
    args: commandLines($('agent-provider-args').value),
    authCommand: commandLines($('agent-provider-auth-command').value),
    statusCommand: commandLines($('agent-provider-status-command').value),
    usageMode: $('agent-usage-mode').value,
    usageCommand: commandLines($('agent-usage-command').value),
    manualUsageRemaining: $('agent-usage-manual').value === '' ? null : Number($('agent-usage-manual').value),
    baseUrl: $('agent-provider-base-url').value.trim(),
    secretId: `${activeProfile().id}:${template.id || 'codex'}`
  };
}

async function configureActiveAgentProvider() {
  if (!isElectron || !window.atlasBrowser.configureAgentProvider) return;
  agentRuntimeStatus = { state: 'starting', providerId: activeProfile().settings.agentProvider.id, message: 'Connecting to agent provider…' };
  renderAgentWorkspace();
  try { agentRuntimeStatus = await window.atlasBrowser.configureAgentProvider(activeProfile().settings.agentProvider); }
  catch (error) { agentRuntimeStatus = { state: 'error', providerId: activeProfile().settings.agentProvider.id, message: error.message }; }
  renderAgentWorkspace();
  refreshAgentUsage();
}

function openSettings() {
  $('default-page-url').value = activeProfile().settings.defaultPageUrl || '';
  $('privacy-mode').value = activeProfile().settings.privacyMode || 'balanced';
  renderPrivacyStatus({ ...privacyStatus, mode: $('privacy-mode').value });
  $('agent-provider').innerHTML = providerTemplates.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`).join('');
  populateProviderForm(activeProfile().settings.agentProvider);
  $('agent-compaction-threshold').value = String(activeProfile().settings.compactionThreshold || 0.78);
  $('stt-model').value = activeProfile().settings.sttModel || 'base.en';
  $('tts-speed').value = String(activeProfile().settings.ttsSpeed || 1);
  $('auto-speak').checked = Boolean(activeProfile().settings.autoSpeak);
  populateKokoroVoices().catch((error) => toast(`Voice catalog unavailable: ${error.message}`));
  $('settings-modal').classList.remove('hidden');
  requestAnimationFrame(syncDesktopBounds);
}

function closeSettings() { $('settings-modal').classList.add('hidden'); configureActiveAgentProvider(); requestAnimationFrame(syncDesktopBounds); }

async function saveSettings(event) {
  event.preventDefault();
  const configuredDefault = $('default-page-url').value.trim();
  const previousProviderId = activeProfile().settings.agentProvider.id;
  const agentProvider = providerConfigFromForm();
  activeProfile().settings = { ...activeProfile().settings, defaultPageUrl: configuredDefault ? normalizeAddress(configuredDefault) : '', privacyMode: $('privacy-mode').value || 'balanced', compactionThreshold: Number($('agent-compaction-threshold').value), reasoningEffort: agentProvider.effort, agentProvider, ttsVoice: $('tts-voice').value || 'af_heart', ttsSpeed: Number($('tts-speed').value) || 1, sttModel: $('stt-model').value, autoSpeak: $('auto-speak').checked, sidebarWidth: activeProfile().settings.sidebarWidth || 268, agentTrayHeight: activeProfile().settings.agentTrayHeight || 76 };
  const secret = $('agent-provider-api-key').value;
  if (secret && isElectron) await window.atlasBrowser.saveAgentProviderSecret({ secretId: agentProvider.secretId, value: secret });
  saveProfiles();
  await configurePrivacyShield(activeProfile().settings.privacyMode);
  await configureActiveAgentProvider();
  if (previousProviderId !== agentProvider.id) createAgentSession(activeView === 'agent' ? null : activeProjectId);
  closeSettings(); renderAgentWorkspace(); toast('Settings saved');
}

const walkthroughSteps = [
  { selector: '.project-sidebar', title: 'Projects keep work separated', copy: 'Each project owns its tabs, bookmarks, tasks, notes, and library. Resize this sidebar by dragging its right edge.' },
  { selector: '#project-filter', title: 'Find or create a project', copy: 'Search your projects here. Use the neon plus in the tool row to create one, then choose its name, status, color, image, or emoji.' },
  { selector: '.project-quick-menu', title: 'Project tools', copy: 'These buttons open Browser, Tasks, Agent, Library, and Notes for the selected project. Hover any icon to see its name.' },
  { selector: '.tabbar', title: 'Website tabs', copy: 'Tabs are real websites. Click a tab icon to choose from the searchable emoji library or switch back to the website favicon.' },
  { selector: '.browser-toolbar', title: 'Browse and save', copy: 'Enter a URL or search here. Save to project adds the current page to that project’s Library.' },
  { selector: '#download-button', title: 'Project downloads', copy: 'Downloads are saved to disk and automatically added to the current project’s Library. This popup only shows that project’s download activity; dismissing an item never deletes the file or Library resource.' },
  { selector: '#bookmarks-bar', title: 'Project bookmarks', copy: 'Bookmarks change with each project. A bookmark can also be shared with every project, including projects created later.' },
  { selector: '.browser-canvas', title: 'Capture research while browsing', copy: 'Highlight text on a webpage and right-click Send to Library. ATLAS saves the selection with its URL and date.' },
  { selector: '[data-view="tasks"]', title: 'Tasks', copy: 'Create tasks with priorities and due dates. Due tasks notify you, and completed tasks stay in a three-day temporary archive.' },
  { selector: '[data-view="library"]', title: 'Library', copy: 'Store URLs, editable text documents, PDFs, and images. The selected agent can read these project resources.' },
  { selector: '[data-view="notes"]', title: 'Notes', copy: 'Write formatted notes with classic editing controls, then edit or delete them whenever needed.' },
  { selector: '[data-view="agent"]', title: 'The ATLAS agent', copy: 'Choose a project scope in the full Agent view or use all projects. The bottom tray automatically stays scoped to the project you are viewing.' },
  { selector: '#voice-agent', title: 'Conversation mode', copy: 'Conversation mode listens with voice activity detection, acts on your request, answers aloud, and listens again.' },
  { selector: '#settings-button', title: 'Settings and providers', copy: 'Configure privacy protection, Codex or another supported CLI, voice, reasoning effort, usage reporting, and replay this walkthrough at any time.' }
];

function positionWalkthrough() {
  if (walkthroughStep < 0) return;
  const step = walkthroughSteps[walkthroughStep];
  const target = document.querySelector(step.selector);
  const rect = target?.getBoundingClientRect() || { left: window.innerWidth / 2 - 40, top: window.innerHeight / 2 - 40, width: 80, height: 80, right: window.innerWidth / 2 + 40, bottom: window.innerHeight / 2 + 40 };
  const pad = 8;
  Object.assign($('walkthrough-highlight').style, { left: `${Math.max(8, rect.left - pad)}px`, top: `${Math.max(8, rect.top - pad)}px`, width: `${Math.min(window.innerWidth - 16, rect.width + pad * 2)}px`, height: `${Math.min(window.innerHeight - 16, rect.height + pad * 2)}px` });
  const card = $('walkthrough-card');
  const cardWidth = Math.min(420, window.innerWidth - 32);
  const left = rect.right + cardWidth + 34 < window.innerWidth ? rect.right + 18 : Math.max(16, Math.min(window.innerWidth - cardWidth - 16, rect.left));
  const above = rect.top > 300;
  const top = above ? Math.max(16, rect.top - card.offsetHeight - 18) : Math.min(window.innerHeight - card.offsetHeight - 16, rect.bottom + 18);
  Object.assign(card.style, { left: `${left}px`, top: `${Math.max(16, top)}px` });
}

function renderWalkthrough() {
  const step = walkthroughSteps[walkthroughStep];
  if (!step) return finishWalkthrough();
  $('walkthrough-title').textContent = step.title;
  $('walkthrough-copy').textContent = step.copy;
  $('walkthrough-progress').textContent = `${walkthroughStep + 1} of ${walkthroughSteps.length}`;
  $('walkthrough-back').disabled = walkthroughStep === 0;
  $('walkthrough-next').textContent = walkthroughStep === walkthroughSteps.length - 1 ? 'Finish' : 'Next';
  requestAnimationFrame(positionWalkthrough);
}

function startWalkthrough(replay = false) {
  walkthroughReplay = replay;
  walkthroughStep = 0;
  $('walkthrough-overlay').classList.remove('hidden');
  renderWalkthrough();
  requestAnimationFrame(syncDesktopBounds);
}

function finishWalkthrough() {
  walkthroughStep = -1;
  $('walkthrough-overlay').classList.add('hidden');
  if (!walkthroughReplay) { activeProfile().settings.walkthroughCompleted = true; saveProfiles(); }
  requestAnimationFrame(syncDesktopBounds);
}

async function previewTtsVoice() {
  const previous = { voice: activeProfile().settings.ttsVoice, speed: activeProfile().settings.ttsSpeed };
  activeProfile().settings.ttsVoice = $('tts-voice').value || 'af_heart';
  activeProfile().settings.ttsSpeed = Number($('tts-speed').value) || 1;
  $('test-tts-voice').disabled = true;
  $('test-tts-voice').textContent = 'Generating locally…';
  try { await speakAgentText('Hello. I am the ATLAS agent, ready to help with your projects.', true); }
  finally { activeProfile().settings.ttsVoice = previous.voice; activeProfile().settings.ttsSpeed = previous.speed; $('test-tts-voice').disabled = false; $('test-tts-voice').textContent = '▶ Preview selected voice'; }
}

function setConversationPhase(phase) {
  conversationMode.phase = phase;
  renderConversationModeUI();
}

function clearConversationTimers() {
  if (conversationAnimationFrame) cancelAnimationFrame(conversationAnimationFrame);
  if (conversationIdleTimer) clearTimeout(conversationIdleTimer);
  conversationAnimationFrame = 0;
  conversationIdleTimer = 0;
}

function stopConversationMode(reason = '') {
  if (!conversationMode.active && !conversationMode.stream) return;
  conversationMode.active = false;
  clearConversationTimers();
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  mediaRecorder = null;
  voiceChunks = [];
  conversationMode.stream?.getTracks().forEach((track) => track.stop());
  conversationMode.stream = null;
  conversationMode.audioContext?.close().catch(() => {});
  conversationMode.audioContext = null;
  conversationMode.analyser = null;
  conversationMode.phase = 'off';
  if (activeTtsAudio) activeTtsAudio.pause();
  if (conversationTtsFinish) conversationTtsFinish();
  renderAgentWorkspace();
  if (reason) toast(reason);
}

function armConversationIdleTimeout() {
  if (conversationIdleTimer) clearTimeout(conversationIdleTimer);
  conversationIdleTimer = setTimeout(() => {
    if (conversationMode.active && conversationMode.phase === 'listening' && !conversationMode.speechDetected) stopConversationMode('Conversation mode ended after 30 seconds of silence.');
  }, CONVERSATION_IDLE_TIMEOUT_MS);
}

function monitorConversationVoice() {
  if (!conversationMode.active || !conversationMode.analyser || !['listening', 'hearing'].includes(conversationMode.phase)) return;
  const samples = new Uint8Array(conversationMode.analyser.fftSize);
  conversationMode.analyser.getByteTimeDomainData(samples);
  let energy = 0;
  for (const sample of samples) { const normalized = (sample - 128) / 128; energy += normalized * normalized; }
  const rms = Math.sqrt(energy / samples.length);
  const now = performance.now();

  if (!conversationMode.speechDetected && now < conversationMode.calibrationUntil && rms < 0.03) {
    conversationMode.noiseFloor = (conversationMode.noiseFloor * 0.92) + (rms * 0.08);
  }
  const startThreshold = Math.max(0.018, conversationMode.noiseFloor * 3.2);
  const continueThreshold = Math.max(0.012, conversationMode.noiseFloor * 1.8);

  if (!conversationMode.speechDetected) {
    conversationMode.elevatedFrames = rms >= startThreshold ? conversationMode.elevatedFrames + 1 : Math.max(0, conversationMode.elevatedFrames - 1);
    if (conversationMode.elevatedFrames >= 3) {
      conversationMode.speechDetected = true;
      conversationMode.speechStartedAt = now;
      conversationMode.silenceStartedAt = 0;
      if (conversationIdleTimer) clearTimeout(conversationIdleTimer);
      setConversationPhase('hearing');
    }
  } else if (rms >= continueThreshold) {
    conversationMode.silenceStartedAt = 0;
  } else {
    if (!conversationMode.silenceStartedAt) conversationMode.silenceStartedAt = now;
    const longEnough = now - conversationMode.speechStartedAt > 300;
    if (longEnough && now - conversationMode.silenceStartedAt >= CONVERSATION_END_SILENCE_MS) {
      finishConversationUtterance();
      return;
    }
  }

  if (conversationMode.speechDetected && now - conversationMode.speechStartedAt >= CONVERSATION_MAX_UTTERANCE_MS) {
    finishConversationUtterance();
    return;
  }
  conversationAnimationFrame = requestAnimationFrame(monitorConversationVoice);
}

async function transcribeConversationUtterance(blob) {
  if (!conversationMode.active) return;
  try {
    const result = await window.atlasBrowser.transcribeAudio({ bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type, model: activeProfile().settings.sttModel || 'base.en' });
    if (!conversationMode.active) return;
    const text = result.text?.trim();
    if (!text) {
      toast('I did not catch that. Listening again…');
      await beginConversationListening();
      return;
    }
    setConversationPhase('thinking');
    const sent = await sendAgentMessage(conversationMode.targetId, text);
    if (!sent && conversationMode.active) await beginConversationListening();
  } catch (error) {
    toast(`Local transcription failed: ${error.message}`);
    if (conversationMode.active) await beginConversationListening();
  }
}

function finishConversationUtterance() {
  if (!conversationMode.active || !mediaRecorder || mediaRecorder.state !== 'recording') return;
  clearConversationTimers();
  setConversationPhase('transcribing');
  mediaRecorder.requestData();
  mediaRecorder.stop();
}

async function beginConversationListening() {
  if (!conversationMode.active || !conversationMode.stream || !conversationMode.audioContext) return;
  await conversationMode.audioContext.resume();
  clearConversationTimers();
  conversationMode.speechDetected = false;
  conversationMode.speechStartedAt = 0;
  conversationMode.silenceStartedAt = 0;
  conversationMode.elevatedFrames = 0;
  conversationMode.noiseFloor = 0.008;
  conversationMode.calibrationUntil = performance.now() + 700;
  voiceChunks = [];
  const recorder = new MediaRecorder(conversationMode.stream);
  mediaRecorder = recorder;
  recorder.ondataavailable = (event) => { if (event.data.size) voiceChunks.push(event.data); };
  recorder.onstop = () => {
    const chunks = voiceChunks;
    voiceChunks = [];
    if (mediaRecorder === recorder) mediaRecorder = null;
    if (!conversationMode.active || !conversationMode.speechDetected) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    transcribeConversationUtterance(blob);
  };
  recorder.start(250);
  setConversationPhase('listening');
  armConversationIdleTimeout();
  conversationAnimationFrame = requestAnimationFrame(monitorConversationVoice);
}

async function continueConversationAfterTurn(text) {
  if (!conversationMode.active) return;
  clearConversationTimers();
  await conversationMode.audioContext?.suspend();
  setConversationPhase('speaking');
  await speakAgentText(text, true);
  if (!conversationMode.active) return;
  await new Promise((resolve) => setTimeout(resolve, 450));
  await beginConversationListening();
}

async function resumeConversationAfterFailure(text) {
  if (!conversationMode.active) return;
  await conversationMode.audioContext?.suspend();
  setConversationPhase('speaking');
  await speakAgentText(text, true);
  if (conversationMode.active) await beginConversationListening();
}

async function toggleAgentVoice(targetId = 'agent-input') {
  if (conversationMode.active) { stopConversationMode('Conversation mode ended.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext) return toast('Hands-free conversation mode is unavailable on this device.');
  const session = targetId === 'agent-tray-input' ? ensureTrayAgentSession() : activeAgentSession();
  if (!session) return toast('Start an agent conversation first.');
  if (session.busy) return toast('Wait for the current agent response before starting conversation mode.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    conversationMode.stream = stream;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    conversationMode.active = true;
    conversationMode.targetId = targetId;
    conversationMode.sessionId = session.id;
    conversationMode.audioContext = audioContext;
    conversationMode.analyser = analyser;
    await beginConversationListening();
  } catch (error) {
    stopConversationMode();
    toast(`Microphone unavailable: ${error.message}`);
  }
}
function addProject() { openProjectEditor(); }
function addTask() { if (currentProject()) openTaskEditor(); }
function addNote() { if (currentProject()) openNoteEditor(); }
function addResource() { if (currentProject()) openResourceEditor(); }

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { activeView = button.dataset.view; if (activeView === 'agent' && !activeAgentSession()) createAgentSession(); save(); render(); }));
$('project-filter').addEventListener('input', renderProjects);
$('add-tab').addEventListener('click', addTab);
$('tabs').closest('.tabbar').addEventListener('contextmenu', (event) => {
  if (!isElectron) return;
  event.preventDefault();
  window.atlasBrowser.showAppMenu();
});
$('add-project').addEventListener('click', addProject);
$('sidebar-resizer').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const width = Number($('sidebar-resizer').getAttribute('aria-valuenow')) || 268;
  sidebarResizeStart = { pointerId: event.pointerId, startX: event.clientX, width };
  $('sidebar-resizer').setPointerCapture(event.pointerId);
  $('sidebar-resizer').classList.add('dragging');
  document.body.classList.add('resizing-sidebar');
  event.preventDefault();
});
$('sidebar-resizer').addEventListener('pointermove', (event) => {
  if (!sidebarResizeStart || sidebarResizeStart.pointerId !== event.pointerId) return;
  applySidebarWidth(sidebarResizeStart.width + event.clientX - sidebarResizeStart.startX);
});
const finishSidebarResize = (event) => {
  if (!sidebarResizeStart || sidebarResizeStart.pointerId !== event.pointerId) return;
  const width = Number($('sidebar-resizer').getAttribute('aria-valuenow')) || 268;
  sidebarResizeStart = null;
  $('sidebar-resizer').classList.remove('dragging');
  document.body.classList.remove('resizing-sidebar');
  applySidebarWidth(width, true);
};
$('sidebar-resizer').addEventListener('pointerup', finishSidebarResize);
$('sidebar-resizer').addEventListener('pointercancel', finishSidebarResize);
$('sidebar-resizer').addEventListener('dblclick', () => applySidebarWidth(268, true));
$('sidebar-resizer').addEventListener('keydown', (event) => {
  const current = Number($('sidebar-resizer').getAttribute('aria-valuenow')) || 268;
  const next = event.key === 'ArrowLeft' ? current - 16 : event.key === 'ArrowRight' ? current + 16 : event.key === 'Home' ? sidebarWidthLimits().min : event.key === 'End' ? sidebarWidthLimits().max : null;
  if (next === null) return;
  event.preventDefault();
  applySidebarWidth(next, true);
});
$('agent-tray-resizer').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const height = Number($('agent-tray-resizer').getAttribute('aria-valuenow')) || 76;
  agentTrayResizeStart = { pointerId: event.pointerId, startY: event.clientY, height };
  $('agent-tray-resizer').setPointerCapture(event.pointerId);
  $('agent-tray-resizer').classList.add('dragging');
  document.body.classList.add('resizing-agent-tray');
  event.preventDefault();
});
$('agent-tray-resizer').addEventListener('pointermove', (event) => {
  if (!agentTrayResizeStart || agentTrayResizeStart.pointerId !== event.pointerId) return;
  applyAgentTrayHeight(agentTrayResizeStart.height + agentTrayResizeStart.startY - event.clientY);
});
const finishAgentTrayResize = (event) => {
  if (!agentTrayResizeStart || agentTrayResizeStart.pointerId !== event.pointerId) return;
  const height = Number($('agent-tray-resizer').getAttribute('aria-valuenow')) || 76;
  agentTrayResizeStart = null;
  $('agent-tray-resizer').classList.remove('dragging');
  document.body.classList.remove('resizing-agent-tray');
  applyAgentTrayHeight(height, true);
};
$('agent-tray-resizer').addEventListener('pointerup', finishAgentTrayResize);
$('agent-tray-resizer').addEventListener('pointercancel', finishAgentTrayResize);
$('agent-tray-resizer').addEventListener('dblclick', () => applyAgentTrayHeight(76, true));
$('agent-tray-resizer').addEventListener('keydown', (event) => {
  const current = Number($('agent-tray-resizer').getAttribute('aria-valuenow')) || 76;
  const next = event.key === 'ArrowUp' ? current + 20 : event.key === 'ArrowDown' ? current - 20 : event.key === 'Home' ? agentTrayHeightLimits().min : event.key === 'End' ? agentTrayHeightLimits().max : null;
  if (next === null) return;
  event.preventDefault();
  applyAgentTrayHeight(next, true);
});
$('add-task').addEventListener('click', addTask);
$('add-note').addEventListener('click', addNote);
$('add-resource').addEventListener('click', addResource);
$('save-page').addEventListener('click', captureCurrentPage);
$('add-bookmark').addEventListener('click', () => openBookmarkEditor());
$('manage-bookmarks').addEventListener('click', () => {
  if ($('bookmark-manager').classList.contains('hidden')) openBookmarkManager(); else closeBookmarkManager();
});
$('bookmark-form').addEventListener('submit', saveBookmarkEditor);
$('close-bookmark-modal').addEventListener('click', closeBookmarkEditor);
$('cancel-bookmark').addEventListener('click', closeBookmarkEditor);
$('bookmark-modal').addEventListener('click', (event) => { if (event.target === $('bookmark-modal')) closeBookmarkEditor(); });
$('close-bookmark-manager').addEventListener('click', closeBookmarkManager);
$('bookmark-manager-list').addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-bookmark-edit]');
  const removeButton = event.target.closest('[data-bookmark-remove]');
  if (editButton) {
    const bookmark = currentProject()?.bookmarks.find((entry) => entry.id === editButton.dataset.bookmarkEdit);
    if (bookmark) openBookmarkEditor(bookmark);
  } else if (removeButton) removeBookmark(removeButton.dataset.bookmarkRemove);
});
$('bookmark-color').addEventListener('input', (event) => setBookmarkColor(event.target.value));
$('bookmark-color-hex').addEventListener('input', (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value.trim())) setBookmarkColor(event.target.value); });
$('bookmark-color-hex').addEventListener('blur', (event) => setBookmarkColor(event.target.value));
$('bookmark-apply-all').addEventListener('change', (event) => { $('bookmark-scope-state').textContent = event.target.checked ? 'All projects' : 'This project only'; });
document.querySelectorAll('[data-bookmark-color]').forEach((button) => button.addEventListener('click', () => setBookmarkColor(button.dataset.bookmarkColor)));
$('bookmark-eyedropper').addEventListener('click', async () => {
  if (!window.EyeDropper) return toast('The eyedropper is not available on this system');
  try {
    const result = await new window.EyeDropper().open();
    if (result?.sRGBHex) setBookmarkColor(result.sRGBHex);
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Could not sample that color');
  }
});
$('go').addEventListener('click', navigateCurrentTab);
$('address').addEventListener('keydown', (event) => { if (event.key === 'Enter') navigateCurrentTab(); });
$('open-page').addEventListener('click', () => { const tab = currentTab(); if (tab?.url) window.open(tab.url, '_blank', 'noopener'); });
$('send-agent').addEventListener('click', () => sendAgentMessage('agent-input'));
$('new-agent-session').addEventListener('click', () => createAgentSession());
$('agent-project-scope').addEventListener('change', (event) => { const session = activeAgentSession(); if (!session || session.messages.length) return; session.scopeProjectId = event.target.value || null; session.updatedAt = new Date().toISOString(); save(); renderAgentWorkspace(); });
$('voice-agent').addEventListener('click', () => toggleAgentVoice('agent-input'));
$('agent-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAgentMessage('agent-input'); } });
$('agent-input').addEventListener('input', (event) => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; });
$('expand-agent-tray').addEventListener('click', () => { ensureTrayAgentSession(); activeView = 'agent'; save(); render(); });
$('agent-tray-send').addEventListener('click', () => sendAgentMessage('agent-tray-input'));
$('agent-tray-voice').addEventListener('click', () => toggleAgentVoice('agent-tray-input'));
$('agent-tray-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAgentMessage('agent-tray-input'); } });
$('agent-tray-input').addEventListener('input', (event) => { if ($('agent-tray').classList.contains('tray-expanded')) event.target.style.height = '100%'; else { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 92)}px`; } });
$('nav-reload').addEventListener('click', () => { if (isElectron) window.atlasBrowser.reload(); else { const frame = $('website-frame'); frame.src = frame.src; } });
$('nav-back').addEventListener('click', () => { if (isElectron) window.atlasBrowser.back(); });
$('nav-forward').addEventListener('click', () => { if (isElectron) window.atlasBrowser.forward(); });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('agent-input').value = button.dataset.prompt; $('agent-input').focus(); }));
$('resource-type').addEventListener('change', updateResourceForm);
$('resource-file').addEventListener('change', (event) => {
  pendingResourceFile = event.target.files[0] || null;
  $('resource-selected-file').textContent = pendingResourceFile ? `${pendingResourceFile.name} · ${(pendingResourceFile.size / 1024 / 1024).toFixed(2)} MB` : '';
  $('resource-selected-file').classList.toggle('hidden', !pendingResourceFile);
  if (pendingResourceFile && !$('resource-title').value.trim()) $('resource-title').value = pendingResourceFile.name.replace(/\.[^.]+$/, '');
});
$('resource-form').addEventListener('submit', saveResourceEditor);
$('close-resource-modal').addEventListener('click', closeResourceEditor);
$('cancel-resource').addEventListener('click', closeResourceEditor);
$('delete-resource').addEventListener('click', () => { if (editingResourceId) removeResource(editingResourceId); });
$('resource-modal').addEventListener('click', (event) => { if (event.target === $('resource-modal')) closeResourceEditor(); });
$('close-resource-viewer').addEventListener('click', closeResourceViewer);
$('resource-viewer-modal').addEventListener('click', (event) => { if (event.target === $('resource-viewer-modal')) closeResourceViewer(); });
$('task-form').addEventListener('submit', saveTaskEditor);
$('close-task-modal').addEventListener('click', closeTaskEditor);
$('cancel-task').addEventListener('click', closeTaskEditor);
$('delete-task').addEventListener('click', deleteTask);
$('task-modal').addEventListener('click', (event) => { if (event.target === $('task-modal')) closeTaskEditor(); });
$('note-form').addEventListener('submit', saveNoteEditor);
$('close-note-modal').addEventListener('click', closeNoteEditor);
$('cancel-note').addEventListener('click', closeNoteEditor);
$('delete-note').addEventListener('click', deleteNote);
$('note-modal').addEventListener('click', (event) => { if (event.target === $('note-modal')) closeNoteEditor(); });
document.querySelectorAll('[data-note-command]').forEach((button) => button.addEventListener('mousedown', (event) => { event.preventDefault(); applyNoteCommand(button.dataset.noteCommand); }));
$('note-font').addEventListener('change', (event) => applyNoteCommand('fontName', event.target.value));
$('note-size').addEventListener('change', (event) => applyNoteCommand('fontSize', event.target.value));
$('note-color').addEventListener('input', (event) => applyNoteCommand('foreColor', event.target.value));
$('note-link').addEventListener('mousedown', (event) => { event.preventDefault(); const href = window.prompt('Link URL', 'https://'); if (href && href !== 'https://') applyNoteCommand('createLink', normalizeAddress(href)); });
$('notification-button').addEventListener('click', () => {
  if ($('notification-popover').classList.contains('hidden')) openNotifications(); else closeNotifications();
});
$('download-button').addEventListener('click', () => {
  if ($('download-popover').classList.contains('hidden')) openDownloads(); else closeDownloads();
});
$('settings-button').addEventListener('click', openSettings);
$('settings-form').addEventListener('submit', saveSettings);
$('agent-provider').addEventListener('change', () => populateProviderForm(activeProviderTemplate($('agent-provider').value)));
$('agent-usage-mode').addEventListener('change', () => {
  $('agent-usage-command-field').classList.toggle('hidden', $('agent-usage-mode').value !== 'command');
  $('agent-usage-manual-field').classList.toggle('hidden', $('agent-usage-mode').value !== 'manual');
});
$('privacy-mode').addEventListener('change', (event) => persistPrivacyMode(event.target.value));
$('clear-website-data').addEventListener('click', async () => {
  if (!confirm('Clear all website cookies, cache, and stored site data? This will sign you out of websites in ATLAS, but it will not delete projects, tabs, bookmarks, notes, tasks, or Library resources.')) return;
  const button = $('clear-website-data');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Clearing website data…';
  try {
    if (!isElectron || !window.atlasBrowser.clearWebsiteData) throw new Error('This control is available in the ATLAS desktop app.');
    renderPrivacyStatus(await window.atlasBrowser.clearWebsiteData());
    toast('Website cookies, cache, and stored data cleared');
  } catch (error) {
    toast(`Could not clear website data: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
$('agent-provider-test').addEventListener('click', async () => {
  const status = $('agent-provider-status');
  status.className = '';
  status.textContent = 'Testing…';
  try {
    const config = providerConfigFromForm();
    const secret = $('agent-provider-api-key').value;
    if (secret) await window.atlasBrowser.saveAgentProviderSecret({ secretId: config.secretId, value: secret });
    await window.atlasBrowser.configureAgentProvider(config);
    const result = await window.atlasBrowser.testAgentProvider();
    status.className = result.ok ? 'success' : 'error';
    status.textContent = result.message;
  } catch (error) { status.className = 'error'; status.textContent = error.message; }
});
$('agent-provider-login').addEventListener('click', async () => {
  const status = $('agent-provider-status');
  try { await window.atlasBrowser.configureAgentProvider(providerConfigFromForm()); await window.atlasBrowser.loginAgentProvider(); status.className = 'success'; status.textContent = 'Sign-in opened in a terminal. Return here and test the connection when finished.'; }
  catch (error) { status.className = 'error'; status.textContent = error.message; }
});
$('replay-walkthrough').addEventListener('click', () => { closeSettings(); startWalkthrough(true); });
$('walkthrough-next').addEventListener('click', () => { if (walkthroughStep >= walkthroughSteps.length - 1) finishWalkthrough(); else { walkthroughStep += 1; renderWalkthrough(); } });
$('walkthrough-back').addEventListener('click', () => { if (walkthroughStep > 0) { walkthroughStep -= 1; renderWalkthrough(); } });
$('walkthrough-skip').addEventListener('click', finishWalkthrough);
$('test-tts-voice').addEventListener('click', previewTtsVoice);
$('close-settings-modal').addEventListener('click', closeSettings);
$('cancel-settings').addEventListener('click', closeSettings);
$('settings-modal').addEventListener('click', (event) => { if (event.target === $('settings-modal')) closeSettings(); });
$('close-notifications').addEventListener('click', closeNotifications);
$('notification-list').addEventListener('click', (event) => { const button = event.target.closest('[data-notification-id]'); if (button) openNotification(button.dataset.notificationId); });
$('close-downloads').addEventListener('click', closeDownloads);
$('download-list').addEventListener('click', (event) => {
  const dismissButton = event.target.closest('[data-download-dismiss]');
  const openButton = event.target.closest('[data-download-open]');
  if (dismissButton) dismissDownload(dismissButton.dataset.downloadDismiss);
  else if (openButton) openDownloadedFile(openButton.dataset.downloadOpen);
});
$('profile-button').addEventListener('click', openProfileManager);
$('close-profile-modal').addEventListener('click', closeProfileManager);
$('cancel-profile').addEventListener('click', closeProfileManager);
$('profile-modal').addEventListener('click', (event) => { if (event.target === $('profile-modal')) closeProfileManager(); });
$('new-profile').addEventListener('click', () => selectProfileEditor(null));
$('profile-form').addEventListener('submit', saveProfileEditor);
$('profile-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-profile-id]');
  if (!button) return;
  selectProfileEditor(profileStore.profiles.find((profile) => profile.id === button.dataset.profileId));
});
$('use-profile').addEventListener('click', () => { if (editingProfileId) switchProfile(editingProfileId); });
$('profile-image-input').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Choose an image file');
  if (file.size > 15 * 1024 * 1024) return toast('Choose an image under 15 MB');
  const reader = new FileReader();
  reader.onload = () => loadProfileCropImage(reader.result);
  reader.readAsDataURL(file);
});
$('profile-image-zoom').addEventListener('input', (event) => {
  if (!profileCropSource) return;
  const previousScale = profileCropBaseScale * profileCropZoom;
  const centerX = (100 - profileCropOffset.x) / previousScale;
  const centerY = (100 - profileCropOffset.y) / previousScale;
  profileCropZoom = Number(event.target.value);
  const nextScale = profileCropBaseScale * profileCropZoom;
  profileCropOffset = { x: 100 - centerX * nextScale, y: 100 - centerY * nextScale };
  renderProfileCrop();
});
$('profile-crop-stage').addEventListener('pointerdown', (event) => {
  if (!profileCropSource) return;
  profileCropDragging = true;
  profileCropPointer = { x: event.clientX, y: event.clientY };
  $('profile-crop-stage').setPointerCapture(event.pointerId);
  $('profile-crop-stage').classList.add('dragging');
});
$('profile-crop-stage').addEventListener('pointermove', (event) => {
  if (!profileCropDragging) return;
  profileCropOffset.x += event.clientX - profileCropPointer.x;
  profileCropOffset.y += event.clientY - profileCropPointer.y;
  profileCropPointer = { x: event.clientX, y: event.clientY };
  renderProfileCrop();
});
const finishProfileCropDrag = () => { profileCropDragging = false; $('profile-crop-stage').classList.remove('dragging'); };
$('profile-crop-stage').addEventListener('pointerup', finishProfileCropDrag);
$('profile-crop-stage').addEventListener('pointercancel', finishProfileCropDrag);
$('project-form').addEventListener('submit', saveProjectEditor);
$('close-project-modal').addEventListener('click', closeProjectEditor);
$('cancel-project').addEventListener('click', closeProjectEditor);
$('delete-project').addEventListener('click', deleteCurrentProject);
$('project-modal').addEventListener('click', (event) => { if (event.target === $('project-modal')) closeProjectEditor(); });
document.querySelectorAll('[data-project-icon-mode]').forEach((button) => button.addEventListener('click', () => setProjectIconMode(button.dataset.projectIconMode)));
$('project-emoji-search').addEventListener('input', () => renderProjectEmojiChoices($('project-emoji-search').value));
$('project-emoji-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-project-emoji]');
  if (!button) return;
  editingProjectEmoji = button.dataset.projectEmoji;
  $('project-emoji-preview').textContent = editingProjectEmoji;
  $('project-emoji-grid').querySelectorAll('[data-project-emoji]').forEach((entry) => entry.classList.toggle('selected', entry === button));
});
$('project-image-input').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Choose an image file');
  if (file.size > 15 * 1024 * 1024) return toast('Choose an image under 15 MB');
  const reader = new FileReader();
  reader.onload = () => loadCropImage(reader.result);
  reader.readAsDataURL(file);
});
$('project-color').addEventListener('input', (event) => setProjectColor(event.target.value));
$('project-color-hex').addEventListener('input', (event) => {
  if (/^#[0-9a-f]{6}$/i.test(event.target.value.trim())) setProjectColor(event.target.value);
});
$('project-color-hex').addEventListener('blur', (event) => setProjectColor(event.target.value));
document.querySelectorAll('[data-project-color]').forEach((button) => button.addEventListener('click', () => setProjectColor(button.dataset.projectColor)));
$('project-eyedropper').addEventListener('click', async () => {
  if (!window.EyeDropper) return toast('The eyedropper is not available on this system');
  try {
    const result = await new window.EyeDropper().open();
    if (result?.sRGBHex) setProjectColor(result.sRGBHex);
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Could not sample that color');
  }
});
$('project-image-zoom').addEventListener('input', (event) => {
  if (!cropSource) return;
  const previousScale = cropBaseScale * cropZoom;
  const centerX = (110 - cropOffset.x) / previousScale;
  const centerY = (110 - cropOffset.y) / previousScale;
  cropZoom = Number(event.target.value);
  const nextScale = cropBaseScale * cropZoom;
  cropOffset = { x: 110 - centerX * nextScale, y: 110 - centerY * nextScale };
  renderCrop();
});
$('crop-stage').addEventListener('click', () => {
  if (projectIconMode !== 'image' || cropDidDrag) return;
  $('project-image-input').click();
});
$('crop-stage').addEventListener('keydown', (event) => {
  if (projectIconMode !== 'image' || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  $('project-image-input').click();
});
$('crop-stage').addEventListener('pointerdown', (event) => {
  cropDidDrag = false;
  if (!cropSource) return;
  cropDragging = true;
  cropPointer = { x: event.clientX, y: event.clientY };
  $('crop-stage').setPointerCapture(event.pointerId);
  $('crop-stage').classList.add('dragging');
});
$('crop-stage').addEventListener('pointermove', (event) => {
  if (!cropDragging) return;
  if (Math.hypot(event.clientX - cropPointer.x, event.clientY - cropPointer.y) > 2) cropDidDrag = true;
  cropOffset.x += event.clientX - cropPointer.x;
  cropOffset.y += event.clientY - cropPointer.y;
  cropPointer = { x: event.clientX, y: event.clientY };
  renderCrop();
});
const finishCropDrag = () => { cropDragging = false; $('crop-stage').classList.remove('dragging'); setTimeout(() => { cropDidDrag = false; }, 0); };
$('crop-stage').addEventListener('pointerup', finishCropDrag);
$('crop-stage').addEventListener('pointercancel', finishCropDrag);
renderEmojiChoices();
$('emoji-search').addEventListener('input', () => renderEmojiChoices($('emoji-search').value));
$('emoji-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-emoji]');
  if (!button || !emojiTabId) return;
  const tab = currentProject()?.tabs.find((item) => item.id === emojiTabId);
  if (!tab) return;
  tab.icon = button.dataset.emoji;
  tab.iconMode = 'emoji';
  save();
  renderTabs(currentProject());
  closeEmojiPicker();
  toast('Tab emoji updated');
});
$('use-favicon').addEventListener('click', () => {
  if (!emojiTabId) return;
  const tab = currentProject()?.tabs.find((item) => item.id === emojiTabId);
  if (!tab) return;
  tab.iconMode = 'favicon';
  save();
  renderTabs(currentProject());
  closeEmojiPicker();
  if (!tab.favicon && isElectron && tab.id === activeTabId) window.atlasBrowser.reload();
  toast(tab.favicon ? 'Using website favicon' : 'Using website favicon when available');
});
$('close-emoji-picker').addEventListener('click', closeEmojiPicker);
document.addEventListener('pointerdown', (event) => {
  if ($('emoji-picker').classList.contains('hidden')) return;
  if (!event.target.closest('#emoji-picker') && !event.target.closest('[data-tab-icon]')) closeEmojiPicker();
});
document.addEventListener('pointerdown', (event) => {
  if ($('notification-popover').classList.contains('hidden')) return;
  if (!event.target.closest('#notification-popover') && !event.target.closest('#notification-button')) closeNotifications();
});
document.addEventListener('pointerdown', (event) => {
  if ($('download-popover').classList.contains('hidden')) return;
  if (!event.target.closest('#download-popover') && !event.target.closest('#download-button')) closeDownloads();
});
document.addEventListener('pointerdown', (event) => {
  if ($('bookmark-manager').classList.contains('hidden')) return;
  if (!event.target.closest('#bookmark-manager') && !event.target.closest('#manage-bookmarks')) closeBookmarkManager();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!$('walkthrough-overlay').classList.contains('hidden')) finishWalkthrough();
  else if (!$('emoji-picker').classList.contains('hidden')) closeEmojiPicker();
  else if (!$('project-modal').classList.contains('hidden')) closeProjectEditor();
  else if (!$('profile-modal').classList.contains('hidden')) closeProfileManager();
  else if (!$('resource-modal').classList.contains('hidden')) closeResourceEditor();
  else if (!$('resource-viewer-modal').classList.contains('hidden')) closeResourceViewer();
  else if (!$('task-modal').classList.contains('hidden')) closeTaskEditor();
  else if (!$('note-modal').classList.contains('hidden')) closeNoteEditor();
  else if (!$('bookmark-modal').classList.contains('hidden')) closeBookmarkEditor();
  else if (!$('bookmark-manager').classList.contains('hidden')) closeBookmarkManager();
  else if (!$('settings-modal').classList.contains('hidden')) closeSettings();
  else if (!$('download-popover').classList.contains('hidden')) closeDownloads();
  else if (!$('notification-popover').classList.contains('hidden')) closeNotifications();
});

window.addEventListener('beforeunload', save);
window.addEventListener('resize', () => { applySidebarWidth(activeProfile().settings.sidebarWidth); applyAgentTrayHeight(activeProfile().settings.agentTrayHeight); positionWalkthrough(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); else refreshAgentUsage(); });

if (isElectron) {
  window.atlasBrowser.onAppCommand((command) => {
    if (command?.type === 'open-url') openExternalUrlInNewTab(command.url);
    else if (command === 'new-tab') addTab();
    else if (command === 'close-tab' && activeTabId) closeTab(activeTabId);
  });
  window.atlasBrowser.onNavigated((url) => {
    const tab = currentTab();
    if (!tab) return;
    lastDesktopUrl = url;
    $('address').value = url;
    if (isTransientMicrosoftAuthenticationUrl(url)) return;
    tab.url = url;
    save();
  });
  window.atlasBrowser.onTitle((title) => { const tab = currentTab(); if (!tab || !title) return; tab.title = title; save(); renderTabs(currentProject()); });
  window.atlasBrowser.onFavicon((favicon) => {
    const tab = currentTab();
    if (!tab || !favicon) return;
    tab.favicon = favicon;
    save();
    if (tab.iconMode === 'favicon') renderTabs(currentProject());
  });
  window.atlasBrowser.onSendSelectionToLibrary(saveWebSelectionToLibrary);
  window.atlasBrowser.onDownloadEvent(handleDownloadEvent);
  window.atlasBrowser.onPrivacyStatus(renderPrivacyStatus);
  window.atlasBrowser.onAgentEvent(handleAgentEvent);
  window.atlasBrowser.onAgentToolRequest(async (request) => {
    try { window.atlasBrowser.resolveAgentTool({ requestId: request.requestId, result: await executeAtlasAgentTool(request) }); }
    catch (error) { window.atlasBrowser.resolveAgentTool({ requestId: request.requestId, error: error.message }); }
  });
  new ResizeObserver(syncDesktopBounds).observe(document.querySelector('.browser-canvas'));
  window.addEventListener('resize', syncDesktopBounds);
  document.querySelector('.workspace').addEventListener('scroll', syncDesktopBounds, { passive: true });
}
if (!state.agentSessions.length) createAgentSession();
applySidebarWidth(activeProfile().settings.sidebarWidth);
applyAgentTrayHeight(activeProfile().settings.agentTrayHeight);
render();
if (isElectron) {
  configurePrivacyShield(activeProfile().settings.privacyMode);
  window.atlasBrowser.getAgentProviderTemplates()
    .then((templates) => { providerTemplates = templates || []; return configureActiveAgentProvider(); })
    .catch((error) => { agentRuntimeStatus = { state: 'error', message: error.message }; renderAgentWorkspace(); });
} else {
  renderAgentUsage(null);
  renderPrivacyStatus({ mode: activeProfile().settings.privacyMode });
}
migrateCopiedDownloadsToLinks();
if (!activeProfile().settings.walkthroughCompleted) setTimeout(() => startWalkthrough(false), 450);
checkDueTasks();
setInterval(checkDueTasks, 30000);
setInterval(refreshAgentUsage, 60000);
