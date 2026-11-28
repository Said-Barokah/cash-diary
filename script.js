/* ============================================================
   CashDiary — Mode Keluarga
   - Database: Firebase Firestore (online, real-time)
   - Data dikelompokkan per "kode keluarga": households/{KODE}/...
   - Login: Firebase Anonymous Auth (tidak terlihat oleh pengguna)
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- GANTI dengan konfigurasi Firebase project Anda sendiri ----------
   Didapat dari: Firebase Console -> Project settings -> Your apps -> (ikon </>) */
const firebaseConfig = {
  apiKey: "AIzaSyD3FNAkJLeUTEJCw5JcyO_b7fUzd6Uf7-E",
  authDomain: "cashdiary-37d39.firebaseapp.com",
  projectId: "cashdiary-37d39",
  storageBucket: "cashdiary-37d39.firebasestorage.app",
  messagingSenderId: "578788377567",
  appId: "1:578788377567:web:ee53aa7b5e749697657a6a",
};
/* ------------------------------------------------------------------------- */

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const FAMILY_CODE_KEY = "cashdiary-family-code";
const DEFAULT_CATEGORIES = [
  ["Makan", "expense"],
  ["Bensin/Transport", "expense"],
  ["Jajan", "expense"],
  ["Lainnya", "expense"],
  ["Gaji", "income"],
  ["Lainnya", "income"],
];

let familyCode = localStorage.getItem(FAMILY_CODE_KEY);
let txCache = [];
let catCache = [];
let unsubTx = null;
let unsubCat = null;

/* ---------- Family code helpers ---------- */

function generateFamilyCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

function householdCollection(sub) {
  return collection(db, "households", familyCode, sub);
}

async function ensureDefaultCategories() {
  const snap = await getDocs(householdCollection("categories"));
  if (!snap.empty) return;
  for (const [name, type] of DEFAULT_CATEGORIES) {
    await addDoc(householdCollection("categories"), { name, type });
  }
}

function attachListeners() {
  if (unsubTx) unsubTx();
  if (unsubCat) unsubCat();

  unsubTx = onSnapshot(householdCollection("transactions"), (snap) => {
    txCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshAll();
  });

  unsubCat = onSnapshot(householdCollection("categories"), (snap) => {
    catCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshCategorySelectForForm();
    refreshCategoryFilterOptions();
  });
}

function detachListeners() {
  if (unsubTx) unsubTx();
  if (unsubCat) unsubCat();
  unsubTx = null;
  unsubCat = null;
}

/* ---------- Data access (Firestore) ---------- */

async function addTransaction({ date, type, category, amount, note }) {
  await addDoc(householdCollection("transactions"), {
    date,
    type,
    category,
    amount,
    note: note || "",
    createdAtMs: Date.now(),
  });
}

async function deleteTransactionById(id) {
  await deleteDoc(doc(db, "households", familyCode, "transactions", id));
}

async function addCategory(name, type) {
  const exists = catCache.some((c) => c.name === name && c.type === type);
  if (!exists) await addDoc(householdCollection("categories"), { name, type });
}

function getCategories(type) {
  return catCache
    .filter((c) => c.type === type)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
}

function getAllCategoryNames() {
  return [...new Set(catCache.map((c) => c.name))].sort((a, b) => a.localeCompare(b));
}

function getFilteredTransactions(filter) {
  let rows = txCache.slice();
  if (filter.from) rows = rows.filter((r) => r.date >= filter.from);
  if (filter.to) rows = rows.filter((r) => r.date <= filter.to);
  if (filter.category && filter.category !== "all") {
    rows = rows.filter((r) => r.category === filter.category);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return rows;
}

function monthlyTotalsJS(months) {
  const map = {};
  txCache.forEach((r) => {
    const ym = r.date.slice(0, 7);
    const key = ym + "|" + r.type;
    map[key] = (map[key] || 0) + r.amount;
  });
  return months.map((ym) => ({
    ym,
    income: map[ym + "|income"] || 0,
    expense: map[ym + "|expense"] || 0,
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
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
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
  const rows = getFilteredTransactions(filter).filter((r) => r.type === "expense");
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
  const data = monthlyTotalsJS(months);
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
      const id = btn.dataset.id;
      const ok = await showConfirmDialog({
        title: "Hapus transaksi?",
        message: "Transaksi ini akan dihapus permanen untuk semua yang pakai kode keluarga ini.",
        confirmText: "Hapus",
        danger: true,
      });
      if (!ok) return;
      await deleteTransactionById(id);
      refreshAll();
      toast("Transaksi dihapus.", "success");
    });
  });
}

