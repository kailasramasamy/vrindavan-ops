const productsAnalyticsList = (() => {
  const API_ENDPOINT = "/analytics/api/products/list";

  const state = {
    type: "total",
    range: "30d",
    startDate: null,
    endDate: null,
    usesRange: false,
    categoryId: null,
    subcategoryId: null,
    categories: [],
    subcategories: [],
    list: [],
    loading: false,
  };

  function init() {
    const config = window.productsListConfig || {};
    state.type = config.type || "total";
    state.range = config.range || "30d";
    state.startDate = config.startDate || null;
    state.endDate = config.endDate || null;
    state.usesRange = Boolean(config.usesRange);
    if (["best_selling", "worst_selling", "no_sales"].includes(state.type)) {
      state.usesRange = true;
    }

    const rangeFilter = document.getElementById("productsListRangeFilter");
    const customRange = document.getElementById("productsListCustomRange");
    const startDateInput = document.getElementById("productsListStartDate");
    const endDateInput = document.getElementById("productsListEndDate");
    const applyCustomButton = document.getElementById("productsListApplyCustomRange");
    const categoryFilter = document.getElementById("productsListCategoryFilter");
    const subcategoryFilter = document.getElementById("productsListSubcategoryFilter");
    const resetButton = document.getElementById("productsListResetFilters");

    if (rangeFilter) {
      rangeFilter.value = state.range;
      rangeFilter.addEventListener("change", () => {
        state.range = rangeFilter.value;
        if (state.range === "custom") {
          customRange?.classList.remove("hidden");
        } else {
          customRange?.classList.add("hidden");
          state.startDate = null;
          state.endDate = null;
          fetchData();
        }
      });
    }

    if (applyCustomButton) {
      applyCustomButton.addEventListener("click", () => {
        if (startDateInput && endDateInput && startDateInput.value && endDateInput.value) {
          state.startDate = startDateInput.value;
          state.endDate = endDateInput.value;
          fetchData();
        }
      });
    }

    if (categoryFilter) {
      categoryFilter.addEventListener("change", () => {
        state.categoryId = categoryFilter.value || null;
        state.subcategoryId = null;
        fetchData();
      });
    }

    if (subcategoryFilter) {
      subcategoryFilter.addEventListener("change", () => {
        state.subcategoryId = subcategoryFilter.value || null;
        fetchData();
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        state.categoryId = null;
        state.subcategoryId = null;
        fetchData();
      });
    }

    fetchData();
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    const root = document.getElementById("productsListRoot");
    const spinner = document.getElementById("productsListSpinner");
    
    if (root) {
      root.classList.toggle("opacity-60", isLoading);
      root.classList.toggle("pointer-events-none", isLoading);
    }
    
    if (spinner) {
      if (isLoading) {
        spinner.classList.remove("hidden");
      } else {
        spinner.classList.add("hidden");
      }
    }
  }

  async function fetchData() {
    if (state.loading) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("type", state.type);
      if (state.categoryId) params.set("category_id", state.categoryId);
      if (state.subcategoryId) params.set("subcategory_id", state.subcategoryId);
      
      // Always send range parameters for date filtering
      params.set("range", state.range);
      if (state.range === "custom" && state.startDate && state.endDate) {
        params.set("start", state.startDate);
        params.set("end", state.endDate);
      }

      const response = await fetch(`${API_ENDPOINT}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Unknown API error");
      }

      state.list = Array.isArray(payload.data.list) ? payload.data.list : [];
      state.categories = Array.isArray(payload.data.categories) ? payload.data.categories : [];
      state.subcategories = Array.isArray(payload.data.subcategories) ? payload.data.subcategories : [];

      if (payload.data.range) {
        state.range = payload.data.range.range || state.range;
        state.startDate = payload.data.range.startDate || state.startDate;
        state.endDate = payload.data.range.endDate || state.endDate;
      }

      updateRangeControls();
      updateRangeSummary();
      populateFilters();
      render();
    } catch (error) {
      console.error("Failed to load products list:", error);
      showError("Failed to load products. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function updateRangeSummary() {
    const rangeSummary = document.getElementById("productsListRangeSummary");
    if (!rangeSummary) return;

    if (state.range === "custom" && state.startDate && state.endDate) {
      rangeSummary.textContent = `Range: ${formatDisplayDate(state.startDate)} to ${formatDisplayDate(
        state.endDate
      )} (Custom)`;
    } else if (state.startDate && state.endDate) {
      rangeSummary.textContent = `Range: ${formatDisplayDate(state.startDate)} to ${formatDisplayDate(
        state.endDate
      )} (Mode: ${state.range})`;
    } else {
      rangeSummary.textContent = "Range: All data (date filters ignored)";
    }
  }

  function updateRangeControls() {
    const rangeFilter = document.getElementById("productsListRangeFilter");
    const customRange = document.getElementById("productsListCustomRange");
    const startDateInput = document.getElementById("productsListStartDate");
    const endDateInput = document.getElementById("productsListEndDate");

    if (rangeFilter) {
      rangeFilter.value = state.range || "30d";
    }

    if (customRange) {
      if (state.range === "custom") {
        customRange.classList.remove("hidden");
        if (startDateInput) startDateInput.value = state.startDate || "";
        if (endDateInput) endDateInput.value = state.endDate || "";
      } else {
        customRange.classList.add("hidden");
      }
    }
  }

  function formatDisplayDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  }

  function populateFilters() {
    const categoryFilter = document.getElementById("productsListCategoryFilter");
    const subcategoryFilter = document.getElementById("productsListSubcategoryFilter");

    if (categoryFilter) {
      const current = state.categoryId || "";
      categoryFilter.innerHTML =
        `<option value="">All</option>` +
        state.categories
          .map((cat) => `<option value="${cat.id}" ${String(cat.id) === current ? "selected" : ""}>${escapeHtml(cat.name)}</option>`)
          .join("");
    }

    if (subcategoryFilter) {
      const current = state.subcategoryId || "";
      const available = state.categoryId
        ? state.subcategories.filter((sub) => String(sub.category_id) === String(state.categoryId))
        : state.subcategories;

      subcategoryFilter.innerHTML =
        `<option value="">All</option>` +
        available
          .map(
            (sub) =>
              `<option value="${sub.id}" ${String(sub.id) === current ? "selected" : ""}>${escapeHtml(sub.name)}</option>`
          )
          .join("");
    }
  }

  function showError(message) {
    const tbody = document.getElementById("productsListTbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-6 text-center text-red-500 dark:text-red-400">${message}</td></tr>`;
    }
    const count = document.getElementById("productsListCount");
    if (count) count.textContent = "0";
  }

  function render() {
    updateCount(state.list.length);
    renderTable(state.list);
  }

  function updateCount(count) {
    const el = document.getElementById("productsListCount");
    if (el) {
      el.textContent = count.toLocaleString("en-IN");
    }
  }

  function renderTable(items) {
    const tbody = document.getElementById("productsListTbody");
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">No products match the selected criteria.</td></tr>`;
      return;
    }

    const sortedItems = [...items];
    switch (state.type) {
      case "best_selling":
        sortedItems.sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0));
        break;
      case "worst_selling":
        sortedItems.sort((a, b) => Number(a.total_quantity || 0) - Number(b.total_quantity || 0));
        break;
      case "no_sales":
        sortedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "out_of_stock": {
        const toTime = (item) => {
          const value = item.last_sale_date || item.last_order_date || null;
          if (!value) return 0;
          const time = new Date(value).getTime();
          return Number.isFinite(time) ? time : 0;
        };
        sortedItems.sort((a, b) => toTime(b) - toTime(a));
        break;
      }
      case "low_stock":
      case "total":
      default:
        sortedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
    }

    const rows = sortedItems
      .map((item) => {
        const isTracked = item.track_inventory === "1";
        const itemType = state.type;
        const totalStockValue = isTracked && item.total_stock !== undefined ? Number(item.total_stock) : null;
        const totalStock = isTracked 
          ? (totalStockValue !== null ? formatNumber(totalStockValue) : "—")
          : "Not tracked";
        const lowThreshold = isTracked && item.low_stock_threshold !== undefined ? formatNumber(item.low_stock_threshold) : "—";
        const rawQtySold = item.qty_sold !== undefined ? item.qty_sold : item.total_quantity;
        const qtySold = rawQtySold !== undefined ? formatNumber(rawQtySold) : "—";
        const rawRevenue = item.revenue !== undefined ? item.revenue : item.total_revenue;
        const revenue = rawRevenue !== undefined ? formatCurrency(rawRevenue) : "—";
        const rawAvgDaily =
          item.avg_daily_sales !== undefined
            ? item.avg_daily_sales
            : item.avgDailySales !== undefined
            ? item.avgDailySales
            : undefined;
        const avgDaily = rawAvgDaily !== undefined ? formatNumber(rawAvgDaily) : "—";
        const daysSince =
          item.days_since_last_sale !== undefined
            ? item.days_since_last_sale
            : item.daysSinceLastSale !== undefined
            ? item.daysSinceLastSale
            : "—";
        const lastSale = formatDate(item.last_sale_date || item.last_order_date);
        const imageHtml = item.image_url
          ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name || "Product")}" class="w-12 h-12 object-cover rounded-md border border-gray-200 dark:border-gray-700" onerror="this.style.display='none';" />`
          : "";

        let stockClass = "";
        if (isTracked) {
          if (itemType === "low_stock") {
            stockClass = "text-amber-600 dark:text-amber-400 font-semibold";
          } else if (itemType === "out_of_stock" || (totalStockValue !== null && totalStockValue <= 0)) {
            stockClass = "text-red-600 dark:text-red-400 font-semibold";
          } else if (totalStockValue !== null && totalStockValue > 0) {
            stockClass = "text-green-600 dark:text-green-400 font-semibold";
          }
        }

        return `
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
              <div class="flex items-center gap-3">
                ${imageHtml ? `<div class="flex-shrink-0">${imageHtml}</div>` : ""}
                <div>
                  <div class="font-medium">${escapeHtml(item.name)}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(item.unit || "—")}</div>
                </div>
              </div>
            </td>
            <td class="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">${escapeHtml(item.category_name || "—")}</td>
            <td class="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">${escapeHtml(item.subcategory_name || "—")}</td>
            <td class="px-3 py-3 text-sm text-right ${isTracked ? stockClass : 'text-gray-500 dark:text-gray-400 italic'}">${totalStock}</td>
            <td class="px-3 py-3 text-sm text-right text-gray-600 dark:text-gray-300">${lowThreshold}</td>
            <td class="px-3 py-3 text-sm text-right text-gray-900 dark:text-gray-100">${qtySold}</td>
            <td class="px-3 py-3 text-sm text-right text-gray-900 dark:text-gray-100">${revenue}</td>
            <td class="px-3 py-3 text-sm text-right text-gray-900 dark:text-gray-100">${avgDaily}</td>
            <td class="px-3 py-3 text-sm text-right text-gray-900 dark:text-gray-100">${daysSince}</td>
            <td class="px-3 py-3 text-sm text-gray-700 dark:text-gray-200">${lastSale}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "0";
    }
    return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "₹0.00";
    }
    return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    init,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  productsAnalyticsList.init();
});

