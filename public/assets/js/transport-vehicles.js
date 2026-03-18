(function () {
  const API_BASE = "/transport-vehicles/api";
  const state = {
    vehicles: [],
    filteredVehicles: [],
    filters: {
      vehicleType: "",
      status: "",
      search: "",
    },
    isLoading: false,
  };

  const elements = {
    searchInput: document.getElementById("vehicleSearch"),
    typeFilter: document.getElementById("vehicleTypeFilter"),
    statusFilter: document.getElementById("vehicleStatusFilter"),
    tableBody: document.getElementById("vehiclesTableBody"),
    loadingRow: document.getElementById("vehiclesLoadingRow"),
    emptyRow: document.getElementById("vehiclesEmptyRow"),
    createBtn: document.getElementById("createVehicleBtn"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!elements.tableBody) return;

    loadVehicles();
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
      elements.createBtn.addEventListener("click", () => showVehicleModal());
    }
  }

  async function loadVehicles() {
    state.isLoading = true;
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/vehicles`);
      const data = await response.json();

      if (data.success) {
        state.vehicles = data.vehicles || [];
        applyFilters();
      } else {
        showErrorToast("Failed to load vehicles: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading vehicles:", error);
      showErrorToast("Failed to load vehicles");
    } finally {
      state.isLoading = false;
      hideLoading();
    }
  }

  async function loadSummaryStats() {
    try {
      const response = await fetch(`${API_BASE}/vehicles/stats/summary`);
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
    const retiredEl = document.getElementById("statsRetired");
    const totalCostEl = document.getElementById("statsTotalCost");

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (inactiveEl) inactiveEl.textContent = stats.inactive || 0;
    if (retiredEl) retiredEl.textContent = stats.retired || 0;
    if (totalCostEl) {
      totalCostEl.textContent = `₹${formatNumber(stats.totalMonthlyCost || 0)}`;
    }
  }

  function applyFilters() {
    state.filters.search = elements.searchInput?.value || "";
    state.filters.vehicleType = elements.typeFilter?.value || "";
    state.filters.status = elements.statusFilter?.value || "";

    state.filteredVehicles = state.vehicles.filter((vehicle) => {
      const matchesSearch =
        !state.filters.search ||
        vehicle.vehicle_name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        vehicle.vehicle_number?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        vehicle.owner_name?.toLowerCase().includes(state.filters.search.toLowerCase());

      const matchesType = !state.filters.vehicleType || vehicle.vehicle_type === state.filters.vehicleType;
      const matchesStatus = !state.filters.status || vehicle.status === state.filters.status;

      return matchesSearch && matchesType && matchesStatus;
    });

    renderVehicles();
  }

  function renderVehicles() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = "";

    if (state.filteredVehicles.length === 0) {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
        elements.tableBody.appendChild(elements.emptyRow);
      }
      return;
    }

    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }

    state.filteredVehicles.forEach((vehicle) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusClassMap = {
        active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        inactive: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
        retired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      };
      const statusClass = statusClassMap[vehicle.status] || statusClassMap.inactive;

      row.innerHTML = `
        <td class="px-6 py-4">
          <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(vehicle.vehicle_name || "—")}</div>
        </td>
        <td class="px-6 py-4 text-sm text-gray-900 dark:text-white capitalize">${escapeHtml(vehicle.vehicle_type || "—")}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(vehicle.vehicle_number || "—")}</td>
        <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">₹${formatNumber(vehicle.monthly_cost || 0)}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(vehicle.owner_name || "—")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${(vehicle.status || "active").charAt(0).toUpperCase() + (vehicle.status || "active").slice(1)}
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick="editVehicle(${vehicle.id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
              Edit
            </button>
            <button onclick="deleteVehicle(${vehicle.id})" class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium">
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

  function showVehicleModal(vehicle = null) {
    const isEdit = !!vehicle;
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.id = "vehicleModal";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closeVehicleModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${isEdit ? "Edit Vehicle" : "Add Vehicle"}</h3>
            <button onclick="closeVehicleModal()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <form id="vehicleForm" class="px-6 py-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Name *</label>
                <input type="text" name="vehicle_name" required value="${vehicle?.vehicle_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Type *</label>
                <select name="vehicle_type" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="truck" ${vehicle?.vehicle_type === "truck" ? "selected" : ""}>Truck</option>
                  <option value="van" ${vehicle?.vehicle_type === "van" ? "selected" : ""}>Van</option>
                  <option value="car" ${vehicle?.vehicle_type === "car" ? "selected" : ""}>Car</option>
                  <option value="bike" ${vehicle?.vehicle_type === "bike" ? "selected" : ""}>Bike</option>
                  <option value="other" ${vehicle?.vehicle_type === "other" || !vehicle ? "selected" : ""}>Other</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Number</label>
                <input type="text" name="vehicle_number" value="${vehicle?.vehicle_number || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="License plate/Registration">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Cost (₹) *</label>
                <input type="number" name="monthly_cost" step="0.01" required value="${vehicle?.monthly_cost || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Name</label>
                <input type="text" name="owner_name" value="${vehicle?.owner_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Contact</label>
                <input type="text" name="owner_contact" value="${vehicle?.owner_contact || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select name="status" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="active" ${vehicle?.status === "active" || !vehicle ? "selected" : ""}>Active</option>
                <option value="inactive" ${vehicle?.status === "inactive" ? "selected" : ""}>Inactive</option>
                <option value="retired" ${vehicle?.status === "retired" ? "selected" : ""}>Retired</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea name="notes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${vehicle?.notes || ""}</textarea>
            </div>
            <div class="flex gap-3 justify-end pt-4">
              <button type="button" onclick="closeVehicleModal()" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                ${isEdit ? "Update" : "Create"} Vehicle
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById("vehicleForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const vehicleData = {
        vehicle_name: formData.get("vehicle_name"),
        vehicle_type: formData.get("vehicle_type"),
        vehicle_number: formData.get("vehicle_number") || null,
        monthly_cost: Number(formData.get("monthly_cost")),
        owner_name: formData.get("owner_name") || null,
        owner_contact: formData.get("owner_contact") || null,
        status: formData.get("status"),
        notes: formData.get("notes") || null,
      };

      try {
        const url = isEdit ? `${API_BASE}/vehicles/${vehicle.id}` : `${API_BASE}/vehicles`;
        const method = isEdit ? "PATCH" : "POST";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vehicleData),
        });
        const data = await response.json();

        if (data.success) {
          showSuccessToast(isEdit ? "Vehicle updated successfully" : "Vehicle created successfully");
          closeVehicleModal();
          loadVehicles();
          loadSummaryStats();
        } else {
          showErrorToast(data.error || "Failed to save vehicle");
        }
      } catch (error) {
        console.error("Error saving vehicle:", error);
        showErrorToast("Failed to save vehicle");
      }
    });
  }

  window.showVehicleModal = showVehicleModal;
  window.closeVehicleModal = () => {
    const modal = document.getElementById("vehicleModal");
    if (modal) modal.remove();
  };

  window.editVehicle = async (vehicleId) => {
    try {
      const response = await fetch(`${API_BASE}/vehicles/${vehicleId}`);
      const data = await response.json();
      if (data.success) {
        showVehicleModal(data.vehicle);
      } else {
        showErrorToast("Failed to load vehicle details");
      }
    } catch (error) {
      console.error("Error loading vehicle:", error);
      showErrorToast("Failed to load vehicle details");
    }
  };

  window.deleteVehicle = async (vehicleId) => {
    if (!confirm("Are you sure you want to delete this vehicle? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/vehicles/${vehicleId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        showSuccessToast("Vehicle deleted successfully");
        loadVehicles();
        loadSummaryStats();
      } else {
        showErrorToast(data.error || "Failed to delete vehicle");
      }
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      showErrorToast("Failed to delete vehicle");
    }
  };

  function formatNumber(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

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

