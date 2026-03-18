/**
 * Wallet Accounting Frontend JavaScript
 * Handles interactive features for wallet liability reconciliation
 */

const walletAccounting = (() => {
  let chart = null;

  let summaryModal;
  let summaryRangeEl;
  let summaryDaysEl;
  let summaryReconciledEl;
  let summaryRechargesEl;
  let summaryTransactionsEl;
  let summarySalesEl;
  let summaryOrdersEl;
  let summaryMismatchCountEl;
  let summaryMismatchListEl;

  let openingModal;
  let openingForm;
  let openingStartDateInput;
  let openingAmountInput;
  let openingNoteInput;
  let openingSubmitBtn;
  let openingMessageEl;
  let openingTriggerBtn;
  let openingCloseBtn;

  let reconciliationTableBody;
  let reconciliationRangeSummaryEl;
  let reconciliationCountEl;
  let reconciliationPageInfoEl;
  let reconciliationPrevBtn;
  let reconciliationNextBtn;
  let reconciliationStartInput;
  let reconciliationEndInput;
  let reconciliationApplyBtn;
  let reconciliationResetBtn;

  let adjustmentModal;
  let adjustmentForm;
  let adjustmentDateInput;
  let adjustmentAmountInput;
  let adjustmentReasonInput;
  let adjustmentNotesInput;
  let adjustmentSubmitBtn;
  let adjustmentFormMessageEl;
  let adjustmentsTableBody;
  let adjustmentsList = [];

  let downloadCsvButton;
  let downloadCsvSpinner;

  const reconciliationState = {
    items: [],
    filtered: [],
    page: 1,
    pageSize: 10,
    filterStart: null,
    filterEnd: null,
    initialStartValue: "",
    initialEndValue: "",
  };

  function init() {
    summaryModal = document.getElementById("syncSummaryModal");
    summaryRangeEl = document.getElementById("syncSummaryRange");
    summaryDaysEl = document.getElementById("syncSummaryDays");
    summaryReconciledEl = document.getElementById("syncSummaryReconciled");
    summaryRechargesEl = document.getElementById("syncSummaryRecharges");
    summaryTransactionsEl = document.getElementById("syncSummaryTransactions");
    summarySalesEl = document.getElementById("syncSummarySales");
    summaryOrdersEl = document.getElementById("syncSummaryOrders");
    summaryMismatchCountEl = document.getElementById("syncSummaryMismatchCount");
    summaryMismatchListEl = document.getElementById("syncSummaryMismatches");

    openingModal = document.getElementById("openingBalanceModal");
    openingForm = document.getElementById("openingBalanceForm");
    openingStartDateInput = document.getElementById("openingStartDate");
    openingAmountInput = document.getElementById("openingAmount");
    openingNoteInput = document.getElementById("openingNote");
    openingSubmitBtn = document.getElementById("openingBalanceSubmit");
    openingMessageEl = document.getElementById("openingBalanceMessage");
    openingTriggerBtn = document.getElementById("openOpeningBalanceModal");
    openingCloseBtn = document.getElementById("openingBalanceCloseBtn");

    adjustmentModal = document.getElementById("adjustmentModal");
    adjustmentForm = document.getElementById("walletAdjustmentForm");
    adjustmentDateInput = document.getElementById("adjustmentDate");
    adjustmentAmountInput = document.getElementById("adjustmentAmount");
    adjustmentReasonInput = document.getElementById("adjustmentReason");
    adjustmentNotesInput = document.getElementById("adjustmentNotes");
    adjustmentSubmitBtn = document.getElementById("adjustmentSubmitBtn");
    adjustmentFormMessageEl = document.getElementById("adjustmentFormMessage");
    adjustmentsTableBody = document.getElementById("walletAdjustmentsTable");

    downloadCsvButton = document.getElementById("downloadCsvButton");
    downloadCsvSpinner = document.getElementById("downloadCsvSpinner");

    reconciliationTableBody = document.getElementById("reconciliationTableBody");
    reconciliationRangeSummaryEl = document.getElementById("reconciliationRangeSummary");
    reconciliationCountEl = document.getElementById("reconciliationCount");
    reconciliationPageInfoEl = document.getElementById("reconciliationPageInfo");
    reconciliationPrevBtn = document.getElementById("reconciliationPrevBtn");
    reconciliationNextBtn = document.getElementById("reconciliationNextBtn");
    reconciliationStartInput = document.getElementById("reconciliationFilterStart");
    reconciliationEndInput = document.getElementById("reconciliationFilterEnd");
    reconciliationApplyBtn = document.getElementById("reconciliationApplyBtn");
    reconciliationResetBtn = document.getElementById("reconciliationResetBtn");

    initChart();
    setupEventListeners();
    initReconciliationSection();

    adjustmentsList = Array.isArray(window.walletAccountingData?.adjustments)
      ? window.walletAccountingData.adjustments
      : [];
    renderAdjustmentsTable();
  }

  function setupEventListeners() {
    // Apply filter button
    const applyBtn = document.querySelector('[onclick="walletAccounting.applyFilter()"]');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyFilter);
    }

    if (openingTriggerBtn) {
      openingTriggerBtn.addEventListener("click", showOpeningBalanceModal);
    }

    if (openingForm) {
      openingForm.addEventListener("submit", handleOpeningBalanceSubmit);
    }

    if (reconciliationApplyBtn) {
      reconciliationApplyBtn.addEventListener("click", handleReconciliationApply);
    }

    if (reconciliationResetBtn) {
      reconciliationResetBtn.addEventListener("click", handleReconciliationReset);
    }

    if (reconciliationPrevBtn) {
      reconciliationPrevBtn.addEventListener("click", () => changeReconciliationPage(-1));
    }

    if (reconciliationNextBtn) {
      reconciliationNextBtn.addEventListener("click", () => changeReconciliationPage(1));
    }

    if (adjustmentForm) {
      adjustmentForm.addEventListener("submit", handleAdjustmentSubmit);
    }
  }

  function initChart() {
    const ctx = document.getElementById("trendChart");
    if (!ctx) return;

    const data = window.walletAccountingData?.trend || [];
    
    const labels = data.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    });

    const rechargesData = data.map(item => parseFloat(item.recharges || 0));
    const revenueData = data.map(item => parseFloat(item.revenue || 0));
    const liabilityData = data.map(item => parseFloat(item.closing_balance || 0));

    // Detect theme immediately with explicit colors
    const isDark = document.documentElement.classList.contains("dark");
    const lightColor = 'rgba(209, 213, 219, 0.85)'; // gray-300 with transparency
    const darkColor = 'rgba(55, 65, 81, 0.65)'; // gray-700 with transparency
    const lightAxis = 'rgba(148, 163, 184, 0.85)'; // slate-400
    const darkAxis = 'rgba(71, 85, 105, 0.65)'; // slate-500

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Wallet Recharges',
            data: rechargesData,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            fill: true,
            yAxisID: 'y',
          },
          {
            label: 'Sales Revenue',
            data: revenueData,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.3,
            fill: true,
            yAxisID: 'y',
          },
          {
            label: 'Wallet Liability',
            data: liabilityData,
            borderColor: 'rgb(168, 85, 247)',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            tension: 0.3,
            fill: false,
            yAxisID: 'y1',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
              color: isDark ? lightColor : darkColor,
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                label += '₹' + formatNumber(context.parsed.y);
                return label;
              },
            },
          },
        },
        scales: {
          y: {
            type: "linear",
            display: true,
            position: "left",
            title: {
              display: true,
              text: "Daily Amount (₹)",
              color: isDark ? lightColor : darkColor,
            },
            ticks: {
              callback: function (value) {
                return "₹" + formatNumber(value);
              },
              color: isDark ? lightColor : darkColor,
            },
            grid: {
              color: isDark ? 'rgba(203, 213, 225, 0.25)' : 'rgba(100, 116, 139, 0.1)',
            },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            title: {
              display: true,
              text: "Wallet Liability (₹)",
              color: isDark ? lightColor : darkColor,
            },
            ticks: {
              callback: function (value) {
                return "₹" + formatNumber(value);
              },
              color: isDark ? lightColor : darkColor,
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          x: {
            ticks: {
              color: isDark ? lightColor : darkColor,
            },
            grid: {
              color: isDark ? 'rgba(203, 213, 225, 0.25)' : 'rgba(100, 116, 139, 0.1)',
            },
          },
        },
      },
    });

    // Update chart colors when theme changes
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateChartTheme);
    }
    
    // Also listen for manual theme toggle
    const themeObserver = new MutationObserver(() => updateChartTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  function updateChartTheme() {
    if (!chart) return;
    
    const isDark = document.documentElement.classList.contains("dark");
    const lightColor = 'rgba(209, 213, 219, 0.85)';
    const darkColor = 'rgba(55, 65, 81, 0.65)';
    const lightAxis = 'rgba(148, 163, 184, 0.85)';
    const darkAxis = 'rgba(71, 85, 105, 0.65)';
    const textColor = isDark ? lightColor : darkColor;
    const axisColor = isDark ? lightColor : darkAxis;
    const axisTitle = isDark ? lightAxis : darkAxis;
    const gridColor = isDark ? 'rgba(203, 213, 225, 0.18)' : 'rgba(148, 163, 184, 0.12)';

    chart.options.plugins.legend.labels.color = textColor;
    chart.options.scales.y.title.color = axisTitle;
    chart.options.scales.y.ticks.color = axisColor;
    chart.options.scales.y.grid.color = gridColor;
    chart.options.scales.y1.title.color = axisTitle;
    chart.options.scales.y1.ticks.color = axisColor;
    chart.options.scales.x.ticks.color = axisColor;
    chart.options.scales.x.grid.color = gridColor;
    chart.update('none'); // Update without animation for instant change
  }

  function getAxisColor() {
    const isDark = document.documentElement.classList.contains("dark") ||
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;

    return isDark ? "rgba(243, 244, 246, 0.95)" : "rgba(55, 65, 81, 0.85)";
  }

  function getGridColor() {
    const isDark = document.documentElement.classList.contains("dark") ||
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;

    return isDark ? "rgba(203, 213, 225, 0.2)" : "rgba(100, 116, 139, 0.08)";
  }

  function formatNumber(value, decimals = 2) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) {
      return Number(0).toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    return num.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, type = 'info') {
    // Use the global toast manager if available
    if (window.toastManager) {
      window.toastManager.show(message, type);
      return;
    }

    // Fallback: try window.showToast
    if (window.showToast) {
      window.showToast("", message, type);
      return;
    }

    // Fallback: try window.utils.showToast
    if (window.utils && window.utils.showToast) {
      window.utils.showToast(message, type);
      return;
    }

    // If toast system is not available, log to console (no alert)
    console.log(`[Toast ${type}]: ${message}`);
  }

  function applyFilter() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
      showToast('Please select both start and end dates', 'warning');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast('Start date cannot be after end date', 'warning');
      return;
    }

    // Reload page with new date range
    window.location.href = `/accounting/wallet-accounting?start_date=${startDate}&end_date=${endDate}`;
  }

  function showSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  async function executeSync(event) {
    const startDate = document.getElementById("syncStartDate").value;
    const endDate = document.getElementById("syncEndDate").value;

    if (!startDate || !endDate) {
      showToast("Please select both start and end dates", "warning");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast("Start date cannot be after end date", "warning");
      return;
    }

    // Show loading state
    const syncBtn = event?.currentTarget || event?.target || document.getElementById("syncConfirmBtn");
    let originalContent = null;
    if (syncBtn) {
      originalContent = syncBtn.innerHTML;
      syncBtn.disabled = true;
      syncBtn.innerHTML =
        '<svg class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Syncing...';
    }

    try {
      const response = await fetch("/accounting/api/wallet/sync-range", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
        }),
      });

      const result = await response.json();

      if (result.success) {
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.innerHTML = originalContent ?? "Sync Now";
        }

        const summary = buildSyncSummary(result, startDate, endDate);
        closeSyncModal();
        showSyncSummary(summary);
      } else {
        showToast(result.error || "Sync failed", "error");
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.innerHTML = originalContent ?? "Sync Now";
        }
      }
    } catch (error) {
      console.error("Sync error:", error);
      showToast("Failed to sync data: " + error.message, "error");
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalContent ?? "Sync Now";
      }
    }
  }

  function buildSyncSummary(result, startDate, endDate) {
    const entries = Array.isArray(result?.results) ? result.results : [];
    const rangeStart = startDate;
    const rangeEnd = endDate;

    let totalRechargeAmt = 0;
    let totalRechargeTxns = 0;
    let totalSalesAmt = 0;
    let totalOrders = 0;
    let reconciledDays = 0;
    const mismatchDays = [];

    entries.forEach((entry) => {
      const dateLabel = entry?.date ?? null;
      const rechargeData = entry?.recharges ?? {};
      const salesData = entry?.sales ?? {};
      const reconWrapper = entry?.reconciliation ?? {};
      const reconData = reconWrapper?.data ?? null;

      if (rechargeData?.success) {
        totalRechargeAmt += Number(rechargeData.total_amount ?? 0);
        totalRechargeTxns += Number(rechargeData.records_processed ?? 0);
      }

      if (salesData?.success) {
        totalSalesAmt += Number(salesData.total_amount ?? 0);
        totalOrders += Number(salesData.records_processed ?? 0);
      }

      if (reconWrapper?.success && reconData) {
        if (reconData.is_reconciled) {
          reconciledDays += 1;
        } else {
          mismatchDays.push({
            date: dateLabel,
            variance: Number(reconData.variance ?? 0),
            closingBalance: Number(reconData.closing_balance ?? 0),
            appBalance: reconData.app_wallet_balance !== null ? Number(reconData.app_wallet_balance) : null,
          });
        }
      } else {
        mismatchDays.push({
          date: dateLabel,
          variance: null,
          closingBalance: null,
          appBalance: null,
          error: reconWrapper?.error || reconWrapper?.message || "Reconciliation unavailable",
        });
      }
    });

    return {
      start: rangeStart,
      end: rangeEnd,
      daysProcessed: entries.length,
      totalRechargeAmt,
      totalRechargeTxns,
      totalSalesAmt,
      totalOrders,
      reconciledDays,
      mismatchDays,
    };
  }

  function showSyncSummary(summary) {
    if (!summaryModal) {
      return;
    }

    const {
      start,
      end,
      daysProcessed,
      totalRechargeAmt,
      totalRechargeTxns,
      totalSalesAmt,
      totalOrders,
      reconciledDays,
      mismatchDays,
    } = summary;

    if (summaryRangeEl) {
      summaryRangeEl.textContent = `Range: ${start} to ${end}`;
    }

    if (summaryDaysEl) {
      summaryDaysEl.textContent = daysProcessed ? formatNumber(daysProcessed, 0) : "0";
    }

    const mismatchCount = mismatchDays.length;

    if (summaryReconciledEl) {
      summaryReconciledEl.textContent = `${formatNumber(reconciledDays, 0)} / ${formatNumber(daysProcessed, 0)} days`;
      summaryReconciledEl.classList.remove(
        "text-green-600",
        "dark:text-green-400",
        "text-emerald-600",
        "dark:text-emerald-300",
        "text-red-600",
        "dark:text-red-400"
      );
      if (mismatchCount === 0) {
        summaryReconciledEl.classList.add("text-green-600", "dark:text-green-400");
      } else {
        summaryReconciledEl.classList.add("text-red-600", "dark:text-red-400");
      }
    }

    if (summaryRechargesEl) {
      summaryRechargesEl.textContent = `₹${formatNumber(totalRechargeAmt)}`;
    }

    if (summaryTransactionsEl) {
      summaryTransactionsEl.textContent = formatNumber(totalRechargeTxns, 0);
    }

    if (summarySalesEl) {
      summarySalesEl.textContent = `₹${formatNumber(totalSalesAmt)}`;
    }

    if (summaryOrdersEl) {
      summaryOrdersEl.textContent = formatNumber(totalOrders, 0);
    }

    if (summaryMismatchCountEl) {
      summaryMismatchCountEl.textContent = mismatchCount ? `${mismatchCount} day(s) need review` : "All days reconciled";
      summaryMismatchCountEl.classList.remove("text-red-600", "dark:text-red-400", "text-green-600", "dark:text-green-400");
      if (mismatchCount > 0) {
        summaryMismatchCountEl.classList.add("text-red-600", "dark:text-red-400");
      } else {
        summaryMismatchCountEl.classList.add("text-green-600", "dark:text-green-400");
      }
    }

    if (summaryMismatchListEl) {
      if (!mismatchDays.length) {
        summaryMismatchListEl.innerHTML =
          '<li class="px-4 py-2 bg-green-50 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-300 rounded-lg text-sm">All processed days reconciled successfully.</li>';
      } else {
        const items = mismatchDays.map((item) => {
          const dateLabel = item.date || "Unknown date";
          const varianceHtml =
            item.variance !== null && Number.isFinite(item.variance)
              ? `<span class="${item.variance > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"} font-semibold">Variance: ₹${formatNumber(item.variance)}</span>`
              : '<span class="text-gray-500 dark:text-gray-400">Variance unavailable</span>';

          const closing =
            item.closingBalance !== null && Number.isFinite(item.closingBalance)
              ? `Closing: ₹${formatNumber(item.closingBalance)}`
              : "Closing: N/A";

          const app =
            item.appBalance !== null && Number.isFinite(item.appBalance)
              ? `App Wallet: ₹${formatNumber(item.appBalance)}`
              : "App Wallet: N/A";

          const errorNote = item.error
            ? `<div class="text-xs text-red-500 dark:text-red-400 mt-1">${item.error}</div>`
            : "";

          return `<li class="px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm space-y-1">
              <div class="font-semibold text-red-700 dark:text-red-300">${dateLabel}</div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                ${varianceHtml}
                <span>${closing}</span>
                <span>${app}</span>
              </div>
              ${errorNote}
            </li>`;
        });

        summaryMismatchListEl.innerHTML = items.join("");
      }
    }

    summaryModal.classList.remove("hidden");
  }

  function closeSummaryModal() {
    if (summaryModal) {
      summaryModal.classList.add("hidden");
    }
  }

  function refreshAfterSync() {
    window.location.reload();
  }

  function showOpeningBalanceModal() {
    if (!openingModal) return;
    resetOpeningForm();
    openingModal.classList.remove("hidden");
  }

  function closeOpeningBalanceModal() {
    if (!openingModal) return;
    openingModal.classList.add("hidden");
    resetOpeningForm();
  }

  function resetOpeningForm() {
    if (openingStartDateInput) {
      openingStartDateInput.value = window.walletAccountingData?.startDate || "";
    }
    if (openingAmountInput) {
      openingAmountInput.value = "";
    }
    if (openingNoteInput) {
      openingNoteInput.value = "";
    }
    if (openingMessageEl) {
      openingMessageEl.textContent = "";
      openingMessageEl.className = "text-sm";
    }
    if (openingSubmitBtn) {
      openingSubmitBtn.disabled = false;
      openingSubmitBtn.classList.remove("hidden");
      openingSubmitBtn.innerHTML = "Save Opening Balance";
    }
    if (openingCloseBtn) {
      openingCloseBtn.textContent = "Cancel";
    }
  }

  function initReconciliationSection() {
    if (!reconciliationTableBody) {
      return;
    }

    const rawItems = Array.isArray(window.walletAccountingData?.reconciliation)
      ? window.walletAccountingData.reconciliation
      : [];

    reconciliationState.items = rawItems
      .map(normalizeReconciliationEntry)
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    reconciliationState.page = 1;
    reconciliationState.pageSize = 10;
    reconciliationState.filterStart = null;
    reconciliationState.filterEnd = null;
    reconciliationState.initialStartValue = reconciliationStartInput?.value || "";
    reconciliationState.initialEndValue = reconciliationEndInput?.value || "";

    renderReconciliationTable();
  }

  function normalizeDateKey(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  function normalizeReconciliationEntry(entry) {
    if (!entry) {
      return null;
    }

    const dateKey = normalizeDateKey(entry.reconciliation_date || entry.date || entry.recon_date);
    if (!dateKey) {
      return null;
    }

    return {
      date: dateKey,
      openingBalance: Number(entry.opening_balance ?? 0),
      totalRecharges: Number(entry.total_recharges ?? 0),
      totalSales: Number(entry.total_sales ?? 0),
      adjustmentIncrease: Number(entry.adjustment_increase ?? 0),
      adjustmentDecrease: Number(entry.adjustment_decrease ?? 0),
      adjustmentNet:
        entry.adjustment_net !== undefined && entry.adjustment_net !== null
          ? Number(entry.adjustment_net)
          : Number(entry.adjustment_increase ?? 0) - Number(entry.adjustment_decrease ?? 0),
      adjustmentNotes: entry.adjustment_notes || null,
      closingBalance: Number(entry.closing_balance ?? 0),
      appWalletBalance:
        entry.app_wallet_balance === null || entry.app_wallet_balance === undefined
          ? null
          : Number(entry.app_wallet_balance),
      variance: Number(entry.variance ?? 0),
      isReconciled: Boolean(entry.is_reconciled),
    };
  }

  function filterReconciliationData() {
    const items = reconciliationState.items || [];
    if (!items.length) {
      reconciliationState.filtered = [];
      return;
    }

    const { filterStart, filterEnd } = reconciliationState;
    let filtered = items;

    if (filterStart) {
      filtered = filtered.filter((item) => item.date >= filterStart);
    }

    if (filterEnd) {
      filtered = filtered.filter((item) => item.date <= filterEnd);
    }

    reconciliationState.filtered = filtered;
  }

  function renderReconciliationTable() {
    if (!reconciliationTableBody) {
      return;
    }

    filterReconciliationData();

    const filtered = reconciliationState.filtered || [];
    const total = filtered.length;
    const pageSize = reconciliationState.pageSize || 10;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    if (total === 0) {
      reconciliationState.page = 1;
    } else {
      reconciliationState.page = Math.min(Math.max(reconciliationState.page, 1), totalPages);
    }

    const startIndex = total === 0 ? 0 : (reconciliationState.page - 1) * pageSize;
    const pageItems = total === 0 ? [] : filtered.slice(startIndex, startIndex + pageSize);

    let rowsHtml = "";
    if (pageItems.length === 0) {
      const message = reconciliationState.filterStart || reconciliationState.filterEnd
        ? "No reconciliation records found for the selected range."
        : "No reconciliation data available. Click \"Sync Data\" to fetch from app database.";
      rowsHtml = `<tr><td colspan="8" class="px-6 py-8 text-center text-gray-500 dark:text-gray-400">${message}</td></tr>`;
    } else {
      rowsHtml = pageItems
        .map((item) => renderReconciliationRow(item))
        .join("");
    }

    reconciliationTableBody.innerHTML = rowsHtml;

    const from = total === 0 ? 0 : startIndex + 1;
    const to = total === 0 ? 0 : startIndex + pageItems.length;

    if (reconciliationCountEl) {
      reconciliationCountEl.textContent = total
        ? `Showing ${from}-${to} of ${total} day${total === 1 ? "" : "s"}`
        : "No reconciliation records to display";
    }

    if (reconciliationPageInfoEl) {
      reconciliationPageInfoEl.textContent = total
        ? `Page ${reconciliationState.page} of ${totalPages}`
        : "Page 0 of 0";
    }

    if (reconciliationPrevBtn) {
      reconciliationPrevBtn.disabled = total === 0 || reconciliationState.page <= 1;
    }

    if (reconciliationNextBtn) {
      reconciliationNextBtn.disabled = total === 0 || reconciliationState.page >= totalPages;
    }

    if (reconciliationRangeSummaryEl) {
      if (reconciliationState.filterStart || reconciliationState.filterEnd) {
        const startLabel = reconciliationState.filterStart ? formatDate(reconciliationState.filterStart) : "Earliest";
        const endLabel = reconciliationState.filterEnd ? formatDate(reconciliationState.filterEnd) : "Latest";
        reconciliationRangeSummaryEl.textContent = `Filtered range: ${startLabel} to ${endLabel}`;
      } else {
        const totalAll = reconciliationState.items.length;
        reconciliationRangeSummaryEl.textContent = totalAll
          ? `Showing all ${totalAll} day${totalAll === 1 ? "" : "s"}`
          : "No reconciliation data available";
      }
    }
  }

  function renderReconciliationRow(item) {
    const varianceClass = Math.abs(item.variance) < 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
    const varianceDisplay = `${item.variance >= 0 ? "+" : "-"}₹${formatNumber(Math.abs(item.variance))}`;
    const appBalanceDisplay = item.appWalletBalance === null || Number.isNaN(item.appWalletBalance)
      ? "N/A"
      : `₹${formatNumber(item.appWalletBalance)}`;

    const adjustmentIncrease = Number(item.adjustmentIncrease || 0);
    const adjustmentDecrease = Number(item.adjustmentDecrease || 0);
    const openingLines = [`<div>₹${formatNumber(item.openingBalance)}</div>`];
    const adjustmentSegments = [];
    if (adjustmentIncrease > 0) {
      adjustmentSegments.push(`<span class="text-emerald-600 dark:text-emerald-400">+₹${formatNumber(adjustmentIncrease)}</span>`);
    }
    if (adjustmentDecrease > 0) {
      adjustmentSegments.push(`<span class="text-red-600 dark:text-red-400">-₹${formatNumber(adjustmentDecrease)}</span>`);
    }
    if (adjustmentSegments.length > 0) {
      const adjLabel = adjustmentSegments.join(" ");
      openingLines.push(`<div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Adj: ${adjLabel}</div>`);
    }
    if (item.adjustmentNotes) {
      openingLines.push(`<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(item.adjustmentNotes)}</div>`);
    }

    return `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${formatDate(item.date)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">${openingLines.join("")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400">+₹${formatNumber(item.totalRecharges)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 dark:text-red-400">-₹${formatNumber(item.totalSales)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">₹${formatNumber(item.closingBalance)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">${appBalanceDisplay}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right ${varianceClass}">${varianceDisplay}</td>
        <td class="px-6 py-4 whitespace-nowrap text-center">${renderReconciliationStatusBadge(item.isReconciled)}</td>
      </tr>
    `;
  }

  function renderReconciliationStatusBadge(isReconciled) {
    if (isReconciled) {
      return `
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
          </svg>
          Reconciled
        </span>
      `;
    }

    return `
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
        <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        Mismatch
      </span>
    `;
  }

  function handleReconciliationApply() {
    const startValue = reconciliationStartInput?.value || "";
    const endValue = reconciliationEndInput?.value || "";

    if (startValue && endValue && new Date(startValue) > new Date(endValue)) {
      showToast("Start date cannot be after end date", "warning");
      return;
    }

    reconciliationState.filterStart = startValue || null;
    reconciliationState.filterEnd = endValue || null;
    reconciliationState.page = 1;
    renderReconciliationTable();
    loadAdjustments();
  }

  function handleReconciliationReset() {
    if (reconciliationStartInput) {
      reconciliationStartInput.value = reconciliationState.initialStartValue || "";
    }
    if (reconciliationEndInput) {
      reconciliationEndInput.value = reconciliationState.initialEndValue || "";
    }

    reconciliationState.filterStart = null;
    reconciliationState.filterEnd = null;
    reconciliationState.page = 1;
    renderReconciliationTable();
    loadAdjustments();
  }

  function changeReconciliationPage(delta) {
    if (!reconciliationState.filtered || reconciliationState.filtered.length === 0) {
      return;
    }

    const totalPages = Math.max(1, Math.ceil(reconciliationState.filtered.length / reconciliationState.pageSize));
    const newPage = reconciliationState.page + delta;
    if (newPage < 1 || newPage > totalPages) {
      return;
    }

    reconciliationState.page = newPage;
    renderReconciliationTable();
  }

  function getActiveDateRange() {
    const start = reconciliationState.filterStart || window.walletAccountingData?.startDate;
    const end = reconciliationState.filterEnd || window.walletAccountingData?.endDate;
    return {
      start,
      end,
    };
  }

  function renderAdjustmentsTable() {
    if (!adjustmentsTableBody) {
      return;
    }

    if (!adjustmentsList || adjustmentsList.length === 0) {
      adjustmentsTableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-500 dark:text-gray-400">No manual adjustments recorded in this range.</td></tr>';
      return;
    }

    const rows = adjustmentsList
      .map((item) => {
        const amountClass = item.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
        const amountDisplay = `${item.amount >= 0 ? "+" : "-"}₹${formatNumber(Math.abs(item.amount))}`;
        const notesDisplay = item.notes ? escapeHtml(item.notes) : "—";
        return `
          <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${formatDate(item.adjustment_date)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right ${amountClass}">${amountDisplay}</td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">${escapeHtml(item.reason || "")}</td>
            <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">${notesDisplay}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
              <button type="button" class="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" onclick="walletAccounting.deleteAdjustment(${item.id})">Delete</button>
            </td>
          </tr>
        `;
      })
      .join("");

    adjustmentsTableBody.innerHTML = rows;
  }

  async function loadAdjustments() {
    if (!adjustmentsTableBody) {
      return;
    }

    const { start, end } = getActiveDateRange();
    if (!start || !end) {
      return;
    }

    try {
      const params = new URLSearchParams({ start_date: start, end_date: end });
      const response = await fetch(`/accounting/api/wallet/adjustments?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load adjustments");
      }

      adjustmentsList = Array.isArray(result.data) ? result.data : [];
      renderAdjustmentsTable();
    } catch (error) {
      console.error("Unable to load adjustments:", error);
      showToast(error.message || "Unable to load adjustments", "error");
    }
  }

  function resetAdjustmentForm() {
    if (adjustmentForm) {
      adjustmentForm.reset();
    }

    if (adjustmentDateInput) {
      const { end } = getActiveDateRange();
      adjustmentDateInput.value = end || "";
    }

    if (adjustmentFormMessageEl) {
      adjustmentFormMessageEl.textContent = "";
      adjustmentFormMessageEl.className = "text-sm";
    }

    if (adjustmentSubmitBtn) {
      adjustmentSubmitBtn.disabled = false;
      adjustmentSubmitBtn.textContent = "Save Adjustment";
    }
  }

  function openAdjustmentModal() {
    if (!adjustmentModal) {
      return;
    }
    resetAdjustmentForm();
    adjustmentModal.classList.remove("hidden");
  }

  function closeAdjustmentModal() {
    if (!adjustmentModal) {
      return;
    }
    adjustmentModal.classList.add("hidden");
  }

  async function handleAdjustmentSubmit(event) {
    event.preventDefault();

    if (!adjustmentDateInput || !adjustmentAmountInput || !adjustmentReasonInput) {
      return;
    }

    const dateValue = adjustmentDateInput.value;
    const amountValue = adjustmentAmountInput.value;
    const reasonValue = adjustmentReasonInput.value;
    const notesValue = adjustmentNotesInput ? adjustmentNotesInput.value : "";

    if (!dateValue) {
      showToast("Please choose an adjustment date.", "warning");
      return;
    }

    if (!amountValue) {
      showToast("Please enter an adjustment amount.", "warning");
      return;
    }

    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount === 0) {
      showToast("Amount must be a non-zero number.", "warning");
      return;
    }

    if (!reasonValue || !reasonValue.trim()) {
      showToast("Please provide a reason for the adjustment.", "warning");
      return;
    }

    if (adjustmentSubmitBtn) {
      adjustmentSubmitBtn.disabled = true;
      adjustmentSubmitBtn.innerHTML = '<svg class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Saving...';
    }

    if (adjustmentFormMessageEl) {
      adjustmentFormMessageEl.textContent = "";
      adjustmentFormMessageEl.className = "text-sm";
    }

    try {
      const response = await fetch("/accounting/api/wallet/adjustments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adjustment_date: dateValue,
          amount,
          reason: reasonValue.trim(),
          notes: notesValue ? notesValue.trim() : null,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save adjustment");
      }

      showToast("Adjustment saved. Re-run the sync for this range to update balances.", "success");
      closeAdjustmentModal();
      await loadAdjustments();
    } catch (error) {
      console.error("Failed to save adjustment:", error);
      if (adjustmentFormMessageEl) {
        adjustmentFormMessageEl.textContent = error.message || "Failed to save adjustment.";
        adjustmentFormMessageEl.className = "text-sm text-red-600 dark:text-red-400";
      }
      showToast(error.message || "Failed to save adjustment", "error");
    } finally {
      if (adjustmentSubmitBtn) {
        adjustmentSubmitBtn.disabled = false;
        adjustmentSubmitBtn.textContent = "Save Adjustment";
      }
    }
  }

  async function deleteAdjustment(id) {
    if (!id) {
      return;
    }

    const shouldDelete = window.confirm("Delete this adjustment? This cannot be undone.");
    if (!shouldDelete) {
      return;
    }

    try {
      const response = await fetch(`/accounting/api/wallet/adjustments/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete adjustment");
      }

      showToast("Adjustment deleted.", "success");
      await loadAdjustments();
    } catch (error) {
      console.error("Failed to delete adjustment:", error);
      showToast(error.message || "Failed to delete adjustment", "error");
    }
  }

  async function handleOpeningBalanceSubmit(event) {
    event.preventDefault();
    if (!openingStartDateInput || !openingAmountInput) {
      return;
    }

    const startDate = openingStartDateInput.value;
    const amountValue = openingAmountInput.value;
    const noteValue = openingNoteInput ? openingNoteInput.value : "";

    if (!startDate) {
      showToast("Please choose the first sync date.", "warning");
      return;
    }

    if (!amountValue) {
      showToast("Please enter the opening balance.", "warning");
      return;
    }

    const amount = Number(amountValue);
    if (!Number.isFinite(amount)) {
      showToast("Opening balance must be a valid number.", "warning");
      return;
    }

    if (openingMessageEl) {
      openingMessageEl.textContent = "";
      openingMessageEl.className = "text-sm";
    }

    if (openingSubmitBtn) {
      openingSubmitBtn.disabled = true;
      openingSubmitBtn.innerHTML =
        '<svg class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Saving...';
    }

    try {
      const response = await fetch("/accounting/api/wallet/opening-balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_date: startDate,
          opening_balance: amount,
          note: noteValue,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save opening balance.");
      }

      if (openingMessageEl) {
        const start = formatDate(result.data?.start_date);
        const prev = formatDate(result.data?.previous_date);
        openingMessageEl.textContent = `Opening balance saved for ${start} (previous day ${prev}).`;
        openingMessageEl.className = "text-sm text-green-600 dark:text-green-400";
      }

      if (openingSubmitBtn) {
        openingSubmitBtn.classList.add("hidden");
      }
      if (openingCloseBtn) {
        openingCloseBtn.textContent = "Close";
      }

      showToast("Opening balance saved successfully.", "success");
    } catch (error) {
      console.error("Failed to save opening balance:", error);
      if (openingMessageEl) {
        openingMessageEl.textContent = error.message || "Failed to save opening balance.";
        openingMessageEl.className = "text-sm text-red-600 dark:text-red-400";
      }
      showToast(error.message || "Failed to save opening balance.", "error");
    } finally {
      if (openingSubmitBtn) {
        openingSubmitBtn.disabled = false;
        openingSubmitBtn.innerHTML = "Save Opening Balance";
      }
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  async function downloadCSV() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
      showToast('Please select both start and end dates', 'warning');
      return;
    }

    const url = `/accounting/api/wallet/download-csv?start_date=${startDate}&end_date=${endDate}`;

    if (downloadCsvButton) {
      downloadCsvButton.disabled = true;
      downloadCsvButton.classList.add("cursor-wait", "opacity-75");
    }
    if (downloadCsvSpinner) {
      downloadCsvSpinner.classList.remove("hidden");
    }

    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to download file");
      }

      const blob = await response.blob();
      let filename = `wallet-reconciliation-${startDate}-to-${endDate}.xlsx`;
      const disposition = response.headers.get("Content-Disposition");
      if (disposition) {
        const match = /filename=\"?([^\";]+)\"?/i.exec(disposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      showToast(error.message || "Unable to download file", "error");
    } finally {
      if (downloadCsvSpinner) {
        downloadCsvSpinner.classList.add("hidden");
      }
      if (downloadCsvButton) {
        downloadCsvButton.disabled = false;
        downloadCsvButton.classList.remove("cursor-wait", "opacity-75");
      }
    }
  }

  function renderAdjustmentRow(item) {
    const dateLabel = item.date || "Unknown date";
    const amountDisplay = item.amount === null || Number.isNaN(item.amount)
      ? "N/A"
      : `₹${formatNumber(item.amount)}`;

    const reasonHtml = item.reason
      ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Reason: ${escapeHtml(item.reason)}</div>`
      : "";

    const notesHtml = item.notes
      ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Notes: ${escapeHtml(item.notes)}</div>`
      : "";

    return `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${formatDate(dateLabel)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">${amountDisplay}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(item.reason)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(item.notes)}</td>
      </tr>
    `;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    applyFilter,
    showSyncModal,
    closeSyncModal,
    executeSync,
    closeSummaryModal,
    refreshAfterSync,
    showOpeningBalanceModal,
    closeOpeningBalanceModal,
    resetOpeningForm,
    downloadCSV,
    openAdjustmentModal,
    closeAdjustmentModal,
    deleteAdjustment,
  };
})();

