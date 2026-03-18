(function () {
  const API_BASE = "/payments/api/employees";
  const DEFAULT_MONTH = new Date().toISOString().slice(0, 7);
  const STORAGE_KEY = "employeePaymentsState";

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
    monthInput: document.getElementById("employeePaymentsMonth"),
    statusFilter: document.getElementById("employeePaymentsStatusFilter"),
    tableBody: document.getElementById("employeePaymentsTableBody"),
    loadingRow: document.getElementById("employeePaymentsLoadingRow"),
    emptyRow: document.getElementById("employeePaymentsEmptyRow"),
    headerRange: document.getElementById("employeePaymentsHeaderRange"),
    recalculateBtn: document.getElementById("recalculateCycleBtn"),
    summary: {
      dates: document.getElementById("cycleDates"),
      employeeCount: document.getElementById("cycleEmployeeCount"),
      grossPay: document.getElementById("cycleGrossPay"),
      deductions: document.getElementById("cycleDeductions"),
      netPay: document.getElementById("cycleNetPay"),
    },
  };

  document.addEventListener("DOMContentLoaded", init);
  
  // Allow external initialization
  window.initEmployeePayments = (month) => {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      state.month = month;
      if (elements.monthInput) {
        elements.monthInput.value = month;
      }
      loadCycleData();
    }
  };

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
      console.error("Failed to load employee payments state", error);
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
      console.error("Failed to save employee payments state", error);
    }
  }

  function init() {
    loadStateFromStorage();

    // Check for default month from window variable
    if (typeof window.EMPLOYEE_PAYMENTS_DEFAULT_MONTH !== 'undefined' && window.EMPLOYEE_PAYMENTS_DEFAULT_MONTH) {
      state.month = window.EMPLOYEE_PAYMENTS_DEFAULT_MONTH;
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
          // Automatically load data when month changes
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

    // Always load data on init
    if (state.month) {
      loadCycleData();
    } else {
      // Show empty state if no month
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

    // Clear previous data immediately when loading new month
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
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#employeePaymentsLoadingRow):not(#employeePaymentsEmptyRow)"));
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
        // No cycle exists yet - show empty state
        state.cycle = null;
        state.records = [];
        state.filteredRecords = []; // Clear filtered records
        if (elements.emptyRow) {
          elements.emptyRow.classList.remove("hidden");
        }
        renderRecordsTable();
        updateCycleSummary();
      } else {
        // Unexpected response format
        state.cycle = null;
        state.records = [];
        state.filteredRecords = []; // Clear filtered records
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
      state.filteredRecords = []; // Clear filtered records
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
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#employeePaymentsLoadingRow):not(#employeePaymentsEmptyRow)"));
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
        const errorMsg = data?.error || "Failed to recalculate employee payments";
        showErrorToast?.(errorMsg);
        if (elements.emptyRow) {
          elements.emptyRow.classList.remove("hidden");
        }
      }
    } catch (error) {
      console.error("recalculateCycle error:", error);
      showErrorToast?.("Failed to recalculate employee payments: " + (error.message || "Unknown error"));
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

    // Sort records: "paid" status first, then others
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

    // Remove existing data rows
    const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#employeePaymentsLoadingRow):not(#employeePaymentsEmptyRow)"));
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
      
      const allowances = (Number(record.food_allowance) || 0) + (Number(record.fuel_allowance) || 0);
      const baseSalary = Number(record.base_salary) || 0;
      const grossSalary = Number(record.gross_salary) || 0;
      const deductions = Number(record.total_deductions) || 0;
      const additions = Number(record.total_additions) || 0;
      const netPay = Number(record.net_pay) || 0;

      // Show special status if net pay is 0
      const statusBadge = netPay === 0 
        ? getStatusBadge("zero_pay") 
        : getStatusBadge(record.payment_status);

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(record.employee_name || "—")}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
          ₹${formatNumber(baseSalary)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
          ₹${formatNumber(allowances)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
          ₹${formatNumber(grossSalary)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400">
          ₹${formatNumber(deductions)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
          <div class="flex items-center gap-2 group/netpay">
            <span>₹${formatNumber(netPay)}</span>
            <button 
              onclick="copyNetPay(this, '${netPay}')" 
              class="opacity-0 group-hover/netpay:opacity-100 transition-opacity p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              title="Copy Net Pay"
              data-original-html=""
            >
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${statusBadge}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <a href="/payments/employees/${record.id}?month=${state.month}" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            View Details
          </a>
        </td>
      `;

      elements.tableBody.appendChild(row);
    });

    // Initialize Lucide icons for copy buttons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Copy Net Pay to clipboard
  window.copyNetPay = function(button, netPayValue) {
    const netPayNum = Number(netPayValue) || 0;
    // Copy only the numeric value without rupee symbol
    const netPayText = formatNumber(netPayNum);
    
    // Store original HTML if not already stored
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    
    navigator.clipboard.writeText(netPayText).then(() => {
      // Replace with checkmark
      button.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-600 dark:text-green-400"></i>';
      
      // Reinitialize Lucide to render the new icon
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      // Restore original icon after 3 seconds (increased delay)
      setTimeout(() => {
        button.innerHTML = button.dataset.originalHtml;
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }, 3000);
    }).catch((error) => {
      console.error('Failed to copy:', error);
      showErrorToast?.('Failed to copy to clipboard');
    });
  };

  function getStatusBadge(status) {
    const statusMap = {
      pending: { label: "Pending", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
      ready: { label: "Ready", class: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
      paid: { label: "Paid", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
      on_hold: { label: "On Hold", class: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
      cancelled: { label: "Cancelled", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
      zero_pay: { label: "Zero Pay", class: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
    };

    const config = statusMap[status] || statusMap.pending;
    return `<span class="px-2 py-1 text-xs font-semibold rounded-full ${config.class}">${config.label}</span>`;
  }

  function updateCycleSummary() {
    if (!state.cycle) {
      if (elements.summary.dates) {
        elements.summary.dates.textContent = "-";
      }
      if (elements.summary.employeeCount) {
        elements.summary.employeeCount.textContent = "-";
      }
      if (elements.summary.grossPay) {
        elements.summary.grossPay.textContent = "₹0.00";
      }
      if (elements.summary.deductions) {
        elements.summary.deductions.textContent = "₹0.00";
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

    if (elements.summary.employeeCount) {
      elements.summary.employeeCount.textContent = formatNumber(cycle.total_employees || state.records.length || 0);
    }

    if (elements.summary.grossPay) {
      elements.summary.grossPay.textContent = `₹${formatNumber(cycle.total_gross_pay || 0)}`;
    }

    if (elements.summary.deductions) {
      elements.summary.deductions.textContent = `₹${formatNumber(cycle.total_deductions || 0)}`;
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
        credentials: "same-origin", // Include cookies for authentication
      });
      
      // Handle redirects (authentication required)
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

  // Toast functions (if available)
  const showSuccessToast = window.showSuccessToast || ((msg) => console.log("Success:", msg));
  const showErrorToast = window.showErrorToast || ((msg) => console.error("Error:", msg));
})();

