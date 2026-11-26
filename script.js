/* ============================================================
   Catatan Keuangan Harian
   - Database: SQLite via sql.js (WebAssembly), persisted to IndexedDB
   - Export/Import .sqlite file for backup / moving between devices
   ============================================================ */

const SQL_WASM_BASE = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";
const IDB_NAME = "keuangan-db";
const IDB_STORE = "files";

const PROFILES_KEY = "kk-profiles";
const ACTIVE_PROFILE_KEY = "kk-active-profile";

let activeProfile = null;

function idbKeyFor(profile) {
  return `sqlite:${profile}`;
}

function getProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveProfiles(list) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

function getActiveProfileName() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function setActiveProfileName(name) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS categories (
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    PRIMARY KEY (name, type)
  );
  INSERT OR IGNORE INTO categories (name, type) VALUES
    ('Makan', 'expense'),
    ('Bensin/Transport', 'expense'),
    ('Jajan', 'expense'),
    ('Lainnya', 'expense'),
    ('Gaji', 'income'),
    ('Lainnya', 'income');
`;

let SQL, db;

/* ---------- IndexedDB helpers (store the raw sqlite file) ---------- */

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadDBBlob(profile) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(idbKeyFor(profile));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveDBBlob(profile, uint8arr) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(uint8arr, idbKeyFor(profile));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDBBlob(profile) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(idbKeyFor(profile));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function persist() {
  const data = db.export();
  await saveDBBlob(activeProfile, data);
}

/* ---------- DB bootstrap ---------- */

async function ensureSqlJsLoaded() {
  if (!SQL) SQL = await initSqlJs({ locateFile: (f) => SQL_WASM_BASE + f });
}

async function loadProfileDB(profile) {
  await ensureSqlJsLoaded();
  const existing = await loadDBBlob(profile);
  if (existing) {
    db = new SQL.Database(new Uint8Array(existing));
    db.run(SCHEMA_SQL); // no-op if already present, fills gaps if file came from an older version
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  }
  activeProfile = profile;
  await persist();
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
}

/* ---------- Data access ---------- */

function addTransaction({ date, type, category, amount, note }) {
  run(
    `INSERT INTO transactions (date, type, category, amount, note) VALUES (?,?,?,?,?)`,
    [date, type, category, amount, note || ""]
  );
}

function deleteTransaction(id) {
  run(`DELETE FROM transactions WHERE id = ?`, [id]);
}

function addCategory(name, type) {
  run(`INSERT OR IGNORE INTO categories (name, type) VALUES (?,?)`, [name, type]);
}

function getCategories(type) {
  return queryAll(`SELECT name FROM categories WHERE type = ? ORDER BY name`, [type]).map(
    (r) => r.name
  );
}

function getAllCategoryNames() {
  return queryAll(`SELECT DISTINCT name FROM categories ORDER BY name`).map((r) => r.name);
}

function getTransactions(filter) {
  let sql = `SELECT * FROM transactions WHERE 1=1`;
  const params = [];
  if (filter.from) {
    sql += ` AND date >= ?`;
    params.push(filter.from);
  }
  if (filter.to) {
    sql += ` AND date <= ?`;
    params.push(filter.to);
  }
  if (filter.category && filter.category !== "all") {
    sql += ` AND category = ?`;
    params.push(filter.category);
  }
  sql += ` ORDER BY date DESC, id DESC`;
  return queryAll(sql, params);
}

function monthlyTotals(months) {
  // months: array of 'YYYY-MM' labels, oldest first
  const rows = queryAll(
    `SELECT strftime('%Y-%m', date) as ym, type, SUM(amount) as total
     FROM transactions GROUP BY ym, type`
  );
  const map = {};
  rows.forEach((r) => {
    map[r.ym] = map[r.ym] || { income: 0, expense: 0 };
    map[r.ym][r.type] = r.total;
  });
  return months.map((ym) => ({
    ym,
    income: (map[ym] && map[ym].income) || 0,
    expense: (map[ym] && map[ym].expense) || 0,
  }));
}

/* ---------- Formatting helpers ---------- */

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatRupiah(n) {
  return rupiahFormatter.format(n || 0);
}

function formatRupiahShort(n) {
  if (Math.abs(n) >= 1_000_000) return "Rp" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "jt";
  if (Math.abs(n) >= 1_000) return "Rp" + (n / 1_000).toFixed(0) + "rb";
  return "Rp" + n;
}

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

function lastNMonths(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function getPresetRange(preset) {
  const now = new Date();
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(from), to: toISODate(to) };
  }
  if (preset === "lastmonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toISODate(from), to: toISODate(to) };
  }
  if (preset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: toISODate(from), to: toISODate(now) };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: toISODate(from), to: toISODate(now) };
  }
  if (preset === "all") return { from: null, to: null };
  return null; // custom
}

/* ---------- Profiles ---------- */

function sanitizeProfileName(name) {
  return name.trim().slice(0, 40);
}

function populateProfileSelect() {
  const sel = document.getElementById("profileSelect");
  const profiles = getProfiles();
  sel.innerHTML =
    profiles.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("") +
    `<option value="__new__">+ Profil baru…</option>`;
  sel.value = activeProfile;
}

async function switchToProfile(name) {
  await loadProfileDB(name);
  setActiveProfileName(name);
  populateProfileSelect();
  document.getElementById("txDate").value = toISODate(new Date());
  refreshCategorySelectForForm();
  refreshFilterUI();
  refreshAll();
}

async function createNewProfile() {
  const name = sanitizeProfileName(prompt("Nama profil baru (misal: nama Anda):") || "");
  if (!name) {
    populateProfileSelect(); // revert the <select> back to the active profile
    return;
  }
  const profiles = getProfiles();
  if (profiles.includes(name)) {
    alert("Nama profil itu sudah ada. Pilih dari daftar, atau pakai nama lain.");
    populateProfileSelect();
    return;
  }
  profiles.push(name);
  saveProfiles(profiles);
  await switchToProfile(name);
}

async function deleteActiveProfile() {
  const profiles = getProfiles();
  if (profiles.length <= 1) {
    alert("Tidak bisa menghapus satu-satunya profil yang ada.");
    return;
  }
  if (!confirm(`Hapus profil "${activeProfile}" beserta semua transaksinya? Tindakan ini tidak bisa dibatalkan.`)) {
    return;
  }
  const removed = activeProfile;
  const remaining = profiles.filter((p) => p !== removed);
  saveProfiles(remaining);
  await deleteDBBlob(removed);
  await switchToProfile(remaining[0]);
}

async function initProfiles() {
  let profiles = getProfiles();
  if (profiles.length === 0) {
    const name = sanitizeProfileName(prompt("Selamat datang! Siapa nama profil pertama Anda?") || "Utama");
    profiles = [name || "Utama"];
    saveProfiles(profiles);
    setActiveProfileName(profiles[0]);
  } else {
    const saved = getActiveProfileName();
    if (!saved || !profiles.includes(saved)) {
      setActiveProfileName(profiles[0]);
    }
  }
  activeProfile = getActiveProfileName();
  await loadProfileDB(activeProfile);
  populateProfileSelect();

  document.getElementById("profileSelect").addEventListener("change", async (e) => {
    const value = e.target.value;
    if (value === "__new__") {
      await createNewProfile();
    } else {
      await switchToProfile(value);
    }
  });

  document.getElementById("deleteProfileBtn").addEventListener("click", deleteActiveProfile);
}

/* ---------- Theme ---------- */

function currentThemeIsDark() {
  const stamp = document.documentElement.getAttribute("data-theme");
  if (stamp === "dark") return true;
  if (stamp === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme-pref");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  updateToggleIcon();

  btn.addEventListener("click", () => {
    const next = currentThemeIsDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme-pref", next);
    updateToggleIcon();
    renderCharts();
  });

  function updateToggleIcon() {
    btn.textContent = currentThemeIsDark() ? "☀️" : "🌙";
  }
}

/* ---------- Chart rendering ---------- */

let categoryChart, trendChart;

function seriesColor(i) {
  return cssVar(`--series-${(i % 8) + 1}`);
}

function renderCharts() {
  renderCategoryChart();
  renderTrendChart();
}

function renderCategoryChart() {
  const filter = getActiveFilter();
  const rows = getTransactions(filter).filter((r) => r.type === "expense");
  const totals = {};
  rows.forEach((r) => {
    totals[r.category] = (totals[r.category] || 0) + r.amount;
  });
  const labels = Object.keys(totals);
  const values = labels.map((l) => totals[l]);

  const emptyNote = document.getElementById("categoryChartEmpty");
  const canvas = document.getElementById("categoryChart");

  if (labels.length === 0) {
    emptyNote.hidden = false;
    canvas.style.display = "none";
    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }
    return;
  }
  emptyNote.hidden = true;
  canvas.style.display = "block";

  const surface = cssVar("--surface-1");
  const textSecondary = cssVar("--text-secondary");

  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, i) => seriesColor(i)),
          borderColor: surface,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textSecondary, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatRupiah(ctx.raw)}`,
          },
        },
      },
    },
  });
}

