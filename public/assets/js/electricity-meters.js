(function () {
  const API_BASE = "/electricity-meters/api";
  const state = {
    meters: [],
    filteredMeters: [],
    filters: {
      meterType: "",
      status: "",
      search: "",
    },
    isLoading: false,
  };

  const elements = {
    searchInput: document.getElementById("searchInput"),
    typeFilter: document.getElementById("meterTypeFilter"),
    statusFilter: document.getElementById("meterStatusFilter"),
    tableBody: document.getElementById("metersTableBody"),
    loadingRow: document.getElementById("loadingRow"),
    createBtn: document.getElementById("createMeterBtn"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!elements.tableBody) return;

    loadMeters();
    loadSummaryStats();

    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", debounce(applyFilters, 300));
    }
    if (elements.typeFilter) {
      elements.typeFilter.addEventListener("change", applyFilters);
    }
    if (elements.statusFilter) {
      elements.statusFilter.addEventListener("change", applyFilters);
    }
    if (elements.createBtn) {
      elements.createBtn.addEventListener("click", () => showMeterModal());
    }
  }

  async function loadMeters() {
    state.isLoading = true;
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/meters`);
      const data = await response.json();

      if (data.success) {
        state.meters = data.meters || [];
        applyFilters();
      } else {
        showErrorToast("Failed to load meters: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading meters:", error);
      showErrorToast("Failed to load meters");
    } finally {
      state.isLoading = false;
      hideLoading();
    }
  }

  async function loadSummaryStats() {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      const data = await response.json();
      if (data.success && data.stats) {
        updateSummaryStats(data.stats);
      }
    } catch (error) {
      console.error("Error loading summary stats:", error);
    }
  }

  function updateSummaryStats(stats) {
    const totalEl = document.getElementById("statsTotal");
    const activeEl = document.getElementById("statsActive");
    const inactiveEl = document.getElementById("statsInactive");
    const disconnectedEl = document.getElementById("statsDisconnected");
    const totalTypesEl = document.getElementById("statsTotalTypes");

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (inactiveEl) inactiveEl.textContent = stats.inactive || 0;
    if (disconnectedEl) disconnectedEl.textContent = stats.disconnected || 0;
    if (totalTypesEl) totalTypesEl.textContent = stats.totalTypes || 0;
  }

  function applyFilters() {
    state.filters.search = elements.searchInput?.value || "";
    state.filters.meterType = elements.typeFilter?.value || "";
    state.filters.status = elements.statusFilter?.value || "";

    state.filteredMeters = state.meters.filter((meter) => {
      const matchesSearch =
        !state.filters.search ||
        meter.meter_name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        meter.location?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        meter.meter_number?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        meter.supplier_name?.toLowerCase().includes(state.filters.search.toLowerCase());

      const matchesType = !state.filters.meterType || meter.meter_type === state.filters.meterType;
      const matchesStatus = !state.filters.status || meter.status === state.filters.status;

      return matchesSearch && matchesType && matchesStatus;
    });

    renderMeters();
  }

  function renderMeters() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = "";

    if (state.filteredMeters.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `
        <td colspan="6" class="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No meters found
        </td>
      `;
      elements.tableBody.appendChild(emptyRow);
      return;
    }

    state.filteredMeters.forEach((meter) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusClassMap = {
        active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        inactive: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
        disconnected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      };
      const statusClass = statusClassMap[meter.status] || statusClassMap.inactive;

      row.innerHTML = `
        <td class="px-6 py-4">
          <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(meter.meter_name || "—")}</div>
          ${meter.location ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(meter.location)}</div>` : ""}
        </td>
        <td class="px-6 py-4 text-sm text-gray-900 dark:text-white capitalize">${escapeHtml((meter.meter_type || "commercial").replace(/_/g, " "))}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(meter.supplier_name || "—")}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(meter.supplier_contact || meter.supplier_phone || meter.supplier_email || "—")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${(meter.status || "active").charAt(0).toUpperCase() + (meter.status || "active").slice(1)}
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick="editMeter(${meter.id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
              Edit
            </button>
            <button onclick="deleteMeter(${meter.id})" class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium">
              Delete
            </button>
          </div>
        </td>
      `;

      elements.tableBody.appendChild(row);
    });
  }

  function showLoading() {
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
      if (elements.tableBody && !elements.tableBody.contains(elements.loadingRow)) {
        elements.tableBody.appendChild(elements.loadingRow);
      }
    }
  }

  function hideLoading() {
    if (elements.loadingRow) {
      elements.loadingRow.classList.add("hidden");
    }
  }

  function showMeterModal(meter = null) {
    const isEdit = !!meter;
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.id = "meterModal";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closeMeterModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${isEdit ? "Edit Meter" : "Add Meter"}</h3>
            <button onclick="closeMeterModal()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <form id="meterForm" class="px-6 py-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meter Name *</label>
                <input type="text" name="meter_name" required value="${meter?.meter_name || ""}" placeholder="e.g., Main Plant Meter" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meter Type *</label>
                <select name="meter_type" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="commercial" ${meter?.meter_type === "commercial" || !meter ? "selected" : ""}>Commercial</option>
                  <option value="residential" ${meter?.meter_type === "residential" ? "selected" : ""}>Residential</option>
                  <option value="industrial" ${meter?.meter_type === "industrial" ? "selected" : ""}>Industrial</option>
                  <option value="agricultural" ${meter?.meter_type === "agricultural" ? "selected" : ""}>Agricultural</option>
                  <option value="other" ${meter?.meter_type === "other" ? "selected" : ""}>Other</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                <input type="text" name="location" value="${meter?.location || ""}" placeholder="e.g., Plant 1, Hub A, Office" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meter Number</label>
                <input type="text" name="meter_number" value="${meter?.meter_number || ""}" placeholder="Meter/connection number" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier Name</label>
                <input type="text" name="supplier_name" value="${meter?.supplier_name || ""}" placeholder="Electricity board/supplier name" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier Contact</label>
                <input type="text" name="supplier_contact" value="${meter?.supplier_contact || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier Email</label>
                <input type="email" name="supplier_email" value="${meter?.supplier_email || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier Phone</label>
                <input type="tel" name="supplier_phone" value="${meter?.supplier_phone || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${meter?.description || ""}</textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select name="status" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="active" ${meter?.status === "active" || !meter ? "selected" : ""}>Active</option>
                <option value="inactive" ${meter?.status === "inactive" ? "selected" : ""}>Inactive</option>
                <option value="disconnected" ${meter?.status === "disconnected" ? "selected" : ""}>Disconnected</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea name="notes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${meter?.notes || ""}</textarea>
            </div>
            <div class="flex gap-3 justify-end pt-4">
              <button type="button" onclick="closeMeterModal()" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                ${isEdit ? "Update" : "Create"} Meter
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById("meterForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const meterData = {
        meter_name: formData.get("meter_name"),
        meter_type: formData.get("meter_type"),
        location: formData.get("location") || null,
        meter_number: formData.get("meter_number") || null,
        supplier_name: formData.get("supplier_name") || null,
        supplier_contact: formData.get("supplier_contact") || null,
        supplier_email: formData.get("supplier_email") || null,
        supplier_phone: formData.get("supplier_phone") || null,
        description: formData.get("description") || null,
        status: formData.get("status"),
        notes: formData.get("notes") || null,
      };

      try {
        const url = isEdit ? `${API_BASE}/meters/${meter.id}` : `${API_BASE}/meters`;
        const method = isEdit ? "PATCH" : "POST";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(meterData),
        });
        const data = await response.json();

        if (data.success) {
          showSuccessToast(isEdit ? "Meter updated successfully" : "Meter created successfully");
          closeMeterModal();
          loadMeters();
          loadSummaryStats();
        } else {
          showErrorToast(data.error || "Failed to save meter");
        }
      } catch (error) {
        console.error("Error saving meter:", error);
        showErrorToast("Failed to save meter");
      }
    });
  }

  window.showMeterModal = showMeterModal;
  window.closeMeterModal = () => {
    const modal = document.getElementById("meterModal");
    if (modal) modal.remove();
  };

  window.editMeter = async (meterId) => {
    try {
      const response = await fetch(`${API_BASE}/meters/${meterId}`);
      const data = await response.json();
      if (data.success) {
        showMeterModal(data.meter);
      } else {
        showErrorToast("Failed to load meter details");
      }
    } catch (error) {
      console.error("Error loading meter:", error);
      showErrorToast("Failed to load meter details");
    }
  };

  window.deleteMeter = async (meterId) => {
    if (!confirm("Are you sure you want to delete this meter? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/meters/${meterId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        showSuccessToast("Meter deleted successfully");
        loadMeters();
        loadSummaryStats();
      } else {
        showErrorToast(data.error || "Failed to delete meter");
      }
    } catch (error) {
      console.error("Error deleting meter:", error);
      showErrorToast("Failed to delete meter");
    }
  };

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const showSuccessToast = window.showSuccessToast || ((msg) => console.log("Success:", msg));
  const showErrorToast = window.showErrorToast || ((msg) => console.error("Error:", msg));
})();


