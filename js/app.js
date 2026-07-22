// --- App state --------------------------------------------------------------
const STATE = {
  data: null,
  signedIn: false,
  view: "home",
  showNoteForm: false,
  picker: null, // { nodeKey } while the "help me choose" flow is active
  pickerResult: null, // skill key once the tree reaches a leaf
  syncStatus: "idle", // idle | saving | saved | error
};

const SYMPTOM_OPTIONS = [
  "Flashback", "Nightmare", "Intrusive thoughts", "Anxiety/panic",
  "Dissociation", "Irritability/anger", "Hypervigilance", "Avoidance",
  "Low mood", "Sleep disturbance",
];

function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

function sudClass(v) {
  if (v <= 3) return "low";
  if (v <= 6) return "mid";
  return "";
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// --- Persistence helper -------------------------------------------------------
let saveTimer = null;
function persist() {
  STATE.syncStatus = "saving";
  renderSyncIndicator();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await DRIVE.saveData(STATE.data);
      STATE.syncStatus = "saved";
    } catch (e) {
      console.error(e);
      STATE.syncStatus = "error";
    }
    renderSyncIndicator();
  }, 500);
}

function renderSyncIndicator() {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  el.textContent =
    STATE.syncStatus === "saving" ? "Saving…" :
    STATE.syncStatus === "saved" ? "Saved to Drive" :
    STATE.syncStatus === "error" ? "⚠ not saved" : "";
}

// --- Router -------------------------------------------------------------------
function setView(view) {
  STATE.view = view;
  STATE.showNoteForm = false;
  STATE.picker = null;
  STATE.pickerResult = null;
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  const titles = { home: "Container", ground: "Ground Me", safeplace: "Safe Place", summary: "Weekly Summary", settings: "Settings" };
  document.getElementById("page-title").textContent = titles[view];
  render();
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (btn) setView(btn.dataset.view);
});

function render() {
  const root = document.getElementById("view-root");
  if (STATE.view === "settings") {
    root.innerHTML = renderSettings();
    bindSettings();
    return;
  }
  if (!STATE.signedIn) {
    root.innerHTML = renderConnectPrompt();
    bindConnectPrompt();
    return;
  }
  switch (STATE.view) {
    case "home": root.innerHTML = renderHome(); bindHome(); break;
    case "ground": root.innerHTML = renderGround(); bindGround(); break;
    case "safeplace": root.innerHTML = renderSafePlace(); bindSafePlace(); break;
    case "summary": root.innerHTML = renderSummary(); bindSummary(); break;
    case "settings": root.innerHTML = renderSettings(); bindSettings(); break;
  }
}

// --- Connect prompt (shown before Drive sign-in) ------------------------------
function renderConnectPrompt() {
  const hasClientId = !!DRIVE.getClientId();
  return `
    <div class="card center">
      <div style="font-size:40px;">🏺</div>
      <h2>Let's connect your Container</h2>
      <p class="small">Your notes, safe place media, and summaries are stored only in your own Google Drive — nothing is kept on this device.</p>
      ${hasClientId
        ? `<button class="btn btn-primary" id="btn-signin">Connect Google Drive</button>`
        : `<p class="small">First, add your Google OAuth Client ID in Settings — it's a one-time, free setup step.</p>
           <button class="btn btn-outline" id="btn-goto-settings">Go to Settings</button>`
      }
    </div>
  `;
}
function bindConnectPrompt() {
  const signBtn = document.getElementById("btn-signin");
  if (signBtn) signBtn.addEventListener("click", async () => {
    signBtn.textContent = "Connecting…";
    try {
      await DRIVE.signIn({ silentFirst: false });
      STATE.data = await DRIVE.loadData();
      STATE.signedIn = true;
      maybeShowWeeklyBanner();
      setView("home");
    } catch (e) {
      alert(e.message || "Could not connect to Google Drive.");
      signBtn.textContent = "Connect Google Drive";
    }
  });
  const gotoBtn = document.getElementById("btn-goto-settings");
  if (gotoBtn) gotoBtn.addEventListener("click", () => setView("settings"));
}

