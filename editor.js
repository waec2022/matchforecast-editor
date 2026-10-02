/* ==========================================================
   CAMPUS GUIDE EDITOR — a separate, private tool. Never linked
   from the public site, never loaded by guests.

   How it works:
   1. Connect — fetches the CURRENT content of each data/*.json
      file from your GitHub repo (a read-only operation).
   2. Edit — add, edit, or delete entries entirely in your browser.
      Nothing is sent anywhere during this step.
   3. Files — download the updated JSON file(s) and replace them
      in your repo yourself, then commit.

   Your token is only ever used for step 1 (reading). It is kept
   in a plain JS variable for this page only — never written to
   localStorage, sessionStorage, or any file — so closing or
   refreshing this tab clears it completely.
   ========================================================== */

const ENTITY_CONFIG = {
  lecturer: {
    label: "Lecturer", labelPlural: "Lecturers", file: "lecturers.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "department", label: "Department" },
      { key: "faculty", label: "Faculty" },
      { key: "office", label: "Office" },
      { key: "officeHours", label: "Office Hours" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "courses", label: "Courses Taught (comma-separated)", type: "list" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  course: {
    label: "Course", labelPlural: "Courses", file: "courses.json",
    fields: [
      { key: "code", label: "Course Code", required: true },
      { key: "title", label: "Course Title", required: true },
      { key: "department", label: "Department" },
      { key: "level", label: "Level" },
      { key: "semester", label: "Semester" },
    ],
    display: (r) => `${r.code} — ${r.title}`,
    idSource: (r) => r.code,
  },
  department: {
    label: "Department", labelPlural: "Departments", file: "departments.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "faculty", label: "Faculty" },
      { key: "office", label: "Office" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  faculty: {
    label: "Faculty", labelPlural: "Faculties", file: "faculties.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "office", label: "Office" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  building: {
    label: "Building", labelPlural: "Buildings", file: "buildings.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "campusArea", label: "Campus Area" },
      { key: "description", label: "Description", type: "textarea" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  office: {
    label: "Office", labelPlural: "Offices", file: "offices.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "building", label: "Building" },
      { key: "openingHours", label: "Opening Hours" },
      { key: "contact", label: "Contact" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  service: {
    label: "Service", labelPlural: "Services", file: "services.json",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "office", label: "Responsible Office" },
      { key: "openingHours", label: "Opening Hours" },
      { key: "description", label: "Description", type: "textarea" },
    ],
    display: (r) => r.name,
    idSource: (r) => r.name,
  },
  notification: {
    label: "Notification", labelPlural: "Notifications", file: "notifications.json",
    fields: [
      { key: "message", label: "Message", required: true, type: "textarea" },
    ],
    display: (r) => r.message,
    idSource: (r) => r.message,
    // Timestamps are computed automatically — never typed by hand.
    computeOnCreate: (record) => {
      const now = new Date();
      record.createdAt = now.toISOString();
      record.expiresAt = new Date(now.getTime() + 20 * 60000).toISOString();
      return record;
    },
  },
};

const ENTITY_ORDER = ["lecturer", "course", "department", "faculty", "building", "office", "service", "notification"];

const state = {
  token: "",
  repo: "",
  branch: "main",
  connecting: false,
  connected: false,
  connectError: null,
  data: {},
  screen: "connect", // connect | dashboard | list | form | files
  activeType: null,
  editingId: null,
  formError: null,
  showToken: false,
};

const root = document.getElementById("editor-app");

/* ---------------- GitHub (read-only) ---------------- */

async function fetchFile(path) {
  const headers = state.token ? { Authorization: `token ${state.token}` } : {};
  const res = await fetch(
    `https://api.github.com/repos/${state.repo}/contents/${path}?ref=${encodeURIComponent(state.branch)}`,
    { headers }
  );
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub returned ${res.status} for ${path}`);
  }
  const json = await res.json();
  const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ""))));
  try {
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function connect() {
  state.connecting = true;
  state.connectError = null;
  render();

  try {
    const results = await Promise.all(ENTITY_ORDER.map((type) => fetchFile(`data/${ENTITY_CONFIG[type].file}`)));
    ENTITY_ORDER.forEach((type, i) => { state.data[type] = results[i]; });
    state.connected = true;
    state.screen = "dashboard";
  } catch (err) {
    state.connectError = err.message || "Couldn't connect. Check the repository name and branch.";
  }
  state.connecting = false;
  render();
}

/* ---------------- Local editing (no network) ---------------- */

function slugify(str) {
  return (str || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function uniqueId(type, base) {
  const existing = new Set(state.data[type].map((r) => r.id));
  const root = slugify(base) || "item";
  if (!existing.has(root)) return root;
  let n = 2;
  while (existing.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

function saveRecord(type, formValues, editingId) {
  const config = ENTITY_CONFIG[type];
  const record = {};

  config.fields.forEach((f) => {
    let value = (formValues[f.key] || "").trim();
    if (f.type === "list") {
      value = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (value.length) record[f.key] = value;
      return;
    }
    if (value) record[f.key] = value;
  });

  if (editingId) {
    record.id = editingId;
    if (type === "notification") {
      const existing = state.data[type].find((r) => r.id === editingId);
      if (existing) {
        record.createdAt = existing.createdAt;
        record.expiresAt = existing.expiresAt;
      }
    }
    const idx = state.data[type].findIndex((r) => r.id === editingId);
    state.data[type][idx] = record;
  } else {
    record.id = uniqueId(type, config.idSource(record));
    if (config.computeOnCreate) config.computeOnCreate(record);
    state.data[type].push(record);
  }
}

function deleteRecord(type, id) {
  state.data[type] = state.data[type].filter((r) => r.id !== id);
}

/* ---------------- Download (manual commit step) ---------------- */

function downloadFile(type) {
  const config = ENTITY_CONFIG[type];
  const blob = new Blob([JSON.stringify(state.data[type], null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = config.file;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Rendering ---------------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderTopbar() {
  if (!state.connected) return "";
  return `
    <div class="editor-topbar">
      <span class="editor-brand">CAMPUS<span class="accent">GUIDE</span> Editor</span>
      <div class="editor-nav">
        <button type="button" class="nav-link ${state.screen === "dashboard" || state.screen === "list" || state.screen === "form" ? "is-active" : ""}" id="nav-dashboard">Dashboard</button>
        <button type="button" class="nav-link ${state.screen === "files" ? "is-active" : ""}" id="nav-files">Files</button>
        <button type="button" class="nav-link" id="nav-disconnect">Disconnect</button>
      </div>
    </div>
  `;
}

function renderConnect() {
  return `
    <div class="editor-center">
      <form class="connect-card" id="connect-form">
        <h1 class="connect-title">Campus Guide Editor</h1>
        <p class="connect-subtitle">Update your campus information easily</p>
        <p class="connect-intro">This is a private tool for updating your website's content. No backend, no database — just you and your GitHub repository.</p>

        <div class="field">
          <label for="token-input">GitHub Token (optional for public repos)</label>
          <div class="password-field">
            <input id="token-input" type="${state.showToken ? "text" : "password"}" placeholder="ghp_... (personal access token)" value="${escapeHtml(state.token)}" />
            <button type="button" class="password-toggle" id="toggle-token">${state.showToken ? "Hide" : "Show"}</button>
          </div>
        </div>

        <div class="field">
          <label for="repo-input">Repository</label>
          <input id="repo-input" type="text" placeholder="yourusername/campus-guide" value="${escapeHtml(state.repo)}" required />
        </div>

        <div class="field">
          <label for="branch-input">Branch</label>
          <input id="branch-input" type="text" placeholder="main" value="${escapeHtml(state.branch)}" />
        </div>

        ${state.connectError ? `<p class="form-error">${escapeHtml(state.connectError)}</p>` : ""}

        <button type="submit" class="primary-button" ${state.connecting ? "disabled" : ""}>
          ${state.connecting ? "Connecting..." : "Connect to GitHub"}
        </button>

        <p class="privacy-note">
          Your token is only used to read your repository's current content — it is never used to write or commit anything automatically, and it is never saved anywhere. Closing or refreshing this page clears it completely. Leave it blank if your repository is public.
        </p>
      </form>
    </div>
  `;
}

function renderDashboard() {
  const cards = ENTITY_ORDER.map((type) => {
    const config = ENTITY_CONFIG[type];
    const count = state.data[type]?.length || 0;
    return `
      <button type="button" class="category-card" data-open-type="${type}">
        <div>
          <p class="category-card-title">${config.labelPlural}</p>
          <p class="category-card-count">${count} item${count === 1 ? "" : "s"}</p>
        </div>
        <span class="category-card-chevron">›</span>
      </button>
    `;
  }).join("");

  return `
    <div class="editor-container">
      <h1 class="list-title">Content</h1>
      <div class="dashboard-grid">${cards}</div>
    </div>
  `;
}

function renderList() {
  const type = state.activeType;
  const config = ENTITY_CONFIG[type];
  const items = state.data[type] || [];

  const rows = items.length
    ? items.map((r) => `
        <div class="record-row">
          <span class="record-row-label">${escapeHtml(config.display(r))}</span>
          <span class="record-row-actions">
            <button type="button" class="secondary-button" data-edit="${r.id}">Edit</button>
            <button type="button" class="danger-button" data-delete="${r.id}">Delete</button>
          </span>
        </div>`).join("")
    : `<p class="empty-note">No ${config.labelPlural.toLowerCase()} yet.</p>`;

  return `
    <div class="editor-container">
      <button type="button" class="back-link" id="back-to-dashboard">← Back to Dashboard</button>
      <div class="list-header">
        <h1 class="list-title">${config.labelPlural} (${items.length})</h1>
        <button type="button" class="primary-button" id="add-new">+ Add ${config.label}</button>
      </div>
      <div class="form-stack">${rows}</div>
    </div>
  `;
}

function renderForm() {
  const type = state.activeType;
  const config = ENTITY_CONFIG[type];
  const editing = state.editingId ? state.data[type].find((r) => r.id === state.editingId) : null;

  const fieldsHtml = config.fields.map((f) => {
    const value = editing
      ? (f.type === "list" ? (editing[f.key] || []).join(", ") : editing[f.key] || "")
      : "";
    return `
      <div class="field">
        <label for="field-${f.key}">${f.label}${f.required ? " *" : ""}</label>
        ${f.type === "textarea" || f.type === "list"
          ? `<textarea id="field-${f.key}" rows="${f.type === "list" ? 2 : 3}">${escapeHtml(value)}</textarea>`
          : `<input id="field-${f.key}" type="text" value="${escapeHtml(value)}" />`}
      </div>`;
  }).join("");

  return `
    <div class="editor-container">
      <button type="button" class="back-link" id="back-to-list">← Back to ${config.labelPlural}</button>
      <h1 class="list-title">${editing ? "Edit" : "Add"} ${config.label}</h1>
      <form class="form-stack" id="record-form">
        ${fieldsHtml}
        ${state.formError ? `<p class="form-error">${escapeHtml(state.formError)}</p>` : ""}
        <button type="submit" class="primary-button">Save ${config.label}</button>
      </form>
    </div>
  `;
}

function renderFiles() {
  const rows = ENTITY_ORDER.map((type) => {
    const config = ENTITY_CONFIG[type];
    const count = state.data[type]?.length || 0;
    return `
      <div class="file-row">
        <span>data/${config.file} <span style="color:var(--text-muted); font-size:0.82rem;">(${count} item${count === 1 ? "" : "s"})</span></span>
        <button type="button" class="secondary-button" data-download="${type}">Download</button>
      </div>`;
  }).join("");

  return `
    <div class="editor-container">
      <h1 class="list-title">Files</h1>
      <div class="form-stack">${rows}</div>
      <div>
        <h2 style="font-size:1rem;">How to publish your changes</h2>
        <ol class="steps-list">
          <li>Download the file(s) for whatever you changed, above.</li>
          <li>Go to your GitHub repository's <code>data</code> folder.</li>
          <li>Open the matching file there and click the edit (pencil) icon.</li>
          <li>Replace its contents with the downloaded file's contents, then commit.</li>
          <li>Your website updates automatically within a few minutes.</li>
        </ol>
      </div>
    </div>
  `;
}

function render() {
  let screenHtml = "";
  if (state.screen === "connect") screenHtml = renderConnect();
  else if (state.screen === "dashboard") screenHtml = renderDashboard();
  else if (state.screen === "list") screenHtml = renderList();
  else if (state.screen === "form") screenHtml = renderForm();
  else if (state.screen === "files") screenHtml = renderFiles();

  root.innerHTML = `<div class="editor-page">${renderTopbar()}${screenHtml}</div>`;
  attachHandlers();
}

/* ---------------- Events ---------------- */

function attachHandlers() {
  document.getElementById("connect-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.token = document.getElementById("token-input").value.trim();
    state.repo = document.getElementById("repo-input").value.trim();
    state.branch = document.getElementById("branch-input").value.trim() || "main";
    if (!state.repo) {
      state.connectError = "Enter a repository, like yourusername/campus-guide.";
      render();
      return;
    }
    connect();
  });

  document.getElementById("toggle-token")?.addEventListener("click", () => {
    state.showToken = !state.showToken;
    state.token = document.getElementById("token-input").value;
    render();
  });

  document.getElementById("nav-dashboard")?.addEventListener("click", () => { state.screen = "dashboard"; render(); });
  document.getElementById("nav-files")?.addEventListener("click", () => { state.screen = "files"; render(); });
  document.getElementById("nav-disconnect")?.addEventListener("click", () => {
    state.token = ""; state.repo = ""; state.data = {}; state.connected = false; state.screen = "connect";
    render();
  });

  document.querySelectorAll("[data-open-type]").forEach((card) => {
    card.addEventListener("click", () => {
      state.activeType = card.dataset.openType;
      state.screen = "list";
      render();
    });
  });

  document.getElementById("back-to-dashboard")?.addEventListener("click", () => { state.screen = "dashboard"; render(); });
  document.getElementById("back-to-list")?.addEventListener("click", () => { state.screen = "list"; state.formError = null; render(); });

  document.getElementById("add-new")?.addEventListener("click", () => {
    state.editingId = null;
    state.formError = null;
    state.screen = "form";
    render();
  });

  document.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editingId = btn.dataset.edit;
      state.formError = null;
      state.screen = "form";
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this entry? This only removes it from this editing session — download the file afterward to make it permanent.")) {
        deleteRecord(state.activeType, btn.dataset.delete);
        render();
      }
    });
  });

  document.getElementById("record-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = state.activeType;
    const config = ENTITY_CONFIG[type];
    const values = {};
    let missingRequired = false;
    config.fields.forEach((f) => {
      const el = document.getElementById(`field-${f.key}`);
      values[f.key] = el.value;
      if (f.required && !el.value.trim()) missingRequired = true;
    });
    if (missingRequired) {
      state.formError = "Please fill in the required field(s).";
      render();
      return;
    }
    saveRecord(type, values, state.editingId);
    state.formError = null;
    state.screen = "list";
    render();
  });

  document.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", () => downloadFile(btn.dataset.download));
  });
}

render();