function renderTrendChart() {
  const months = lastNMonths(6);
  const data = monthlyTotals(months);
  const labels = months.map(monthLabel);

  const textSecondary = cssVar("--text-secondary");
  const gridline = cssVar("--gridline");

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("trendChart").getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pemasukan",
          data: data.map((d) => d.income),
          backgroundColor: seriesColor(0),
          borderRadius: 4,
          maxBarThickness: 28,
        },
        {
          label: "Pengeluaran",
          data: data.map((d) => d.expense),
          backgroundColor: seriesColor(1),
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textSecondary },
        },
        y: {
          grid: { color: gridline },
          ticks: { color: textSecondary, callback: (v) => formatRupiahShort(v) },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { position: "bottom", labels: { color: textSecondary, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`,
          },
        },
      },
    },
  });
}

/* ---------- Filter state ---------- */

function getActiveFilter() {
  const preset = document.getElementById("filterPreset").value;
  const category = document.getElementById("filterCategory").value;
  if (preset === "custom") {
    const from = document.getElementById("filterFrom").value || null;
    const to = document.getElementById("filterTo").value || null;
    return { from, to, category };
  }
  const range = getPresetRange(preset);
  return { ...range, category };
}

function refreshFilterUI() {
  const preset = document.getElementById("filterPreset").value;
  const showCustom = preset === "custom";
  document.getElementById("customRangeFrom").hidden = !showCustom;
  document.getElementById("customRangeTo").hidden = !showCustom;
}

function refreshCategoryFilterOptions() {
  const sel = document.getElementById("filterCategory");
  const prev = sel.value;
  const names = getAllCategoryNames();
  sel.innerHTML =
    `<option value="all">Semua kategori</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (names.includes(prev)) sel.value = prev;
}

function refreshCategorySelectForForm() {
  const typeInput = document.querySelector('input[name="type"]:checked');
  const type = typeInput ? typeInput.value : "expense";
  const sel = document.getElementById("txCategory");
  const prev = sel.value;
  const names = getCategories(type);
  sel.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (names.includes(prev)) sel.value = prev;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- Rendering: summary + table ---------- */

function renderSummary(rows) {
  let income = 0, expense = 0;
  rows.forEach((r) => (r.type === "income" ? (income += r.amount) : (expense += r.amount)));
  document.getElementById("sumIncome").textContent = formatRupiah(income);
  document.getElementById("sumExpense").textContent = formatRupiah(expense);
  document.getElementById("sumBalance").textContent = formatRupiah(income - expense);
}

function renderTable(rows) {
  const tbody = document.getElementById("txTableBody");
  const emptyNote = document.getElementById("txEmpty");

  if (rows.length === 0) {
    tbody.innerHTML = "";
    emptyNote.hidden = false;
    return;
  }
  emptyNote.hidden = true;

  tbody.innerHTML = rows
    .map((r) => {
      const sign = r.type === "expense" ? "-" : "+";
      return `<tr data-id="${r.id}">
        <td>${r.date}</td>
        <td><span class="type-badge ${r.type}">${r.type === "expense" ? "Keluar" : "Masuk"}</span></td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.note || "")}</td>
        <td class="col-amount">${sign} ${formatRupiah(r.amount)}</td>
        <td><button class="row-delete" data-id="${r.id}" aria-label="Hapus">Hapus</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".row-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      if (!confirm("Hapus transaksi ini?")) return;
      deleteTransaction(id);
      await persist();
      refreshAll();
    });
  });
}

function refreshAll() {
  const filter = getActiveFilter();
  const rows = getTransactions(filter);
  renderSummary(rows);
  renderTable(rows);
  renderCharts();
  refreshCategoryFilterOptions();
}

/* ---------- Export / Import ---------- */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportSQLite() {
  const data = db.export();
  downloadBlob(
    new Blob([data], { type: "application/x-sqlite3" }),
    `catatan-keuangan-${activeProfile}-${toISODate(new Date())}.sqlite`
  );
}

function exportCSV() {
  const rows = getTransactions({});
  const header = ["id", "date", "type", "category", "amount", "note"];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const vals = header.map((h) => {
      const v = r[h] ?? "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(vals.join(","));
  });
  downloadBlob(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `catatan-keuangan-${activeProfile}-${toISODate(new Date())}.csv`
  );
}

async function importSQLiteFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const newDb = new SQL.Database(buf);
    newDb.run(SCHEMA_SQL); // ensure tables exist even on an older/foreign file
    db = newDb;
    await persist();
    refreshAll();
    alert("Berhasil memuat data dari file .sqlite.");
  } catch (err) {
    alert("Gagal membaca file ini sebagai database SQLite.");
    console.error(err);
  }
}

/* ---------- Wiring ---------- */

async function main() {
  initThemeToggle();
  await initProfiles();

  document.getElementById("txDate").value = toISODate(new Date());
  refreshCategorySelectForForm();
  refreshCategoryFilterOptions();
  refreshFilterUI();
  refreshAll();

  document.querySelectorAll('input[name="type"]').forEach((el) => {
    el.addEventListener("change", refreshCategorySelectForForm);
  });

  document.getElementById("filterPreset").addEventListener("change", () => {
    refreshFilterUI();
    refreshAll();
  });
  document.getElementById("filterFrom").addEventListener("change", refreshAll);
  document.getElementById("filterTo").addEventListener("change", refreshAll);
  document.getElementById("filterCategory").addEventListener("change", refreshAll);

  document.getElementById("txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.querySelector('input[name="type"]:checked').value;
    const date = document.getElementById("txDate").value;
    const amount = parseFloat(document.getElementById("txAmount").value);
    const note = document.getElementById("txNote").value.trim();
    const newCategoryInput = document.getElementById("txNewCategory").value.trim();
    let category = document.getElementById("txCategory").value;

    if (!date || !amount || amount <= 0) {
      alert("Tanggal dan jumlah harus diisi dengan benar.");
      return;
    }
    if (newCategoryInput) {
      category = newCategoryInput;
      addCategory(category, type);
    }

    addTransaction({ date, type, category, amount, note });
    await persist();

    document.getElementById("txAmount").value = "";
    document.getElementById("txNote").value = "";
    document.getElementById("txNewCategory").value = "";
    refreshCategorySelectForForm();
    refreshAll();
  });

  document.getElementById("exportDbBtn").addEventListener("click", exportSQLite);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);
  document.getElementById("importDbInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importSQLiteFile(file);
    e.target.value = "";
  });
}

main().catch((err) => {
  console.error(err);
  alert("Gagal memuat aplikasi. Buka Console (F12) untuk detail.");
});