// --- HOME / Container ----------------------------------------------------------
function renderHome() {
  const data = STATE.data;
  const notes = [...data.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const fillLevel = Math.min(notes.length, 12);

  const topicAgg = {};
  data.notes.forEach((n) => {
    const k = (n.topic || "Untitled").trim();
    if (!topicAgg[k]) topicAgg[k] = { topic: k, sum: 0, count: 0 };
    topicAgg[k].sum += Number(n.sud || 0);
    topicAgg[k].count += 1;
  });
  const topTopics = Object.values(topicAgg)
    .map((t) => ({ ...t, avg: t.sum / t.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  return `
    <div class="jar-wrap">
      ${jarSvg(fillLevel)}
      <div class="jar-caption">${escapeHtml(data.containerName)}</div>
    </div>

    <button class="btn btn-amber" id="btn-add-note">+ Add to my container</button>

    ${STATE.showNoteForm ? renderNoteForm() : ""}

    ${topTopics.length ? `
      <div class="card">
        <h3 style="font-size:14px;">Most persistent, all-time</h3>
        ${topTopics.map((t) => `
          <div class="summary-stat">
            <span>${escapeHtml(t.topic)}</span>
            <span class="small">avg ${t.avg.toFixed(1)}/10 · ${t.count}x</span>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="card">
      <h3 style="font-size:14px;">Recent entries</h3>
      ${notes.length === 0 ? `<div class="empty-state"><div class="icon">🏺</div>Nothing set aside yet. When something's weighing on you, add it here.</div>` :
        notes.slice(0, 15).map(noteItemHtml).join("")}
    </div>
  `;
}

function jarSvg(fillLevel) {
  const totalDots = 12;
  const dots = [];
  for (let i = 0; i < totalDots; i++) {
    const filled = i < fillLevel;
    const row = Math.floor(i / 4);
    const col = i % 4;
    const cx = 34 + col * 20;
    const cy = 110 - row * 18;
    dots.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="${filled ? "#7FA687" : "none"}" stroke="${filled ? "#7FA687" : "#C7D3C3"}" stroke-width="1.5" />`);
  }
  return `
  <svg class="jar-svg" viewBox="0 0 128 148" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="16" width="48" height="14" rx="4" fill="#C97F4B"/>
    <rect x="20" y="30" width="88" height="104" rx="16" fill="#FBF9F4" stroke="#C97F4B" stroke-width="3"/>
    ${dots.join("")}
  </svg>`;
}

function noteItemHtml(n) {
  const symptoms = (n.symptoms || []).map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("");
  return `
    <div class="note-item" data-id="${n.id}">
      <div class="note-top">
        <span class="note-topic">${escapeHtml(n.topic || "Untitled")}</span>
        <span class="note-date">${fmtDate(n.createdAt)}</span>
      </div>
      <div class="sud-gauge">${sudDotsHtml(n.sud, true)}<span class="small">${n.sud}/10</span></div>
      ${n.body ? `<div class="note-body">${escapeHtml(n.body)}</div>` : ""}
      ${n.skillUsed ? `<div class="small mt-8">Used: ${escapeHtml(n.skillUsed)}</div>` : ""}
      ${symptoms ? `<div class="note-tags chip-row">${symptoms}</div>` : ""}
      <button class="btn-ghost small" data-delete-note="${n.id}" style="margin-top:6px;">Remove</button>
    </div>
  `;
}

function sudDotsHtml(value, readonly, inputId) {
  let out = "";
  for (let i = 1; i <= 10; i++) {
    const filled = i <= value;
    out += `<span class="sud-dot ${filled ? "filled " + sudClass(value) : ""}" ${readonly ? "" : `data-sud-val="${i}"`}></span>`;
  }
  return out;
}

function renderNoteForm() {
  const knownTopics = [...new Set(STATE.data.notes.map((n) => n.topic).filter(Boolean))];
  return `
    <div class="card" id="note-form">
      <h3 style="font-size:15px;">Set something in the container</h3>
      <label>Topic / trauma this relates to</label>
      <input type="text" id="nf-topic" list="topic-list" placeholder="e.g. Car accident, Dad's voice…" />
      <datalist id="topic-list">${knownTopics.map((t) => `<option value="${escapeHtml(t)}">`).join("")}</datalist>

      <label>How distressing is it right now? (SUD 0–10)</label>
      <div class="sud-gauge" id="nf-sud-gauge">${sudDotsHtml(0, false)}</div>

      <label>Notes (optional — kept brief, just enough to recall it later)</label>
      <textarea id="nf-body" placeholder="A few words is plenty"></textarea>

      <label>Symptoms present, if any</label>
      <div class="chip-row" id="nf-symptoms">
        ${SYMPTOM_OPTIONS.map((s) => `<span class="chip" data-symptom="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join("")}
      </div>

      <div style="display:flex; gap:8px; margin-top:16px;">
        <button class="btn btn-outline" id="nf-cancel">Cancel</button>
        <button class="btn btn-primary" id="nf-save">Save to container</button>
      </div>
    </div>
  `;
}

function bindHome() {
  document.getElementById("btn-add-note").addEventListener("click", () => {
    STATE.showNoteForm = !STATE.showNoteForm;
    render();
  });

  document.querySelectorAll("[data-delete-note]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.deleteNote;
      if (!confirm("Remove this entry?")) return;
      STATE.data.notes = STATE.data.notes.filter((n) => n.id !== id);
      persist();
      render();
    });
  });

  const form = document.getElementById("note-form");
  if (!form) return;

  let currentSud = 0;
  const gauge = document.getElementById("nf-sud-gauge");
  gauge.addEventListener("click", (e) => {
    const dot = e.target.closest("[data-sud-val]");
    if (!dot) return;
    currentSud = Number(dot.dataset.sudVal);
    gauge.innerHTML = sudDotsHtml(currentSud, false);
  });

  const selectedSymptoms = new Set();
  document.getElementById("nf-symptoms").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-symptom]");
    if (!chip) return;
    const s = chip.dataset.symptom;
    if (selectedSymptoms.has(s)) { selectedSymptoms.delete(s); chip.classList.remove("selected"); }
    else { selectedSymptoms.add(s); chip.classList.add("selected"); }
  });

  document.getElementById("nf-cancel").addEventListener("click", () => {
    STATE.showNoteForm = false;
    render();
  });

  document.getElementById("nf-save").addEventListener("click", () => {
    const topic = document.getElementById("nf-topic").value.trim();
    if (!topic) { alert("Give it a short topic name so you can track it over time."); return; }
    STATE.data.notes.push({
      id: uuid(),
      topic,
      sud: currentSud,
      body: document.getElementById("nf-body").value.trim(),
      symptoms: [...selectedSymptoms],
      skillUsed: null,
      createdAt: new Date().toISOString(),
    });
    persist();
    STATE.showNoteForm = false;
    render();
  });
}

// --- GROUND ME / Skills ----------------------------------------------------
function renderGround() {
  if (STATE.picker) return renderPicker();
  if (STATE.pickerResult) return renderPickerResult();

  const skills = loadSkills(STATE.data);
  return `
    <div class="card center">
      <h3>Not sure what will help?</h3>
      <p class="small">Answer a couple of quick questions and I'll suggest a skill for this moment.</p>
      <button class="btn btn-primary" id="btn-start-picker">Help me choose</button>
    </div>
    ${Object.entries(skills).map(([key, s]) => skillCardHtml(key, s)).join("")}
  `;
}

function skillCardHtml(key, s) {
  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="font-size:16px;">${s.icon} ${escapeHtml(s.name)}</h3>
        <button class="btn-ghost small" data-log-skill="${key}">I used this ✓</button>
      </div>
      <p class="small">${escapeHtml(s.instructions)}</p>
      ${key === "safeplace" ? `<button class="btn btn-outline" data-goto="safeplace">Open Safe Place</button>` : ""}
    </div>
  `;
}

function renderPicker() {
  const node = SKILL_PICKER_TREE[STATE.picker.nodeKey];
  return `
    <div class="card question-card">
      <h2>${escapeHtml(node.question)}</h2>
      ${node.options.map((opt, i) => `<button class="btn btn-outline answer-btn" data-opt="${i}">${escapeHtml(opt.label)}</button>`).join("")}
      <button class="btn-ghost small" id="picker-cancel">Cancel</button>
    </div>
  `;
}

function renderPickerResult() {
  const skills = loadSkills(STATE.data);
  if (STATE.pickerResult === "container") {
    return `
      <div class="card skill-result">
        <div style="font-size:32px;">🏺</div>
        <div class="skill-name">Use your Container</div>
        <p class="small">Set the intruding memory or feeling aside in your container for now — you don't have to resolve it this moment.</p>
        <button class="btn btn-primary" id="goto-container">Go to my Container</button>
        <button class="btn-ghost small mt-8" id="picker-restart">Start over</button>
      </div>
    `;
  }
  const s = skills[STATE.pickerResult];
  return `
    <div class="card skill-result">
      <div style="font-size:32px;">${s.icon}</div>
      <div class="skill-name">${escapeHtml(s.name)}</div>
      <p class="small">${escapeHtml(s.instructions)}</p>
      ${STATE.pickerResult === "safeplace" ? `<button class="btn btn-primary" id="goto-safeplace">Open Safe Place</button>` : ""}
      <button class="btn btn-outline mt-8" id="log-result-skill">I used this ✓</button>
      <button class="btn-ghost small mt-8" id="picker-restart">Start over</button>
    </div>
  `;
}

function logSkillUsage(skillKey) {
  const skills = loadSkills(STATE.data);
  const name = skills[skillKey] ? skills[skillKey].name : skillKey;
  STATE.data.skillUsageLog.push({ skill: name, ts: new Date().toISOString() });
  persist();
}

function bindGround() {
  const startBtn = document.getElementById("btn-start-picker");
  if (startBtn) startBtn.addEventListener("click", () => {
    STATE.picker = { nodeKey: "start" };
    render();
  });

  document.querySelectorAll("[data-log-skill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      logSkillUsage(btn.dataset.logSkill);
      btn.textContent = "Logged ✓";
      btn.disabled = true;
    });
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.goto));
  });

  // Picker question flow
  const cancelBtn = document.getElementById("picker-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { STATE.picker = null; render(); });

  document.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const node = SKILL_PICKER_TREE[STATE.picker.nodeKey];
      const opt = node.options[Number(btn.dataset.opt)];
      if (opt.result) {
        STATE.pickerResult = opt.result;
        STATE.picker = null;
      } else {
        STATE.picker = { nodeKey: opt.next };
      }
      render();
    });
  });

  // Picker result actions
  const gotoContainer = document.getElementById("goto-container");
  if (gotoContainer) gotoContainer.addEventListener("click", () => { STATE.showNoteForm = true; setView("home"); });
  const gotoSafe = document.getElementById("goto-safeplace");
  if (gotoSafe) gotoSafe.addEventListener("click", () => setView("safeplace"));
  const logResult = document.getElementById("log-result-skill");
  if (logResult) logResult.addEventListener("click", () => {
    logSkillUsage(STATE.pickerResult);
    logResult.textContent = "Logged ✓";
    logResult.disabled = true;
  });
  const restartBtn = document.getElementById("picker-restart");
  if (restartBtn) restartBtn.addEventListener("click", () => {
    STATE.pickerResult = null;
    STATE.picker = { nodeKey: "start" };
    render();
  });
}

