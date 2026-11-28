/* ============================================================
   Small UI helpers: toast notifications + modal dialogs
   (replacements for the browser's native alert/confirm/prompt,
   styled to match CashDiary instead of looking like a system popup)
   ============================================================ */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function ensureUiRoots() {
  if (!document.getElementById("toastRoot")) {
    const toastRoot = document.createElement("div");
    toastRoot.id = "toastRoot";
    toastRoot.className = "toast-root";
    document.body.appendChild(toastRoot);
  }
  if (!document.getElementById("modalRoot")) {
    const modalRoot = document.createElement("div");
    modalRoot.id = "modalRoot";
    document.body.appendChild(modalRoot);
  }
}

function toast(message, type = "info", duration = 3200) {
  ensureUiRoots();
  const root = document.getElementById("toastRoot");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  }, duration);
}

function closeModal(backdrop) {
  backdrop.classList.remove("show");
  setTimeout(() => backdrop.remove(), 150);
  document.removeEventListener("keydown", backdrop._escHandler);
}

function showConfirmDialog({ title = "Konfirmasi", message, confirmText = "Ya", cancelText = "Batal", danger = false }) {
  ensureUiRoots();
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-action="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.getElementById("modalRoot").appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("show"));

    function finish(result) {
      closeModal(backdrop);
      resolve(result);
    }

    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => finish(true));
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => finish(false));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    backdrop._escHandler = (e) => {
      if (e.key === "Escape") finish(false);
    };
    document.addEventListener("keydown", backdrop._escHandler);
    backdrop.querySelector('[data-action="confirm"]').focus();
  });
}

function showPromptDialog({ title = "Masukkan nilai", message = "", placeholder = "", defaultValue = "", confirmText = "Simpan", cancelText = "Batal" }) {
  ensureUiRoots();
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        ${message ? `<p>${escapeHtml(message)}</p>` : ""}
        <input type="text" class="modal-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-action="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn-primary" data-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.getElementById("modalRoot").appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("show"));

    const input = backdrop.querySelector(".modal-input");

    function finish(result) {
      closeModal(backdrop);
      resolve(result);
    }

    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => finish(input.value));
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => finish(null));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value);
      if (e.key === "Escape") finish(null);
    });
    backdrop._escHandler = (e) => {
      if (e.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", backdrop._escHandler);

    input.focus();
    input.select();
  });
}
