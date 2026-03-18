(function () {
  const API_BASE = "/payments/api/delivery";
  const DEFAULT_MONTH = window.DELIVERY_PAYMENTS_DEFAULT_MONTH || new Date().toISOString().slice(0, 7);
  const STORAGE_KEY = "deliveryPaymentsState";

  const state = {
    month: DEFAULT_MONTH,
    cycle: null,
    records: [],
    filteredRecords: [],
    filters: {
      status: "",
      search: "",
      type: "",
    },
    isLoading: false,
  };

  const elements = {
    monthInput: document.getElementById("deliveryPaymentsMonth"),
    statusFilter: document.getElementById("deliveryPaymentsStatusFilter"),
    typeFilter: document.getElementById("deliveryPaymentsTypeFilter"),
    searchInput: document.getElementById("deliveryPaymentsSearch"),
    tableBody: document.getElementById("deliveryPaymentsTbody"),
    loadingRow: document.getElementById("deliveryPaymentsLoadingRow"),
    headerRange: document.getElementById("deliveryPaymentsHeaderRange"),
    summary: {
      dates: document.getElementById("cycleDates"),
      activeDeliveryBoyCount: document.getElementById("cycleDeliveryBoyCount"),
      activeDeliveryBoySubtext: document.getElementById("cycleDeliveryBoySubtext"),
      grossPay: document.getElementById("cycleGrossPay"),
      netPay: document.getElementById("cycleNetPay"),
      commissionCount: document.getElementById("cycleCommissionCount"),
      fixedCount: document.getElementById("cycleFixedCount"),
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
      console.error("Failed to load delivery payments state", error);
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
      console.error("Failed to save delivery payments state", error);
    }
  }

  function init() {
    loadStateFromStorage();

    const urlParams = new URLSearchParams(window.location.search);
    const urlMonth = urlParams.get("month");
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) && urlMonth !== state.month) {
      state.month = urlMonth;
    }

    // Ensure month is always set
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

    if (elements.typeFilter) {
      elements.typeFilter.value = state.filters.type || "";
      elements.typeFilter.addEventListener("change", (event) => {
        state.filters.type = event.target.value;
        saveStateToStorage();
        applyFilters();
      });
    }

    if (elements.searchInput) {
      elements.searchInput.value = state.filters.search || "";
      elements.searchInput.addEventListener(
        "input",
        debounce((event) => {
          state.filters.search = event.target.value.trim().toLowerCase();
          saveStateToStorage();
          applyFilters();
        }, 200),
      );
    }

    // Auto load data for the default month
    loadCycleData();
  }

  async function loadCycleData() {
    if (!state.month) {
      console.error("loadCycleData: No month selected");
      return;
    }
    if (state.isLoading) {
      return;
    }

    state.isLoading = true;
    
    // Show loading row
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
    }
    if (elements.tableBody) {
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#deliveryPaymentsLoadingRow)"));
      existingRows.forEach(row => row.remove());
      if (!elements.tableBody.contains(elements.loadingRow)) {
        elements.tableBody.appendChild(elements.loadingRow);
      }
    }

    try {
      // First try to load existing cycle data (fast)
      const data = await fetchJSON(`${API_BASE}/cycles/month?month=${encodeURIComponent(state.month)}`);
      
      if (data && data.success && data.cycle) {
        // Cycle exists, use existing data
        state.cycle = data.cycle;
        state.records = Array.isArray(data.records) ? data.records : [];
        applyFilters();
        updateCycleSummary();
        saveStateToStorage();
        return;
      }
      
      // Cycle doesn't exist, recalculate to create it
      await recalculateCycle({ silent: true });
    } catch (error) {
      console.error("loadCycleData error:", error);
      // If loading fails, try recalculating
      await recalculateCycle({ silent: true });
    } finally {
      state.isLoading = false;
      if (elements.loadingRow) {
        elements.loadingRow.classList.add("hidden");
      }
    }
  }

  async function recalculateCycle({ silent = false } = {}) {
    if (state.isLoading) return;

    if (!state.month) {
      console.error("recalculateCycle: No month selected");
      showErrorToast?.("Please select a month");
      return;
    }

    state.isLoading = true;
    
    // Show loading row, hide empty message
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
    }
    // Clear existing data rows but keep loading row
    if (elements.tableBody) {
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#deliveryPaymentsLoadingRow)"));
      existingRows.forEach(row => row.remove());
      // Ensure loading row is in the table
      if (!elements.tableBody.contains(elements.loadingRow)) {
        elements.tableBody.appendChild(elements.loadingRow);
      }
    }
    
    try {
      const payload = {
        month: state.month,
      };
      
      const data = await fetchJSON(`${API_BASE}/cycles/recalculate`, {
        method: "POST",
        body: payload,
      });

      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to recalculate delivery payments");
      }

      state.cycle = data.cycle || null;
      state.records = Array.isArray(data.records) ? data.records : [];
      
      applyFilters();
      updateCycleSummary();
      saveStateToStorage();

      if (!silent) {
        showSuccessToast?.("Delivery payment cycle recalculated successfully");
      }
    } catch (error) {
      console.error("recalculateCycle error:", error);
      state.cycle = null;
      state.records = [];
      updateCycleSummary();
      showErrorToast?.(error.message || "Unable to recalculate delivery payments");
    } finally {
      state.isLoading = false;
      // Hide loading row - renderRecordsTable will handle showing data or empty message
      if (elements.loadingRow) {
        elements.loadingRow.classList.add("hidden");
      }
    }
  }

  async function lockCurrentCycle() {
    if (!state.cycle) {
      showWarningToast?.("Calculate the cycle before locking");
      return;
    }
    setLoading(true, elements.lockButton, "Locking…");
    try {
      const data = await fetchJSON(`${API_BASE}/cycles/${state.cycle.id}/lock`, {
        method: "POST",
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to lock cycle");
      }
      state.cycle = data.cycle || state.cycle;
      updateCycleSummary();
      showSuccessToast?.("Cycle locked successfully");
    } catch (error) {
      console.error("lockCurrentCycle error:", error);
      showErrorToast?.(error.message || "Unable to lock cycle");
    } finally {
      setLoading(false, elements.lockButton);
    }
  }

  async function unlockCurrentCycle() {
    if (!state.cycle) {
      showWarningToast?.("Cycle not available to unlock");
      return;
    }
    setLoading(true, elements.unlockButton, "Unlocking…");
    try {
      const data = await fetchJSON(`${API_BASE}/cycles/${state.cycle.id}/unlock`, {
        method: "POST",
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to unlock cycle");
      }
      state.cycle = data.cycle || state.cycle;
      updateCycleSummary();
      showSuccessToast?.("Cycle unlocked successfully");
    } catch (error) {
      console.error("unlockCurrentCycle error:", error);
      showErrorToast?.(error.message || "Unable to unlock cycle");
    } finally {
      setLoading(false, elements.unlockButton);
    }
  }

  function updateCycleSummary() {
    const cycle = state.cycle;
    const summary = elements.summary;

    if (!cycle) {
      if (elements.headerRange) {
        elements.headerRange.textContent = "";
        elements.headerRange.classList.add("hidden");
      }
      if (summary.dates) summary.dates.textContent = "-";
      if (summary.activeDeliveryBoyCount) summary.activeDeliveryBoyCount.textContent = "-";
      if (summary.activeDeliveryBoySubtext) summary.activeDeliveryBoySubtext.textContent = "";
      if (summary.commissionCount) summary.commissionCount.textContent = "-";
      if (summary.fixedCount) summary.fixedCount.textContent = "-";
      if (summary.grossPay) summary.grossPay.textContent = "₹0.00";
      if (summary.netPay) summary.netPay.textContent = "₹0.00";
      toggleCycleActions(false);
      return;
    }

    if (summary.dates) summary.dates.textContent = formatCycleDateRange(cycle.start_date, cycle.end_date);
    if (elements.headerRange) {
      elements.headerRange.textContent = formatCycleDateRange(cycle.start_date, cycle.end_date);
      elements.headerRange.classList.remove("hidden");
    }

    const records = Array.isArray(state.records) ? state.records : [];
    let activeRecords = records.filter((record) => record.is_active_delivery_boy !== false);
    if (activeRecords.length === 0 && typeof cycle.total_delivery_boys_active === "number" && cycle.total_delivery_boys_active > 0) {
      activeRecords = records;
    }

    let activeCount = activeRecords.length;
    if (!activeCount) {
      activeCount =
        cycle.total_delivery_boys_active ??
        cycle.total_delivery_boys ??
        records.length ??
        0;
    }

    if (summary.activeDeliveryBoyCount) {
      summary.activeDeliveryBoyCount.textContent = formatNumber(activeCount);
    }
    if (summary.activeDeliveryBoySubtext) {
      const totalCount =
        cycle.total_delivery_boys_all ??
        records.length ??
        activeCount;
      summary.activeDeliveryBoySubtext.textContent = totalCount ? `Out of ${formatNumber(totalCount)} total` : "";
    }

    const countSource = activeRecords.length ? activeRecords : records;
    const counts = countSource.reduce(
      (acc, record) => {
        const type = (record.payment_type || "").toLowerCase();
        if (type === "fixed") {
          acc.fixed += 1;
        } else {
          acc.commission += 1;
        }
        return acc;
      },
      { commission: 0, fixed: 0 },
    );
    if (summary.commissionCount) {
      summary.commissionCount.textContent = formatNumber(counts.commission);
    }
    if (summary.fixedCount) {
      summary.fixedCount.textContent = formatNumber(counts.fixed);
    }

    if (summary.grossPay) summary.grossPay.textContent = formatCurrency(cycle.total_gross_pay);
    if (summary.netPay) summary.netPay.textContent = formatCurrency(cycle.total_net_pay);

    toggleCycleActions(true);
  }

  function toggleCycleActions(hasCycle) {
    if (!elements.lockButton || !elements.unlockButton) return;
    if (!hasCycle) {
      elements.lockButton.classList.add("hidden");
      elements.unlockButton.classList.add("hidden");
      return;
    }
    const status = state.cycle?.status;
    if (status === "locked") {
      elements.lockButton.classList.add("hidden");
      elements.unlockButton.classList.remove("hidden");
    } else {
      elements.lockButton.classList.remove("hidden");
      elements.unlockButton.classList.add("hidden");
    }
    elements.lockButton.disabled = status === "locked";
    elements.unlockButton.disabled = status !== "locked";
  }

  function applyFilters() {
    const statusFilter = state.filters.status;
    const searchFilter = state.filters.search;

    let records = [...state.records];

    if (statusFilter) {
      records = records.filter((record) => String(record.payment_status).toLowerCase() === statusFilter.toLowerCase());
    }

    const typeFilter = state.filters.type;
    if (typeFilter) {
      records = records.filter((record) => (record.payment_type || "").toLowerCase() === typeFilter.toLowerCase());
    }

    if (searchFilter) {
      records = records.filter((record) => {
        const target = [
          record.delivery_boy_name,
          record.phone,
          record.delivery_boy_user_id,
          record.delivery_boy_external_id,
        ]
          .map((value) => (value == null ? "" : String(value).toLowerCase()))
          .join(" ");
        return target.includes(searchFilter);
      });
    }

    // Sort records: "paid" status first, then others
    records.sort((a, b) => {
      const statusA = String(a.payment_status || "").toLowerCase();
      const statusB = String(b.payment_status || "").toLowerCase();
      
      // If one is "paid" and the other is not, "paid" comes first
      if (statusA === "paid" && statusB !== "paid") return -1;
      if (statusA !== "paid" && statusB === "paid") return 1;
      
      // Otherwise maintain original order (or sort alphabetically by status)
      return statusA.localeCompare(statusB);
    });

    state.filteredRecords = records;
    renderRecordsTable();
  }

  function renderRecordsTable() {
    if (!elements.tableBody) return;

    // Hide loading row if visible
    if (elements.loadingRow) {
      elements.loadingRow.classList.add("hidden");
    }

    if (!state.filteredRecords.length) {
      // Clear existing rows except loading row
      const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#deliveryPaymentsLoadingRow)"));
      existingRows.forEach(row => row.remove());
      
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `
        <td colspan="10" class="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          ${state.records.length ? "No records match your filters." : "Select a month and click 'Recalculate' to load delivery payments."}
        </td>
      `;
      elements.tableBody.appendChild(emptyRow);
      return;
    }

    // Clear existing rows except loading row
    const existingRows = Array.from(elements.tableBody.querySelectorAll("tr:not(#deliveryPaymentsLoadingRow)"));
    existingRows.forEach(row => row.remove());

    const rows = state.filteredRecords
      .map((record) => renderRecordRow(record))
      .join("");

    elements.tableBody.insertAdjacentHTML("beforeend", rows);
  }

  function renderRecordRow(record) {
    const metrics = computeRecordMetrics(record);
    const statusBadge = renderStatusBadge(record.payment_status);
    const recordLink = `/payments/delivery/${record.id}${state.month ? `?month=${encodeURIComponent(state.month)}` : ""}`;
    return `
      <tr class="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 transition-colors">
        <td class="px-4 py-3 align-top">
          <div class="font-semibold text-gray-900 dark:text-gray-100">${escapeHtml(record.delivery_boy_name || "—")}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">User ID: ${escapeHtml(record.delivery_boy_user_id ?? "—")}</div>
          ${record.phone ? `<div class="text-xs text-gray-500 dark:text-gray-400">📞 ${escapeHtml(record.phone)}</div>` : ""}
        </td>
        <td class="px-3 py-3 text-sm text-gray-700 dark:text-gray-300 align-top capitalize">${escapeHtml(record.payment_type || "commission")}</td>
        <td class="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300 align-top">${formatNumber(record.total_orders)}</td>
        <td class="px-3 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 align-top">${formatCurrency(metrics.basePay)}</td>
        <td class="px-3 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 align-top">${formatCurrency(record.commission_amount)}</td>
        <td class="px-3 py-3 text-right text-sm text-emerald-600 dark:text-emerald-400 align-top font-medium">${formatCurrency(metrics.allowances)}</td>
        <td class="px-3 py-3 text-right text-sm text-red-600 dark:text-red-400 align-top font-medium">${formatCurrency(metrics.deductions)}</td>
        <td class="px-3 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 align-top">${formatCurrency(record.net_pay)}</td>
        <td class="px-3 py-3 align-top">${statusBadge}</td>
        <td class="px-4 py-3 align-top">
          <a
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            href="${recordLink}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
            View
          </a>
        </td>
      </tr>
    `;
  }

  async function openRecordModal(recordId) {
    if (!elements.modalsRoot) return;

    showModalLoading("Loading delivery payment details…");

    try {
      const [recordRes, entriesRes, ordersRes] = await Promise.allSettled([
        fetchJSON(`${API_BASE}/records/${recordId}`),
        fetchJSON(`${API_BASE}/records/${recordId}/entries`),
        fetchJSON(`${API_BASE}/records/${recordId}/orders`),
      ]);

      const recordData = recordRes.status === "fulfilled" && recordRes.value.success ? recordRes.value.record : null;
      const entriesData = entriesRes.status === "fulfilled" && entriesRes.value.success ? entriesRes.value.entries : [];
      const ordersData = ordersRes.status === "fulfilled" && ordersRes.value.success ? ordersRes.value.orders : [];

      if (!recordData) {
        throw new Error("Unable to load delivery payment record");
      }

      mountRecordModal(recordData, entriesData, ordersData);
    } catch (error) {
      console.error("openRecordModal error:", error);
      showErrorToast?.(error.message || "Unable to load delivery payment record");
      closeModal();
    }
  }

  function mountRecordModal(recordData, entries, orders) {
    const modalRoot = elements.modalsRoot;
    if (!modalRoot) return;

    let currentRecord = { ...recordData };
    let currentEntries = Array.isArray(entries) ? entries : [];
    const currentOrders = Array.isArray(orders) ? orders : [];

    modalRoot.innerHTML = renderRecordModal(currentRecord, currentEntries, currentOrders);
    document.body.classList.add("overflow-hidden");

    const modal = modalRoot.querySelector('[data-modal="delivery-record"]');
    if (!modal) return;

    const closeModalHandler = () => {
      closeModal();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeModalHandler();
      }
    };

    modal.querySelectorAll("[data-close]").forEach((closeButton) => {
      closeButton.addEventListener("click", closeModalHandler);
    });
    document.addEventListener("keydown", handleEscape, { once: true });

    const statusSelect = modal.querySelector('[data-field="status-select"]');
    const statusReason = modal.querySelector('[data-field="status-reason"]');
    const statusButton = modal.querySelector('[data-action="update-status"]');
    if (statusButton && statusSelect) {
      statusButton.addEventListener("click", async () => {
        const newStatus = statusSelect.value;
        const reason = statusReason?.value?.trim() || null;
        await handleStatusUpdate(currentRecord.id, newStatus, reason);
      });
    }

    const remarksTextarea = modal.querySelector('[data-field="remarks"]');
    const remarksButton = modal.querySelector('[data-action="update-remarks"]');
    if (remarksButton && remarksTextarea) {
      remarksButton.addEventListener("click", async () => {
        await handleRemarksUpdate(currentRecord.id, remarksTextarea.value);
      });
    }

    const entryForm = modal.querySelector("[data-form='new-entry']");
    if (entryForm) {
      entryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(entryForm);
        const entryPayload = {
          entry_type: formData.get("entry_type"),
          direction: formData.get("direction"),
          amount: formData.get("amount"),
          quantity: formData.get("quantity"),
          reason: formData.get("reason"),
          notes: formData.get("notes"),
          effective_date: formData.get("effective_date"),
        };
        await handleCreateEntry(currentRecord.id, entryPayload);
        entryForm.reset();
      });
    }

    const entriesContainer = modal.querySelector('[data-section="entries"]');
    if (entriesContainer) {
      entriesContainer.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-action='delete-entry']");
        if (!target) return;
        const entryId = Number(target.getAttribute("data-entry-id"));
        if (!entryId) return;
        const confirmed = window.confirm("Delete this entry?");
        if (!confirmed) return;
        await handleDeleteEntry(entryId);
      });
    }

    function syncRecordAndEntries(record, updatedEntries) {
      currentRecord = { ...currentRecord, ...record };
      currentEntries = Array.isArray(updatedEntries) ? updatedEntries : currentEntries;
      updateRecordInState(currentRecord);
      applyFilters();
      updateModalSummary(modal, currentRecord);
      renderEntriesList(modal, currentEntries);
      if (remarksTextarea) {
        remarksTextarea.value = currentRecord.remarks || "";
      }
      if (statusSelect) {
        statusSelect.value = currentRecord.payment_status;
      }
    }

    async function handleStatusUpdate(recordId, status, reason) {
      if (!status) {
        showWarningToast?.("Select a status to update");
        return;
      }
      const button = modal.querySelector('[data-action="update-status"]');
      setLoading(true, button, "Updating…");
      try {
        const data = await fetchJSON(`${API_BASE}/records/${recordId}/status`, {
          method: "PATCH",
          body: { status, reason },
        });
        if (!data || !data.success) {
          throw new Error(data?.error || "Unable to update status");
        }
        syncRecordAndEntries(data.record, currentEntries);
        showSuccessToast?.("Payment status updated");
        if (statusReason) {
          statusReason.value = "";
        }
      } catch (error) {
        console.error("handleStatusUpdate error:", error);
        showErrorToast?.(error.message || "Unable to update status");
      } finally {
        setLoading(false, button);
      }
    }

    async function handleRemarksUpdate(recordId, remarks) {
      const button = modal.querySelector('[data-action="update-remarks"]');
      setLoading(true, button, "Saving…");
      try {
        const data = await fetchJSON(`${API_BASE}/records/${recordId}/remarks`, {
          method: "PATCH",
          body: { remarks },
        });
        if (!data || !data.success) {
          throw new Error(data?.error || "Unable to update remarks");
        }
        syncRecordAndEntries(data.record, currentEntries);
        showSuccessToast?.("Remarks updated");
      } catch (error) {
        console.error("handleRemarksUpdate error:", error);
        showErrorToast?.(error.message || "Unable to update remarks");
      } finally {
        setLoading(false, button);
      }
    }

    async function handleCreateEntry(recordId, entryPayload) {
      const submitButton = entryForm?.querySelector("button[type='submit']");
      setLoading(true, submitButton, "Adding…");
      try {
        const validationError = validateEntryPayload(entryPayload);
        if (validationError) {
          throw new Error(validationError);
        }
        const data = await fetchJSON(`${API_BASE}/records/${recordId}/entries`, {
          method: "POST",
          body: entryPayload,
        });
        if (!data || !data.success) {
          throw new Error(data?.error || "Unable to add entry");
        }
        syncRecordAndEntries(data.record, data.entries);
        showSuccessToast?.("Entry added successfully");
      } catch (error) {
        console.error("handleCreateEntry error:", error);
        showErrorToast?.(error.message || "Unable to add entry");
      } finally {
        setLoading(false, submitButton);
      }
    }

    async function handleDeleteEntry(entryId) {
      const deleteButton = modal.querySelector(`[data-action='delete-entry'][data-entry-id='${entryId}']`);
      setLoading(true, deleteButton, "Deleting…");
      try {
        const data = await fetchJSON(`${API_BASE}/entries/${entryId}`, {
          method: "DELETE",
        });
        if (!data || !data.success) {
          throw new Error(data?.error || "Unable to delete entry");
        }
        syncRecordAndEntries(data.record, data.entries);
        showSuccessToast?.("Entry deleted successfully");
      } catch (error) {
        console.error("handleDeleteEntry error:", error);
        showErrorToast?.(error.message || "Unable to delete entry");
      } finally {
        setLoading(false, deleteButton);
      }
    }

    updateModalSummary(modal, currentRecord);
    renderEntriesList(modal, currentEntries);
    renderOrdersList(modal, currentOrders);
  }

  function updateModalSummary(modal, record) {
    const metrics = computeRecordMetrics(record);
    const summaryMap = {
      "base-pay": metrics.basePay,
      commission: record.commission_amount,
      "fuel-allowance": record.fuel_allowance_total,
      "adjustments-positive": record.adjustments_positive,
      "leave-deduction": record.leave_deduction_total,
      "adjustments-negative": record.adjustments_negative,
      advances: record.advances_total,
      gross: record.gross_pay,
      net: record.net_pay,
    };

    Object.entries(summaryMap).forEach(([key, value]) => {
      const field = modal.querySelector(`[data-field='${key}']`);
      if (field) {
        field.textContent = formatCurrency(value);
      }
    });

    const statusBadgeEl = modal.querySelector("[data-field='status-badge']");
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = renderStatusBadge(record.payment_status);
    }

    const headerTitle = modal.querySelector("[data-field='partner-name']");
    if (headerTitle) {
      headerTitle.textContent = record.delivery_boy_name || "Delivery Partner";
    }

    const headerMeta = modal.querySelector("[data-field='partner-meta']");
    if (headerMeta) {
      const parts = [];
      if (record.phone) parts.push(`📞 ${record.phone}`);
      parts.push(`User ID: ${record.delivery_boy_user_id}`);
      headerMeta.textContent = parts.join(" · ");
    }

    const statusSelect = modal.querySelector('[data-field="status-select"]');
    if (statusSelect) {
      statusSelect.value = record.payment_status || "pending";
    }
  }

  function renderEntriesList(modal, entries) {
    const entriesTableBody = modal.querySelector("[data-field='entries-body']");
    if (!entriesTableBody) return;

    if (!entries || entries.length === 0) {
      entriesTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No entries added yet. Use the form above to record allowances, leaves, adjustments, or advances.
          </td>
        </tr>
      `;
      return;
    }

    entriesTableBody.innerHTML = entries
      .map((entry) => {
        const directionLabel = entry.direction === "debit" ? "Debit" : "Credit";
        const amountClass = entry.direction === "debit" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
        return `
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium capitalize">${entry.entry_type.replace("_", " ")}</td>
            <td class="px-4 py-3 text-sm ${amountClass} font-semibold">${directionLabel}</td>
            <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-semibold">${formatCurrency(entry.amount)}</td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${entry.quantity != null ? formatNumber(entry.quantity) : "—"}</td>
            <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              ${entry.reason ? `<div>${escapeHtml(entry.reason)}</div>` : ""}
              ${entry.notes ? `<div class="text-xs text-gray-400 dark:text-gray-500 mt-1">${escapeHtml(entry.notes)}</div>` : ""}
              ${entry.effective_date ? `<div class="text-xs text-gray-400 dark:text-gray-500 mt-1">Effective: ${formatDate(entry.effective_date)}</div>` : ""}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                data-action="delete-entry"
                data-entry-id="${entry.id}"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                Remove
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderOrdersList(modal, orders) {
    const target = modal.querySelector("[data-field='orders-body']");
    if (!target) return;

    if (!orders || orders.length === 0) {
      target.innerHTML = `
        <tr>
          <td colspan="7" class="px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No delivered orders found for this cycle.
          </td>
        </tr>
      `;
      return;
    }

    target.innerHTML = orders
      .map((order) => {
        return `
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(order.order_number || order.order_id)}</td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${formatDate(order.order_date)}</td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${escapeHtml(order.product_name || "—")}</td>
            <td class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">${formatNumber(order.quantity)}</td>
            <td class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">${formatCurrency(order.line_total)}</td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">${escapeHtml(order.commission_source || "standard")}</td>
            <td class="px-4 py-3 text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">${formatCurrency(order.commission_amount)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderRecordModal(record, entries, orders) {
    const metrics = computeRecordMetrics(record);
    const remarks = escapeHtml(record.remarks || "");
    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
        <div class="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" data-close></div>
        <div class="relative w-full max-w-6xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" data-modal="delivery-record">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <div>
              <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100" data-field="partner-name">${escapeHtml(record.delivery_boy_name || "Delivery Partner")}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400" data-field="partner-meta">
                ${record.phone ? `📞 ${escapeHtml(record.phone)} · ` : ""}User ID: ${escapeHtml(record.delivery_boy_user_id ?? "—")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span data-field="status-badge">${renderStatusBadge(record.payment_status)}</span>
              <button
                type="button"
                class="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
                data-close
                aria-label="Close"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="px-6 py-5 space-y-6 max-h-[85vh] overflow-y-auto">
            <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              ${renderSummaryCard("Base Pay", metrics.basePay, "base-pay")}
              ${renderSummaryCard("Commission", record.commission_amount, "commission")}
              ${renderSummaryCard("Fuel Allowance", record.fuel_allowance_total, "fuel-allowance")}
              ${renderSummaryCard("Adjustments (+)", record.adjustments_positive, "adjustments-positive")}
              ${renderSummaryCard("Leave Deductions", record.leave_deduction_total, "leave-deduction", true)}
              ${renderSummaryCard("Adjustments (-)", record.adjustments_negative, "adjustments-negative", true)}
              ${renderSummaryCard("Advance Deducted", record.advances_total, "advances", true)}
              ${renderSummaryCard("Net Payable", record.net_pay, "net", false, true)}
            </section>

            <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Payment Status
                </h3>
                <div class="space-y-3">
                  <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <select data-field="status-select" class="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                      ${renderStatusOptions(record.payment_status)}
                    </select>
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                      data-action="update-status"
                    >
                      Update Status
                    </button>
                  </div>
                  <textarea
                    data-field="status-reason"
                    placeholder="Reason or note for status change (optional)"
                    class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    rows="2"
                  ></textarea>
                </div>
              </div>

              <div class="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  Remarks
                </h3>
                <div class="space-y-3">
                  <textarea
                    data-field="remarks"
                    class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    rows="4"
                    placeholder="Add internal remarks or payment notes"
                  >${remarks}</textarea>
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                    data-action="update-remarks"
                  >
                    Save Remarks
                  </button>
                </div>
              </div>
            </section>

            <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div class="mb-4">
                <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-between">
                  <span>Manual Adjustments</span>
                  <span class="text-xs font-normal text-gray-500 dark:text-gray-400">Fuel, leaves, adjustments & advances</span>
                </h3>
              </div>
              <form data-form="new-entry" class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4">
                <div class="flex flex-col">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Entry Type</label>
                  <select name="entry_type" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" required>
                    <option value="fuel_allowance">Fuel Allowance</option>
                    <option value="leave">Leave</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="advance">Advance</option>
                  </select>
                </div>
                <div class="flex flex-col">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Direction</label>
                  <select name="direction" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" required>
                    <option value="credit">Credit (Add)</option>
                    <option value="debit">Debit (Deduct)</option>
                  </select>
                </div>
                <div class="flex flex-col">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (₹)</label>
                  <input name="amount" type="number" step="0.01" min="0" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" required>
                </div>
                <div class="flex flex-col">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quantity</label>
                  <input name="quantity" type="number" step="0.01" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="Litres / days">
                </div>
                <div class="flex flex-col">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Effective Date</label>
                  <input name="effective_date" type="date" max="${escapeHtml(record.end_date || "")}" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                </div>
                <div class="flex flex-col md:col-span-2">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason</label>
                  <input name="reason" type="text" maxlength="200" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="Short description (optional)">
                </div>
                <div class="flex flex-col md:col-span-3">
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <input name="notes" type="text" maxlength="255" class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="Additional notes (optional)">
                </div>
                <div class="md:col-span-5 flex justify-end">
                  <button type="submit" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
                    Add Entry
                  </button>
                </div>
              </form>
              <div class="overflow-x-auto" data-section="entries">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead class="bg-gray-100 dark:bg-gray-800/80">
                    <tr>
                      <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Type</th>
                      <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Direction</th>
                      <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                      <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Quantity</th>
                      <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Reason & Notes</th>
                      <th class="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody data-field="entries-body"></tbody>
                </table>
              </div>
            </section>

            <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">Commission Breakdown</h3>
                <span class="text-xs text-gray-500 dark:text-gray-400">Orders delivered in this cycle</span>
              </div>
              <div class="overflow-x-auto">
                <div class="max-h-80 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-lg">
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead class="bg-gray-100 dark:bg-gray-800/80">
                      <tr>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Order</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Product</th>
                        <th class="px-4 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Qty</th>
                        <th class="px-4 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Line Total</th>
                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Commission Source</th>
                        <th class="px-4 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Commission</th>
                      </tr>
                    </thead>
                    <tbody data-field="orders-body"></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function renderSummaryCard(title, value, field, isNegative = false, isHighlight = false) {
    const valueClass = isNegative ? "text-red-600 dark:text-red-400" : isHighlight ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100";
    return `
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <p class="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">${title}</p>
        <p class="text-lg font-bold mt-2 ${valueClass}" data-field="${field}">${formatCurrency(value)}</p>
      </div>
    `;
  }

  function renderStatusOptions(currentStatus) {
    const statuses = ["pending", "ready", "paid", "on_hold", "cancelled"];
    return statuses
      .map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${humanizeStatus(status)}</option>`)
      .join("");
  }

  function showModalLoading(message) {
    if (!elements.modalsRoot) return;
    elements.modalsRoot.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-900 px-6 py-4 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-200">
          <svg class="w-5 h-5 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          <span class="text-sm font-medium">${escapeHtml(message)}</span>
        </div>
      </div>
    `;
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    if (!elements.modalsRoot) return;
    elements.modalsRoot.innerHTML = "";
    document.body.classList.remove("overflow-hidden");
  }

  function validateEntryPayload(entry) {
    if (!entry.entry_type) return "Entry type is required";
    if (!entry.direction) return "Direction is required";
    if (entry.amount == null || Number(entry.amount) <= 0) return "Amount must be greater than zero";
    return null;
  }

  function updateRecordInState(updatedRecord) {
    if (!updatedRecord) return;
    const index = state.records.findIndex((record) => record.id === updatedRecord.id);
    if (index >= 0) {
      state.records[index] = { ...state.records[index], ...updatedRecord };
    } else {
      state.records.push(updatedRecord);
    }
  }

  function computeRecordMetrics(record) {
    const basePay = toNumber(record.fixed_salary_amount) + toNumber(record.hybrid_base_amount);
    const allowances = toNumber(record.fuel_allowance_total) + toNumber(record.adjustments_positive);
    const deductions = toNumber(record.leave_deduction_total) + toNumber(record.adjustments_negative) + toNumber(record.advances_total);
    return {
      basePay,
      allowances,
      deductions,
    };
  }

  function renderStatusBadge(status) {
    const config = {
      pending: { text: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" },
      ready: { text: "Ready", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800" },
      paid: { text: "Paid", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" },
      on_hold: { text: "On Hold", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800" },
      cancelled: { text: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800" },
    };
    const info = config[status] || config.pending;
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${info.color}">${info.text}</span>`;
  }

  function humanizeStatus(status) {
    return String(status || "")
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  async function fetchJSON(url, { body, headers, ...rest } = {}) {
    const options = {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(headers || {}),
      },
      ...rest,
    };

    if (body instanceof FormData) {
      options.body = body;
    } else if (body != null) {
      options.body = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage = typeof data === "string" ? data : data?.error || response.statusText;
      throw new Error(errorMessage);
    }

    return data;
  }

  function setLoading(isLoading, target, loadingLabel = "Loading…") {
    state.isLoading = isLoading;
    if (!target) return;
    if (target.tagName?.toLowerCase() === "button") {
      if (!target.dataset.originalContent) {
        target.dataset.originalContent = target.innerHTML;
      }
      target.disabled = Boolean(isLoading);
      if (isLoading) {
        target.innerHTML = `
          <span class="inline-flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            ${escapeHtml(loadingLabel)}
          </span>
        `;
      } else {
        target.innerHTML = target.dataset.originalContent;
      }
      return;
    }

    target.classList.toggle("hidden", !isLoading);
  }

  function toNumber(value, precision = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    const factor = 10 ** precision;
    return Math.round(num * factor) / factor;
  }

  function formatCurrency(value) {
    const numeric = Number(value) || 0;
    if (typeof window !== "undefined" && typeof window.formatIndianCurrency === "function") {
      return window.formatIndianCurrency(numeric);
    }
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric);
  }

  function formatNumber(value) {
    const numeric = Number(value) || 0;
    if (typeof window !== "undefined" && typeof window.formatIndianNumber === "function") {
      return window.formatIndianNumber(numeric);
    }
    return new Intl.NumberFormat("en-IN").format(numeric);
  }

  function formatDate(dateInput) {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return dateInput;
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatCycleDateRange(start, end) {
    if (!start && !end) return "-";
    const startLabel = formatDate(start);
    const endLabel = end ? formatDate(end) : startLabel;
    return `${startLabel} – ${endLabel}`;
  }

  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, delay = 200) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
})();