// --- SAFE PLACE ---------------------------------------------------------------
function renderSafePlace() {
  const sp = STATE.data.safePlace;
  return `
    <div class="card center">
      <div style="font-size:36px;">🌲</div>
      <h2>${escapeHtml(sp.name)}</h2>
      <button class="btn btn-primary" id="btn-enter-safeplace" ${(sp.images.length + sp.sounds.length === 0) ? "disabled" : ""}>Enter Safe Place</button>
      ${(sp.images.length + sp.sounds.length === 0) ? `<p class="small mt-8">Add an image or sound below to build your experience.</p>` : ""}
    </div>

    <div class="card">
      <label>Name your safe place</label>
      <input type="text" id="sp-name" value="${escapeHtml(sp.name)}" />
      <button class="btn btn-outline mt-8" id="sp-save-name">Save name</button>
    </div>

    <div class="card">
      <h3 style="font-size:14px;">Images</h3>
      <div class="chip-row">
        ${sp.images.map((img) => `<span class="chip">${escapeHtml(img.name)} <a href="#" data-del-img="${img.id}">✕</a></span>`).join("") || `<span class="small">None yet</span>`}
      </div>
      <button class="btn btn-outline mt-8" id="btn-add-image">+ Add image</button>
      <input type="file" id="file-image" accept="image/*" multiple style="display:none;" />
    </div>

    <div class="card">
      <h3 style="font-size:14px;">Sounds</h3>
      <p class="small">The first sound in this list plays on loop when you enter your Safe Place.</p>
      <div class="chip-row">
        ${sp.sounds.map((snd) => `<span class="chip">${escapeHtml(snd.name)} <a href="#" data-del-snd="${snd.id}">✕</a></span>`).join("") || `<span class="small">None yet</span>`}
      </div>
      <button class="btn btn-outline mt-8" id="btn-add-sound">+ Add sound</button>
      <input type="file" id="file-sound" accept="audio/*" multiple style="display:none;" />
    </div>
  `;
}

