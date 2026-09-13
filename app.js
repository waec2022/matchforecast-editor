/* ==========================================================================
   MatchForecast Local Editor — app.js
   Vanilla JS, no build step. Talks directly to the GitHub Contents API
   to read and publish data.json. The token lives only in a JS variable
   and sessionStorage (session-scoped) — never localStorage, never in
   any file that gets committed.
   ========================================================================== */

(function () {
  "use strict";

  var BOOKMAKER_NAMES = ["Bet9ja", "SportyBet", "BetPawa", "Betway", "1xBet"];

  var STATUS_OPTIONS = ["pending", "won", "lost"];
  var LIVE_STATUS_OPTIONS = ["live", "half-time", "finished"];
  var WINLOSS_OPTIONS = ["win", "loss", "draw", "void"];

  /* ---------------- section field configs ---------------- */

  var SECTION_CONFIG = {
    predictions: {
      label: "Predictions",
      fields: [
        { key: "match", label: "Match", type: "text", placeholder: "Team A vs Team B" },
        { key: "date", label: "Date", type: "text", placeholder: "e.g. Sep 13, 2026" },
        { key: "league", label: "League", type: "text" },
        { key: "market", label: "Market", type: "text", placeholder: "e.g. Over/Under, BTTS" },
        { key: "prediction", label: "Prediction", type: "text", placeholder: "e.g. Over 2.5" },
        { key: "odds", label: "Odds", type: "text" },
        { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
        { key: "bookmakers", label: "Bookmakers", type: "bookmakers" }
      ],
      summary: function (i) { return { title: i.match || "(no match)", sub: (i.prediction || "") + (i.odds ? " @ " + i.odds : "") }; }
    },
    accumulators: {
      label: "Accumulators",
      fields: [
        { key: "title", label: "Title", type: "text", placeholder: "e.g. 4-Fold Banker" },
        { key: "date", label: "Date", type: "text" },
        { key: "totalOdds", label: "Total odds", type: "text" },
        { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
        { key: "selections", label: "Selections", type: "selections", placeholder: "One per line: Team A vs Team B - Pick" },
        { key: "bookmakers", label: "Bookmakers", type: "bookmakers" }
      ],
      summary: function (i) { return { title: i.title || "(untitled)", sub: (safeArr(i.selections).length) + " selections · " + (i.totalOdds || "") }; }
    },
    correctScores: {
      label: "Correct Score",
      fields: [
        { key: "match", label: "Match", type: "text" },
        { key: "date", label: "Date", type: "text" },
        { key: "league", label: "League", type: "text" },
        { key: "correctScore", label: "Correct score", type: "text", placeholder: "e.g. 2-1" },
        { key: "odds", label: "Odds", type: "text" },
        { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
        { key: "bookmakers", label: "Bookmakers", type: "bookmakers" }
      ],
      summary: function (i) { return { title: i.match || "(no match)", sub: (i.correctScore || "") + (i.odds ? " @ " + i.odds : "") }; }
    },
    codesOnly: {
      label: "Codes Only",
      fields: [
        { key: "bookmaker", label: "Bookmaker", type: "select", options: BOOKMAKER_NAMES },
        { key: "label", label: "Label", type: "text", placeholder: "e.g. Today's 20 Odds Slip" },
        { key: "code", label: "Booking code", type: "text" }
      ],
      summary: function (i) { return { title: i.bookmaker || "(bookmaker)", sub: i.label || "" }; }
    },
    livePredictions: {
      label: "Live Predictions",
      fields: [
        { key: "match", label: "Match", type: "text" },
        { key: "league", label: "League", type: "text" },
        { key: "market", label: "Market", type: "text" },
        { key: "prediction", label: "Prediction", type: "text" },
        { key: "odds", label: "Odds", type: "text" },
        { key: "bookmaker", label: "Bookmaker", type: "select", options: BOOKMAKER_NAMES },
        { key: "code", label: "Booking code", type: "text" },
        { key: "status", label: "Status", type: "select", options: LIVE_STATUS_OPTIONS }
      ],
      summary: function (i) { return { title: i.match || "(no match)", sub: i.prediction || "" }; }
    },
    betOfTheDay: {
      label: "Bet of the Day",
      fields: [
        { key: "match", label: "Match", type: "text" },
        { key: "date", label: "Date", type: "text" },
        { key: "market", label: "Market", type: "text" },
        { key: "prediction", label: "Prediction", type: "text" },
        { key: "odds", label: "Odds", type: "text" },
        { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
        { key: "bookmakers", label: "Bookmakers", type: "bookmakers" }
      ],
      summary: function (i) { return { title: i.match || "(no match)", sub: i.prediction || "" }; }
    },
    results: {
      label: "Results",
      fields: [
        { key: "match", label: "Match", type: "text" },
        { key: "date", label: "Date", type: "text" },
        { key: "result", label: "Result", type: "text", placeholder: "e.g. 2-1" },
        { key: "winLoss", label: "Win / Loss", type: "select", options: WINLOSS_OPTIONS },
        { key: "status", label: "Status label", type: "text", placeholder: "optional, e.g. WON" }
      ],
      summary: function (i) { return { title: i.match || "(no match)", sub: (i.result || "") + " · " + (i.winLoss || "") }; }
    },
    news: {
      label: "News",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "date", label: "Date", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "content", label: "Content", type: "textarea" },
        { key: "image", label: "Image URL", type: "text", placeholder: "optional" },
        { key: "link", label: "Link", type: "text", placeholder: "optional" }
      ],
      summary: function (i) { return { title: i.title || "(untitled)", sub: i.date || "" }; }
    }
  };

  /* ---------------- state ---------------- */

  var STATE = {
    owner: "", repo: "", branch: "main", file: "data.json", token: "",
    sha: null,
    data: null,
    dirty: false,
    currentSection: null,
    editingIndex: null
  };

  function safeArr(a) { return Array.isArray(a) ? a : []; }

  function defaultData() {
    return {
      meta: { lastUpdated: "", displayDate: "", resultsDate: "", stats: { totalSelections: 0, winnersYesterday: 0, losersYesterday: 0, hitRateYesterday: 0 } },
      predictions: [], accumulators: [], correctScores: [], codesOnly: [],
      livePredictions: [], betOfTheDay: [], results: [], news: [],
      bookmakers: BOOKMAKER_NAMES.map(function (n) { return { id: n.toLowerCase().replace(/[^a-z0-9]/g, ""), name: n, link: "" }; })
    };
  }

  function ensureShape(data) {
    var d = data && typeof data === "object" ? data : {};
    var base = defaultData();
    d.meta = Object.assign({}, base.meta, d.meta, { stats: Object.assign({}, base.meta.stats, (d.meta || {}).stats) });
    Object.keys(SECTION_CONFIG).forEach(function (k) { d[k] = safeArr(d[k]); });
    d.bookmakers = safeArr(d.bookmakers).length ? d.bookmakers : base.bookmakers;
    return d;
  }

  /* ---------------- base64 (UTF-8 safe) ---------------- */

  function b64Encode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (m, p1) {
      return String.fromCharCode("0x" + p1);
    }));
  }
  function b64Decode(str) {
    return decodeURIComponent(atob(str.replace(/\n/g, "")).split("").map(function (c) {
      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
  }

  /* ---------------- status bar ---------------- */

  var statusBar = document.getElementById("statusBar");
  function showStatus(msg, kind) {
    statusBar.hidden = false;
    statusBar.textContent = msg;
    statusBar.className = "status-bar status-bar--" + (kind || "busy");
  }
  function hideStatus() { statusBar.hidden = true; }

  /* ---------------- GitHub API ---------------- */

  function apiUrl() {
    return "https://api.github.com/repos/" + STATE.owner + "/" + STATE.repo + "/contents/" + STATE.file;
  }

  function authHeaders() {
    var h = { "Accept": "application/vnd.github+json" };
    if (STATE.token) h["Authorization"] = "token " + STATE.token;
    return h;
  }

  function loadFromGitHub() {
    showStatus("Loading data.json from GitHub…", "busy");
    return fetch(apiUrl() + "?ref=" + encodeURIComponent(STATE.branch), { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 404) {
          // File doesn't exist yet — start from a fresh empty dataset.
          STATE.sha = null;
          STATE.data = defaultData();
          showStatus("No data.json found yet — starting fresh. Publish to create it.", "ok");
          return STATE.data;
        }
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || ("GitHub error " + res.status)); });
        return res.json().then(function (json) {
          STATE.sha = json.sha;
          STATE.data = ensureShape(JSON.parse(b64Decode(json.content)));
          showStatus("✓ Connected — data loaded", "ok");
          return STATE.data;
        });
      })
      .catch(function (err) {
        showStatus("Failed to load: " + err.message, "error");
        throw err;
      });
  }

  function publishToGitHub() {
    if (!STATE.owner || !STATE.repo || !STATE.token) {
      showStatus("Set owner, repo and token in Settings first.", "error");
      return;
    }
    var publishBtn = document.getElementById("publishBtn");
    publishBtn.disabled = true;
    showStatus("Publishing…", "busy");

    STATE.data.meta.lastUpdated = new Date().toISOString();
    var body = {
      message: "Update data.json via MatchForecast Editor",
      content: b64Encode(JSON.stringify(STATE.data, null, 2)),
      branch: STATE.branch
    };
    if (STATE.sha) body.sha = STATE.sha;

    fetch(apiUrl(), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error(json.message || ("GitHub rejected the update (" + res.status + ")"));
          return json;
        });
      })
      .then(function (json) {
        STATE.sha = json.content.sha;
        STATE.dirty = false;
        showStatus("✓ Published successfully — GitHub updated — website will refresh on next load", "ok");
      })
      .catch(function (err) {
        showStatus("✗ Publish failed: " + err.message + " — nothing was lost, fix and retry.", "error");
      })
      .finally(function () {
        publishBtn.disabled = false;
      });
  }

  /* ---------------- settings persistence ---------------- */

  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem("mf_editor_settings") || "{}");
      STATE.owner = saved.owner || "";
      STATE.repo = saved.repo || "";
      STATE.branch = saved.branch || "main";
      STATE.file = saved.file || "data.json";
    } catch (e) {}
    STATE.token = sessionStorage.getItem("mf_editor_token") || "";

    document.getElementById("ghOwner").value = STATE.owner;
    document.getElementById("ghRepo").value = STATE.repo;
    document.getElementById("ghBranch").value = STATE.branch;
    document.getElementById("ghFile").value = STATE.file;
    document.getElementById("ghToken").value = STATE.token;
  }

  function saveSettingsFromForm() {
    STATE.owner = document.getElementById("ghOwner").value.trim();
    STATE.repo = document.getElementById("ghRepo").value.trim();
    STATE.branch = document.getElementById("ghBranch").value.trim() || "main";
    STATE.file = document.getElementById("ghFile").value.trim() || "data.json";
    STATE.token = document.getElementById("ghToken").value.trim();

    localStorage.setItem("mf_editor_settings", JSON.stringify({
      owner: STATE.owner, repo: STATE.repo, branch: STATE.branch, file: STATE.file
    }));
    // Token: session-only, never localStorage.
    if (STATE.token) sessionStorage.setItem("mf_editor_token", STATE.token);
    else sessionStorage.removeItem("mf_editor_token");
  }

  /* ---------------- navigation ---------------- */

  var views = document.querySelectorAll(".view");
  function showView(name) {
    views.forEach(function (v) { v.classList.toggle("is-active", v.dataset.view === name); });
  }

  document.getElementById("bottomTabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    var nav = btn.dataset.nav;
    if (nav === "more") {
      document.getElementById("moreSheet").hidden = false;
      return;
    }
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.toggle("tab-btn--active", b === btn); });
    goTo(nav);
  });

  document.getElementById("moreSheet").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-nav]");
    if (btn) goTo(btn.dataset.nav);
    document.getElementById("moreSheet").hidden = true;
  });
  document.getElementById("closeMoreSheet").addEventListener("click", function () {
    document.getElementById("moreSheet").hidden = true;
  });

  function goTo(nav) {
    if (nav === "dashboard") { renderDashboard(); showView("dashboard"); return; }
    if (nav === "settings") { showView("settings"); renderBookmakerSettings(); return; }
    if (SECTION_CONFIG[nav]) {
      STATE.currentSection = nav;
      renderList();
      showView("list");
    }
  }

  /* ---------------- dashboard ---------------- */

  function renderDashboard() {
    if (!STATE.data) return;
    var m = STATE.data.meta;
    document.getElementById("metaDisplayDate").value = m.displayDate || "";
    document.getElementById("metaResultsDate").value = m.resultsDate || "";
    document.getElementById("statTotal").value = m.stats.totalSelections || 0;
    document.getElementById("statWinners").value = m.stats.winnersYesterday || 0;
    document.getElementById("statLosers").value = m.stats.losersYesterday || 0;
    document.getElementById("statHitRate").value = m.stats.hitRateYesterday || 0;

    var ul = document.getElementById("dashboardCounts");
    ul.innerHTML = "";
    Object.keys(SECTION_CONFIG).forEach(function (key) {
      var li = document.createElement("li");
      li.innerHTML = "<span>" + SECTION_CONFIG[key].label + "</span><strong>" + safeArr(STATE.data[key]).length + "</strong>";
      ul.appendChild(li);
    });
  }

  document.getElementById("saveMetaBtn").addEventListener("click", function () {
    if (!STATE.data) return;
    var m = STATE.data.meta;
    m.displayDate = document.getElementById("metaDisplayDate").value;
    m.resultsDate = document.getElementById("metaResultsDate").value;
    m.stats.totalSelections = Number(document.getElementById("statTotal").value) || 0;
    m.stats.winnersYesterday = Number(document.getElementById("statWinners").value) || 0;
    m.stats.losersYesterday = Number(document.getElementById("statLosers").value) || 0;
    m.stats.hitRateYesterday = Number(document.getElementById("statHitRate").value) || 0;
    STATE.dirty = true;
    showStatus("Overview saved locally — tap Publish to push it live.", "ok");
  });

  /* ---------------- list view ---------------- */

  function renderList() {
    var cfg = SECTION_CONFIG[STATE.currentSection];
    document.getElementById("listTitle").textContent = cfg.label;
    var container = document.getElementById("listContainer");
    container.innerHTML = "";
    var items = safeArr(STATE.data[STATE.currentSection]);
    if (!items.length) {
      container.innerHTML = '<p class="empty-hint">No ' + cfg.label.toLowerCase() + ' yet. Tap + Add to create one.</p>';
      return;
    }
    items.forEach(function (item, idx) {
      var s = cfg.summary(item);
      var row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML =
        '<div class="list-item__body">' +
          '<div class="list-item__title">' + escapeHtml(s.title) + '</div>' +
          '<div class="list-item__sub">' + escapeHtml(s.sub) + '</div>' +
        '</div><span class="list-item__chevron">›</span>';
      row.addEventListener("click", function () { openEditor(idx); });
      container.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  document.getElementById("addItemBtn").addEventListener("click", function () { openEditor(null); });

  /* ---------------- item editor ---------------- */

  function openEditor(index) {
    STATE.editingIndex = index;
    var cfg = SECTION_CONFIG[STATE.currentSection];
    var item = index === null ? {} : safeArr(STATE.data[STATE.currentSection])[index];
    document.getElementById("editorTitle").textContent = (index === null ? "Add " : "Edit ") + cfg.label.replace(/s$/, "");
    document.getElementById("editorDeleteBtn").style.display = index === null ? "none" : "inline-block";

    var form = document.getElementById("editorForm");
    form.innerHTML = "";
    cfg.fields.forEach(function (field) {
      form.appendChild(buildField(field, item));
    });
    showView("editor");
  }

  function buildField(field, item) {
    var wrap = document.createElement("label");
    wrap.dataset.fieldKey = field.key;
    var value = item[field.key];

    if (field.type === "select") {
      wrap.innerHTML = field.label;
      var select = document.createElement("select");
      field.options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        if (value === opt) o.selected = true;
        select.appendChild(o);
      });
      wrap.appendChild(select);
      return wrap;
    }

    if (field.type === "textarea") {
      wrap.innerHTML = field.label;
      var ta = document.createElement("textarea");
      ta.placeholder = field.placeholder || "";
      ta.value = value || "";
      wrap.appendChild(ta);
      return wrap;
    }

    if (field.type === "selections") {
      wrap.innerHTML = field.label;
      var ta2 = document.createElement("textarea");
      ta2.placeholder = field.placeholder || "";
      ta2.value = safeArr(value).map(function (s) { return (s.match || "") + " - " + (s.pick || ""); }).join("\n");
      wrap.appendChild(ta2);
      return wrap;
    }

    if (field.type === "bookmakers") {
      wrap.innerHTML = field.label;
      var existing = {};
      safeArr(value).forEach(function (b) { existing[b.name] = b; });
      BOOKMAKER_NAMES.forEach(function (name) {
        var b = existing[name] || {};
        var row = document.createElement("div");
        row.className = "bookmaker-row";
        row.dataset.bookmakerName = name;
        row.innerHTML =
          '<span class="bookmaker-row__name">' + name + '</span>' +
          '<div class="bookmaker-row__fields">' +
            '<input type="text" data-bm="odds" placeholder="Odds" value="' + escapeHtml(b.odds || "") + '">' +
            '<input type="text" data-bm="code" placeholder="Booking code" value="' + escapeHtml(b.code || "") + '">' +
            '<input type="text" class="full" data-bm="link" placeholder="Affiliate link (optional)" value="' + escapeHtml(b.link || "") + '">' +
          '</div>';
        wrap.appendChild(row);
      });
      return wrap;
    }

    // text / date / number
    wrap.innerHTML = field.label;
    var input = document.createElement("input");
    input.type = field.type === "number" ? "number" : "text";
    input.placeholder = field.placeholder || "";
    input.value = value || "";
    wrap.appendChild(input);
    return wrap;
  }

  function collectForm() {
    var cfg = SECTION_CONFIG[STATE.currentSection];
    var item = {};
    var form = document.getElementById("editorForm");
    cfg.fields.forEach(function (field) {
      var wrap = form.querySelector('[data-field-key="' + field.key + '"]');
      if (!wrap) return;

      if (field.type === "select") {
        item[field.key] = wrap.querySelector("select").value;
      } else if (field.type === "textarea") {
        item[field.key] = wrap.querySelector("textarea").value;
      } else if (field.type === "selections") {
        var lines = wrap.querySelector("textarea").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
        item[field.key] = lines.map(function (line) {
          var idx = line.indexOf(" - ");
          return idx === -1 ? { match: line, pick: "" } : { match: line.slice(0, idx).trim(), pick: line.slice(idx + 3).trim() };
        });
      } else if (field.type === "bookmakers") {
        var rows = wrap.querySelectorAll(".bookmaker-row");
        var list = [];
        rows.forEach(function (row) {
          var odds = row.querySelector('[data-bm="odds"]').value.trim();
          var code = row.querySelector('[data-bm="code"]').value.trim();
          var link = row.querySelector('[data-bm="link"]').value.trim();
          if (odds || code || link) {
            list.push({ name: row.dataset.bookmakerName, odds: odds, code: code, link: link });
          }
        });
        item[field.key] = list;
      } else {
        var inp = wrap.querySelector("input");
        item[field.key] = field.type === "number" ? (Number(inp.value) || 0) : inp.value.trim();
      }
    });
    return item;
  }

  document.getElementById("editorBackBtn").addEventListener("click", function () { renderList(); showView("list"); });

  document.getElementById("editorSaveBtn").addEventListener("click", function () {
    var item = collectForm();
    var arr = safeArr(STATE.data[STATE.currentSection]);
    if (STATE.editingIndex === null) {
      item.id = STATE.currentSection + "_" + Date.now();
      arr.push(item);
    } else {
      var existingId = arr[STATE.editingIndex].id;
      item.id = existingId || (STATE.currentSection + "_" + Date.now());
      arr[STATE.editingIndex] = item;
    }
    STATE.data[STATE.currentSection] = arr;
    STATE.dirty = true;
    renderList();
    showView("list");
    showStatus("Saved locally — tap Publish to push it live.", "ok");
  });

  document.getElementById("editorDeleteBtn").addEventListener("click", function () {
    if (STATE.editingIndex === null) return;
    if (!confirm("Delete this item?")) return;
    var arr = safeArr(STATE.data[STATE.currentSection]);
    arr.splice(STATE.editingIndex, 1);
    STATE.data[STATE.currentSection] = arr;
    STATE.dirty = true;
    renderList();
    showView("list");
    showStatus("Deleted locally — tap Publish to push it live.", "ok");
  });

  /* ---------------- bookmakers (sidebar list) settings ---------------- */

  function renderBookmakerSettings() {
    if (!STATE.data) return;
    var wrap = document.getElementById("bookmakerSettingsList");
    wrap.innerHTML = "";
    safeArr(STATE.data.bookmakers).forEach(function (b, idx) {
      var row = document.createElement("label");
      row.textContent = b.name;
      var input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Affiliate link (optional)";
      input.value = b.link || "";
      input.addEventListener("change", function () {
        STATE.data.bookmakers[idx].link = input.value.trim();
        STATE.dirty = true;
      });
      row.appendChild(input);
      wrap.appendChild(row);
    });
  }

  /* ---------------- connect button ---------------- */

  document.getElementById("connectBtn").addEventListener("click", function () {
    saveSettingsFromForm();
    loadFromGitHub().then(function () {
      renderDashboard();
      renderBookmakerSettings();
      goTo("dashboard");
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.toggle("tab-btn--active", b.dataset.nav === "dashboard"); });
    });
  });

  document.getElementById("publishBtn").addEventListener("click", function () {
    if (!STATE.data) { showStatus("Connect to GitHub first (Settings tab).", "error"); return; }
    publishToGitHub();
  });

  /* ---------------- boot ---------------- */

  loadSettings();
  if (STATE.owner && STATE.repo && STATE.token) {
    loadFromGitHub().then(function () {
      renderDashboard();
      renderBookmakerSettings();
      goTo("dashboard");
    });
  } else {
    STATE.data = defaultData();
    showView("settings");
    showStatus("Enter your GitHub details and token, then tap Connect & Load.", "busy");
  }
})();
