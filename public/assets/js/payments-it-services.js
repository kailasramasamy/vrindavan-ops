(function () {
  const API_BASE = "/payments/api/it-services";
  const IT_SERVICES_API_BASE = "/it-services/api";
  const DEFAULT_MONTH = new Date().toISOString().slice(0, 7);
  const STORAGE_KEY = "itServicesPaymentsState";

  const state = {
    month: DEFAULT_MONTH,
    cycle: null,
    records: [],
    filteredRecords: [],
    filters: {
      status: "",
    },
    isLoading: false,
    itServices: [], // All IT services for the "Add Invoice" modal
  };

  const elements = {
    monthInput: document.getElementById("itServicesPaymentsMonth"),
    statusFilter: document.getElementById("itServicesPaymentsStatusFilter"),
    tableBody: document.getElementById("itServicesPaymentsTableBody"),
    loadingRow: document.getElementById("itServicesPaymentsLoadingRow"),
    emptyRow: document.getElementById("itServicesPaymentsEmptyRow"),
    headerRange: document.getElementById("itServicesPaymentsHeaderRange"),
    addInvoiceBtn: document.getElementById("addInvoiceBtn"),
    summary: {
      dates: document.getElementById("cycleDates"),
      invoiceCount: document.getElementById("cycleInvoiceCount"),
      invoiceAmount: document.getElementById("cycleInvoiceAmount"),
      adjustments: document.getElementById("cycleAdjustments"),
      netPay: document.getElementById("cycleNetPay"),
    },
  };

  document.addEventListener("DOMContentLoaded", init);

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (saved.month) {
          state.month = saved.month;
        }
        if (saved.filters && typeof saved.filters === "object") {
          state.filters = { ...state.filters, ...saved.filters };
        }
      }
    } catch (error) {
      console.error("Failed to load IT services payments state", error);
    }
  }

  function saveStateToStorage() {
    try {
      const payload = {
        month: state.month,
        filters: state.filters,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to save IT services payments state", error);
    }
  }

  function init() {
    loadStateFromStorage();

    if (typeof window.IT_SERVICES_PAYMENTS_DEFAULT_MONTH !== 'undefined' && window.IT_SERVICES_PAYMENTS_DEFAULT_MONTH) {
      state.month = window.IT_SERVICES_PAYMENTS_DEFAULT_MONTH;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlMonth = urlParams.get("month");
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) && urlMonth !== state.month) {
      state.month = urlMonth;
    }

    if (!state.month) {
      state.month = DEFAULT_MONTH;
    }

    if (elements.monthInput) {
      elements.monthInput.value = state.month;
      elements.monthInput.max = new Date().toISOString().slice(0, 7);
      elements.monthInput.addEventListener(
        "change",
        debounce((event) => {
          const newMonth = event.target.value || state.month;
          if (newMonth === state.month) {
            saveStateToStorage();
            return;
          }
          state.month = newMonth;
          saveStateToStorage();
          loadCycleData();
        }, 200),
      );
    }

    if (elements.statusFilter) {
      elements.statusFilter.value = state.filters.status || "";
      elements.statusFilter.addEventListener("change", (event) => {
        state.filters.status = event.target.value;
        saveStateToStorage();
        applyFilters();
      });
    }

    if (elements.addInvoiceBtn) {
      elements.addInvoiceBtn.addEventListener("click", () => {
        showAddInvoiceModal();
      });
    }

    // Load IT services for the "Add Invoice" modal
    loadItServices();

    if (state.month) {
      loadCycleData();
    } else {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
      }
      updateCycleSummary();
    }
  }

  async function loadItServices() {
    try {
      const response = await fetch(`${IT_SERVICES_API_BASE}/services?limit=500&status=active`);
      const data = await response.json();

      if (data.success) {
        state.itServices = data.services || [];
      }
    } catch (error) {
      console.error("Error loading IT services:", error);
    }
  }

  function showAddInvoiceModal(record = null) {
    const isEdit = !!record;
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.id = "invoiceModal";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" data-modal-backdrop></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${isEdit ? "Update Invoice" : "Add Invoice"}</h3>
              <button class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" data-modal-close>
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <form id="invoiceForm" class="space-y-4">
              ${!isEdit ? `
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service *</label>
                <select name="service_id" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
                  <option value="">Select a service...</option>
                  ${state.itServices.map(service => `
                    <option value="${service.id}">${escapeHtml(service.service_name)} (${escapeHtml((service.service_type || 'other').replace(/_/g, ' '))})</option>
                  `).join('')}
                </select>
              </div>
              ` : `
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service</label>
                <input type="text" value="${escapeHtml(record.service_name || "")}" disabled class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
              </div>
              `}
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Amount (₹) *</label>
                <input type="number" name="invoice_amount" step="0.01" min="0" required value="${record ? (Number(record.invoice_amount) || 0) : ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Number</label>
                <input type="text" name="invoice_number" value="${record ? (record.invoice_number || "") : ""}" placeholder="Optional" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Date</label>
                <input type="date" name="invoice_date" value="${record ? formatDateForInput(record.invoice_date) : ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
              </div>
              <div class="flex gap-3 justify-end pt-4">
                <button type="button" data-modal-close class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Cancel
                </button>
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  ${isEdit ? "Update" : "Create"} Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const backdrop = modal.querySelector("[data-modal-backdrop]");
    const closeBtns = modal.querySelectorAll("[data-modal-close]");
    const form = modal.querySelector("#invoiceForm");

    function closeModal() {
      document.body.removeChild(modal);
    }

    backdrop.addEventListener("click", closeModal);
    closeBtns.forEach(btn => btn.addEventListener("click", closeModal));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);

      if (isEdit) {
        // Update existing record
        const invoiceData = {
          invoice_amount: parseFloat(formData.get("invoice_amount")) || 0,
          invoice_number: formData.get("invoice_number")?.trim() || null,
          invoice_date: formData.get("invoice_date") || null,
        };

        try {
          const data = await fetchJSON(`${API_BASE}/records/${record.id}/invoice`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invoiceData),
          });

          if (data && data.success) {
            showSuccessToast?.("Invoice details updated successfully");
            closeModal();
            loadCycleData();
            updateCycleSummary();
          } else {
            showErrorToast?.(data?.error || "Failed to update invoice details");
          }
        } catch (error) {
          console.error("Error updating invoice:", error);
          showErrorToast?.("Failed to update invoice details");
        }
      } else {
        // Create new record
        const invoiceData = {
          month: state.month,
          service_id: parseInt(formData.get("service_id")),
          invoice_amount: parseFloat(formData.get("invoice_amount")) || 0,
          invoice_number: formData.get("invoice_number")?.trim() || null,
          invoice_date: formData.get("invoice_date") || null,
        };

        if (!invoiceData.service_id || invoiceData.invoice_amount <= 0) {
          showErrorToast?.("Please select a service and enter a valid invoice amount");
          return;
        }

        try {
          const data = await fetchJSON(`${API_BASE}/records/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invoiceData),
          });

          if (data && data.success) {
            showSuccessToast?.("Invoice created successfully");
            closeModal();
            loadCycleData();
            updateCycleSummary();
          } else {
            showErrorToast?.(data?.error || "Failed to create invoice");
          }
        } catch (error) {
          console.error("Error creating invoice:", error);
          showErrorToast?.("Failed to create invoice");
        }
      }
    });
  }

  async function loadCycleData() {
    if (!state.month) {
      return;
    }
    if (state.isLoading) {
      return;
    }

    state.cycle = null;
    state.records = [];
    state.filteredRecords = [];
    
    state.isLoading = true;
    
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
    }
    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }
    if (elements.tableBody) {
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#itServicesPaymentsLoadingRow):not(#itServicesPaymentsEmptyRow)"));
      existingRows.forEach(row => row.remove());
    }

    try {
      const data = await fetchJSON(`${API_BASE}/cycles/month?month=${encodeURIComponent(state.month)}`);
      
      if (data && data.success && data.cycle) {
        state.cycle = data.cycle;
        state.records = Array.isArray(data.records) ? data.records : [];
        applyFilters();
        updateCycleSummary();
        saveStateToStorage();
      } else if (data && data.success === false) {
        state.cycle = null;
        state.records = [];
        state.filteredRecords = [];
        if (elements.emptyRow) {
          elements.emptyRow.classList.remove("hidden");
        }
        renderRecordsTable();
        updateCycleSummary();
      } else {
        state.cycle = null;
        state.records = [];
        state.filteredRecords = [];
        if (elements.emptyRow) {
          elements.emptyRow.classList.remove("hidden");
        }
        renderRecordsTable();
        updateCycleSummary();
      }
    } catch (error) {
      console.error("loadCycleData error:", error);
      state.cycle = null;
      state.records = [];
      state.filteredRecords = [];
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
      }
      renderRecordsTable();
      updateCycleSummary();
    } finally {
      state.isLoading = false;
      if (elements.loadingRow) {
        elements.loadingRow.classList.add("hidden");
      }
    }
  }

  function applyFilters() {
    let filtered = [...state.records];

    filtered.sort((a, b) => {
      const statusA = String(a.payment_status || "").toLowerCase();
      const statusB = String(b.payment_status || "").toLowerCase();

      if (statusA === "paid" && statusB !== "paid") return -1;
      if (statusA !== "paid" && statusB === "paid") return 1;

      return statusA.localeCompare(statusB);
    });

    if (state.filters.status) {
      filtered = filtered.filter((r) => r.payment_status === state.filters.status);
    }

    state.filteredRecords = filtered;
    renderRecordsTable();
  }

  function renderRecordsTable() {
    if (!elements.tableBody) {
      return;
    }

    const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#itServicesPaymentsLoadingRow):not(#itServicesPaymentsEmptyRow)"));
    existingRows.forEach(row => row.remove());

    if (elements.loadingRow) {
      elements.loadingRow.classList.add("hidden");
    }

    if (state.filteredRecords.length === 0) {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
      }
      return;
    }

    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }

    state.filteredRecords.forEach((record) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";
      
      const invoiceAmount = Number(record.invoice_amount) || 0;
      const adjustments = Number(record.total_adjustments) || 0;
      const netPay = Number(record.net_pay) || 0;

      const statusBadge = getStatusBadge(record.payment_status);

      const serviceType = (record.service_type || "other").replace(/_/g, " ");
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(record.service_name || "—")}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 capitalize mt-0.5">${escapeHtml(serviceType)}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(record.invoice_number || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${record.invoice_date ? new Date(record.invoice_date).toLocaleDateString("en-IN") : "—"}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
          ₹${formatNumber(invoiceAmount)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm ${adjustments >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}">
          ${adjustments >= 0 ? '+' : ''}₹${formatNumber(Math.abs(adjustments))}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
          ₹${formatNumber(netPay)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${statusBadge}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <div class="flex items-center gap-2">
            <button onclick="updateInvoiceAmount(${record.id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
              Update Invoice
            </button>
            <span class="text-gray-300 dark:text-gray-600">|</span>
            <a href="/payments/it-services/${record.id}?month=${state.month}" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
              View Details
            </a>
          </div>
        </td>
      `;

      elements.tableBody.appendChild(row);
    });
  }

  window.updateInvoiceAmount = async (recordId) => {
    try {
      const response = await fetch(`${API_BASE}/records/${recordId}`);
      const data = await response.json();
      if (data.success) {
        showAddInvoiceModal(data.record);
      } else {
        showErrorToast?.("Failed to load record details");
      }
    } catch (error) {
      console.error("Error loading record:", error);
      showErrorToast?.("Failed to load record details");
    }
  };

  function getStatusBadge(status) {
    const statusMap = {
      pending: { label: "Pending", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
      ready: { label: "Ready", class: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
      paid: { label: "Paid", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
      on_hold: { label: "On Hold", class: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
      cancelled: { label: "Cancelled", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    };

    const config = statusMap[status] || statusMap.pending;
    return `<span class="px-2 py-1 text-xs font-semibold rounded-full ${config.class}">${config.label}</span>`;
  }

  function updateCycleSummary() {
    if (!state.cycle) {
      if (elements.summary.dates) {
        elements.summary.dates.textContent = "-";
      }
      if (elements.summary.invoiceCount) {
        elements.summary.invoiceCount.textContent = "-";
      }
      if (elements.summary.invoiceAmount) {
        elements.summary.invoiceAmount.textContent = "₹0.00";
      }
      if (elements.summary.adjustments) {
        elements.summary.adjustments.textContent = "₹0.00";
      }
      if (elements.summary.netPay) {
        elements.summary.netPay.textContent = "₹0.00";
      }
      if (elements.headerRange) {
        elements.headerRange.classList.add("hidden");
      }
      return;
    }

    const cycle = state.cycle;
    const startDate = cycle.start_date ? new Date(cycle.start_date) : null;
    const endDate = cycle.end_date ? new Date(cycle.end_date) : null;

    if (elements.summary.dates && startDate && endDate) {
      const startStr = startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const endStr = endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      elements.summary.dates.textContent = `${startStr} - ${endStr}`;
    }

    if (elements.summary.invoiceCount) {
      elements.summary.invoiceCount.textContent = formatNumber(cycle.total_invoices || state.records.length || 0);
    }

    if (elements.summary.invoiceAmount) {
      elements.summary.invoiceAmount.textContent = `₹${formatNumber(cycle.total_invoice_amount || 0)}`;
    }

    if (elements.summary.adjustments) {
      elements.summary.adjustments.textContent = `₹${formatNumber(cycle.total_adjustments || 0)}`;
    }

    if (elements.summary.netPay) {
      elements.summary.netPay.textContent = `₹${formatNumber(cycle.total_net_pay || 0)}`;
    }

    if (elements.headerRange && startDate && endDate) {
      const startStr = startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const endStr = endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      elements.headerRange.textContent = `${startStr} - ${endStr}`;
      elements.headerRange.classList.remove("hidden");
    }
  }

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

  function formatDateForInput(dateValue) {
    if (!dateValue) return "";
    // If it's already in yyyy-MM-dd format, return as is
    if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // If it's a datetime string, extract just the date part
    if (typeof dateValue === "string" && dateValue.includes("T")) {
      return dateValue.split("T")[0];
    }
    // If it's a Date object or can be parsed, format it
    try {
      const date = new Date(dateValue);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
        const day = `${date.getUTCDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return "";
  }

  async function fetchJSON(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        credentials: "same-origin",
      });
      
      if (response.redirected || response.status === 302 || response.status === 401) {
        throw new Error("Authentication required");
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        const text = await response.text();
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("fetchJSON error:", error);
      throw error;
    }
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