function bindSafePlace() {
  const enterBtn = document.getElementById("btn-enter-safeplace");
  if (enterBtn) enterBtn.addEventListener("click", () => {
    SAFEPLACE.open(STATE.data.safePlace);
  });

  document.getElementById("sp-save-name").addEventListener("click", () => {
    STATE.data.safePlace.name = document.getElementById("sp-name").value.trim() || "Safe Place";
    persist();
    render();
  });

  const imgBtn = document.getElementById("btn-add-image");
  const imgInput = document.getElementById("file-image");
  imgBtn.addEventListener("click", () => imgInput.click());
  imgInput.addEventListener("change", async () => {
    for (const file of imgInput.files) {
      imgBtn.textContent = "Uploading…";
      try {
        const uploaded = await DRIVE.uploadMedia(file);
        STATE.data.safePlace.images.push(uploaded);
      } catch (e) { alert(e.message); }
    }
    imgBtn.textContent = "+ Add image";
    persist();
    render();
  });

  const sndBtn = document.getElementById("btn-add-sound");
  const sndInput = document.getElementById("file-sound");
  sndBtn.addEventListener("click", () => sndInput.click());
  sndInput.addEventListener("change", async () => {
    for (const file of sndInput.files) {
      sndBtn.textContent = "Uploading…";
      try {
        const uploaded = await DRIVE.uploadMedia(file);
        STATE.data.safePlace.sounds.push(uploaded);
      } catch (e) { alert(e.message); }
    }
    sndBtn.textContent = "+ Add sound";
    persist();
    render();
  });

  document.querySelectorAll("[data-del-img]").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = a.dataset.delImg;
      STATE.data.safePlace.images = STATE.data.safePlace.images.filter((i) => i.id !== id);
      persist();
      render();
      DRIVE.deleteMedia(id).catch(() => {});
    });
  });
  document.querySelectorAll("[data-del-snd]").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = a.dataset.delSnd;
      STATE.data.safePlace.sounds = STATE.data.safePlace.sounds.filter((i) => i.id !== id);
      persist();
      render();
      DRIVE.deleteMedia(id).catch(() => {});
    });
  });
}

