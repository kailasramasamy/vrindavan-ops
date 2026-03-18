(function () {
  const API_BASE = "/it-services/api";
  const state = {
    services: [],
    filteredServices: [],
    filters: {
      serviceType: "",
      status: "",
      search: "",
    },
    isLoading: false,
  };

  const elements = {
    searchInput: document.getElementById("searchInput"),
    typeFilter: document.getElementById("serviceTypeFilter"),
    statusFilter: document.getElementById("serviceStatusFilter"),
    tableBody: document.getElementById("servicesTableBody"),
    loadingRow: document.getElementById("loadingRow"),
    createBtn: document.getElementById("createServiceBtn"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!elements.tableBody) return;

    loadServices();
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
      elements.createBtn.addEventListener("click", () => showServiceModal());
    }
  }

  async function loadServices() {
    state.isLoading = true;
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/services`);
      const data = await response.json();

      if (data.success) {
        state.services = data.services || [];
        applyFilters();
      } else {
        showErrorToast("Failed to load services: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading services:", error);
      showErrorToast("Failed to load services");
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
    const discontinuedEl = document.getElementById("statsDiscontinued");
    const totalTypesEl = document.getElementById("statsTotalTypes");

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (inactiveEl) inactiveEl.textContent = stats.inactive || 0;
    if (discontinuedEl) discontinuedEl.textContent = stats.discontinued || 0;
    if (totalTypesEl) totalTypesEl.textContent = stats.totalTypes || 0;
  }

  function applyFilters() {
    state.filters.search = elements.searchInput?.value || "";
    state.filters.serviceType = elements.typeFilter?.value || "";
    state.filters.status = elements.statusFilter?.value || "";

    state.filteredServices = state.services.filter((service) => {
      const matchesSearch =
        !state.filters.search ||
        service.service_name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        service.vendor_name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        service.vendor_contact?.toLowerCase().includes(state.filters.search.toLowerCase());

      const matchesType = !state.filters.serviceType || service.service_type === state.filters.serviceType;
      const matchesStatus = !state.filters.status || service.status === state.filters.status;

      return matchesSearch && matchesType && matchesStatus;
    });

    renderServices();
  }

  function renderServices() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = "";

    if (state.filteredServices.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `
        <td colspan="6" class="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No services found
        </td>
      `;
      elements.tableBody.appendChild(emptyRow);
      return;
    }

    state.filteredServices.forEach((service) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusClassMap = {
        active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        inactive: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
        discontinued: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      };
      const statusClass = statusClassMap[service.status] || statusClassMap.inactive;

      row.innerHTML = `
        <td class="px-6 py-4">
          <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(service.service_name || "—")}</div>
        </td>
        <td class="px-6 py-4 text-sm text-gray-900 dark:text-white capitalize">${escapeHtml((service.service_type || "other").replace(/_/g, " "))}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(service.vendor_name || "—")}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(service.vendor_contact || service.vendor_phone || service.vendor_email || "—")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${(service.status || "active").charAt(0).toUpperCase() + (service.status || "active").slice(1)}
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick="editService(${service.id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
              Edit
            </button>
            <button onclick="deleteService(${service.id})" class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium">
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

  function showServiceModal(service = null) {
    const isEdit = !!service;
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.id = "serviceModal";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closeServiceModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${isEdit ? "Edit Service" : "Add Service"}</h3>
            <button onclick="closeServiceModal()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <form id="serviceForm" class="px-6 py-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Name *</label>
                <input type="text" name="service_name" required value="${service?.service_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Type *</label>
                <select name="service_type" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="software" ${service?.service_type === "software" ? "selected" : ""}>Software</option>
                  <option value="hardware" ${service?.service_type === "hardware" ? "selected" : ""}>Hardware</option>
                  <option value="cloud" ${service?.service_type === "cloud" ? "selected" : ""}>Cloud</option>
                  <option value="maintenance" ${service?.service_type === "maintenance" ? "selected" : ""}>Maintenance</option>
                  <option value="support" ${service?.service_type === "support" ? "selected" : ""}>Support</option>
                  <option value="other" ${service?.service_type === "other" || !service ? "selected" : ""}>Other</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor Name</label>
                <input type="text" name="vendor_name" value="${service?.vendor_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor Contact</label>
                <input type="text" name="vendor_contact" value="${service?.vendor_contact || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor Email</label>
                <input type="email" name="vendor_email" value="${service?.vendor_email || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor Phone</label>
                <input type="tel" name="vendor_phone" value="${service?.vendor_phone || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${service?.description || ""}</textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select name="status" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="active" ${service?.status === "active" || !service ? "selected" : ""}>Active</option>
                <option value="inactive" ${service?.status === "inactive" ? "selected" : ""}>Inactive</option>
                <option value="discontinued" ${service?.status === "discontinued" ? "selected" : ""}>Discontinued</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea name="notes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${service?.notes || ""}</textarea>
            </div>
            <div class="flex gap-3 justify-end pt-4">
              <button type="button" onclick="closeServiceModal()" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                ${isEdit ? "Update" : "Create"} Service
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById("serviceForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const serviceData = {
        service_name: formData.get("service_name"),
        service_type: formData.get("service_type"),
        vendor_name: formData.get("vendor_name") || null,
        vendor_contact: formData.get("vendor_contact") || null,
        vendor_email: formData.get("vendor_email") || null,
        vendor_phone: formData.get("vendor_phone") || null,
        description: formData.get("description") || null,
        status: formData.get("status"),
        notes: formData.get("notes") || null,
      };

      try {
        const url = isEdit ? `${API_BASE}/services/${service.id}` : `${API_BASE}/services`;
        const method = isEdit ? "PATCH" : "POST";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serviceData),
        });
        const data = await response.json();

        if (data.success) {
          showSuccessToast(isEdit ? "Service updated successfully" : "Service created successfully");
          closeServiceModal();
          loadServices();
          loadSummaryStats();
        } else {
          showErrorToast(data.error || "Failed to save service");
        }
      } catch (error) {
        console.error("Error saving service:", error);
        showErrorToast("Failed to save service");
      }
    });
  }

  window.showServiceModal = showServiceModal;
  window.closeServiceModal = () => {
    const modal = document.getElementById("serviceModal");
    if (modal) modal.remove();
  };

  window.editService = async (serviceId) => {
    try {
      const response = await fetch(`${API_BASE}/services/${serviceId}`);
      const data = await response.json();
      if (data.success) {
        showServiceModal(data.service);
      } else {
        showErrorToast("Failed to load service details");
      }
    } catch (error) {
      console.error("Error loading service:", error);
      showErrorToast("Failed to load service details");
    }
  };

  window.deleteService = async (serviceId) => {
    if (!confirm("Are you sure you want to delete this service? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/services/${serviceId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        showSuccessToast("Service deleted successfully");
        loadServices();
        loadSummaryStats();
      } else {
        showErrorToast(data.error || "Failed to delete service");
      }
    } catch (error) {
      console.error("Error deleting service:", error);
      showErrorToast("Failed to delete service");
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

