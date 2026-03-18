(function () {
  const API_BASE = "/payments/api/transport";
  const DEFAULT_MONTH = new Date().toISOString().slice(0, 7);
  const STORAGE_KEY = "transportPaymentsState";

  const state = {
    month: DEFAULT_MONTH,
    cycle: null,
    records: [],
    filteredRecords: [],
    filters: {
      status: "",
    },
    isLoading: false,
  };

  const elements = {
    monthInput: document.getElementById("transportPaymentsMonth"),
    statusFilter: document.getElementById("transportPaymentsStatusFilter"),
    tableBody: document.getElementById("transportPaymentsTableBody"),
    loadingRow: document.getElementById("transportPaymentsLoadingRow"),
    emptyRow: document.getElementById("transportPaymentsEmptyRow"),
    headerRange: document.getElementById("transportPaymentsHeaderRange"),
    recalculateBtn: document.getElementById("recalculateCycleBtn"),
    summary: {
      dates: document.getElementById("cycleDates"),
      vehicleCount: document.getElementById("cycleVehicleCount"),
      transportCost: document.getElementById("cycleTransportCost"),
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
      console.error("Failed to load transport payments state", error);
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
      console.error("Failed to save transport payments state", error);
    }
  }

  function init() {
    loadStateFromStorage();

    if (typeof window.TRANSPORT_PAYMENTS_DEFAULT_MONTH !== 'undefined' && window.TRANSPORT_PAYMENTS_DEFAULT_MONTH) {
      state.month = window.TRANSPORT_PAYMENTS_DEFAULT_MONTH;
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

    if (elements.recalculateBtn) {
      elements.recalculateBtn.addEventListener("click", () => {
        recalculateCycle();
      });
    }

    if (state.month) {
      loadCycleData();
    } else {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
      }
      updateCycleSummary();
    }
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
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#transportPaymentsLoadingRow):not(#transportPaymentsEmptyRow)"));
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

  async function recalculateCycle() {
    if (state.isLoading) return;

    if (!state.month) {
      showErrorToast?.("Please select a month");
      return;
    }

    state.isLoading = true;
    
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
    }
    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }
    if (elements.tableBody) {
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#transportPaymentsLoadingRow):not(#transportPaymentsEmptyRow)"));
      existingRows.forEach(row => row.remove());
    }

    try {
      const data = await fetchJSON(`${API_BASE}/cycles/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: state.month }),
      });

      if (data && data.success) {
        state.cycle = data.cycle;
        state.records = Array.isArray(data.records) ? data.records : [];
        applyFilters();
        updateCycleSummary();
      } else {
        const errorMsg = data?.error || "Failed to recalculate transport payments";
        showErrorToast?.(errorMsg);
        if (elements.emptyRow) {
          elements.emptyRow.classList.remove("hidden");
        }
      }
    } catch (error) {
      console.error("recalculateCycle error:", error);
      showErrorToast?.("Failed to recalculate transport payments: " + (error.message || "Unknown error"));
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
      }
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

    const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#transportPaymentsLoadingRow):not(#transportPaymentsEmptyRow)"));
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
      
      const monthlyCost = Number(record.monthly_cost) || 0;
      const adjustments = Number(record.total_adjustments) || 0;
      const netPay = Number(record.net_pay) || 0;

      const statusBadge = getStatusBadge(record.payment_status);

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(record.vehicle_name || "—")}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white capitalize">
          ${escapeHtml(record.vehicle_type || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(record.vehicle_number || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
          ₹${formatNumber(monthlyCost)}
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
          <a href="/payments/transport/${record.id}?month=${state.month}" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            View Details
          </a>
        </td>
      `;

      elements.tableBody.appendChild(row);
    });
  }

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
      if (elements.summary.vehicleCount) {
        elements.summary.vehicleCount.textContent = "-";
      }
      if (elements.summary.transportCost) {
        elements.summary.transportCost.textContent = "₹0.00";
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

    if (elements.summary.vehicleCount) {
      elements.summary.vehicleCount.textContent = formatNumber(cycle.total_vehicles || state.records.length || 0);
    }

    if (elements.summary.transportCost) {
      elements.summary.transportCost.textContent = `₹${formatNumber(cycle.total_transport_cost || 0)}`;
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