// --- SUMMARY --------------------------------------------------------------
function renderSummary() {
  const summary = SUMMARY.build(STATE.data, 7);
  const day = STATE.data.settings.weeklySummaryDay;
  return `
    <div class="card">
      <label>Remind me of my summary on</label>
      <select id="summary-day">
        ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d) =>
          `<option value="${d}" ${d === day ? "selected" : ""}>${d}</option>`).join("")}
      </select>
    </div>

    <div class="card">
      <h3 style="font-size:14px;">Last 7 days — ${summary.noteCount} entr${summary.noteCount === 1 ? "y" : "ies"}</h3>

      <h3 class="mt-16" style="font-size:13px;">Topics by distress</h3>
      ${summary.topics.length === 0 ? `<p class="small">No entries logged this week.</p>` :
        summary.topics.map((t) => `
          <div class="summary-stat">
            <span>${escapeHtml(t.topic)}</span>
            <span class="small">avg ${t.sudAvg.toFixed(1)}/10</span>
          </div>
          <div class="summary-bar-track"><div class="summary-bar-fill" style="width:${t.sudAvg * 10}%"></div></div>
        `).join("")}

      <h3 class="mt-16" style="font-size:13px;">Skills used</h3>
      ${summary.skillsRanked.length === 0 ? `<p class="small">None logged this week.</p>` :
        summary.skillsRanked.map((s) => `<div class="summary-stat"><span>${escapeHtml(s.skill)}</span><span class="small">${s.count}x</span></div>`).join("")}

      <h3 class="mt-16" style="font-size:13px;">Symptoms most present</h3>
      ${summary.symptomsRanked.length === 0 ? `<p class="small">None logged this week.</p>` :
        summary.symptomsRanked.map((s) => `<div class="summary-stat"><span>${escapeHtml(s.symptom)}</span><span class="small">${s.count}x</span></div>`).join("")}
    </div>

    <button class="btn btn-primary" id="btn-copy-summary">Copy for my clinician</button>
  `;
}

