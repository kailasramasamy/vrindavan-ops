(function () {
  const API_BASE = "/rental-properties/api";
  const state = {
    properties: [],
    filteredProperties: [],
    filters: {
      propertyType: "",
      status: "",
      search: "",
    },
    isLoading: false,
  };

  const elements = {
    searchInput: document.getElementById("propertySearch"),
    typeFilter: document.getElementById("propertyTypeFilter"),
    statusFilter: document.getElementById("propertyStatusFilter"),
    tableBody: document.getElementById("propertiesTableBody"),
    loadingRow: document.getElementById("propertiesLoadingRow"),
    emptyRow: document.getElementById("propertiesEmptyRow"),
    createBtn: document.getElementById("createPropertyBtn"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!elements.tableBody) return;

    loadProperties();
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
      elements.createBtn.addEventListener("click", () => showPropertyModal());
    }
  }

  async function loadProperties() {
    state.isLoading = true;
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/properties`);
      const data = await response.json();

      if (data.success) {
        state.properties = data.properties || [];
        applyFilters();
      } else {
        showErrorToast("Failed to load properties: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading properties:", error);
      showErrorToast("Failed to load properties");
    } finally {
      state.isLoading = false;
      hideLoading();
    }
  }

  async function loadSummaryStats() {
    try {
      const response = await fetch(`${API_BASE}/properties/stats/summary`);
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
    const terminatedEl = document.getElementById("statsTerminated");
    const totalRentEl = document.getElementById("statsTotalRent");

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (inactiveEl) inactiveEl.textContent = stats.inactive || 0;
    if (terminatedEl) terminatedEl.textContent = stats.terminated || 0;
    if (totalRentEl) {
      totalRentEl.textContent = `₹${formatNumber(stats.totalMonthlyRent || 0)}`;
    }
  }

  function applyFilters() {
    state.filters.search = elements.searchInput?.value || "";
    state.filters.propertyType = elements.typeFilter?.value || "";
    state.filters.status = elements.statusFilter?.value || "";

    state.filteredProperties = state.properties.filter((prop) => {
      const matchesSearch =
        !state.filters.search ||
        prop.property_name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        prop.property_location?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        prop.owner_name?.toLowerCase().includes(state.filters.search.toLowerCase());

      const matchesType = !state.filters.propertyType || prop.property_type === state.filters.propertyType;
      const matchesStatus = !state.filters.status || prop.status === state.filters.status;

      return matchesSearch && matchesType && matchesStatus;
    });

    renderProperties();
  }

  function renderProperties() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = "";

    if (state.filteredProperties.length === 0) {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
        elements.tableBody.appendChild(elements.emptyRow);
      }
      return;
    }

    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }

    state.filteredProperties.forEach((property) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusClassMap = {
        active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        inactive: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
        terminated: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      };
      const statusClass = statusClassMap[property.status] || statusClassMap.inactive;

      row.innerHTML = `
        <td class="px-6 py-4">
          <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(property.property_name || "—")}</div>
        </td>
        <td class="px-6 py-4 text-sm text-gray-900 dark:text-white capitalize">${escapeHtml(property.property_type || "—")}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(property.property_location || "—")}</td>
        <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">₹${formatNumber(property.monthly_rent || 0)}</td>
        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(property.owner_name || "—")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${(property.status || "active").charAt(0).toUpperCase() + (property.status || "active").slice(1)}
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick="editProperty(${property.id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
              Edit
            </button>
            <button onclick="deleteProperty(${property.id})" class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium">
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

  function showPropertyModal(property = null) {
    const isEdit = !!property;
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.id = "propertyModal";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closePropertyModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${isEdit ? "Edit Property" : "Add Property"}</h3>
            <button onclick="closePropertyModal()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <form id="propertyForm" class="px-6 py-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Property Name *</label>
                <input type="text" name="property_name" required value="${property?.property_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Property Type *</label>
                <select name="property_type" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="hub" ${property?.property_type === "hub" ? "selected" : ""}>Hub</option>
                  <option value="plant" ${property?.property_type === "plant" ? "selected" : ""}>Plant</option>
                  <option value="warehouse" ${property?.property_type === "warehouse" ? "selected" : ""}>Warehouse</option>
                  <option value="office" ${property?.property_type === "office" ? "selected" : ""}>Office</option>
                  <option value="other" ${property?.property_type === "other" || !property ? "selected" : ""}>Other</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <input type="text" name="property_location" value="${property?.property_location || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Rent (₹) *</label>
              <input type="number" name="monthly_rent" step="0.01" required value="${property?.monthly_rent || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Name</label>
                <input type="text" name="owner_name" value="${property?.owner_name || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Contact</label>
                <input type="text" name="owner_contact" value="${property?.owner_contact || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lease Start Date</label>
                <input type="date" name="lease_start_date" value="${property?.lease_start_date || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lease End Date</label>
                <input type="date" name="lease_end_date" value="${property?.lease_end_date || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select name="status" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="active" ${property?.status === "active" || !property ? "selected" : ""}>Active</option>
                <option value="inactive" ${property?.status === "inactive" ? "selected" : ""}>Inactive</option>
                <option value="terminated" ${property?.status === "terminated" ? "selected" : ""}>Terminated</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea name="notes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${property?.notes || ""}</textarea>
            </div>
            <div class="flex gap-3 justify-end pt-4">
              <button type="button" onclick="closePropertyModal()" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                ${isEdit ? "Update" : "Create"} Property
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById("propertyForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const propertyData = {
        property_name: formData.get("property_name"),
        property_type: formData.get("property_type"),
        property_location: formData.get("property_location") || null,
        monthly_rent: Number(formData.get("monthly_rent")),
        owner_name: formData.get("owner_name") || null,
        owner_contact: formData.get("owner_contact") || null,
        lease_start_date: formData.get("lease_start_date") || null,
        lease_end_date: formData.get("lease_end_date") || null,
        status: formData.get("status"),
        notes: formData.get("notes") || null,
      };

      try {
        const url = isEdit ? `${API_BASE}/properties/${property.id}` : `${API_BASE}/properties`;
        const method = isEdit ? "PATCH" : "POST";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(propertyData),
        });
        const data = await response.json();

        if (data.success) {
          showSuccessToast(isEdit ? "Property updated successfully" : "Property created successfully");
          closePropertyModal();
          loadProperties();
          loadSummaryStats();
        } else {
          showErrorToast(data.error || "Failed to save property");
        }
      } catch (error) {
        console.error("Error saving property:", error);
        showErrorToast("Failed to save property");
      }
    });
  }

  window.showPropertyModal = showPropertyModal;
  window.closePropertyModal = () => {
    const modal = document.getElementById("propertyModal");
    if (modal) modal.remove();
  };

  window.editProperty = async (propertyId) => {
    try {
      const response = await fetch(`${API_BASE}/properties/${propertyId}`);
      const data = await response.json();
      if (data.success) {
        showPropertyModal(data.property);
      } else {
        showErrorToast("Failed to load property details");
      }
    } catch (error) {
      console.error("Error loading property:", error);
      showErrorToast("Failed to load property details");
    }
  };

  window.deleteProperty = async (propertyId) => {
    if (!confirm("Are you sure you want to delete this property? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/properties/${propertyId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        showSuccessToast("Property deleted successfully");
        loadProperties();
        loadSummaryStats();
      } else {
        showErrorToast(data.error || "Failed to delete property");
      }
    } catch (error) {
      console.error("Error deleting property:", error);
      showErrorToast("Failed to delete property");
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

