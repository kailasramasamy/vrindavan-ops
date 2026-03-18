(function () {
  const API_BASE = "/payments/api/employees";
  const recordId = window.EMPLOYEE_PAYMENT_RECORD_ID;
  const selectedMonth = window.EMPLOYEE_PAYMENT_SELECTED_MONTH || "";

  if (!recordId) {
    console.error("Employee payment record ID not found");
    return;
  }

  const elements = {
    statusBadge: document.querySelector('[data-field="status-badge"]'),
    statusSelect: document.querySelector('[data-field="status-select"]'),
    paymentDateInput: document.querySelector('[data-field="payment-date-input"]'),
    updateStatusBtn: document.querySelector('[data-action="update-status"]'),
    remarks: document.querySelector('[data-field="remarks"]'),
    updateRemarksBtn: document.querySelector('[data-action="update-remarks"]'),
    addEntryBtn: document.querySelector('[data-action="add-entry"]'),
    entriesTableBody: document.getElementById("entriesTableBody"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (elements.updateStatusBtn) {
      elements.updateStatusBtn.addEventListener("click", handleUpdateStatus);
    }

    if (elements.updateRemarksBtn) {
      elements.updateRemarksBtn.addEventListener("click", handleUpdateRemarks);
    }

    if (elements.addEntryBtn) {
      elements.addEntryBtn.addEventListener("click", showAddEntryModal);
    }

    // Handle delete entry buttons
    document.addEventListener("click", (e) => {
      if (e.target.matches('[data-action="delete-entry"]')) {
        const entryId = e.target.getAttribute("data-entry-id");
        if (entryId) {
          handleDeleteEntry(Number(entryId));
        }
      }
      if (e.target.matches('[data-action="deduct-loan-payment"]')) {
        const loanId = e.target.getAttribute("data-loan-id");
        const loanBalance = parseFloat(e.target.getAttribute("data-loan-balance") || 0);
        if (loanId) {
          showLoanPaymentModal(Number(loanId), loanBalance);
        }
      }
    });
  }

  async function handleUpdateStatus() {
    const status = elements.statusSelect?.value;
    const paymentDate = elements.paymentDateInput?.value || null;

    if (!status) {
      showErrorToast?.("Please select a status");
      return;
    }

    try {
      const data = await fetchJSON(`${API_BASE}/records/${recordId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentDate }),
      });

      if (data && data.success) {
        updateStatusBadge(status);
        showSuccessToast?.("Payment status updated successfully");
        if (data.record) {
          updateSummary(data.record);
        }
      } else {
        showErrorToast?.(data?.error || "Failed to update status");
      }
    } catch (error) {
      console.error("handleUpdateStatus error:", error);
      showErrorToast?.("Failed to update payment status");
    }
  }

  async function handleUpdateRemarks() {
    const remarks = elements.remarks?.value || "";

    try {
      const data = await fetchJSON(`${API_BASE}/records/${recordId}/remarks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });

      if (data && data.success) {
        showSuccessToast?.("Remarks saved successfully");
      } else {
        showErrorToast?.(data?.error || "Failed to save remarks");
      }
    } catch (error) {
      console.error("handleUpdateRemarks error:", error);
      showErrorToast?.("Failed to save remarks");
    }
  }

  function showAddEntryModal() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm";
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Add Entry</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" data-action="close-modal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <form data-form="add-entry" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry Type</label>
            <select name="entry_type" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="allowance">Allowance</option>
              <option value="bonus">Bonus</option>
              <option value="adjustment">Adjustment</option>
              <option value="deduction">Deduction</option>
              <option value="advance">Advance</option>
              <option value="leave">Leave</option>
              <option value="loan">Loan Payment</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
            <input type="number" name="amount" step="0.01" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="0.00">
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Use negative values for deductions</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" name="entry_date" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Optional description"></textarea>
          </div>
          <div class="flex gap-3 justify-end">
            <button type="button" data-action="close-modal" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Cancel
            </button>
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              Add Entry
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('[data-form="add-entry"]');
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const entryData = {
        entry_type: formData.get("entry_type"),
        amount: Number(formData.get("amount")),
        description: formData.get("description") || null,
        entry_date: formData.get("entry_date") || null,
      };

      try {
        const data = await fetchJSON(`${API_BASE}/records/${recordId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entryData),
        });

        if (data && data.success) {
          showSuccessToast?.("Entry added successfully");
          modal.remove();
          location.reload(); // Reload to show updated entries and summary
        } else {
          showErrorToast?.(data?.error || "Failed to add entry");
        }
      } catch (error) {
        console.error("addEntry error:", error);
        showErrorToast?.("Failed to add entry");
      }
    });

    modal.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
      btn.addEventListener("click", () => modal.remove());
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  function showLoanPaymentModal(loanId, maxBalance) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm";
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Deduct Loan Payment</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" data-action="close-modal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <form data-form="loan-payment" class="space-y-4">
          <div class="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Outstanding Balance</p>
            <p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">₹${maxBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount</label>
            <input type="number" name="amount" step="0.01" min="0.01" max="${maxBalance}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="0.00">
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum: ₹${maxBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" name="entry_date" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value="${new Date().toISOString().slice(0, 10)}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea name="description" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Optional description">Loan repayment</textarea>
          </div>
          <div class="flex gap-3 justify-end">
            <button type="button" data-action="close-modal" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Cancel
            </button>
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Deduct Payment
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('[data-form="loan-payment"]');
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const amount = Math.abs(Number(formData.get("amount")));
      
      if (amount <= 0) {
        showErrorToast?.("Payment amount must be greater than 0");
        return;
      }
      
      if (amount > maxBalance) {
        showErrorToast?.(`Payment amount cannot exceed outstanding balance of ₹${maxBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        return;
      }

      const entryData = {
        entry_type: "loan",
        amount: -amount, // Negative for deduction
        description: formData.get("description") || `Loan payment - Loan #${loanId}`,
        entry_date: formData.get("entry_date") || null,
        loan_id: loanId, // Pass loan_id to create repayment record
      };

      try {
        const data = await fetchJSON(`${API_BASE}/records/${recordId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entryData),
        });

        if (data && data.success) {
          showSuccessToast?.("Loan payment deducted successfully");
          modal.remove();
          location.reload(); // Reload to show updated entries, summary, and loan balances
        } else {
          showErrorToast?.(data?.error || "Failed to deduct loan payment");
        }
      } catch (error) {
        console.error("deductLoanPayment error:", error);
        showErrorToast?.("Failed to deduct loan payment");
      }
    });

    modal.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
      btn.addEventListener("click", () => modal.remove());
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  async function handleDeleteEntry(entryId) {
    if (!confirm("Are you sure you want to delete this entry?")) {
      return;
    }

    try {
      const data = await fetchJSON(`${API_BASE}/entries/${entryId}`, {
        method: "DELETE",
      });

      if (data && data.success) {
        showSuccessToast?.("Entry deleted successfully");
        location.reload(); // Reload to show updated entries and summary
      } else {
        showErrorToast?.(data?.error || "Failed to delete entry");
      }
    } catch (error) {
      console.error("handleDeleteEntry error:", error);
      showErrorToast?.("Failed to delete entry");
    }
  }

  function updateStatusBadge(status) {
    if (!elements.statusBadge) return;

    const statusMap = {
      pending: { label: "Pending", class: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" },
      ready: { label: "Ready", class: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800" },
      paid: { label: "Paid", class: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" },
      on_hold: { label: "On Hold", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800" },
      cancelled: { label: "Cancelled", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800" },
    };

    const config = statusMap[status] || statusMap.pending;
    elements.statusBadge.textContent = config.label;
    elements.statusBadge.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${config.class}`;
  }

  function updateSummary(record) {
    // Update summary fields if needed
    const baseSalaryEl = document.querySelector('[data-field="base-salary"]');
    const foodAllowanceEl = document.querySelector('[data-field="food-allowance"]');
    const fuelAllowanceEl = document.querySelector('[data-field="fuel-allowance"]');
    const creditsEl = document.querySelector('[data-field="credits"]');
    const deductionsEl = document.querySelector('[data-field="deductions"]');
    const netPayEl = document.querySelector('[data-field="net"]');

    if (baseSalaryEl) {
      baseSalaryEl.textContent = `₹${formatNumber(record.base_salary || 0)}`;
    }
    if (foodAllowanceEl) {
      foodAllowanceEl.textContent = `₹${formatNumber(record.food_allowance || 0)}`;
    }
    if (fuelAllowanceEl) {
      fuelAllowanceEl.textContent = `₹${formatNumber(record.fuel_allowance || 0)}`;
    }
    if (creditsEl) {
      creditsEl.textContent = `₹${formatNumber(record.total_additions || 0)}`;
    }
    if (deductionsEl) {
      deductionsEl.textContent = `₹${formatNumber(record.total_deductions || 0)}`;
    }
    if (netPayEl) {
      netPayEl.textContent = `₹${formatNumber(record.net_pay || 0)}`;
    }
  }

  function formatNumber(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  async function fetchJSON(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("fetchJSON error:", error);
      throw error;
    }
  }

  // Toast functions (if available)
  const showSuccessToast = window.showSuccessToast || ((msg) => console.log("Success:", msg));
  const showErrorToast = window.showErrorToast || ((msg) => console.error("Error:", msg));
})();