function bindSummary() {
  document.getElementById("summary-day").addEventListener("change", (e) => {
    STATE.data.settings.weeklySummaryDay = e.target.value;
    persist();
  });
  document.getElementById("btn-copy-summary").addEventListener("click", async (e) => {
    const summary = SUMMARY.build(STATE.data, 7);
    const text = SUMMARY.toClinicianText(summary, STATE.data.containerName);
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = "Copied ✓";
      setTimeout(() => { e.target.textContent = "Copy for my clinician"; }, 1800);
    } catch {
      alert(text); // fallback: show it so it can be selected manually
    }
  });
}

// --- SETTINGS ---------------------------------------------------------------
function renderSettings() {
  const hasClientId = !!DRIVE.getClientId();
  const skills = loadSkills(STATE.data || { skills: {} });
  return `
    <div class="card">
      <h3 style="font-size:14px;">Google Drive connection</h3>
      <p class="small">One-time setup: create a free OAuth Client ID at
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">console.cloud.google.com</a>
        (OAuth client type: "Web application", add this page's URL under Authorized JavaScript origins), then paste the Client ID below.</p>
      <label>Google OAuth Client ID</label>
      <input type="text" id="client-id-input" value="${escapeHtml(DRIVE.getClientId() || "")}" placeholder="xxxx.apps.googleusercontent.com" />
      <button class="btn btn-outline mt-8" id="btn-save-client-id">Save Client ID</button>
      ${hasClientId && !STATE.signedIn ? `<button class="btn btn-primary mt-8" id="btn-connect-now">Connect Google Drive</button>` : ""}
      ${STATE.signedIn ? `<p class="small mt-8">✓ Connected. Your data is stored in your Drive as "emdr-companion-data.json".</p><button class="btn btn-ghost mt-8" id="btn-sign-out">Sign out</button>` : ""}
    </div>

    ${STATE.data ? `
    <div class="card">
      <h3 style="font-size:14px;">Container name</h3>
      <input type="text" id="container-name-input" value="${escapeHtml(STATE.data.containerName)}" />
      <button class="btn btn-outline mt-8" id="btn-save-container-name">Save</button>
    </div>

    <div class="card">
      <h3 style="font-size:14px;">Coping skill instructions</h3>
      <p class="small">Edit these to match exactly what your therapist taught you.</p>
      ${Object.entries(skills).map(([key, s]) => `
        <label>${s.icon} ${escapeHtml(s.name)}</label>
        <textarea data-skill-edit="${key}">${escapeHtml(s.instructions)}</textarea>
      `).join("")}
      <button class="btn btn-outline mt-8" id="btn-save-skills">Save skill instructions</button>
    </div>
    ` : ""}

    <div class="card small">
      <strong>About your data:</strong> Notes, safe place media, and logs are stored only in your Google Drive, in files this app creates. Nothing is kept permanently on this device. This app is a personal coping-skills organizer — it isn't a substitute for guidance from your EMDR therapist.
    </div>
  `;
}

