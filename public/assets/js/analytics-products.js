const productsAnalytics = (() => {
  const API_ENDPOINT = "/analytics/api/products";

  const state = {
    range: "30d",
    startDate: null,
    endDate: null,
    loading: false,
  };

  function init() {
    const config = window.productsAnalyticsConfig || {};
    state.range = config.defaultRange || "30d";
    state.startDate = config.startDate || null;
    state.endDate = config.endDate || null;

    const rangeSelect = document.getElementById("productsRange");
    const customPicker = document.getElementById("customRangePicker");
    const applyButton = document.getElementById("applyCustomRange");

    if (rangeSelect) {
      rangeSelect.addEventListener("change", (event) => {
        const value = event.target.value;
        state.range = value;
        if (value === "custom") {
          customPicker?.classList.remove("hidden");
        } else {
          customPicker?.classList.add("hidden");
          state.startDate = null;
          state.endDate = null;
          fetchData();
        }
      });
    }

    if (applyButton) {
      applyButton.addEventListener("click", () => {
        const startInput = document.getElementById("productsRangeStart");
        const endInput = document.getElementById("productsRangeEnd");
        if (!startInput || !endInput) return;

        if (!startInput.value || !endInput.value) {
          toast("Please select both start and end dates for the custom range.", "warning");
          return;
        }

        if (new Date(startInput.value) > new Date(endInput.value)) {
          toast("Start date cannot be after end date.", "warning");
          return;
        }

        state.startDate = startInput.value;
        state.endDate = endInput.value;
        fetchData();
      });
    }

    if (state.range === "custom" && state.startDate && state.endDate) {
      customPicker?.classList.remove("hidden");
    }

    updateCardLinks();
    fetchData();
  }

  function toast(message, type = "info") {
    if (window?.utils?.showToast) {
      window.utils.showToast(message, type);
      return;
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    const root = document.getElementById("productsAnalyticsRoot");
    if (root) {
      root.classList.toggle("opacity-60", isLoading);
      root.classList.toggle("pointer-events-none", isLoading);
    }
  }

  async function fetchData() {
    if (state.loading) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({ range: state.range });
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

      if (payload.data.range) {
        state.range = payload.data.range.range || state.range;
        state.startDate = payload.data.range.startDate || state.startDate;
        state.endDate = payload.data.range.endDate || state.endDate;
      }

      updateSummary(payload.data.summary);
      updateTables(payload.data.tables);
      updateCardLinks();
    } catch (error) {
      console.error("Failed to load products analytics:", error);
      toast("Failed to load products analytics. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  function updateSummary(summary = {}) {
    const top = summary.top || {};
    const secondary = summary.secondary || {};
    assignText("cardTotalProducts", top.total_products);
    assignText("cardLowStock", top.low_stock_products);
    assignText("cardOutOfStock", top.out_of_stock_products);
    assignText("cardBestSelling", secondary.best_selling_products);
    assignText("cardWorstSelling", secondary.worst_selling_products);
    assignText("cardNoSales", secondary.products_without_sales);
  }

  function assignText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const display = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-IN") : "--";
    el.textContent = display;
  }

  function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "—";
    }
    return Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return "0.00";
    return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
    } catch (error) {
      return "—";
    }
  }

  function updateTables(tables = {}) {
    renderTable("bestSellingTbody", tables.bestSelling, (product) => [
      cell(product.name),
      cell(formatNumber(product.total_quantity, 0), true),
      cell(formatNumber(product.total_orders, 0), true),
      cell(formatCurrency(product.total_revenue), true),
    ]);

    renderTable("averageSellingTbody", tables.averageSelling, (product) => [
      cell(product.name),
      cell(formatNumber(product.total_quantity, 0), true),
      cell(formatNumber(product.total_orders, 0), true),
      cell(formatCurrency(product.total_revenue), true),
    ]);

    renderTable("worstSellingTbody", tables.worstSelling, (product) => [
      cell(product.name),
      cell(formatNumber(product.total_quantity, 0), true),
      cell(
        product.days_since_last_sale !== null && product.days_since_last_sale !== undefined
          ? formatNumber(product.days_since_last_sale, 0)
          : "—",
        true
      ),
      cell(formatDate(product.last_order_date), true),
    ]);

    renderTable("fastStockoutTbody", tables.fastStockout, (product) => [
      cell(product.name),
      cell(formatNumber(product.avg_daily_sales, 2), true),
      cell(formatNumber(product.low_stock_threshold, 0), true),
      cell(
        product.projected_days_to_stockout !== null && product.projected_days_to_stockout !== undefined
          ? formatNumber(product.projected_days_to_stockout, 0)
          : "—",
        true
      ),
    ]);

    renderTable("topRevenueTbody", tables.topRevenue, (product) => [
      cell(product.name),
      cell(formatCurrency(product.total_revenue), true),
      cell(formatNumber(product.total_quantity, 0), true),
      cell(formatNumber(product.avg_daily_sales, 2), true),
    ]);
  }

  function cell(value, alignRight = false) {
    const classes = ["px-4", "py-3", "text-sm", "text-gray-900", "dark:text-gray-100"];
    if (alignRight) {
      classes.push("text-right");
    } else {
      classes.push("text-left");
    }
    return `<td class="${classes.join(" ")}">${value ?? "—"}</td>`;
  }

  function renderTable(tbodyId, items = [], rowTemplate) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!Array.isArray(items) || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500 dark:text-gray-400">No data available for the selected range.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((item) => `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">${rowTemplate(item).join("")}</tr>`)
      .join("");
  }

  function updateCardLinks() {
    document.querySelectorAll("[data-product-card-link]").forEach((link) => {
      const type = link.getAttribute("data-type") || "total";
      const scope = link.getAttribute("data-scope") || "global";
      const params = new URLSearchParams();
      params.set("type", type);
      if (scope === "range") {
        params.set("range", state.range);
        if (state.range === "custom" && state.startDate && state.endDate) {
          params.set("start", state.startDate);
          params.set("end", state.endDate);
        }
      }
      link.href = `/analytics/products/list?${params.toString()}`;
    });
  }

  return {
    init,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  productsAnalytics.init();
});

