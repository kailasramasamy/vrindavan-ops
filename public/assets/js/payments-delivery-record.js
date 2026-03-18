(function () {
  const API_BASE = "/payments/api/delivery";
  const recordData = window.DELIVERY_RECORD_DATA || {};
  const entriesData = Array.isArray(window.DELIVERY_RECORD_ENTRIES) ? window.DELIVERY_RECORD_ENTRIES : [];
  const ordersData = Array.isArray(window.DELIVERY_RECORD_ORDERS) ? window.DELIVERY_RECORD_ORDERS : [];
  const STORAGE_KEY = "deliveryPaymentsState";
  const selectedMonth = window.DELIVERY_RECORD_SELECTED_MONTH || null;

  if (selectedMonth) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      const filters = saved && typeof saved === "object" && saved.filters ? saved.filters : {};
      const payload = { month: selectedMonth, filters };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to cache selected month", error);
    }
  }

  let currentRecord = { ...recordData };
  let currentEntries = [...entriesData];
  let currentOrders = [...ordersData];

  const ordersPagination = {
    currentPage: 1,
    itemsPerPage: 25,
  };

  const elements = {
    statusSelect: document.querySelector("[data-field='status-select']"),
    statusReason: document.querySelector("[data-field='status-reason']"),
    statusButton: document.querySelector("[data-action='update-status']"),
    statusBadge: document.querySelector("[data-field='status-badge']"),
    remarksTextarea: document.querySelector("[data-field='remarks']"),
    remarksButton: document.querySelector("[data-action='update-remarks']"),
    entriesBody: document.querySelector("[data-field='entries-body']"),
    leaveEntriesBody: document.querySelector("[data-field='leave-entries-body']"),
    leaveForm: document.querySelector("[data-form='leave-entry']"),
    ordersBody: document.querySelector("[data-field='orders-body']"),
    ordersWrapper: document.querySelector("[data-field='orders-wrapper']"),
    ordersPaginationInfo: document.querySelector("[data-field='orders-pagination-info']"),
    ordersPaginationControls: document.querySelector("[data-field='orders-pagination-controls']"),
    exportCsvButton: document.getElementById("exportCommissionCsv"),
    entryForm: document.querySelector("[data-form='new-entry']"),
    partnerName: document.querySelector("[data-field='partner-name']"),
    partnerMeta: document.querySelector("[data-field='partner-meta']"),
    cycleRange: document.querySelector("[data-field='cycle-range']"),
    paymentType: document.querySelector("[data-field='payment-type']"),
    totalOrders: document.querySelector("[data-field='total-orders']"),
    netPay: document.querySelector("[data-field='net']"),
    basePay: document.querySelector("[data-field='base-pay']"),
    commission: document.querySelector("[data-field='commission']"),
    allowances: document.querySelector("[data-field='allowances']"),
    deductions: document.querySelector("[data-field='deductions']"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!currentRecord?.id) {
      return;
    }

    updateSummary();
    renderEntriesList();
    renderLeaveEntriesList();
    renderOrdersList();

    if (elements.statusSelect) {
      elements.statusSelect.value = currentRecord.payment_status || "pending";
    }

    if (elements.statusButton) {
      elements.statusButton.addEventListener("click", handleStatusUpdate);
    }

    if (elements.remarksButton) {
      elements.remarksButton.addEventListener("click", handleRemarksUpdate);
    }

    if (elements.entryForm) {
      elements.entryForm.addEventListener("submit", handleCreateEntry);
    }

    if (elements.leaveForm) {
      elements.leaveForm.addEventListener("submit", handleCreateLeave);
      
      // Sync date inputs: when start date changes, update end date min
      const startDateInput = elements.leaveForm.querySelector('input[name="leave_start_date"]');
      const endDateInput = elements.leaveForm.querySelector('input[name="leave_end_date"]');
      
      if (startDateInput && endDateInput) {
        startDateInput.addEventListener("change", () => {
          if (startDateInput.value) {
            endDateInput.min = startDateInput.value;
            if (endDateInput.value && endDateInput.value < startDateInput.value) {
              endDateInput.value = startDateInput.value;
            }
          }
        });
        
        endDateInput.addEventListener("change", () => {
          if (endDateInput.value && startDateInput.value && endDateInput.value < startDateInput.value) {
            startDateInput.value = endDateInput.value;
          }
        });
      }
    }

    if (elements.exportCsvButton) {
      elements.exportCsvButton.addEventListener("click", handleExportCommissionCsv);
    }
  }

  function updateSummary(record = currentRecord) {
    if (!record) return;

    if (elements.partnerName) {
      elements.partnerName.textContent = record.delivery_boy_name || "Delivery Partner";
    }

    if (elements.partnerMeta) {
      const parts = [];
      if (record.phone) {
        parts.push(`📞 ${record.phone}`);
      }
      if (record.delivery_boy_user_id != null) {
        parts.push(`User ID: ${record.delivery_boy_user_id}`);
      }
      elements.partnerMeta.textContent = parts.join(" · ");
    }

    if (elements.paymentType) {
      elements.paymentType.textContent = (record.payment_type || "commission").toLowerCase();
    }

    if (elements.totalOrders) {
      elements.totalOrders.textContent = formatNumber(record.total_orders || 0);
    }

    if (elements.netPay) {
      elements.netPay.textContent = formatCurrency(record.net_pay);
    }

    if (elements.statusBadge) {
      const status = (record.payment_status || "pending").toLowerCase();
      const statusText = status.replace(/_/g, " ");
      const config = {
        pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
        ready: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
        paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
        on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
        cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
      };
      const statusClass = config[status] || config.pending;
      // Remove existing status classes and add new ones
      elements.statusBadge.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`;
      elements.statusBadge.textContent = statusText.charAt(0).toUpperCase() + statusText.slice(1);
    }

    if (elements.basePay) {
      elements.basePay.textContent = formatCurrency(toNumber(record.fixed_salary_amount) + toNumber(record.hybrid_base_amount));
    }
    if (elements.commission) {
      elements.commission.textContent = formatCurrency(record.commission_amount);
    }
    if (elements.allowances) {
      elements.allowances.textContent = formatCurrency(record.fuel_allowance_total || 0);
    }
    if (elements.deductions) {
      const deductions =
        toNumber(record.leave_deduction_total) + toNumber(record.adjustments_negative) + toNumber(record.advances_total);
      elements.deductions.textContent = formatCurrency(deductions);
    }
  }

  function renderEntriesList(entries = currentEntries) {
    if (!elements.entriesBody) return;
    // Filter out leave entries (they're shown separately)
    const nonLeaveEntries = entries.filter((entry) => entry.entry_type !== "leave");
    if (!nonLeaveEntries || nonLeaveEntries.length === 0) {
      elements.entriesBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-5 text-center text-gray-500 dark:text-gray-400 text-sm">
            No manual adjustments recorded yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.entriesBody.innerHTML = nonLeaveEntries
      .map((entry) => {
        const directionLabel = entry.direction === "debit" ? "Debit" : "Credit";
        const amountClass =
          entry.direction === "debit" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
        return `
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium capitalize">${escapeHtml(
              entry.entry_type.replace("_", " "),
            )}</td>
            <td class="px-4 py-3 text-sm ${amountClass} font-semibold">${directionLabel}</td>
            <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-semibold">${formatCurrency(entry.amount)}</td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${entry.quantity != null ? formatNumber(entry.quantity) : "—"}</td>
            <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              ${entry.reason ? `<div>${escapeHtml(entry.reason)}</div>` : ""}
              ${entry.notes ? `<div class="text-xs text-gray-400 dark:text-gray-500 mt-1">${escapeHtml(entry.notes)}</div>` : ""}
              ${entry.effective_date ? `<div class="text-xs text-gray-400 dark:text-gray-500 mt-1">${formatDate(entry.effective_date)}</div>` : ""}
            </td>
            <td class="px-4 py-3 text-right">
              <button
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

    elements.entriesBody.querySelectorAll("[data-action='delete-entry']").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const entryId = Number(event.currentTarget.getAttribute("data-entry-id"));
        if (!entryId) return;
        const confirmed = window.confirm("Delete this entry?");
        if (!confirmed) return;
        await handleDeleteEntry(entryId);
      });
    });
  }

  function renderLeaveEntriesList(entries = currentEntries) {
    if (!elements.leaveEntriesBody) return;
    const leaveEntries = entries.filter((entry) => entry.entry_type === "leave");
    
    if (!leaveEntries || leaveEntries.length === 0) {
      elements.leaveEntriesBody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-5 text-center text-gray-500 dark:text-gray-400 text-sm">
            No leave entries recorded yet.
          </td>
        </tr>
      `;
      return;
    }

    // Group leave entries by date range (entries with same effective_date or consecutive dates)
    const groupedLeaves = [];
    const sortedLeaves = [...leaveEntries].sort((a, b) => {
      const dateA = new Date(a.effective_date || a.created_at);
      const dateB = new Date(b.effective_date || b.created_at);
      return dateA - dateB;
    });

    let currentGroup = null;
    sortedLeaves.forEach((entry) => {
      const entryDate = new Date(entry.effective_date || entry.created_at);
      if (!currentGroup || !areConsecutiveDates(new Date(currentGroup.endDate), entryDate)) {
        currentGroup = {
          startDate: entryDate,
          endDate: entryDate,
          entries: [entry],
          totalDays: toNumber(entry.quantity || 1),
          totalDeduction: toNumber(entry.amount),
          reason: entry.reason || "",
        };
        groupedLeaves.push(currentGroup);
      } else {
        currentGroup.endDate = entryDate;
        currentGroup.entries.push(entry);
        currentGroup.totalDays += toNumber(entry.quantity || 1);
        currentGroup.totalDeduction += toNumber(entry.amount);
        if (entry.reason && !currentGroup.reason) {
          currentGroup.reason = entry.reason;
        }
      }
    });

    elements.leaveEntriesBody.innerHTML = groupedLeaves
      .map((group, index) => {
        const startStr = formatDate(group.startDate);
        const endStr = formatDate(group.endDate);
        const dateRange = startStr === endStr ? startStr : `${startStr} to ${endStr}`;
        const entryIds = group.entries.map((e) => e.id).join(",");
        return `
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${escapeHtml(dateRange)}</td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${formatNumber(group.totalDays)}</td>
            <td class="px-4 py-3 text-sm text-right font-semibold text-red-600 dark:text-red-400">${formatCurrency(group.totalDeduction)}</td>
            <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(group.reason || "—")}</td>
            <td class="px-4 py-3 text-right">
              <button
                class="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                data-action="delete-leave"
                data-entry-ids="${entryIds}"
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

    elements.leaveEntriesBody.querySelectorAll("[data-action='delete-leave']").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const entryIds = event.currentTarget.getAttribute("data-entry-ids").split(",").map(Number).filter(Boolean);
        if (!entryIds.length) return;
        const confirmed = window.confirm(`Delete ${entryIds.length} leave ${entryIds.length === 1 ? "entry" : "entries"}?`);
        if (!confirmed) return;
        // Delete all entries in parallel
        await Promise.all(entryIds.map((id) => handleDeleteEntry(id)));
      });
    });
  }

  function areConsecutiveDates(date1, date2) {
    const diff = Math.abs(date2 - date1);
    return diff <= 1000 * 60 * 60 * 24; // 1 day difference
  }

  async function handleCreateLeave(event) {
    event.preventDefault();
    if (!elements.leaveForm) return;
    const submitButton = elements.leaveForm.querySelector("button[type='submit']");
    const formData = new FormData(elements.leaveForm);
    const payload = {
      leave_start_date: formData.get("leave_start_date"),
      leave_end_date: formData.get("leave_end_date"),
      reason: formData.get("leave_reason")?.trim() || null,
    };

    if (!payload.leave_start_date || !payload.leave_end_date) {
      showErrorToast?.("Please select both start and end dates");
      return;
    }

    setLoading(submitButton, true, "Calculating…");
    try {
      const data = await fetchJSON(`${API_BASE}/records/${currentRecord.id}/leave`, {
        method: "POST",
        body: payload,
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to create leave entries");
      }
      // Refresh entries and record
      const entriesResult = await fetchJSON(`${API_BASE}/records/${currentRecord.id}/entries`);
      if (entriesResult.success) {
        currentEntries = entriesResult.entries || [];
      }
      if (data.record) {
        currentRecord = data.record;
      }
      renderLeaveEntriesList();
      renderEntriesList();
      updateSummary();
      elements.leaveForm.reset();
      showSuccessToast?.(`Leave added: ${data.leaveDays} day(s), Deduction: ${formatCurrency(data.totalDeduction)}`);
    } catch (error) {
      console.error("handleCreateLeave error:", error);
      showErrorToast?.(error.message || "Unable to create leave entries");
    } finally {
      setLoading(submitButton, false);
    }
  }

  function renderOrdersList(orders = currentOrders) {
    if (!elements.ordersBody) return;
    if (!orders || orders.length === 0) {
      elements.ordersBody.innerHTML = `
        <tr>
          <td colspan="7" class="px-4 py-5 text-center text-gray-500 dark:text-gray-400 text-sm">
            No delivered orders recorded for this cycle.
          </td>
        </tr>
      `;
      if (elements.ordersPaginationInfo) {
        elements.ordersPaginationInfo.textContent = "";
      }
      if (elements.ordersPaginationControls) {
        elements.ordersPaginationControls.innerHTML = "";
      }
      return;
    }

    const totalItems = orders.length;
    const totalPages = Math.ceil(totalItems / ordersPagination.itemsPerPage);
    
    // Reset to page 1 if current page is beyond available pages
    if (ordersPagination.currentPage > totalPages && totalPages > 0) {
      ordersPagination.currentPage = 1;
    }
    
    const startIndex = (ordersPagination.currentPage - 1) * ordersPagination.itemsPerPage;
    const endIndex = Math.min(startIndex + ordersPagination.itemsPerPage, totalItems);
    const paginatedOrders = orders.slice(startIndex, endIndex);

    elements.ordersBody.innerHTML = paginatedOrders
      .map((order) => {
        return `
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(
              order.order_number || order.order_id,
            )}</td>
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

    // Update pagination info
    if (elements.ordersPaginationInfo) {
      if (totalItems === 0) {
        elements.ordersPaginationInfo.textContent = "";
      } else {
        elements.ordersPaginationInfo.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${formatNumber(totalItems)} orders`;
      }
    }

    // Render pagination controls
    if (elements.ordersPaginationControls) {
      if (totalPages <= 1) {
        elements.ordersPaginationControls.innerHTML = "";
      } else {
        const prevDisabled = ordersPagination.currentPage === 1;
        const nextDisabled = ordersPagination.currentPage === totalPages;

        elements.ordersPaginationControls.innerHTML = `
          <button
            data-action="orders-prev"
            ${prevDisabled ? 'disabled class="opacity-50 cursor-not-allowed"' : 'class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"'}
          >
            Previous
          </button>
          <span class="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">
            Page ${ordersPagination.currentPage} of ${totalPages}
          </span>
          <button
            data-action="orders-next"
            ${nextDisabled ? 'disabled class="opacity-50 cursor-not-allowed"' : 'class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"'}
          >
            Next
          </button>
        `;

        // Attach event listeners
        const prevButton = elements.ordersPaginationControls.querySelector("[data-action='orders-prev']");
        const nextButton = elements.ordersPaginationControls.querySelector("[data-action='orders-next']");

        if (prevButton && !prevDisabled) {
          prevButton.addEventListener("click", () => {
            if (ordersPagination.currentPage > 1) {
              ordersPagination.currentPage--;
              renderOrdersList();
            }
          });
        }

        if (nextButton && !nextDisabled) {
          nextButton.addEventListener("click", () => {
            if (ordersPagination.currentPage < totalPages) {
              ordersPagination.currentPage++;
              renderOrdersList();
            }
          });
        }
      }
    }
  }

  async function handleStatusUpdate() {
    if (!elements.statusSelect || !elements.statusButton) return;
    const status = elements.statusSelect.value;
    const reason = elements.statusReason?.value?.trim() || null;
    setLoading(elements.statusButton, true, "Updating…");
    try {
      const data = await fetchJSON(`${API_BASE}/records/${currentRecord.id}/status`, {
        method: "PATCH",
        body: { status, reason },
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to update payment status");
      }
      currentRecord = data.record || currentRecord;
      updateSummary();
      if (elements.statusReason) {
        elements.statusReason.value = "";
      }
      showSuccessToast?.("Payment status updated");
    } catch (error) {
      console.error("handleStatusUpdate error:", error);
      showErrorToast?.(error.message || "Unable to update payment status");
    } finally {
      setLoading(elements.statusButton, false);
    }
  }

  async function handleRemarksUpdate() {
    if (!elements.remarksTextarea || !elements.remarksButton) return;
    const remarks = elements.remarksTextarea.value;
    setLoading(elements.remarksButton, true, "Saving…");
    try {
      const data = await fetchJSON(`${API_BASE}/records/${currentRecord.id}/remarks`, {
        method: "PATCH",
        body: { remarks },
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to update remarks");
      }
      currentRecord = data.record || currentRecord;
      showSuccessToast?.("Remarks updated");
    } catch (error) {
      console.error("handleRemarksUpdate error:", error);
      showErrorToast?.(error.message || "Unable to update remarks");
    } finally {
      setLoading(elements.remarksButton, false);
    }
  }

  async function handleCreateEntry(event) {
    event.preventDefault();
    if (!elements.entryForm) return;
    const submitButton = elements.entryForm.querySelector("button[type='submit']");
    const formData = new FormData(elements.entryForm);
    const payload = {
      entry_type: formData.get("entry_type"),
      direction: formData.get("direction"),
      amount: formData.get("amount"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
      notes: formData.get("notes"),
      effective_date: formData.get("effective_date"),
    };
    const validationError = validateEntryPayload(payload);
    if (validationError) {
      showErrorToast?.(validationError);
      return;
    }
    setLoading(submitButton, true, "Adding…");
    try {
      const data = await fetchJSON(`${API_BASE}/records/${currentRecord.id}/entries`, {
        method: "POST",
        body: payload,
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to add entry");
      }
      currentEntries = data.entries || [];
      currentRecord = data.record || currentRecord;
      renderEntriesList();
      updateSummary();
      elements.entryForm.reset();
      showSuccessToast?.("Entry added successfully");
    } catch (error) {
      console.error("handleCreateEntry error:", error);
      showErrorToast?.(error.message || "Unable to add entry");
    } finally {
      setLoading(submitButton, false);
    }
  }

  async function handleDeleteEntry(entryId) {
    try {
      const data = await fetchJSON(`${API_BASE}/entries/${entryId}`, {
        method: "DELETE",
      });
      if (!data || !data.success) {
        throw new Error(data?.error || "Unable to delete entry");
      }
      currentEntries = data.entries || [];
      currentRecord = data.record || currentRecord;
      renderEntriesList();
      renderLeaveEntriesList();
      updateSummary();
      showSuccessToast?.("Entry deleted successfully");
    } catch (error) {
      console.error("handleDeleteEntry error:", error);
      showErrorToast?.(error.message || "Unable to delete entry");
    }
  }

  function handleExportCommissionCsv() {
    if (!currentOrders || currentOrders.length === 0) {
      showWarningToast?.("No commission data available to export");
      return;
    }

    // CSV headers with proper rupee symbol
    const rupeeSymbol = "₹";
    const headers = ["Order", "Date", "Product", "Product Unit Size", "Quantity", "Per Product Commission (" + rupeeSymbol + ")", "Commission Source", "Commission (" + rupeeSymbol + ")"];

    // Convert orders to CSV rows
    const csvRows = [headers.join(",")];

    currentOrders.forEach((order) => {
      const commission = toNumber(order.commission_amount || 0);
      const quantity = toNumber(order.quantity || 0);
      const perProductCommission = quantity > 0 ? commission / quantity : 0;
      const row = [
        escapeCsvField(order.order_number || order.order_id || ""),
        escapeCsvField(formatDate(order.order_date)),
        escapeCsvField(order.product_name || "—"),
        escapeCsvField(order.product_unit_size || ""),
        escapeCsvField(quantity),
        escapeCsvField(perProductCommission),
        escapeCsvField((order.commission_source || "standard").toUpperCase()),
        escapeCsvField(commission),
      ];
      csvRows.push(row.join(","));
    });

    // Create CSV content with UTF-8 BOM for proper rupee symbol display in Excel
    const csvContent = "\uFEFF" + csvRows.join("\n");

    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    // Generate filename
    const partnerName = (currentRecord.delivery_boy_name || "DeliveryPartner").replace(/[^a-zA-Z0-9]/g, "_");
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `Commission_Breakdown_${partnerName}_${dateStr}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccessToast?.("Commission breakdown exported successfully");
  }

  function escapeCsvField(field) {
    if (field == null) return "";
    const str = String(field);
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function validateEntryPayload(entry) {
    const allowedTypes = new Set(["fuel_allowance", "leave", "adjustment", "advance"]);
    const allowedDirections = new Set(["credit", "debit"]);
    if (!allowedTypes.has(entry.entry_type)) {
      return "Select a valid entry type";
    }
    if (!allowedDirections.has(entry.direction)) {
      return "Select a valid entry direction";
    }
    if (entry.amount == null || Number.isNaN(Number(entry.amount)) || Number(entry.amount) <= 0) {
      return "Enter a valid amount";
    }
    return null;
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

  function setLoading(button, isLoading, loadingLabel = "Loading…") {
    if (!button) return;
    if (!button.dataset.originalContent) {
      button.dataset.originalContent = button.innerHTML;
    }
    button.disabled = Boolean(isLoading);
    if (isLoading) {
      button.innerHTML = `
        <span class="inline-flex items-center gap-2">
          <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          ${escapeHtml(loadingLabel)}
        </span>
      `;
    } else {
      button.innerHTML = button.dataset.originalContent;
    }
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

  function renderStatusBadge(status) {
    const config = {
      pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
      ready: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
      paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
      on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
    };
    const normalized = (status || "pending").toLowerCase();
    const info = config[normalized] || config.pending;
    const text = normalized.replace(/_/g, " ");
    return `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${info}">${escapeHtml(
      text.charAt(0).toUpperCase() + text.slice(1),
    )}</span>`;
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
})();