function refreshAll() {
  const filter = getActiveFilter();
  const rows = getFilteredTransactions(filter);
  renderSummary(rows);
  renderTable(rows);
  renderCharts();
}

/* ---------- Export CSV ---------- */

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

function exportCSV() {
  const rows = txCache.slice().sort((a, b) => b.date.localeCompare(a.date));
  const header = ["date", "type", "category", "amount", "note"];
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
    `cashdiary-${familyCode}-${toISODate(new Date())}.csv`
  );
}

/* ---------- Family code gate ---------- */

async function joinFamilyCode(code) {
  familyCode = code.trim().toUpperCase();
  localStorage.setItem(FAMILY_CODE_KEY, familyCode);

  document.getElementById("codeGate").hidden = true;
  document.getElementById("appMain").hidden = false;
  document.getElementById("familyCodeDisplay").textContent = familyCode;

  await ensureDefaultCategories();
  attachListeners();

  document.getElementById("txDate").value = toISODate(new Date());
  refreshFilterUI();
}

function leaveFamilyCode() {
  detachListeners();
  localStorage.removeItem(FAMILY_CODE_KEY);
  familyCode = null;
  txCache = [];
  catCache = [];

  document.getElementById("appMain").hidden = true;
  document.getElementById("codeGate").hidden = false;
  document.getElementById("joinCodeInput").value = "";
}

/* ---------- Wiring ---------- */

async function main() {
  initThemeToggle();
  await signInAnonymously(auth);

  document.getElementById("createCodeBtn").addEventListener("click", async () => {
    const code = generateFamilyCode();
    try {
      await navigator.clipboard.writeText(code);
    } catch (e) {
      /* clipboard access may be blocked; user can still read/copy it from the dialog */
    }
    const ok = await showConfirmDialog({
      title: "Kode keluarga baru dibuat",
      message: `Kode Anda:\n\n${code}\n\n(sudah disalin ke clipboard)\n\nBagikan kode ini ke pasangan Anda supaya bisa gabung melihat data yang sama. Kode ini tidak bisa diubah lagi setelah dibuat.`,
      confirmText: "Lanjut, mulai pakai",
      cancelText: "Batal",
    });
    if (!ok) return;
    await joinFamilyCode(code);
    toast(`Kode keluarga "${code}" aktif.`, "success");
  });

  document.getElementById("joinCodeBtn").addEventListener("click", async () => {
    const val = document.getElementById("joinCodeInput").value.trim();
    if (!val) {
      toast("Masukkan kode keluarga dulu.", "error");
      return;
    }
    await joinFamilyCode(val);
    toast(`Bergabung ke kode "${val.toUpperCase()}".`, "success");
  });

  document.getElementById("leaveCodeBtn").addEventListener("click", async () => {
    const ok = await showConfirmDialog({
      title: "Ganti kode keluarga?",
      message: "Anda akan keluar dari kode ini di device ini. Untuk masuk lagi nanti, Anda perlu memasukkan kodenya lagi.",
      confirmText: "Ganti",
      danger: true,
    });
    if (!ok) return;
    leaveFamilyCode();
  });

  document.getElementById("copyCodeBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(familyCode);
      toast("Kode disalin.", "success");
    } catch (e) {
      toast("Tidak bisa menyalin otomatis. Salin manual dari layar.", "error");
    }
  });

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
      toast("Tanggal dan jumlah harus diisi dengan benar.", "error");
      return;
    }
    if (newCategoryInput) {
      category = newCategoryInput;
      await addCategory(category, type);
    }

    await addTransaction({ date, type, category, amount, note });

    document.getElementById("txAmount").value = "";
    document.getElementById("txNote").value = "";
    document.getElementById("txNewCategory").value = "";
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

  if (familyCode) {
    await joinFamilyCode(familyCode);
  } else {
    document.getElementById("codeGate").hidden = false;
  }
}

main().catch((err) => {
  console.error(err);
  toast("Gagal memuat aplikasi. Buka Console (F12) untuk detail.", "error", 8000);
});