function bindSettings() {
  document.getElementById("btn-save-client-id").addEventListener("click", () => {
    const id = document.getElementById("client-id-input").value.trim();
    if (!id) return;
    DRIVE.setClientId(id);
    render();
  });
  const connectBtn = document.getElementById("btn-connect-now");
  if (connectBtn) connectBtn.addEventListener("click", async () => {
    connectBtn.textContent = "Connecting…";
    try {
      await DRIVE.signIn({ silentFirst: false });
      STATE.data = await DRIVE.loadData();
      STATE.signedIn = true;
      maybeShowWeeklyBanner();
      render();
    } catch (e) {
      alert(e.message || "Could not connect.");
      connectBtn.textContent = "Connect Google Drive";
    }
  });

  const signOutBtn = document.getElementById("btn-sign-out");
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    DRIVE.signOut();
    STATE.signedIn = false;
    STATE.data = null;
    render();
  });

  const nameBtn = document.getElementById("btn-save-container-name");
  if (nameBtn) nameBtn.addEventListener("click", () => {
    STATE.data.containerName = document.getElementById("container-name-input").value.trim() || "My Container";
    persist();
    render();
  });

  const skillsBtn = document.getElementById("btn-save-skills");
  if (skillsBtn) skillsBtn.addEventListener("click", () => {
    const overrides = {};
    document.querySelectorAll("[data-skill-edit]").forEach((ta) => {
      overrides[ta.dataset.skillEdit] = { instructions: ta.value.trim() };
    });
    STATE.data.skills = overrides;
    persist();
    alert("Saved.");
  });
}

// --- Weekly summary reminder banner ------------------------------------------
function maybeShowWeeklyBanner() {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const settings = STATE.data.settings;
  const todayKey = new Date().toDateString();
  if (today === settings.weeklySummaryDay && settings.lastSummaryShown !== todayKey) {
    settings.lastSummaryShown = todayKey;
    persist();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Your weekly EMDR summary is ready", { body: "Open Companion to review it before your next session." });
    } else {
      setTimeout(() => alert("It's your weekly summary day — check the Summary tab before your next session."), 400);
    }
  }
}

// --- Boot ----------------------------------------------------------------------
async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  if ("Notification" in window && Notification.permission === "default") {
    // Ask early but don't block the UI on it.
    Notification.requestPermission().catch(() => {});
  }

  const clientId = DRIVE.getClientId();
  if (clientId) {
    try {
      if (!DRIVE.isSignedIn()) {
        await DRIVE.signIn({ silentFirst: true });
      }
      STATE.data = await DRIVE.loadData();
      STATE.signedIn = true;
      maybeShowWeeklyBanner();
    } catch {
      STATE.signedIn = false;
    }
  }
  render();
}

boot();
