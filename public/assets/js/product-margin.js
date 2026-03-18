// Product Margin Management - Frontend JavaScript
// Handles all UI interactions, API calls, validation, and error handling

const API_BASE = "/product-margin/api/v1";

// State management
let state = {
  categories: [],
  subcategories: [],
  products: [],
  sellers: [],
  sellerMargins: [],
  cogm: [],
  currentTab: "products",
};

// Utility Functions
const utils = {
  // Show toast notification
  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ${type === "error" ? "bg-red-500 text-white" : type === "success" ? "bg-green-500 text-white" : type === "warning" ? "bg-yellow-500 text-black" : "bg-blue-500 text-white"}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Format date for display
  formatDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  },

  // Format percentage
  formatPercent(value) {
    if (value === null || value === undefined) return "N/A";
    return `${parseFloat(value).toFixed(2)}%`;
  },

  // Validate margin percentage
  validateMargin(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return { valid: false, error: "Margin must be a number" };
    if (num < 0) return { valid: false, error: "Margin cannot be negative" };
    if (num > 100) return { valid: false, error: "Margin cannot exceed 100%" };
    return { valid: true, value: num };
  },

  // Validate required field
  validateRequired(value, fieldName) {
    if (!value || value.trim() === "") {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: value.trim() };
  },

  // Validate date
  validateDate(dateString, fieldName) {
    if (!dateString) {
      return { valid: false, error: `${fieldName} is required` };
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return { valid: false, error: `${fieldName} must be a valid date` };
    }
    return { valid: true, value: dateString };
  },

  // Show loading state
  showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>';
    }
  },

  // Show error state
  showError(elementId, message = "Failed to load data") {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<tr><td colspan="10" class="px-6 py-4 text-center text-red-500">${message}</td></tr>`;
    }
  },
};

// Cost price helpers — products.cost_price is the single source of truth.
// It is updated both by manual edits on the product page and by COGM saves.
function sumCoreCOGMCosts(cogmEntry) {
  if (!cogmEntry) return 0;
  const sourcing = parseFloat(cogmEntry.sourcing_cost) || 0;
  const transport = parseFloat(cogmEntry.transport_cost) || 0;
  const packing = parseFloat(cogmEntry.packing_cost) || 0;
  return sourcing + transport + packing;
}

function computeCostPriceForProduct(productId, fallbackCostPrice) {
  // Use product.cost_price from DB as the source of truth
  const product = Array.isArray(state.products) ? state.products.find((p) => p.id == productId) : null;
  const costPrice = product ? product.cost_price : fallbackCostPrice;
  return Math.round((parseFloat(costPrice) || 0) * 100) / 100;
}

function updateProductsWithComputedCost() {
  if (!Array.isArray(state.products)) return;
  state.products = state.products.map((product) => {
    const computed = Math.round((parseFloat(product.cost_price) || 0) * 100) / 100;
    return { ...product, computed_cost_price: computed };
  });
}

function getComputedCostPriceFromState(productId) {
  const product = Array.isArray(state.products) ? state.products.find((p) => p.id == productId) : null;
  if (product && product.computed_cost_price !== undefined && product.computed_cost_price !== null) {
    return parseFloat(product.computed_cost_price) || 0;
  }
  return computeCostPriceForProduct(productId, product ? product.cost_price : undefined);
}

function getProductCostPrice(product) {
  if (!product) return 0;
  if (product.computed_cost_price !== undefined && product.computed_cost_price !== null) {
    return parseFloat(product.computed_cost_price) || 0;
  }
  return Math.round((parseFloat(product.cost_price) || 0) * 100) / 100;
}

// API Functions
const api = {
  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  },

  // Categories
  async getCategories() {
    return this.request(`${API_BASE}/product-categories`);
  },

  async createCategory(data) {
    return this.request(`${API_BASE}/product-categories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCategory(id, data) {
    return this.request(`${API_BASE}/product-categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteCategory(id) {
    return this.request(`${API_BASE}/product-categories/${id}`, {
      method: "DELETE",
    });
  },

  // Subcategories
  async getSubcategories(categoryId = null) {
    const url = categoryId ? `${API_BASE}/product-subcategories?category_id=${categoryId}` : `${API_BASE}/product-subcategories`;
    return this.request(url);
  },

  async createSubcategory(data) {
    return this.request(`${API_BASE}/product-subcategories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSubcategory(id, data) {
    return this.request(`${API_BASE}/product-subcategories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteSubcategory(id) {
    return this.request(`${API_BASE}/product-subcategories/${id}`, {
      method: "DELETE",
    });
  },

  // Common Margins
  async getCommonMargins(productId = null) {
    const url = productId ? `${API_BASE}/product-margins?product_id=${productId}` : `${API_BASE}/product-margins`;
    return this.request(url);
  },

  async createCommonMargin(data) {
    return this.request(`${API_BASE}/product-margins`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCommonMargin(id, data) {
    return this.request(`${API_BASE}/product-margins/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteCommonMargin(id) {
    return this.request(`${API_BASE}/product-margins/${id}`, {
      method: "DELETE",
    });
  },

  // Seller Margins
  async getSellerMargins(sellerId = null, productId = null) {
    let url = `${API_BASE}/seller-product-margins`;
    const params = [];
    if (sellerId) params.push(`seller_id=${sellerId}`);
    if (productId) params.push(`product_id=${productId}`);
    if (params.length > 0) url += "?" + params.join("&");
    return this.request(url);
  },

  async createSellerMargin(data) {
    return this.request(`${API_BASE}/seller-product-margins`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSellerMargin(id, data) {
    return this.request(`${API_BASE}/seller-product-margins/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteSellerMargin(id) {
    return this.request(`${API_BASE}/seller-product-margins/${id}`, {
      method: "DELETE",
    });
  },

  // Products (from product margin API)
  async getProducts() {
    try {
      // Try product margin API first, fallback to production API
      try {
        const response = await fetch(`${API_BASE}/products`);
        const data = await response.json();
        if (data.success) return data;
      } catch (e) {
        console.warn("Product margin API not available, trying production API");
      }

      const response = await fetch("/production/products/api");
      return await response.json();
    } catch (error) {
      console.error("Error fetching products:", error);
      throw error;
    }
  },

  // Sellers (from product margin API)
  async getSellers() {
    try {
      // Try product margin API first
      try {
        const response = await fetch(`${API_BASE}/sellers`);
        const data = await response.json();
        if (data.success) return data;
      } catch (e) {
        console.warn("Product margin sellers API not available, trying sales API");
      }

      // Fallback to sales API endpoints
      const endpoints = ["/sales/api/v1/partners", "/sales/api/partners", "/api/v1/sales-partners"];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
            if (data.success || data.data || data.rows) {
              return { success: true, data: data.data || data.rows || [] };
            }
          }
        } catch (e) {
          continue;
        }
      }

      // If all endpoints fail, return empty array
      return { success: true, data: [] };
    } catch (error) {
      console.error("Error fetching sellers:", error);
      return { success: true, data: [] };
    }
  },

  // Get product by ID (from product margin API)
  async getProductById(id) {
    try {
      // Try product margin API first
      try {
        const response = await fetch(`${API_BASE}/products/${id}`);
        const data = await response.json();
        if (data.success) return data;
      } catch (e) {
        console.warn("Product margin API not available, trying production API");
      }

      // Fallback to production API
      const response = await fetch(`/production/products/${id}`);
      return await response.json();
    } catch (error) {
      console.error("Error fetching product:", error);
      throw error;
    }
  },

  // Update product (via product margin API)
  async updateProduct(id, productData) {
    try {
      const response = await fetch(`${API_BASE}/products/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error updating product:", error);
      throw error;
    }
  },
};

// Data Loading Functions
const dataLoader = {
  async loadAll() {
    try {
      utils.showLoading("sellerOverridesTbody");
      utils.showLoading("categoriesTbody");
      utils.showLoading("subcategoriesTbody");
      utils.showLoading("productsTbody");

      // Load all data in parallel with individual error handling
      const results = await Promise.allSettled([api.getCategories().catch((err) => ({ success: false, error: err.message, data: [] })), api.getSubcategories().catch((err) => ({ success: false, error: err.message, data: [] })), api.getSellerMargins().catch((err) => ({ success: false, error: err.message, data: [] })), api.getProducts().catch((err) => ({ success: false, error: err.message, data: [], rows: [] })), api.getSellers().catch((err) => ({ success: false, error: err.message, data: [], rows: [] })), api.request(`${API_BASE}/cost-of-goods-manufactured`).catch((err) => ({ success: false, error: err.message, data: [] }))]);

      // Extract results
      const categoriesRes = results[0].status === "fulfilled" ? results[0].value : { success: false, data: [] };
      const subcategoriesRes = results[1].status === "fulfilled" ? results[1].value : { success: false, data: [] };
      const sellerMarginsRes = results[2].status === "fulfilled" ? results[2].value : { success: false, data: [] };
      const productsRes = results[3].status === "fulfilled" ? results[3].value : { success: false, data: [], rows: [] };
      const sellersRes = results[4].status === "fulfilled" ? results[4].value : { success: false, data: [], rows: [] };
      const cogmRes = results[5].status === "fulfilled" ? results[5].value : { success: false, data: [] };

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const apiNames = ["Categories", "Subcategories", "Seller Margins", "Products", "Sellers", "COGM"];
          console.error(`Failed to load ${apiNames[index]}:`, result.reason);
        }
      });

      // Update state
      state.categories = categoriesRes.success ? categoriesRes.data : [];
      state.subcategories = subcategoriesRes.success ? subcategoriesRes.data : [];
      state.sellerMargins = sellerMarginsRes.success ? sellerMarginsRes.data : [];
      state.products = productsRes.success ? productsRes.data || productsRes.rows || [] : [];
      state.sellers = sellersRes.success ? sellersRes.data || sellersRes.rows || [] : [];
      state.cogm = cogmRes.success ? cogmRes.data || [] : [];

      // Enrich products with computed cost price
      updateProductsWithComputedCost();

      // Update UI
      this.updateStats();
      this.renderSellerMargins();
      this.renderCategories();
      this.renderSubcategories();
      this.renderProducts();

      // Only show warning if no data is available
      const hasData = state.categories.length > 0 || state.products.length > 0;
      if (!hasData) {
        utils.showToast("No data available. Please check API endpoints.", "warning");
      }
    } catch (error) {
      console.error("Error loading data:", error);
      utils.showError("sellerOverridesTbody", "Failed to load data");
      utils.showError("categoriesTbody", "Failed to load data");
      utils.showError("subcategoriesTbody", "Failed to load data");
      utils.showError("productsTbody", "Failed to load data");
      utils.showToast("Failed to load data: " + error.message, "error");
    }
  },

  updateStats() {
    // Update stat cards
    const categoriesCount = document.getElementById("categoriesCount");
    const subcategoriesCount = document.getElementById("subcategoriesCount");
    const sellerOverridesCount = document.getElementById("sellerOverridesCount");
    const productsCount = document.getElementById("productsCount");

    if (categoriesCount) categoriesCount.textContent = state.categories.length;
    if (subcategoriesCount) subcategoriesCount.textContent = state.subcategories.length;
    if (sellerOverridesCount) sellerOverridesCount.textContent = state.sellerMargins.length;
    if (productsCount) productsCount.textContent = state.products.length;
  },

  renderSellerMargins() {
    const tbody = document.getElementById("sellerOverridesTbody");
    const categoryFilter = document.getElementById("sellerOverrideCategoryFilter");
    const subcategoryFilter = document.getElementById("sellerOverrideSubcategoryFilter");
    const sellerFilter = document.getElementById("sellerOverrideSellerFilter");
    const searchInput = document.getElementById("sellerOverrideSearch");
    const showOnlyOverridden = document.getElementById("sellerOverrideShowOnlyOverridden");
    const showOnlyActive = document.getElementById("sellerOverrideShowOnlyActive");
    const statusDiv = document.getElementById("sellerOverrideStatus");

    if (!tbody) return;

    // Update category filter dropdown
    if (categoryFilter) {
      const currentValue = categoryFilter.value;
      categoryFilter.innerHTML = '<option value="">All Categories</option>' + state.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
      if (currentValue) categoryFilter.value = currentValue;
    }

    // Update subcategory filter dropdown based on selected category
    updateSellerOverrideSubcategoryFilter();

    // Update seller filter dropdown
    if (sellerFilter) {
      const currentSellerValue = sellerFilter.value;
      // Get unique sellers from seller margins
      const uniqueSellers = [...new Set(state.sellerMargins.map((m) => m.seller_name).filter((name) => name))];
      uniqueSellers.sort();
      sellerFilter.innerHTML = '<option value="">All Sellers</option>' + uniqueSellers.map((seller) => `<option value="${seller}">${seller}</option>`).join("");
      if (currentSellerValue && sellerFilter.querySelector(`option[value="${currentSellerValue}"]`)) {
        sellerFilter.value = currentSellerValue;
      } else {
        sellerFilter.value = "";
      }
    }

    // Create a map of product_id -> array of overrides for quick lookup
    // If seller filter is set, only get overrides for that seller
    const overrideMap = new Map(); // product_id -> override (single when seller filter is set)
    const overrideArrayMap = new Map(); // product_id -> array of overrides (all overrides for the product)

    // When seller filter is set, we need to get the seller ID to check for products without overrides
    let selectedSellerId = null;
    if (sellerFilter && sellerFilter.value) {
      // Find seller ID from seller margins (more reliable than state.sellers)
      const selectedMargin = state.sellerMargins.find((m) => m.seller_name === sellerFilter.value);
      if (selectedMargin && selectedMargin.seller_id) {
        selectedSellerId = selectedMargin.seller_id;
      } else {
        // Fallback to state.sellers
        const selectedSeller = state.sellers.find((s) => s.partner_name === sellerFilter.value);
        selectedSellerId = selectedSeller ? selectedSeller.id : null;
      }
    }

    state.sellerMargins.forEach((margin) => {
      if (sellerFilter && sellerFilter.value) {
        // When specific seller is selected, only get overrides for that seller
        if (margin.seller_name === sellerFilter.value) {
          overrideMap.set(margin.product_id, margin);
        }
      } else {
        // When "All Sellers" is selected, collect all overrides for each product
        if (!overrideArrayMap.has(margin.product_id)) {
          overrideArrayMap.set(margin.product_id, []);
        }
        overrideArrayMap.get(margin.product_id).push(margin);
        // Use the first override for pricing calculations
        if (!overrideMap.has(margin.product_id)) {
          overrideMap.set(margin.product_id, margin);
        }
      }
    });

    // Count overridden products (for status display)
    const overriddenProductIds = new Set(overrideMap.keys());
    const totalOverridden = overriddenProductIds.size;

    // Update status indicator
    if (statusDiv) {
      if (totalOverridden > 0) {
        statusDiv.innerHTML = `<span class="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onclick="document.getElementById('sellerOverrideShowOnlyOverridden').checked = true; dataLoader.renderSellerMargins();">${totalOverridden} product${totalOverridden !== 1 ? "s" : ""} overridden</span>`;
      } else {
        statusDiv.innerHTML = '<span class="text-gray-500 dark:text-gray-400">No products overridden</span>';
      }
    }

    // Filter products (like Products and Margin tab)
    let filteredProducts = [...state.products];

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    // Filter to show only overridden products if checkbox is checked
    if (showOnlyOverridden && showOnlyOverridden.checked) {
      filteredProducts = filteredProducts.filter((p) => overrideMap.has(p.id));
    }

    // Filter to show only active products if checkbox is checked
    if (showOnlyActive && showOnlyActive.checked) {
      filteredProducts = filteredProducts.filter((p) => {
        const override = overrideMap.get(p.id);
        // If product has override, check product_active
        if (override) {
          return override.product_active === 1 || override.product_active === true;
        }
        // If no override and seller is selected, product is not active (no override means inactive)
        // If no override and "All Sellers" is selected, don't show it (can't determine active status)
        return false;
      });
    }

    if (filteredProducts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="px-4 py-3 text-center text-gray-500 dark:text-gray-400">No products found</td></tr>';
      return;
    }

    // Helper function to render a single row
    const renderRow = (product, override, sellerId = null) => {
      // Get category and subcategory
      const category = state.categories.find((c) => c.id === product.category_id);
      const subcategory = state.subcategories.find((sc) => sc.id === product.subcategory_id);

      const hasOverride = !!override;

      // Seller display
      const sellerDisplay = hasOverride ? override.seller_name || "Unknown Seller" : "-";

      // Product active status
      const productActive = hasOverride ? override.product_active === 1 || override.product_active === true : null;
      const productActiveDisplay = productActive !== null ? (productActive ? "Yes" : "No") : "-";
      const productActiveClass = productActive === true ? "text-green-600 dark:text-green-400" : productActive === false ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400";

      // Product name with grammage, category, and subcategory
      const productName = product.name || "Unknown Product";
      const grammage = product.grammage || product.unit_size || "";
      const productNameWithGrammage = grammage ? `${productName} (${grammage})` : productName;
      const nameAlias = product.name_alias || "";
      const categoryName = category ? category.name : "Uncategorized";
      const subcategoryName = subcategory ? subcategory.name : "";
      const categoryDisplay = subcategoryName ? `${categoryName} / ${subcategoryName}` : categoryName;

      // Get pricing values from override or product
      const mrp = override ? parseFloat(override.mrp) || parseFloat(product.mrp) || 0 : parseFloat(product.mrp) || 0;
      const marginPercentage = override ? parseFloat(override.margin_percentage) || parseFloat(product.margin_percentage) || 0 : parseFloat(product.margin_percentage) || 0;
      const overrideCostPrice = override && override.cost_price !== undefined && override.cost_price !== null ? parseFloat(override.cost_price) : null;
      const productCostPrice = getProductCostPrice(product);
      const costPrice = overrideCostPrice !== null && !Number.isNaN(overrideCostPrice) ? overrideCostPrice : productCostPrice;
      const gstPercentage = override ? parseFloat(override.gst_percentage) || parseFloat(product.gst_percentage) || 0 : parseFloat(product.gst_percentage) || 0;

      // Calculate Seller Commission (Seller Margin Value)
      const sellerCommission = mrp > 0 && marginPercentage >= 0 ? mrp * (marginPercentage / 100) : override ? parseFloat(override.seller_margin_value) || 0 : 0;
      const sellerCommissionRounded = Math.round(sellerCommission * 100) / 100;

      // Landing Price = MRP - Seller Margin Value
      const landingPrice = mrp - sellerCommissionRounded;
      const landingPriceRounded = Math.round(landingPrice * 100) / 100;

      // Calculate Basic Price from Landing Price (Landing Price = Basic Price + GST Value)
      // Basic Price = Landing Price / (1 + GST%/100)
      let basicPrice = 0;
      if (landingPriceRounded > 0 && gstPercentage >= 0) {
        basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
        basicPrice = Math.round(basicPrice * 100) / 100; // Round to 2 decimal places
      }

      // Calculate GST Value from Basic Price
      const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

      // Net Profit = MRP - Cost Price - Seller Commission
      const netProfit = mrp - costPrice - sellerCommissionRounded;
      const netProfitFormatted = netProfit.toFixed(2);

      // Determine net profit color
      let profitColorClass = "";
      if (netProfit > 0) {
        profitColorClass = "text-green-600 dark:text-green-400 font-semibold";
      } else if (netProfit < 0) {
        profitColorClass = "text-red-600 dark:text-red-400 font-semibold";
      } else {
        profitColorClass = "text-gray-600 dark:text-gray-400";
      }

      // Highlight row if overridden
      const rowClass = hasOverride ? "hover:bg-gray-50 dark:hover:bg-gray-700 bg-orange-50 dark:bg-orange-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700";

      return `
        <tr class="${rowClass}">
          <td class="px-4 py-3">
            <div class="text-sm font-medium text-gray-900 dark:text-white">
              ${productNameWithGrammage}
            </div>
            ${nameAlias ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${nameAlias}</div>` : ""}
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${categoryDisplay}</div>
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            ${sellerDisplay}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-center">
            ${
              productActive !== null
                ? `
              <div class="flex items-center justify-center gap-2">
                <span class="${productActiveClass} font-medium">${productActiveDisplay}</span>
                <button onclick="toggleProductActive(${override.id})" 
                  class="px-2 py-1 text-xs ${productActive ? "bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400" : "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400"} rounded transition-colors"
                  title="${productActive ? "Deactivate" : "Activate"} product for this seller">
                  ${productActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            `
                : sellerId && sellerFilter && sellerFilter.value
                  ? `
              <div class="flex items-center justify-center gap-2">
                <span class="text-gray-500 dark:text-gray-400 font-medium">-</span>
                <button onclick="toggleProductActiveForProduct(${product.id}, ${sellerId}, true)" 
                  class="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400 rounded transition-colors"
                  title="Activate product for this seller">
                  Activate
                </button>
              </div>
            `
                  : "-"
            }
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${mrp > 0 ? "₹" + mrp.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${marginPercentage > 0 ? utils.formatPercent(marginPercentage) : "Not Set"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${landingPriceRounded > 0 ? "₹" + landingPriceRounded.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${basicPrice > 0 ? "₹" + basicPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${gstValue > 0 ? "₹" + gstValue.toFixed(2) + " (" + gstPercentage.toFixed(2) + "%)" : gstPercentage > 0 ? "(" + gstPercentage.toFixed(2) + "%)" : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${costPrice > 0 ? "₹" + costPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm ${profitColorClass}">
            ${mrp > 0 || costPrice > 0 ? "₹" + netProfitFormatted : "-"}
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
            ${
              hasOverride
                ? `
              <a href="/product-margin/seller-overrides/${override.id}/edit" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">Edit</a>
              <button onclick="deleteSellerMargin(${override.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Delete</button>
            `
                : `
              <a href="/product-margin/seller-overrides/add?product_id=${product.id}" class="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300">Add Override</a>
            `
            }
          </td>
        </tr>
      `;
    };

    // Build rows array - when "All Sellers" is selected and product has multiple overrides, create one row per override
    const rows = [];
    filteredProducts.forEach((product) => {
      if (sellerFilter && sellerFilter.value) {
        // When specific seller is selected, show all products (with or without overrides)
        const override = overrideMap.get(product.id);
        // Show product if: not filtering for overridden only, OR product has override
        if (!showOnlyOverridden?.checked || override) {
          rows.push(renderRow(product, override, selectedSellerId));
        }
      } else {
        // When "All Sellers" is selected
        const allOverrides = overrideArrayMap.get(product.id) || [];
        if (allOverrides.length > 0) {
          // Create one row per override
          allOverrides.forEach((override) => {
            rows.push(renderRow(product, override, null));
          });
        } else {
          // No overrides - show product without override
          if (!showOnlyOverridden?.checked) {
            rows.push(renderRow(product, null, null));
          }
        }
      }
    });

    tbody.innerHTML = rows.join("");
  },

  renderCategories() {
    const tbody = document.getElementById("categoriesTbody");
    if (!tbody) return;

    if (state.categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No categories found</td></tr>';
      return;
    }

    tbody.innerHTML = state.categories
      .map((category) => {
        const subcategories = state.subcategories.filter((sub) => sub.category_id === category.id);
        const subcategoryNames = subcategories.map((sub) => sub.name).join(", ") || "None";

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-medium text-gray-900 dark:text-white">${category.name}</div>
            ${category.description ? `<div class="text-sm text-gray-500 dark:text-gray-400">${category.description}</div>` : ""}
          </td>
          <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
            ${subcategoryNames}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            ${category.product_count || 0}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button onclick="editCategory(${category.id})" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">Edit</button>
            <button onclick="deleteCategory(${category.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Delete</button>
          </td>
        </tr>
      `;
      })
      .join("");
  },

  renderSubcategories() {
    const tbody = document.getElementById("subcategoriesTbody");
    if (!tbody) return;

    if (state.subcategories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No subcategories found</td></tr>';
      return;
    }

    tbody.innerHTML = state.subcategories
      .map((subcategory) => {
        const category = state.categories.find((c) => c.id === subcategory.category_id);
        const categoryName = category ? category.name : "Unknown Category";

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-medium text-gray-900 dark:text-white">${subcategory.name}</div>
            ${subcategory.description ? `<div class="text-sm text-gray-500 dark:text-gray-400">${subcategory.description}</div>` : ""}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            ${categoryName}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            ${subcategory.product_count || 0}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button onclick="editSubcategory(${subcategory.id})" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">Edit</button>
            <button onclick="deleteSubcategory(${subcategory.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Delete</button>
          </td>
        </tr>
      `;
      })
      .join("");
  },

  renderProducts() {
    const tbody = document.getElementById("productsTbody");
    const categoryFilter = document.getElementById("productCategoryFilter");
    const subcategoryFilter = document.getElementById("productSubcategoryFilter");
    const searchInput = document.getElementById("productSearch");

    if (!tbody) return;

    // Update category filter dropdown
    if (categoryFilter) {
      const currentValue = categoryFilter.value;
      categoryFilter.innerHTML = '<option value="">All Categories</option>' + state.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
      if (currentValue) categoryFilter.value = currentValue;
    }

    // Update subcategory filter dropdown based on selected category
    updateProductSubcategoryFilter();

    // Filter products
    let filteredProducts = state.products;

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    if (filteredProducts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-3 text-center text-gray-500 dark:text-gray-400">No products found</td></tr>';
      return;
    }

    tbody.innerHTML = filteredProducts
      .map((product) => {
        const category = state.categories.find((c) => c.id === product.category_id);
        const subcategory = state.subcategories.find((sc) => sc.id === product.subcategory_id);

        // Calculate Net Profit: MRP - Cost Price - Seller Commission
        const mrp = parseFloat(product.mrp) || 0;
        const costPrice = getProductCostPrice(product);
        const marginPercentage = parseFloat(product.margin_percentage) || 0;
        const gstPercentage = parseFloat(product.gst_percentage) || 0;

        // Seller Commission = MRP * (Seller Margin % / 100)
        const sellerCommission = mrp > 0 && marginPercentage >= 0 ? mrp * (marginPercentage / 100) : 0;
        const sellerCommissionRounded = Math.round(sellerCommission * 100) / 100;

        // Landing Price = MRP - Seller Margin Value
        const landingPrice = mrp - sellerCommissionRounded;
        const landingPriceRounded = Math.round(landingPrice * 100) / 100;

        // Calculate Basic Price from Landing Price (Landing Price = Basic Price + GST Value)
        // Basic Price = Landing Price / (1 + GST%/100)
        let basicPrice = 0;
        if (landingPriceRounded > 0 && gstPercentage >= 0) {
          basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
          basicPrice = Math.round(basicPrice * 100) / 100; // Round to 2 decimal places
        }

        // Calculate GST Value from Basic Price
        const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

        // Net Profit = MRP - Cost Price - Seller Commission
        const netProfit = mrp - costPrice - sellerCommissionRounded;
        const netProfitFormatted = netProfit.toFixed(2);

        // Determine net profit color
        let profitColorClass = "";
        if (netProfit > 0) {
          profitColorClass = "text-green-600 dark:text-green-400 font-semibold";
        } else if (netProfit < 0) {
          profitColorClass = "text-red-600 dark:text-red-400 font-semibold";
        } else {
          profitColorClass = "text-gray-600 dark:text-gray-400";
        }

        // Product name with grammage, category, and subcategory
        const productName = product.name || "Unknown Product";
        const grammage = product.grammage || product.unit_size || "";
        const productNameWithGrammage = grammage ? `${productName} (${grammage})` : productName;
        const nameAlias = product.name_alias || "";
        const categoryName = category ? category.name : "Uncategorized";
        const subcategoryName = subcategory ? subcategory.name : "";
        const categoryDisplay = subcategoryName ? `${categoryName} / ${subcategoryName}` : categoryName;

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
          <td class="px-4 py-3">
            <div class="text-sm font-medium text-gray-900 dark:text-white">
              ${productNameWithGrammage}
            </div>
            ${nameAlias ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${nameAlias}</div>` : ""}
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${categoryDisplay}</div>
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${mrp > 0 ? "₹" + mrp.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${marginPercentage > 0 ? utils.formatPercent(marginPercentage) : "Not Set"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${landingPriceRounded > 0 ? "₹" + landingPriceRounded.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${basicPrice > 0 ? "₹" + basicPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${gstValue > 0 ? "₹" + gstValue.toFixed(2) + " (" + gstPercentage.toFixed(2) + "%)" : gstPercentage > 0 ? "(" + gstPercentage.toFixed(2) + "%)" : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${costPrice > 0 ? "₹" + costPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm ${profitColorClass}">
            ${mrp > 0 || costPrice > 0 ? "₹" + netProfitFormatted : "-"}
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
            <a href="/product-margin/products/${product.id}" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">View</a>
            <a href="/product-margin/products/${product.id}/edit" class="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300">Edit</a>
          </td>
        </tr>
      `;
      })
      .join("");
  },

  renderVrindavanMargins() {
    const tbody = document.getElementById("vrindavanMarginsTbody");
    const categoryFilter = document.getElementById("vrindavanCategoryFilter");
    const subcategoryFilter = document.getElementById("vrindavanSubcategoryFilter");
    const searchInput = document.getElementById("vrindavanSearch");

    if (!tbody) return;

    // Update category filter dropdown
    if (categoryFilter) {
      const currentValue = categoryFilter.value;
      categoryFilter.innerHTML = '<option value="">All Categories</option>' + state.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
      if (currentValue) categoryFilter.value = currentValue;
    }

    // Update subcategory filter dropdown based on selected category
    updateVrindavanSubcategoryFilter();

    // Filter products
    let filteredProducts = state.products;

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    if (filteredProducts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-3 text-center text-gray-500 dark:text-gray-400">No products found</td></tr>';
      return;
    }

    tbody.innerHTML = filteredProducts
      .map((product) => {
        const category = state.categories.find((c) => c.id === product.category_id);
        const subcategory = state.subcategories.find((sc) => sc.id === product.subcategory_id);

        // Calculate without seller margin
        const mrp = parseFloat(product.mrp) || 0;
        const discountPrice = parseFloat(product.discount_price) || 0;
        const costPrice = getProductCostPrice(product);
        const gstPercentage = parseFloat(product.gst_percentage) || 0;

        // Use discount_price if available, otherwise use MRP
        const sellingPrice = discountPrice > 0 ? discountPrice : mrp;

        // Landing Price = Selling Price (no seller margin deduction)
        const landingPrice = sellingPrice;
        const landingPriceRounded = Math.round(landingPrice * 100) / 100;

        // Calculate Basic Price from Selling Price (Selling Price = Basic Price + GST Value)
        // Basic Price = Selling Price / (1 + GST%/100)
        let basicPrice = 0;
        if (landingPriceRounded > 0 && gstPercentage >= 0) {
          basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
          basicPrice = Math.round(basicPrice * 100) / 100; // Round to 2 decimal places
        }

        // Calculate GST Value from Basic Price
        const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

        // Net Profit = Discount Price (or MRP if discount_price not available) - Cost Price (no seller commission)
        const netProfit = sellingPrice - costPrice;
        const netProfitFormatted = netProfit.toFixed(2);

        // Determine net profit color
        let profitColorClass = "";
        if (netProfit > 0) {
          profitColorClass = "text-green-600 dark:text-green-400 font-semibold";
        } else if (netProfit < 0) {
          profitColorClass = "text-red-600 dark:text-red-400 font-semibold";
        } else {
          profitColorClass = "text-gray-600 dark:text-gray-400";
        }

        // Product name with grammage, category, and subcategory
        const productName = product.name || "Unknown Product";
        const grammage = product.grammage || product.unit_size || "";
        const productNameWithGrammage = grammage ? `${productName} (${grammage})` : productName;
        const nameAlias = product.name_alias || "";
        const categoryName = category ? category.name : "Uncategorized";
        const subcategoryName = subcategory ? subcategory.name : "";
        const categoryDisplay = subcategoryName ? `${categoryName} / ${subcategoryName}` : categoryName;

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
          <td class="px-4 py-3">
            <div class="text-sm font-medium text-gray-900 dark:text-white">
              ${productNameWithGrammage}
            </div>
            ${nameAlias ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${nameAlias}</div>` : ""}
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${categoryDisplay}</div>
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${mrp > 0 ? "₹" + mrp.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${discountPrice > 0 ? "₹" + discountPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${landingPriceRounded > 0 ? "₹" + landingPriceRounded.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${basicPrice > 0 ? "₹" + basicPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            ${gstValue > 0 ? "₹" + gstValue.toFixed(2) + " (" + gstPercentage.toFixed(2) + "%)" : gstPercentage > 0 ? "(" + gstPercentage.toFixed(2) + "%)" : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
            ${costPrice > 0 ? "₹" + costPrice.toFixed(2) : "-"}
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-sm ${profitColorClass}">
            ${sellingPrice > 0 || costPrice > 0 ? "₹" + netProfitFormatted : "-"}
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
            <a href="/product-margin/products/${product.id}" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">View</a>
            <a href="/product-margin/products/${product.id}/edit" class="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300">Edit</a>
          </td>
        </tr>
      `;
      })
      .join("");
  },
};

// Modal Functions
const modals = {
  showModal(title, content, onConfirm = null) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onclick="this.closest('.fixed').remove()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">${title}</h3>
            ${content}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  },

  closeModal() {
    const modal = document.querySelector(".fixed.inset-0.z-50");
    if (modal) modal.remove();
  },
};

// Tab Switching
function switchTab(tabName) {
  state.currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.remove("active", "text-blue-600", "dark:text-blue-400", "border-blue-600", "dark:border-blue-400");
    btn.classList.add("text-gray-500", "dark:text-gray-400", "border-transparent");
  });

  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add("active", "text-blue-600", "dark:text-blue-400", "border-blue-600", "dark:border-blue-400");
    activeBtn.classList.remove("text-gray-500", "dark:text-gray-400", "border-transparent");
  }

  // Update content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.add("hidden");
  });

  const activeContent = document.getElementById(`content-${tabName}`);

  // Load or render COGM data when switching to COGM tab
  if (tabName === "cogm") {
    if (state.cogm.length === 0) {
      loadCOGM();
    } else {
      renderCOGM();
      populateCOGMFilters();
    }
  }

  // Render Vrindavan Margins when switching to that tab
  if (tabName === "vrindavan-margins") {
    dataLoader.renderVrindavanMargins();
  }

  if (activeContent) {
    activeContent.classList.remove("hidden");
  }
}

// Category Functions
async function showAddCategoryModal() {
  const content = `
    <form id="categoryForm" onsubmit="saveCategory(event)">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category Name *</label>
        <input type="text" id="categoryName" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea id="categoryDescription" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"></textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
      </div>
    </form>
  `;
  modals.showModal("Add Category", content);
}

async function editCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  if (!category) {
    utils.showToast("Category not found", "error");
    return;
  }

  const content = `
    <form id="categoryForm" onsubmit="saveCategory(event, ${id})">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category Name *</label>
        <input type="text" id="categoryName" value="${category.name || ""}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea id="categoryDescription" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">${category.description || ""}</textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
      </div>
    </form>
  `;
  modals.showModal("Edit Category", content);
}

async function saveCategory(event, id = null) {
  event.preventDefault();

  const name = document.getElementById("categoryName").value;
  const description = document.getElementById("categoryDescription").value;

  // Validation
  const nameValidation = utils.validateRequired(name, "Category name");
  if (!nameValidation.valid) {
    utils.showToast(nameValidation.error, "error");
    return;
  }

  try {
    const data = { name: nameValidation.value, description: description || null };

    if (id) {
      await api.updateCategory(id, data);
      utils.showToast("Category updated successfully", "success");
    } else {
      await api.createCategory(data);
      utils.showToast("Category created successfully", "success");
    }

    modals.closeModal();
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to save category", "error");
  }
}

async function deleteCategory(id) {
  if (!confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
    return;
  }

  try {
    await api.deleteCategory(id);
    utils.showToast("Category deleted successfully", "success");
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to delete category", "error");
  }
}

// Sync Categories Modal
function showSyncCategoriesModal() {
  const content = `
    <div class="mb-4">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        This will sync categories from <strong>vrindavan_stage_copy.categories</strong> to the operations database.
        Existing categories will be updated if their names have changed, and new categories will be added.
      </p>
      <div id="syncCategoriesSummary" class="hidden mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Sync Summary:</h4>
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400">Total Categories:</span>
            <span class="font-medium text-gray-900 dark:text-white" id="syncTotal">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-green-600 dark:text-green-400">Created:</span>
            <span class="font-medium text-green-700 dark:text-green-300" id="syncCreated">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-blue-600 dark:text-blue-400">Updated:</span>
            <span class="font-medium text-blue-700 dark:text-blue-300" id="syncUpdated">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Skipped:</span>
            <span class="font-medium text-gray-600 dark:text-gray-300" id="syncSkipped">-</span>
          </div>
        </div>
      </div>
      <div id="syncCategoriesLoading" class="hidden mb-4 text-center">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Syncing categories...</p>
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
      <button type="button" onclick="confirmSyncCategories()" id="syncCategoriesConfirmBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Confirm Sync</button>
      <button type="button" onclick="modals.closeModal()" id="syncCategoriesCloseBtn" class="hidden px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Close</button>
    </div>
  `;
  const modal = modals.showModal("Sync Categories", content);

  // Reset state
  document.getElementById("syncCategoriesSummary").classList.add("hidden");
  document.getElementById("syncCategoriesLoading").classList.add("hidden");
  document.getElementById("syncCategoriesConfirmBtn").classList.remove("hidden");
  document.getElementById("syncCategoriesCloseBtn").classList.add("hidden");
}

async function confirmSyncCategories() {
  const confirmBtn = document.getElementById("syncCategoriesConfirmBtn");
  const closeBtn = document.getElementById("syncCategoriesCloseBtn");
  const loadingDiv = document.getElementById("syncCategoriesLoading");
  const summaryDiv = document.getElementById("syncCategoriesSummary");

  confirmBtn.classList.add("hidden");
  loadingDiv.classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE}/product-categories/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (result.success) {
      loadingDiv.classList.add("hidden");
      summaryDiv.classList.remove("hidden");

      document.getElementById("syncTotal").textContent = result.summary.total || 0;
      document.getElementById("syncCreated").textContent = result.summary.created || 0;
      document.getElementById("syncUpdated").textContent = result.summary.updated || 0;
      document.getElementById("syncSkipped").textContent = result.summary.skipped || 0;

      closeBtn.classList.remove("hidden");
      utils.showToast("Categories synced successfully", "success");
      await dataLoader.loadAll();
    } else {
      loadingDiv.classList.add("hidden");
      confirmBtn.classList.remove("hidden");
      utils.showToast(result.error || "Failed to sync categories", "error");
    }
  } catch (error) {
    loadingDiv.classList.add("hidden");
    confirmBtn.classList.remove("hidden");
    utils.showToast("An error occurred while syncing categories: " + error.message, "error");
  }
}

// Sync Subcategories Modal
function showSyncSubcategoriesModal() {
  const content = `
    <div class="mb-4">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        This will sync subcategories from <strong>vrindavan_stage_copy.sub_categories</strong> to the operations database.
        Existing subcategories will be updated if their names or categories have changed, and new subcategories will be added.
      </p>
      <div id="syncSubcategoriesSummary" class="hidden mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Sync Summary:</h4>
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400">Total Subcategories:</span>
            <span class="font-medium text-gray-900 dark:text-white" id="syncSubTotal">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-green-600 dark:text-green-400">Created:</span>
            <span class="font-medium text-green-700 dark:text-green-300" id="syncSubCreated">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-blue-600 dark:text-blue-400">Updated:</span>
            <span class="font-medium text-blue-700 dark:text-blue-300" id="syncSubUpdated">-</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Skipped:</span>
            <span class="font-medium text-gray-600 dark:text-gray-300" id="syncSubSkipped">-</span>
          </div>
        </div>
      </div>
      <div id="syncSubcategoriesLoading" class="hidden mb-4 text-center">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Syncing subcategories...</p>
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
      <button type="button" onclick="confirmSyncSubcategories()" id="syncSubcategoriesConfirmBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Confirm Sync</button>
      <button type="button" onclick="modals.closeModal()" id="syncSubcategoriesCloseBtn" class="hidden px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Close</button>
    </div>
  `;
  const modal = modals.showModal("Sync Sub-categories", content);

  // Reset state
  document.getElementById("syncSubcategoriesSummary").classList.add("hidden");
  document.getElementById("syncSubcategoriesLoading").classList.add("hidden");
  document.getElementById("syncSubcategoriesConfirmBtn").classList.remove("hidden");
  document.getElementById("syncSubcategoriesCloseBtn").classList.add("hidden");
}

async function confirmSyncSubcategories() {
  const confirmBtn = document.getElementById("syncSubcategoriesConfirmBtn");
  const closeBtn = document.getElementById("syncSubcategoriesCloseBtn");
  const loadingDiv = document.getElementById("syncSubcategoriesLoading");
  const summaryDiv = document.getElementById("syncSubcategoriesSummary");

  confirmBtn.classList.add("hidden");
  loadingDiv.classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE}/product-subcategories/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (result.success) {
      loadingDiv.classList.add("hidden");
      summaryDiv.classList.remove("hidden");

      document.getElementById("syncSubTotal").textContent = result.summary.total || 0;
      document.getElementById("syncSubCreated").textContent = result.summary.created || 0;
      document.getElementById("syncSubUpdated").textContent = result.summary.updated || 0;
      document.getElementById("syncSubSkipped").textContent = result.summary.skipped || 0;

      closeBtn.classList.remove("hidden");
      utils.showToast("Subcategories synced successfully", "success");
      await dataLoader.loadAll();
    } else {
      loadingDiv.classList.add("hidden");
      confirmBtn.classList.remove("hidden");
      utils.showToast(result.error || "Failed to sync subcategories", "error");
    }
  } catch (error) {
    loadingDiv.classList.add("hidden");
    confirmBtn.classList.remove("hidden");
    utils.showToast("An error occurred while syncing subcategories: " + error.message, "error");
  }
}

// Sync Products Modal
async function showSyncProductsModal() {
  // Show loading state while fetching preview
  const loadingContent = `
    <div class="mb-4 text-center">
      <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Checking for new products...</p>
    </div>
  `;
  const modal = modals.showModal("Sync Products", loadingContent);

  try {
    // Fetch preview of new products
    const previewResponse = await fetch(`${API_BASE}/products/sync/preview`);
    const previewResult = await previewResponse.json();

    if (!previewResult.success) {
      modals.closeModal();
      utils.showToast("Failed to preview sync: " + previewResult.error, "error");
      return;
    }

    const newProductsCount = previewResult.newProductsCount || 0;
    const totalProducts = previewResult.totalProducts || 0;
    const existingProducts = previewResult.existingProducts || 0;

    const content = `
      <div class="mb-4">
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This will sync products from <strong>vrindavan_stage_copy.foods</strong> to the operations database.
          <strong>Only new products will be added</strong> - existing products will not be overwritten. Categories and subcategories will be automatically assigned based on the data in the foods table.
        </p>
        <div id="syncProductsPreview" class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Sync Preview:</h4>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600 dark:text-gray-400">Total Products in Source:</span>
              <span class="font-medium text-gray-900 dark:text-white">${totalProducts}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600 dark:text-gray-400">Existing Products:</span>
              <span class="font-medium text-gray-900 dark:text-white">${existingProducts}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-green-600 dark:text-green-400 font-semibold">New Products Available:</span>
              <span class="font-bold text-green-700 dark:text-green-300 text-lg">${newProductsCount}</span>
            </div>
          </div>
        </div>
        <div id="syncProductsSummary" class="hidden mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Sync Summary:</h4>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600 dark:text-gray-400">Total Products:</span>
              <span class="font-medium text-gray-900 dark:text-white" id="syncProdTotal">-</span>
            </div>
            <div class="flex justify-between">
              <span class="text-green-600 dark:text-green-400">Created:</span>
              <span class="font-medium text-green-700 dark:text-green-300" id="syncProdCreated">-</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Skipped:</span>
              <span class="font-medium text-gray-600 dark:text-gray-300" id="syncProdSkipped">-</span>
            </div>
            <div class="flex justify-between">
              <span class="text-red-600 dark:text-red-400">Errors:</span>
              <span class="font-medium text-red-700 dark:text-red-300" id="syncProdErrors">-</span>
            </div>
          </div>
          <div id="syncProductsErrorDetails" class="hidden mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <h5 class="font-semibold text-red-800 dark:text-red-300 mb-2 text-xs">Error Details (first 10):</h5>
            <ul class="text-xs text-red-700 dark:text-red-400 space-y-1" id="syncProductsErrorList"></ul>
          </div>
        </div>
        <div id="syncProductsLoading" class="hidden mb-4 text-center">
          <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Syncing products...</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6 pt-4 pb-2 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="button" onclick="confirmSyncProducts()" id="syncProductsConfirmBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 ${newProductsCount === 0 ? "opacity-50 cursor-not-allowed" : ""}" ${newProductsCount === 0 ? "disabled" : ""}>Confirm Sync</button>
        <button type="button" onclick="modals.closeModal()" id="syncProductsCloseBtn" class="hidden px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Close</button>
      </div>
    `;

    // Replace modal content with preview
    // Find the inner content div by looking for the one that contains the h3 title
    // The structure is: outer div (inline-block) > inner div (with padding and h3)
    const titleElement = modal.querySelector("h3");
    const modalContent = titleElement ? titleElement.parentElement : null;
    if (modalContent) {
      modalContent.innerHTML = `
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Sync Products</h3>
        ${content}
      `;
    }

    if (newProductsCount === 0) {
      utils.showToast("No new products available to sync", "info");
    }
  } catch (error) {
    modals.closeModal();
    utils.showToast("Failed to load sync preview: " + error.message, "error");
  }
}

async function confirmSyncProducts() {
  const confirmBtn = document.getElementById("syncProductsConfirmBtn");
  const closeBtn = document.getElementById("syncProductsCloseBtn");
  const loadingDiv = document.getElementById("syncProductsLoading");
  const summaryDiv = document.getElementById("syncProductsSummary");
  const errorDetailsDiv = document.getElementById("syncProductsErrorDetails");
  const errorList = document.getElementById("syncProductsErrorList");

  confirmBtn.classList.add("hidden");
  loadingDiv.classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE}/products/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (result.success) {
      loadingDiv.classList.add("hidden");
      summaryDiv.classList.remove("hidden");

      document.getElementById("syncProdTotal").textContent = result.summary.total || 0;
      document.getElementById("syncProdCreated").textContent = result.summary.created || 0;
      document.getElementById("syncProdSkipped").textContent = result.summary.skipped || 0;
      document.getElementById("syncProdErrors").textContent = result.summary.errors || 0;

      // Show error details if any
      if (result.summary.errorDetails && result.summary.errorDetails.length > 0) {
        errorDetailsDiv.classList.remove("hidden");
        errorList.innerHTML = result.summary.errorDetails.map((err) => `<li>${err}</li>`).join("");
      } else {
        errorDetailsDiv.classList.add("hidden");
      }

      closeBtn.classList.remove("hidden");
      utils.showToast("Products synced successfully", "success");
      await dataLoader.loadAll();
    } else {
      loadingDiv.classList.add("hidden");
      confirmBtn.classList.remove("hidden");
      utils.showToast(result.error || "Failed to sync products", "error");
    }
  } catch (error) {
    loadingDiv.classList.add("hidden");
    confirmBtn.classList.remove("hidden");
    utils.showToast("An error occurred while syncing products: " + error.message, "error");
  }
}

// Subcategory Functions
async function showAddSubcategoryModal() {
  const categoryOptions = state.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");

  const content = `
    <form id="subcategoryForm" onsubmit="saveSubcategory(event)">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category *</label>
        <select id="subcategoryCategoryId" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">Select Category</option>
          ${categoryOptions}
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subcategory Name *</label>
        <input type="text" id="subcategoryName" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea id="subcategoryDescription" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"></textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save</button>
      </div>
    </form>
  `;
  modals.showModal("Add Subcategory", content);
}

async function saveSubcategory(event, id = null) {
  event.preventDefault();

  const categoryId = parseInt(document.getElementById("subcategoryCategoryId").value);
  const name = document.getElementById("subcategoryName").value;
  const description = document.getElementById("subcategoryDescription").value;

  // Validation
  if (!categoryId) {
    utils.showToast("Please select a category", "error");
    return;
  }

  const nameValidation = utils.validateRequired(name, "Subcategory name");
  if (!nameValidation.valid) {
    utils.showToast(nameValidation.error, "error");
    return;
  }

  try {
    const data = { category_id: categoryId, name: nameValidation.value, description: description || null };

    if (id) {
      await api.updateSubcategory(id, data);
      utils.showToast("Subcategory updated successfully", "success");
    } else {
      await api.createSubcategory(data);
      utils.showToast("Subcategory created successfully", "success");
    }

    modals.closeModal();
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to save subcategory", "error");
  }
}

// Common Margin Functions
async function showAddMarginModal() {
  const productOptions = state.products.map((p) => `<option value="${p.id}">${p.name || "Unknown"} ${p.grammage ? `(${p.grammage})` : ""}</option>`).join("");

  const today = new Date().toISOString().split("T")[0];

  const content = `
    <form id="marginForm" onsubmit="saveCommonMargin(event)">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product *</label>
        <select id="marginProductId" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">Select Product</option>
          ${productOptions}
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Margin Percentage *</label>
        <input type="number" id="marginPercentage" step="0.01" min="0" max="100" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter a value between 0 and 100</p>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective From *</label>
        <input type="date" id="marginEffectiveFrom" value="${today}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective To</label>
        <input type="date" id="marginEffectiveTo" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty if currently active</p>
      </div>
      <div class="mb-4">
        <label class="flex items-center">
          <input type="checkbox" id="marginIsActive" checked class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
          <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
        </label>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
        <textarea id="marginNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"></textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
      </div>
    </form>
  `;
  modals.showModal("Add Common Margin", content);
}

async function editCommonMargin(id) {
  const margin = state.commonMargins.find((m) => m.id === id);
  if (!margin) {
    utils.showToast("Margin not found", "error");
    return;
  }

  const productOptions = state.products.map((p) => `<option value="${p.id}" ${p.id === margin.product_id ? "selected" : ""}>${p.name || p.product_name || "Unknown"} ${p.grammage ? `(${p.grammage})` : ""}</option>`).join("");

  const content = `
    <form id="marginForm" onsubmit="saveCommonMargin(event, ${id})">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product *</label>
        <select id="marginProductId" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">Select Product</option>
          ${productOptions}
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Margin Percentage *</label>
        <input type="number" id="marginPercentage" value="${margin.margin_percentage || ""}" step="0.01" min="0" max="100" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective From *</label>
        <input type="date" id="marginEffectiveFrom" value="${margin.effective_from || ""}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective To</label>
        <input type="date" id="marginEffectiveTo" value="${margin.effective_to || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="mb-4">
        <label class="flex items-center">
          <input type="checkbox" id="marginIsActive" ${margin.is_active ? "checked" : ""} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
          <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
        </label>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
        <textarea id="marginNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">${margin.notes || ""}</textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
      </div>
    </form>
  `;
  modals.showModal("Edit Common Margin", content);
}

async function saveCommonMargin(event, id = null) {
  event.preventDefault();

  const productId = parseInt(document.getElementById("marginProductId").value);
  const marginPercentage = document.getElementById("marginPercentage").value;
  const effectiveFrom = document.getElementById("marginEffectiveFrom").value;
  const effectiveTo = document.getElementById("marginEffectiveTo").value;
  const isActive = document.getElementById("marginIsActive").checked;
  const notes = document.getElementById("marginNotes").value;

  // Validation
  if (!productId) {
    utils.showToast("Please select a product", "error");
    return;
  }

  const marginValidation = utils.validateMargin(marginPercentage);
  if (!marginValidation.valid) {
    utils.showToast(marginValidation.error, "error");
    return;
  }

  const dateValidation = utils.validateDate(effectiveFrom, "Effective from");
  if (!dateValidation.valid) {
    utils.showToast(dateValidation.error, "error");
    return;
  }

  // Validate effective_to is after effective_from if provided
  if (effectiveTo) {
    const fromDate = new Date(effectiveFrom);
    const toDate = new Date(effectiveTo);
    if (toDate < fromDate) {
      utils.showToast("Effective to date must be after effective from date", "error");
      return;
    }
  }

  try {
    const data = {
      product_id: productId,
      margin_percentage: marginValidation.value,
      effective_from: dateValidation.value,
      effective_to: effectiveTo || null,
      is_active: isActive,
      notes: notes || null,
    };

    if (id) {
      await api.updateCommonMargin(id, data);
      utils.showToast("Margin updated successfully", "success");
    } else {
      await api.createCommonMargin(data);
      utils.showToast("Margin created successfully", "success");
    }

    modals.closeModal();
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to save margin", "error");
  }
}

async function deleteCommonMargin(id) {
  if (!confirm("Are you sure you want to delete this margin? This action cannot be undone.")) {
    return;
  }

  try {
    await api.deleteCommonMargin(id);
    utils.showToast("Margin deleted successfully", "success");
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to delete margin", "error");
  }
}

// Seller Margin Functions
async function showAddSellerMarginModal() {
  const sellerOptions = state.sellers.map((s) => `<option value="${s.id}">${s.partner_name || s.name || "Unknown"} ${s.partner_code ? `(${s.partner_code})` : ""}</option>`).join("");

  const productOptions = state.products
    .map((p) => {
      const productData = { ...p, computed_cost_price: getProductCostPrice(p) };
      return `<option value="${p.id}" data-product='${JSON.stringify(productData)}'>${p.name || p.product_name || "Unknown"} ${p.grammage ? `(${p.grammage})` : ""}</option>`;
    })
    .join("");

  const today = new Date().toISOString().split("T")[0];

  const content = `
    <form id="sellerMarginForm" onsubmit="saveSellerMargin(event)">
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Seller & Product Selection</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seller *</label>
            <select id="sellerMarginSellerId" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
              <option value="">Select Seller</option>
              ${sellerOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product *</label>
            <select id="sellerMarginProductId" required onchange="loadProductDefaultsForSellerOverride()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
              <option value="">Select Product</option>
              ${productOptions}
            </select>
          </div>
        </div>
      </div>

      <!-- Pricing Information -->
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Pricing Information (Override)</h4>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">MRP (₹) *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Maximum Retail Price - the final selling price to customers</p>
            <input type="number" id="sellerMarginMrp" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seller Margin % *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Seller margin percentage on MRP</p>
            <input type="number" id="sellerMarginPercentage" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GST % *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Goods and Services Tax percentage applicable</p>
            <input type="number" id="sellerMarginGstPercentage" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seller Commission (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Commission amount (Auto-calculated from MRP and Seller Margin %)</p>
            <input type="number" id="sellerMarginCommission" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Landing Price (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">MRP minus Seller Margin (Auto-calculated)</p>
            <input type="number" id="sellerMarginLandingPrice" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Basic Price (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Base price before GST (Calculated from Landing Price)</p>
            <input type="number" id="sellerMarginBasicPrice" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GST Value (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Calculated GST amount (Auto-calculated)</p>
            <input type="number" id="sellerMarginGstValue" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Net Profit (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Net profit indicator (MRP - Cost - Commission)</p>
            <div id="sellerMarginProfitIndicator" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-lg">
              ₹0.00
            </div>
          </div>
        </div>
      </div>

      <!-- Effective Dates & Status -->
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Effective Dates & Status</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective From *</label>
            <input type="date" id="sellerMarginEffectiveFrom" value="${today}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective To</label>
            <input type="date" id="sellerMarginEffectiveTo" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
            <label class="flex items-center mt-2">
              <input type="checkbox" id="sellerMarginIsActive" checked class="rounded border-gray-300 text-orange-600 focus:ring-orange-500">
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
        <textarea id="sellerMarginNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"></textarea>
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">Save Override</button>
      </div>
    </form>
  `;
  modals.showModal("Add Seller Margin Override", content);
}

async function editSellerMargin(id) {
  const margin = state.sellerMargins.find((m) => m.id === id);
  if (!margin) {
    utils.showToast("Margin not found", "error");
    return;
  }

  // Get product details to show default values
  const product = state.products.find((p) => p.id === margin.product_id);

  const sellerOptions = state.sellers.map((s) => `<option value="${s.id}" ${s.id === margin.seller_id ? "selected" : ""}>${s.partner_name || s.name || "Unknown"} ${s.partner_code ? `(${s.partner_code})` : ""}</option>`).join("");

  const productOptions = state.products
    .map((p) => {
      const productData = { ...p, computed_cost_price: getProductCostPrice(p) };
      return `<option value="${p.id}" ${p.id === margin.product_id ? "selected" : ""} data-product='${JSON.stringify(productData)}'>${p.name || p.product_name || "Unknown"} ${p.grammage ? `(${p.grammage})` : ""}</option>`;
    })
    .join("");

  // Use override values if available, otherwise use product defaults
  const mrp = margin.mrp || product?.mrp || "";
  const marginPercentage = margin.margin_percentage || "";
  const gstPercentage = margin.gst_percentage || product?.gst_percentage || "";
  const sellerCommission = margin.seller_margin_value || "";
  const landingPrice = margin.landing_price || "";
  const basicPrice = margin.basic_price || "";
  const gstValue = margin.gst_value || "";

  const content = `
    <form id="sellerMarginForm" onsubmit="saveSellerMargin(event, ${id})">
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Seller & Product Selection</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seller *</label>
            <select id="sellerMarginSellerId" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
              <option value="">Select Seller</option>
              ${sellerOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product *</label>
            <select id="sellerMarginProductId" required onchange="loadProductDefaultsForSellerOverride()" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
              <option value="">Select Product</option>
              ${productOptions}
            </select>
          </div>
        </div>
      </div>

      <!-- Pricing Information -->
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Pricing Information (Override)</h4>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">MRP (₹) *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Maximum Retail Price - the final selling price to customers</p>
            <input type="number" id="sellerMarginMrp" value="${mrp}" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seller Margin % *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Seller margin percentage on MRP</p>
            <input type="number" id="sellerMarginPercentage" value="${marginPercentage}" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GST % *</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Goods and Services Tax percentage applicable</p>
            <input type="number" id="sellerMarginGstPercentage" value="${gstPercentage}" step="0.01" oninput="calculateSellerOverridePricing();" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seller Commission (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Commission amount (Auto-calculated from MRP and Seller Margin %)</p>
            <input type="number" id="sellerMarginCommission" value="${sellerCommission}" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Landing Price (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">MRP minus Seller Margin (Auto-calculated)</p>
            <input type="number" id="sellerMarginLandingPrice" value="${landingPrice}" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Basic Price (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Base price before GST (Calculated from Landing Price)</p>
            <input type="number" id="sellerMarginBasicPrice" value="${basicPrice}" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GST Value (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Calculated GST amount (Auto-calculated)</p>
            <input type="number" id="sellerMarginGstValue" value="${gstValue}" step="0.01" readonly class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Net Profit (₹)</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Net profit indicator (MRP - Cost - Commission)</p>
            <div id="sellerMarginProfitIndicator" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-lg">
              ₹0.00
            </div>
          </div>
        </div>
      </div>

      <!-- Effective Dates & Status -->
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Effective Dates & Status</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective From *</label>
            <input type="date" id="sellerMarginEffectiveFrom" value="${margin.effective_from || ""}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Effective To</label>
            <input type="date" id="sellerMarginEffectiveTo" value="${margin.effective_to || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
            <label class="flex items-center mt-2">
              <input type="checkbox" id="sellerMarginIsActive" ${margin.is_active ? "checked" : ""} class="rounded border-gray-300 text-orange-600 focus:ring-orange-500">
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
        <textarea id="sellerMarginNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500">${margin.notes || ""}</textarea>
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">Update Override</button>
      </div>
    </form>
  `;
  modals.showModal("Edit Seller Margin Override", content);

  // Calculate pricing after modal is shown
  setTimeout(() => {
    calculateSellerOverridePricing();
  }, 100);
}

// Load product defaults when product is selected in seller override modal
function loadProductDefaultsForSellerOverride() {
  const productSelect = document.getElementById("sellerMarginProductId");
  if (!productSelect || !productSelect.value) return;

  const selectedOption = productSelect.options[productSelect.selectedIndex];
  const productData = selectedOption.getAttribute("data-product");
  if (!productData) return;

  try {
    const product = JSON.parse(productData);

    // Only set defaults if fields are empty (for new overrides)
    const mrpInput = document.getElementById("sellerMarginMrp");
    const marginInput = document.getElementById("sellerMarginPercentage");
    const gstInput = document.getElementById("sellerMarginGstPercentage");

    if (mrpInput && !mrpInput.value && product.mrp) {
      mrpInput.value = product.mrp;
    }
    if (marginInput && !marginInput.value && product.margin_percentage) {
      marginInput.value = product.margin_percentage;
    }
    if (gstInput && !gstInput.value && product.gst_percentage) {
      gstInput.value = product.gst_percentage;
    }

    // Recalculate pricing
    calculateSellerOverridePricing();
  } catch (error) {
    console.error("Error loading product defaults:", error);
  }
}

// Calculate pricing for seller override modal
function calculateSellerOverridePricing() {
  const mrp = parseFloat(document.getElementById("sellerMarginMrp")?.value) || 0;
  const gstPercentage = parseFloat(document.getElementById("sellerMarginGstPercentage")?.value) || 0;
  const marginPercentage = parseFloat(document.getElementById("sellerMarginPercentage")?.value) || 0;

  // Calculate Seller Commission (Seller Margin Value)
  const sellerCommission = mrp > 0 && marginPercentage >= 0 ? mrp * (marginPercentage / 100) : 0;
  const sellerCommissionRounded = Math.round(sellerCommission * 100) / 100;

  // Landing Price = MRP - Seller Margin Value
  const landingPrice = mrp - sellerCommissionRounded;
  const landingPriceRounded = Math.round(landingPrice * 100) / 100;

  // Calculate Basic Price from Landing Price
  let basicPrice = 0;
  if (landingPriceRounded > 0 && gstPercentage >= 0) {
    basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
    basicPrice = Math.round(basicPrice * 100) / 100;
  }

  // Calculate GST Value from Basic Price
  const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

  // Update calculated fields
  const commissionInput = document.getElementById("sellerMarginCommission");
  const landingInput = document.getElementById("sellerMarginLandingPrice");
  const basicInput = document.getElementById("sellerMarginBasicPrice");
  const gstValueInput = document.getElementById("sellerMarginGstValue");
  const profitIndicator = document.getElementById("sellerMarginProfitIndicator");

  if (commissionInput) commissionInput.value = sellerCommissionRounded.toFixed(2);
  if (landingInput) landingInput.value = landingPriceRounded.toFixed(2);
  if (basicInput) basicInput.value = basicPrice.toFixed(2);
  if (gstValueInput) gstValueInput.value = gstValue.toFixed(2);

  // Calculate Net Profit (need cost price from product/COGM)
  const productSelect = document.getElementById("sellerMarginProductId");
  const selectedProductId = productSelect && productSelect.value ? parseInt(productSelect.value) : null;
  let costPrice = selectedProductId ? getComputedCostPriceFromState(selectedProductId) : 0;
  if (productSelect && productSelect.value) {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const productData = selectedOption.getAttribute("data-product");
    if (productData) {
      try {
        const product = JSON.parse(productData);
        if (product.computed_cost_price !== undefined && product.computed_cost_price !== null) {
          costPrice = parseFloat(product.computed_cost_price) || costPrice;
        } else if (product.cost_price !== undefined && product.cost_price !== null) {
          costPrice = parseFloat(product.cost_price) || costPrice;
        }
      } catch (e) {
        console.error("Error parsing product data:", e);
      }
    }
  }
  costPrice = parseFloat(costPrice) || 0;

  // Net Profit = MRP - Cost Price - Seller Commission
  const netProfit = mrp - costPrice - sellerCommissionRounded;
  const profitAmount = netProfit.toFixed(2);

  if (profitIndicator) {
    if (netProfit > 0) {
      profitIndicator.className = "w-full px-3 py-2 border border-green-300 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-semibold text-lg";
      profitIndicator.textContent = `₹${profitAmount}`;
    } else if (netProfit < 0) {
      profitIndicator.className = "w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-semibold text-lg";
      profitIndicator.textContent = `₹${profitAmount}`;
    } else {
      profitIndicator.className = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-lg";
      profitIndicator.textContent = `₹${profitAmount}`;
    }
  }
}

async function saveSellerMargin(event, id = null) {
  event.preventDefault();

  const sellerId = parseInt(document.getElementById("sellerMarginSellerId").value);
  const productId = parseInt(document.getElementById("sellerMarginProductId").value);
  const mrp = document.getElementById("sellerMarginMrp")?.value;
  const marginPercentage = document.getElementById("sellerMarginPercentage").value;
  const gstPercentage = document.getElementById("sellerMarginGstPercentage")?.value;
  const sellerCommission = document.getElementById("sellerMarginCommission")?.value;
  const landingPrice = document.getElementById("sellerMarginLandingPrice")?.value;
  const basicPrice = document.getElementById("sellerMarginBasicPrice")?.value;
  const gstValue = document.getElementById("sellerMarginGstValue")?.value;
  const effectiveFrom = document.getElementById("sellerMarginEffectiveFrom").value;
  const effectiveTo = document.getElementById("sellerMarginEffectiveTo").value;
  const isActive = document.getElementById("sellerMarginIsActive").checked;
  const productActive = document.getElementById("sellerMarginProductActive") ? document.getElementById("sellerMarginProductActive").checked : true; // Default to true if field doesn't exist
  const notes = document.getElementById("sellerMarginNotes").value;

  // Validation
  if (!sellerId) {
    utils.showToast("Please select a seller", "error");
    return;
  }

  if (!productId) {
    utils.showToast("Please select a product", "error");
    return;
  }

  if (!mrp || parseFloat(mrp) <= 0) {
    utils.showToast("MRP is required and must be greater than 0", "error");
    return;
  }

  const marginValidation = utils.validateMargin(marginPercentage);
  if (!marginValidation.valid) {
    utils.showToast(marginValidation.error, "error");
    return;
  }

  if (!gstPercentage || parseFloat(gstPercentage) < 0) {
    utils.showToast("GST % is required", "error");
    return;
  }

  const dateValidation = utils.validateDate(effectiveFrom, "Effective from");
  if (!dateValidation.valid) {
    utils.showToast(dateValidation.error, "error");
    return;
  }

  // Validate effective_to is after effective_from if provided
  if (effectiveTo) {
    const fromDate = new Date(effectiveFrom);
    const toDate = new Date(effectiveTo);
    if (toDate < fromDate) {
      utils.showToast("Effective to date must be after effective from date", "error");
      return;
    }
  }

  const computedCostPrice = Math.round((getComputedCostPriceFromState(productId) || 0) * 100) / 100;

  try {
    const data = {
      seller_id: sellerId,
      product_id: productId,
      mrp: parseFloat(mrp),
      margin_percentage: marginValidation.value,
      gst_percentage: parseFloat(gstPercentage),
      seller_margin_value: sellerCommission ? parseFloat(sellerCommission) : null,
      landing_price: landingPrice ? parseFloat(landingPrice) : null,
      basic_price: basicPrice ? parseFloat(basicPrice) : null,
      gst_value: gstValue ? parseFloat(gstValue) : null,
      cost_price: computedCostPrice,
      effective_from: dateValidation.value,
      effective_to: effectiveTo || null,
      is_active: isActive,
      product_active: productActive,
      notes: notes || null,
    };

    if (id) {
      await api.updateSellerMargin(id, data);
      utils.showToast("Seller margin override updated successfully", "success");
    } else {
      await api.createSellerMargin(data);
      utils.showToast("Seller margin override created successfully", "success");
    }

    modals.closeModal();
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to save seller margin override", "error");
  }
}

async function deleteSellerMargin(id) {
  if (!confirm("Are you sure you want to delete this seller margin override? This action cannot be undone.")) {
    return;
  }

  try {
    await api.deleteSellerMargin(id);
    utils.showToast("Seller margin deleted successfully", "success");
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to delete seller margin", "error");
  }
}

// Product View Functions (deprecated - now using separate page)
async function viewProductDetails(productId) {
  // Redirect to product view page
  window.location.href = `/product-margin/products/${productId}`;
}

// Legacy function for backward compatibility
async function viewProductDetailsLegacy(productId) {
  try {
    // Show loading state
    const loadingContent = `
      <div class="text-center py-8">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Loading product details...</p>
      </div>
    `;
    modals.showModal("Product Details", loadingContent);

    // Fetch full product details
    const productResult = await api.getProductById(productId);

    if (!productResult.success || !productResult.product) {
      modals.closeModal();
      utils.showToast("Failed to load product details", "error");
      return;
    }

    const product = productResult.product;
    const category = state.categories.find((c) => c.id === product.category_id);
    const subcategory = state.subcategories.find((sc) => sc.id === product.subcategory_id);
    // Common margin is now stored in products table
    const hasCommonMargin = product.margin_percentage !== null && product.margin_percentage !== undefined;
    const sellerMargins = state.sellerMargins.filter((m) => m.product_id === productId && m.is_active);

    // Helper function to display value or "-"
    const displayValue = (value, formatter = null) => {
      if (value === null || value === undefined || value === "") return "-";
      return formatter ? formatter(value) : value;
    };

    // Build product details content
    const content = `
      <div class="max-h-[80vh] overflow-y-auto">
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">${product.name || "Unknown Product"}</h4>
          
          <!-- Basic Information Section -->
          <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Basic Information</h5>
          <div class="grid grid-cols-4 gap-4 text-sm mb-6">
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Product Name:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.name)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Brand Name:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.brand_name)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Product Type:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.product_type)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Category:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(category ? category.name : null)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Subcategory:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(subcategory ? subcategory.name : null)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Grammage:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.grammage || product.unit_size)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Packing Type:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.packing_type)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Milk Type:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.milk_type)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Storage Type:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.storage_type)}</span></div>
            <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Status:</span> <span class="text-gray-900 dark:text-white font-medium">${product.is_active !== undefined ? (product.is_active ? "Active" : "Inactive") : "-"}</span></div>
          </div>

          <!-- Description Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Description</h5>
            <p class="text-sm text-gray-600 dark:text-gray-400">${displayValue(product.description)}</p>
          </div>

          <!-- Pricing & Codes Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Pricing & Codes</h5>
            <div class="grid grid-cols-4 gap-4 text-sm">
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">EAN Code:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.ean_code)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">HSN Code:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.hsn_code)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Basic Price:</span> <span class="text-gray-900 dark:text-white font-medium">${product.basic_price ? "₹" + parseFloat(product.basic_price).toFixed(2) : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">GST %:</span> <span class="text-gray-900 dark:text-white font-medium">${product.gst_percentage ? utils.formatPercent(product.gst_percentage) : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">GST Value:</span> <span class="text-gray-900 dark:text-white font-medium">${product.gst_value ? "₹" + parseFloat(product.gst_value).toFixed(2) : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Landing Price:</span> <span class="text-gray-900 dark:text-white font-medium">${product.landing_price ? "₹" + parseFloat(product.landing_price).toFixed(2) : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">MRP:</span> <span class="text-gray-900 dark:text-white font-semibold text-lg">${product.mrp ? "₹" + parseFloat(product.mrp).toFixed(2) : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Margin %:</span> <span class="text-gray-900 dark:text-white font-medium">${product.margin_percentage ? utils.formatPercent(product.margin_percentage) : "-"}</span></div>
            </div>
          </div>

          <!-- Additional Details Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Additional Details</h5>
            <div class="grid grid-cols-4 gap-4 text-sm">
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Shelf Life:</span> <span class="text-gray-900 dark:text-white font-medium">${product.shelf_life_days ? product.shelf_life_days + " days" : "-"}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">RTV Status:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.rtv_status)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Vendor Pack Size:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.vendor_pack_size)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Packaging Dimensions:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.packaging_dimensions)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Temperature:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.temperature)}</span></div>
              <div><span class="text-gray-500 dark:text-gray-400 block mb-1">Cut-off Time:</span> <span class="text-gray-900 dark:text-white font-medium">${displayValue(product.cutoff_time)}</span></div>
            </div>
          </div>

          <!-- Margin Information Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Margin Information</h5>
            ${
              hasCommonMargin
                ? `
              <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-3">
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Common Margin (Master Data)</p>
                <div class="grid grid-cols-4 gap-4 text-sm">
                  <div><span class="text-gray-600 dark:text-gray-400 block mb-1">Margin:</span> <span class="text-gray-900 dark:text-white font-medium">${utils.formatPercent(product.margin_percentage)}</span></div>
                </div>
              </div>
            `
                : '<p class="text-sm text-gray-500 dark:text-gray-400 mb-3">No common margin set</p>'
            }
            
            ${
              sellerMargins.length > 0
                ? `
              <div>
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Seller-Specific Overrides</p>
                <div class="space-y-3">
                  ${sellerMargins
                    .map(
                      (margin) => `
                    <div class="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                      <div class="grid grid-cols-4 gap-4 text-sm">
                        <div><span class="text-gray-600 dark:text-gray-400 block mb-1">Seller:</span> <span class="text-gray-900 dark:text-white font-medium">${margin.seller_name || "Unknown Seller"}</span></div>
                        <div><span class="text-gray-600 dark:text-gray-400 block mb-1">Margin:</span> <span class="text-gray-900 dark:text-white font-medium">${utils.formatPercent(margin.margin_percentage)}</span></div>
                        <div><span class="text-gray-600 dark:text-gray-400 block mb-1">Effective From:</span> <span class="text-gray-900 dark:text-white font-medium">${utils.formatDate(margin.effective_from)}</span></div>
                        <div><span class="text-gray-600 dark:text-gray-400 block mb-1">Status:</span> <span class="text-gray-900 dark:text-white font-medium">${margin.is_active ? "Active" : "Inactive"}</span></div>
                      </div>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              </div>
            `
                : ""
            }
          </div>

        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
          <a href="/product-margin/products/${productId}/edit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block">Edit Product</a>
        </div>
      </div>
    `;

    // Close loading modal and show details modal
    modals.closeModal();
    modals.showModal("Product Details", content);
  } catch (error) {
    modals.closeModal();
    utils.showToast("Failed to load product details: " + error.message, "error");
  }
}

async function editProductDetails(productId) {
  // Redirect to product edit page
  window.location.href = `/product-margin/products/${productId}/edit`;
}

// Legacy function for backward compatibility
async function editProductDetailsLegacy(productId) {
  try {
    // Fetch product details
    const productResult = await api.getProductById(productId);

    if (!productResult.success || !productResult.product) {
      utils.showToast("Failed to load product for editing", "error");
      return;
    }

    const product = productResult.product;
    const categoryOptions = state.categories.map((c) => `<option value="${c.id}" ${c.id === product.category_id ? "selected" : ""}>${c.name}</option>`).join("");

    const subcategoryOptions = state.subcategories
      .filter((sc) => sc.category_id === product.category_id)
      .map((sc) => `<option value="${sc.id}" ${sc.id === product.subcategory_id ? "selected" : ""}>${sc.name}</option>`)
      .join("");

    const content = `
      <form id="productEditForm" onsubmit="saveProductDetails(event, ${productId})">
        <div class="max-h-[80vh] overflow-y-auto">
          <!-- Product Identification Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Product Identification</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product Name *</label>
                <input type="text" id="editProductName" value="${(product.name || "").replace(/"/g, "&quot;")}" required class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Brand Name</label>
                <input type="text" id="editBrandName" value="${(product.brand_name || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product Type</label>
                <input type="text" id="editProductType" value="${(product.product_type || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category *</label>
                <select id="editCategoryId" required onchange="updateSubcategoryOptions(${productId})" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">Select Category</option>
                  ${categoryOptions}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subcategory</label>
                <select id="editSubcategoryId" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">Select Subcategory</option>
                  ${subcategoryOptions}
                </select>
              </div>
            </div>
          </div>

          <!-- Physical Properties Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Physical Properties</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Grammage</label>
                <input type="text" id="editGrammage" value="${(product.grammage || product.unit_size || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Packing Type</label>
                <input type="text" id="editPackingType" value="${(product.packing_type || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Milk Type</label>
                <select id="editMilkType" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="A1" ${product.milk_type === "A1" ? "selected" : ""}>A1</option>
                  <option value="A2" ${product.milk_type === "A2" ? "selected" : ""}>A2</option>
                  <option value="Buffalo" ${product.milk_type === "Buffalo" ? "selected" : ""}>Buffalo</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Storage Type</label>
                <select id="editStorageType" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="cold" ${product.storage_type === "cold" ? "selected" : ""}>Cold</option>
                  <option value="room_temperature" ${product.storage_type === "room_temperature" ? "selected" : ""}>Room Temperature</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Codes & Identification Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Codes & Identification</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">EAN Code</label>
                <input type="text" id="editEanCode" value="${(product.ean_code || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">HSN Code</label>
                <input type="text" id="editHsnCode" value="${(product.hsn_code || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
          </div>

          <!-- Pricing Information Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Pricing Information</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Basic Price (₹)</label>
                <input type="number" id="editBasicPrice" step="0.01" value="${product.basic_price || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">GST %</label>
                <input type="number" id="editGstPercentage" step="0.01" value="${product.gst_percentage || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">GST Value (₹)</label>
                <input type="number" id="editGstValue" step="0.01" value="${product.gst_value || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Landing Price (₹)</label>
                <input type="number" id="editLandingPrice" step="0.01" value="${product.landing_price || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">MRP (₹)</label>
                <input type="number" id="editMrp" step="0.01" value="${product.mrp || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Margin %</label>
                <input type="number" id="editMarginPercentage" step="0.01" value="${product.margin_percentage || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
          </div>

          <!-- Packaging & Logistics Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Packaging & Logistics</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vendor Pack Size</label>
                <input type="text" id="editVendorPackSize" value="${(product.vendor_pack_size || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Packaging Dimensions</label>
                <input type="text" id="editPackagingDimensions" value="${(product.packaging_dimensions || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Temperature</label>
                <input type="text" id="editTemperature" value="${(product.temperature || "").replace(/"/g, "&quot;")}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cut-off Time</label>
                <input type="time" id="editCutoffTime" value="${product.cutoff_time || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
          </div>

          <!-- Product Lifecycle Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Product Lifecycle</h5>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shelf Life (days)</label>
                <input type="number" id="editShelfLifeDays" value="${product.shelf_life_days || ""}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">RTV Status</label>
                <select id="editRtvStatus" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">Select</option>
                  <option value="RTV" ${product.rtv_status === "RTV" ? "selected" : ""}>RTV</option>
                  <option value="Non RTV" ${product.rtv_status === "Non RTV" ? "selected" : ""}>Non RTV</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Description Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Description</h5>
            <div class="mb-4">
              <textarea id="editDescription" rows="4" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">${(product.description || "").replace(/"/g, "&quot;")}</textarea>
            </div>
          </div>

          <!-- Status Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Status</h5>
            <div class="mb-4">
              <label class="flex items-center">
                <input type="checkbox" id="editIsActive" ${product.is_active ? "checked" : ""} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
              </label>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="modals.closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
        </div>
      </form>
    `;

    modals.showModal("Edit Product", content);
  } catch (error) {
    utils.showToast("Failed to load product for editing: " + error.message, "error");
  }
}

function updateSubcategoryOptions(productId) {
  const categoryId = document.getElementById("editCategoryId").value;
  const subcategorySelect = document.getElementById("editSubcategoryId");

  if (!categoryId) {
    subcategorySelect.innerHTML = '<option value="">Select Subcategory</option>';
    return;
  }

  const subcategories = state.subcategories.filter((sc) => sc.category_id == categoryId);
  subcategorySelect.innerHTML = '<option value="">Select Subcategory</option>' + subcategories.map((sc) => `<option value="${sc.id}">${sc.name}</option>`).join("");
}

async function saveProductDetails(event, productId) {
  event.preventDefault();

  const productData = {
    name: document.getElementById("editProductName").value,
    product_name: document.getElementById("editProductName").value,
    brand_name: document.getElementById("editBrandName").value || null,
    product_type: document.getElementById("editProductType").value || null,
    category_id: document.getElementById("editCategoryId").value || null,
    subcategory_id: document.getElementById("editSubcategoryId").value || null,
    grammage: document.getElementById("editGrammage").value || null,
    unit_size: document.getElementById("editGrammage").value || null,
    packing_type: document.getElementById("editPackingType").value || null,
    milk_type: document.getElementById("editMilkType").value || null,
    storage_type: document.getElementById("editStorageType").value || null,
    description: document.getElementById("editDescription").value || null,
    ean_code: document.getElementById("editEanCode").value || null,
    hsn_code: document.getElementById("editHsnCode").value || null,
    basic_price: document.getElementById("editBasicPrice").value || null,
    gst_percentage: document.getElementById("editGstPercentage").value || null,
    gst_value: document.getElementById("editGstValue").value || null,
    landing_price: document.getElementById("editLandingPrice").value || null,
    mrp: document.getElementById("editMrp").value || null,
    margin_percentage: document.getElementById("editMarginPercentage").value || null,
    shelf_life_days: document.getElementById("editShelfLifeDays").value || null,
    rtv_status: document.getElementById("editRtvStatus").value || null,
    vendor_pack_size: document.getElementById("editVendorPackSize").value || null,
    packaging_dimensions: document.getElementById("editPackagingDimensions").value || null,
    temperature: document.getElementById("editTemperature").value || null,
    cutoff_time: document.getElementById("editCutoffTime").value || null,
    is_active: document.getElementById("editIsActive").checked ? "true" : "false",
  };

  // Validation
  if (!productData.name || productData.name.trim() === "") {
    utils.showToast("Product name is required", "error");
    return;
  }

  try {
    await api.updateProduct(productId, productData);
    utils.showToast("Product updated successfully", "success");
    modals.closeModal();
    await dataLoader.loadAll();
  } catch (error) {
    utils.showToast(error.message || "Failed to update product", "error");
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  dataLoader.loadAll();

  // Add event listeners for product filtering
  const productSearch = document.getElementById("productSearch");
  const productCategoryFilter = document.getElementById("productCategoryFilter");

  if (productSearch) {
    productSearch.addEventListener("input", () => dataLoader.renderProducts());
  }

  if (productCategoryFilter) {
    productCategoryFilter.addEventListener("change", () => {
      updateProductSubcategoryFilter();
      dataLoader.renderProducts();
    });
  }

  const productSubcategoryFilter = document.getElementById("productSubcategoryFilter");
  if (productSubcategoryFilter) {
    productSubcategoryFilter.addEventListener("change", () => dataLoader.renderProducts());
  }

  // Seller override search
  const sellerOverrideSearch = document.getElementById("sellerOverrideSearch");
  if (sellerOverrideSearch) {
    sellerOverrideSearch.addEventListener("input", () => dataLoader.renderSellerMargins());
  }

  // Seller override category filter
  const sellerOverrideCategoryFilter = document.getElementById("sellerOverrideCategoryFilter");
  if (sellerOverrideCategoryFilter) {
    sellerOverrideCategoryFilter.addEventListener("change", () => {
      updateSellerOverrideSubcategoryFilter();
      dataLoader.renderSellerMargins();
    });
  }

  // Seller override subcategory filter
  const sellerOverrideSubcategoryFilter = document.getElementById("sellerOverrideSubcategoryFilter");
  if (sellerOverrideSubcategoryFilter) {
    sellerOverrideSubcategoryFilter.addEventListener("change", () => dataLoader.renderSellerMargins());
  }

  // Seller override seller filter
  const sellerOverrideSellerFilter = document.getElementById("sellerOverrideSellerFilter");
  if (sellerOverrideSellerFilter) {
    sellerOverrideSellerFilter.addEventListener("change", () => dataLoader.renderSellerMargins());
  }

  // Seller override show only overridden checkbox
  const sellerOverrideShowOnlyOverridden = document.getElementById("sellerOverrideShowOnlyOverridden");
  if (sellerOverrideShowOnlyOverridden) {
    sellerOverrideShowOnlyOverridden.addEventListener("change", () => dataLoader.renderSellerMargins());
  }

  // Seller override show only active products checkbox
  const sellerOverrideShowOnlyActive = document.getElementById("sellerOverrideShowOnlyActive");
  if (sellerOverrideShowOnlyActive) {
    sellerOverrideShowOnlyActive.addEventListener("change", () => dataLoader.renderSellerMargins());
  }

  // Vrindavan Margins search
  const vrindavanSearch = document.getElementById("vrindavanSearch");
  if (vrindavanSearch) {
    vrindavanSearch.addEventListener("input", () => dataLoader.renderVrindavanMargins());
  }

  // Vrindavan Margins category filter
  const vrindavanCategoryFilter = document.getElementById("vrindavanCategoryFilter");
  if (vrindavanCategoryFilter) {
    vrindavanCategoryFilter.addEventListener("change", () => {
      updateVrindavanSubcategoryFilter();
      dataLoader.renderVrindavanMargins();
    });
  }

  // Vrindavan Margins subcategory filter
  const vrindavanSubcategoryFilter = document.getElementById("vrindavanSubcategoryFilter");
  if (vrindavanSubcategoryFilter) {
    vrindavanSubcategoryFilter.addEventListener("change", () => dataLoader.renderVrindavanMargins());
  }

  // Handle hash-based tab switching
  function handleHash() {
    const hash = window.location.hash.substring(1); // Remove the #
    if (hash) {
      // Map hash to tab name
      const tabMap = {
        "seller-overrides": "seller-overrides",
        "seller-override": "seller-overrides", // Alternative name
        "vrindavan-margins": "vrindavan-margins",
        "vrindavan-margin": "vrindavan-margins", // Alternative name
        categories: "categories",
        category: "categories", // Alternative name
        subcategories: "subcategories",
        "sub-categories": "subcategories", // Alternative name
        subcategory: "subcategories", // Alternative name
        products: "products",
        "product-margin": "products", // Alternative name
      };
      const tabName = tabMap[hash] || hash;
      switchTab(tabName);
    }
  }

  // Handle initial hash
  handleHash();

  // Handle hash changes
  window.addEventListener("hashchange", handleHash);
});

// Export products to Excel
async function exportProductsToExcel() {
  try {
    // Show loading indicator
    utils.showToast("Preparing export...", "info");

    // Get current filter values
    const categoryFilter = document.getElementById("productCategoryFilter");
    const subcategoryFilter = document.getElementById("productSubcategoryFilter");
    const searchInput = document.getElementById("productSearch");

    // Filter products same way as renderProducts
    let filteredProducts = [...state.products];

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    if (filteredProducts.length === 0) {
      utils.showToast("No products to export", "warning");
      return;
    }

    // Fetch full product details for each product
    const API_BASE = "/product-margin/api/v1";
    const productsWithDetails = await Promise.all(
      filteredProducts.map(async (product) => {
        try {
          const response = await fetch(`${API_BASE}/products/${product.id}`);
          const result = await response.json();
          if (result.success && result.product) {
            return result.product;
          }
          return product; // Fallback to partial product data
        } catch (error) {
          console.error(`Error fetching product ${product.id}:`, error);
          return product; // Fallback to partial product data
        }
      }),
    );

    // Get category and subcategory names
    const categoriesMap = new Map(state.categories.map((c) => [c.id, c.name]));
    const subcategoriesMap = new Map(state.subcategories.map((sc) => [sc.id, sc.name]));

    // Prepare data according to specified columns
    const exportData = productsWithDetails.map((product) => {
      const category = categoriesMap.get(product.category_id) || "";
      const subcategory = subcategoriesMap.get(product.subcategory_id) || "";

      // Calculate pricing values
      const mrp = parseFloat(product.mrp) || 0;
      const marginPercentage = parseFloat(product.margin_percentage) || 0;
      const gstPercentage = parseFloat(product.gst_percentage) || 0;

      // Seller Commission = MRP * (Seller Margin % / 100)
      const sellerCommission = mrp > 0 && marginPercentage >= 0 ? mrp * (marginPercentage / 100) : 0;
      const sellerCommissionRounded = Math.round(sellerCommission * 100) / 100;

      // Landing Price = MRP - Seller Margin Value
      const landingPrice = mrp - sellerCommissionRounded;
      const landingPriceRounded = Math.round(landingPrice * 100) / 100;

      // Basic Price = Landing Price / (1 + GST%/100)
      let basicPrice = 0;
      if (landingPriceRounded > 0 && gstPercentage >= 0) {
        basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
        basicPrice = Math.round(basicPrice * 100) / 100;
      }

      // GST Value = Basic Price * (GST%/100)
      const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

      return {
        "Product Type": product.product_type || "",
        Category: category,
        "Sub-Category": subcategory,
        "Product Name": product.name || "",
        "Brand Name": product.brand_name || "",
        Grammage: product.grammage || product.unit_size || "",
        "Packing Type": product.packing_type || "",
        Description: product.description || "",
        "EAN Code": product.ean_code || "",
        "HSN Code": product.hsn_code || "",
        "Margin (%)": marginPercentage ? marginPercentage.toFixed(2) : "",
        "Basic Price": basicPrice ? basicPrice.toFixed(2) : "",
        "GST %": gstPercentage ? gstPercentage.toFixed(2) : "",
        "GST Value": gstValue ? gstValue.toFixed(2) : "",
        "Landing Price": landingPriceRounded ? landingPriceRounded.toFixed(2) : "",
        "MRP (Rs)": mrp ? mrp.toFixed(2) : "",
        "Shelf life (number of days)": product.shelf_life_days || "",
        "RTV/ Non RTV": product.rtv_status || "",
        "Vendor Pack Size": product.vendor_pack_size || "",
        "Packaging Dimension": product.packaging_dimensions || "",
        Temperature: product.temperature || "",
        "Cut-off time": product.cutoff_time || "",
        // Store original values for sorting
        _sortCategory: category,
        _sortSubcategory: subcategory,
      };
    });

    // Sort by category, then by sub-category
    exportData.sort((a, b) => {
      // First sort by category
      const categoryCompare = (a._sortCategory || "").localeCompare(b._sortCategory || "");
      if (categoryCompare !== 0) {
        return categoryCompare;
      }
      // Then sort by sub-category
      return (a._sortSubcategory || "").localeCompare(b._sortSubcategory || "");
    });

    // Remove sorting helper fields
    exportData.forEach((row) => {
      delete row._sortCategory;
      delete row._sortSubcategory;
    });

    // Create workbook using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");

    // Define column headers
    const headers = ["Product Type", "Category", "Sub-Category", "Product Name", "Brand Name", "Grammage", "Packing Type", "Description", "EAN Code", "HSN Code", "Margin (%)", "Basic Price", "GST %", "GST Value", "Landing Price", "MRP (Rs)", "Shelf life (number of days)", "RTV/ Non RTV", "Vendor Pack Size", "Packaging Dimension", "Temperature", "Cut-off time"];

    // Set column widths
    worksheet.columns = headers.map((header, index) => {
      const widths = [15, 20, 20, 30, 20, 12, 15, 40, 15, 15, 12, 12, 10, 12, 12, 12, 20, 15, 18, 20, 12, 15];
      return {
        header: header,
        key: header,
        width: widths[index] || 15,
      };
    });

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = {
      bold: true,
      size: 11,
      color: { argb: "FFFFFFFF" },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    };
    headerRow.height = 20;

    // Add borders to header cells
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      // Ensure wrap text is disabled for each cell
      cell.alignment = {
        ...cell.alignment,
        wrapText: false,
        vertical: "middle",
      };
    });

    // Add data rows
    exportData.forEach((row) => {
      const dataRow = worksheet.addRow(row);
      // Add borders to data cells
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    });

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Products_Export_${timestamp}.xlsx`;

    // Write and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);

    utils.showToast(`Exported ${exportData.length} product${exportData.length !== 1 ? "s" : ""} successfully!`, "success");
  } catch (error) {
    console.error("Error exporting products:", error);
    utils.showToast("Error exporting products. Please try again.", "error");
  }
}

// Export Vrindavan Margins to Excel
async function exportVrindavanMarginsToExcel() {
  try {
    // Show loading indicator
    utils.showToast("Preparing export...", "info");

    // Get current filter values
    const categoryFilter = document.getElementById("vrindavanCategoryFilter");
    const subcategoryFilter = document.getElementById("vrindavanSubcategoryFilter");
    const searchInput = document.getElementById("vrindavanSearch");

    // Filter products same way as renderVrindavanMargins
    let filteredProducts = [...state.products];

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    if (filteredProducts.length === 0) {
      utils.showToast("No products to export", "warning");
      return;
    }

    // Fetch full product details for each product
    const API_BASE = "/product-margin/api/v1";
    const productsWithDetails = await Promise.all(
      filteredProducts.map(async (product) => {
        try {
          const response = await fetch(`${API_BASE}/products/${product.id}`);
          const result = await response.json();
          if (result.success && result.product) {
            return result.product;
          }
          return product; // Fallback to partial product data
        } catch (error) {
          console.error(`Error fetching product ${product.id}:`, error);
          return product; // Fallback to partial product data
        }
      }),
    );

    // Get category and subcategory names
    const categoriesMap = new Map(state.categories.map((c) => [c.id, c.name]));
    const subcategoriesMap = new Map(state.subcategories.map((sc) => [sc.id, sc.name]));

    // Prepare data without seller margin calculations
    const exportData = productsWithDetails.map((product) => {
      const productId = product.id || product.product_id;
      const category = categoriesMap.get(product.category_id) || "";
      const subcategory = subcategoriesMap.get(product.subcategory_id) || "";

      // Calculate without seller margin
      const mrp = parseFloat(product.mrp) || 0;
      const discountPrice = parseFloat(product.discount_price) || 0;
      const costPrice = computeCostPriceForProduct(productId, product.cost_price);
      const gstPercentage = parseFloat(product.gst_percentage) || 0;

      // Use discount_price if available, otherwise use MRP
      const sellingPrice = discountPrice > 0 ? discountPrice : mrp;

      // Landing Price = Selling Price (no seller margin deduction)
      const landingPrice = sellingPrice;
      const landingPriceRounded = Math.round(landingPrice * 100) / 100;

      // Basic Price = Selling Price / (1 + GST%/100)
      let basicPrice = 0;
      if (landingPriceRounded > 0 && gstPercentage >= 0) {
        basicPrice = landingPriceRounded / (1 + gstPercentage / 100);
        basicPrice = Math.round(basicPrice * 100) / 100;
      }

      // GST Value = Basic Price * (GST%/100)
      const gstValue = Math.round(((basicPrice * gstPercentage) / 100) * 100) / 100;

      // Net Profit = Discount Price (or MRP if discount_price not available) - Cost Price (no seller commission)
      const netProfit = sellingPrice - costPrice;

      return {
        "Product Type": product.product_type || "",
        Category: category,
        "Sub-Category": subcategory,
        "Product Name": product.name || "",
        "Brand Name": product.brand_name || "",
        Grammage: product.grammage || product.unit_size || "",
        "Packing Type": product.packing_type || "",
        Description: product.description || "",
        "EAN Code": product.ean_code || "",
        "HSN Code": product.hsn_code || "",
        "MRP (Rs)": mrp ? mrp.toFixed(2) : "",
        "Discount Price": discountPrice ? discountPrice.toFixed(2) : "",
        "Landing Price": landingPriceRounded ? landingPriceRounded.toFixed(2) : "",
        "Basic Price": basicPrice ? basicPrice.toFixed(2) : "",
        "GST %": gstPercentage ? gstPercentage.toFixed(2) : "",
        "GST Value": gstValue ? gstValue.toFixed(2) : "",
        "Cost Price": costPrice ? costPrice.toFixed(2) : "",
        "Net Profit": netProfit ? netProfit.toFixed(2) : "",
        "Shelf life (number of days)": product.shelf_life_days || "",
        "RTV/ Non RTV": product.rtv_status || "",
        "Vendor Pack Size": product.vendor_pack_size || "",
        "Packaging Dimension": product.packaging_dimensions || "",
        Temperature: product.temperature || "",
        "Cut-off time": product.cutoff_time || "",
        // Store original values for sorting
        _sortCategory: category,
        _sortSubcategory: subcategory,
      };
    });

    // Sort by category and then subcategory
    exportData.sort((a, b) => {
      const categoryCompare = (a._sortCategory || "").localeCompare(b._sortCategory || "");
      if (categoryCompare !== 0) return categoryCompare;
      return (a._sortSubcategory || "").localeCompare(b._sortSubcategory || "");
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Vrindavan Margins");

    // Define columns
    const columns = Object.keys(exportData[0]).filter((key) => !key.startsWith("_"));
    worksheet.columns = columns.map((col) => ({ header: col, key: col, width: 20 }));

    // Add data rows
    exportData.forEach((row) => {
      const dataRow = {};
      columns.forEach((col) => {
        dataRow[col] = row[col];
      });
      worksheet.addRow(dataRow);
    });

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 30;

    // Apply borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    });

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Vrindavan_Margins_Export_${timestamp}.xlsx`;

    // Write and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);

    utils.showToast(`Exported ${exportData.length} product${exportData.length !== 1 ? "s" : ""} successfully!`, "success");
  } catch (error) {
    console.error("Error exporting Vrindavan Margins:", error);
    utils.showToast("Error exporting Vrindavan Margins. Please try again.", "error");
  }
}

// Export seller overrides to Excel
async function exportSellerOverridesToExcel() {
  try {
    // Show loading indicator
    utils.showToast("Preparing export...", "info");

    // Get current filter values
    const categoryFilter = document.getElementById("sellerOverrideCategoryFilter");
    const subcategoryFilter = document.getElementById("sellerOverrideSubcategoryFilter");
    const sellerFilter = document.getElementById("sellerOverrideSellerFilter");
    const searchInput = document.getElementById("sellerOverrideSearch");
    const showOnlyOverridden = document.getElementById("sellerOverrideShowOnlyOverridden");
    const showOnlyActive = document.getElementById("sellerOverrideShowOnlyActive");

    // Filter seller margins by seller if filter is applied
    let filteredSellerMargins = [...state.sellerMargins];
    if (sellerFilter && sellerFilter.value) {
      filteredSellerMargins = filteredSellerMargins.filter((margin) => margin.seller_name === sellerFilter.value);
    }

    // Create maps for override lookup (matching display logic)
    const overrideMap = new Map(); // product_id -> override (single when seller filter is set)
    const overrideArrayMap = new Map(); // product_id -> array of overrides (all overrides for the product)

    filteredSellerMargins.forEach((margin) => {
      if (sellerFilter && sellerFilter.value) {
        // When specific seller is selected, only get overrides for that seller
        if (margin.seller_name === sellerFilter.value) {
          overrideMap.set(margin.product_id, margin);
        }
      } else {
        // When "All Sellers" is selected, collect all overrides for each product
        if (!overrideArrayMap.has(margin.product_id)) {
          overrideArrayMap.set(margin.product_id, []);
        }
        overrideArrayMap.get(margin.product_id).push(margin);
      }
    });

    // Filter products same way as display
    let filteredProducts = [...state.products];

    if (categoryFilter && categoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.category_id == categoryFilter.value);
    }

    if (subcategoryFilter && subcategoryFilter.value) {
      filteredProducts = filteredProducts.filter((p) => p.subcategory_id == subcategoryFilter.value);
    }

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filteredProducts = filteredProducts.filter((p) => (p.name && p.name.toLowerCase().includes(searchTerm)) || (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) || (p.brand_name && p.brand_name.toLowerCase().includes(searchTerm)));
    }

    // Build export data array - matching display logic
    const exportRows = [];

    if (sellerFilter && sellerFilter.value) {
      // When specific seller is selected
      filteredProducts.forEach((product) => {
        const override = overrideMap.get(product.id);

        // Apply filters
        if (showOnlyOverridden && showOnlyOverridden.checked && !override) {
          return; // Skip if filtering for overridden only and product has no override
        }

        if (showOnlyActive && showOnlyActive.checked) {
          if (!override || !(override.product_active === 1 || override.product_active === true)) {
            return; // Skip if filtering for active only and product is not active
          }
        }

        exportRows.push({ product, override });
      });
    } else {
      // When "All Sellers" is selected
      filteredProducts.forEach((product) => {
        const allOverrides = overrideArrayMap.get(product.id) || [];

        if (allOverrides.length > 0) {
          // Create one row per override
          allOverrides.forEach((override) => {
            // Apply filters
            if (showOnlyActive && showOnlyActive.checked) {
              if (!(override.product_active === 1 || override.product_active === true)) {
                return; // Skip if filtering for active only and override is not active
              }
            }
            exportRows.push({ product, override });
          });
        } else {
          // No overrides - only include if not filtering for overridden only
          if (!showOnlyOverridden || !showOnlyOverridden.checked) {
            // If filtering for active only, skip products without overrides (can't determine active status)
            if (!showOnlyActive || !showOnlyActive.checked) {
              exportRows.push({ product, override: null });
            }
          }
        }
      });
    }

    if (exportRows.length === 0) {
      utils.showToast("No products to export", "warning");
      return;
    }

    // Fetch full product details for each product
    const API_BASE = "/product-margin/api/v1";
    const productsWithDetails = await Promise.all(
      exportRows.map(async ({ product }) => {
        try {
          const response = await fetch(`${API_BASE}/products/${product.id}`);
          const result = await response.json();
          if (result.success && result.product) {
            return result.product;
          }
          return product; // Fallback to partial product data
        } catch (error) {
          console.error(`Error fetching product ${product.id}:`, error);
          return product; // Fallback to partial product data
        }
      }),
    );

    // Get category and subcategory names
    const categoriesMap = new Map(state.categories.map((c) => [c.id, c.name]));
    const subcategoriesMap = new Map(state.subcategories.map((sc) => [sc.id, sc.name]));

    // Prepare data - merge override data where it exists
    const exportData = exportRows.map(({ product: originalProduct, override }, index) => {
      const product = productsWithDetails[index];
      const category = categoriesMap.get(product.category_id) || "";
      const subcategory = subcategoriesMap.get(product.subcategory_id) || "";

      // Use override values if available, otherwise use product values
      const mrp = override ? parseFloat(override.mrp) || parseFloat(product.mrp) || 0 : parseFloat(product.mrp) || 0;
      const marginPercentage = override ? parseFloat(override.margin_percentage) || parseFloat(product.margin_percentage) || 0 : parseFloat(product.margin_percentage) || 0;
      const gstPercentage = override ? parseFloat(override.gst_percentage) || parseFloat(product.gst_percentage) || 0 : parseFloat(product.gst_percentage) || 0;

      // Calculate pricing values (use override calculated values if available, otherwise calculate)
      let sellerCommission = override ? parseFloat(override.seller_margin_value) || 0 : 0;
      if (mrp > 0 && marginPercentage >= 0 && !sellerCommission) {
        sellerCommission = mrp * (marginPercentage / 100);
      }
      sellerCommission = Math.round(sellerCommission * 100) / 100;

      let landingPrice = override ? parseFloat(override.landing_price) || 0 : 0;
      if (!landingPrice) {
        landingPrice = mrp - sellerCommission;
      }
      landingPrice = Math.round(landingPrice * 100) / 100;

      let basicPrice = override ? parseFloat(override.basic_price) || 0 : 0;
      if (!basicPrice && landingPrice > 0 && gstPercentage >= 0) {
        basicPrice = landingPrice / (1 + gstPercentage / 100);
      }
      basicPrice = Math.round(basicPrice * 100) / 100;

      let gstValue = override ? parseFloat(override.gst_value) || 0 : 0;
      if (!gstValue && basicPrice > 0 && gstPercentage >= 0) {
        gstValue = basicPrice * (gstPercentage / 100);
      }
      gstValue = Math.round(gstValue * 100) / 100;

      return {
        "Product Type": product.product_type || "",
        Category: category,
        "Sub-Category": subcategory,
        "Product Name": override ? override.product_display_name || override.product_name || product.name || "" : product.name || "",
        "Brand Name": override ? override.brand_name || product.brand_name || "" : product.brand_name || "",
        Grammage: override ? override.grammage || product.grammage || product.unit_size || "" : product.grammage || product.unit_size || "",
        "Packing Type": product.packing_type || "",
        Description: product.description || "",
        "EAN Code": product.ean_code || "",
        "HSN Code": product.hsn_code || "",
        "Margin (%)": marginPercentage ? marginPercentage.toFixed(2) : "",
        "Basic Price": basicPrice ? basicPrice.toFixed(2) : "",
        "GST %": gstPercentage ? gstPercentage.toFixed(2) : "",
        "GST Value": gstValue ? gstValue.toFixed(2) : "",
        "Landing Price": landingPrice ? landingPrice.toFixed(2) : "",
        "MRP (Rs)": mrp ? mrp.toFixed(2) : "",
        "Shelf life (number of days)": product.shelf_life_days || "",
        "RTV/ Non RTV": product.rtv_status || "",
        "Vendor Pack Size": product.vendor_pack_size || "",
        "Packaging Dimension": product.packaging_dimensions || "",
        Temperature: product.temperature || "",
        "Cut-off time": product.cutoff_time || "",
        "Seller Name": override ? override.seller_name || "" : "",
        "Seller Code": override ? override.seller_code || "" : "",
      };
    });

    // Sort by category, then by sub-category, then by seller name (when "All Sellers" is selected)
    exportData.sort((a, b) => {
      const categoryCompare = (a["Category"] || "").localeCompare(b["Category"] || "");
      if (categoryCompare !== 0) return categoryCompare;
      const subcategoryCompare = (a["Sub-Category"] || "").localeCompare(b["Sub-Category"] || "");
      if (subcategoryCompare !== 0) return subcategoryCompare;
      // When "All Sellers" is selected, also sort by seller name
      if (!sellerFilter || !sellerFilter.value) {
        const sellerCompare = (a["Seller Name"] || "").localeCompare(b["Seller Name"] || "");
        if (sellerCompare !== 0) return sellerCompare;
      }
      return 0;
    });

    // Create workbook using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Seller Overrides");

    // Define column headers (add Seller Name and Seller Code at the end)
    const headers = ["Product Type", "Category", "Sub-Category", "Product Name", "Brand Name", "Grammage", "Packing Type", "Description", "EAN Code", "HSN Code", "Margin (%)", "Basic Price", "GST %", "GST Value", "Landing Price", "MRP (Rs)", "Shelf life (number of days)", "RTV/ Non RTV", "Vendor Pack Size", "Packaging Dimension", "Temperature", "Cut-off time", "Seller Name", "Seller Code"];

    // Set column widths
    worksheet.columns = headers.map((header, index) => {
      const widths = [15, 20, 20, 30, 20, 12, 15, 40, 15, 15, 12, 12, 10, 12, 12, 12, 20, 15, 18, 20, 12, 15, 20, 15];
      return {
        header: header,
        key: header,
        width: widths[index] || 15,
      };
    });

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = {
      bold: true,
      size: 11,
      color: { argb: "FFFFFFFF" },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    };
    headerRow.height = 20;

    // Add borders to header cells
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.alignment = {
        ...cell.alignment,
        wrapText: false,
        vertical: "middle",
      };
    });

    // Add data rows
    exportData.forEach((row) => {
      const dataRow = worksheet.addRow(row);
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    });

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Generate filename: <Seller-Name>-NPI-YYYY-MM-DD.xlsx
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    let sellerName = "";
    
    if (sellerFilter && sellerFilter.value) {
      // Get seller name from filter, sanitize for filename
      // Remove special characters, replace spaces with hyphens, clean up
      sellerName = sellerFilter.value
        .trim()
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters except spaces and hyphens
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
      
      // Ensure seller name is not empty after sanitization
      if (!sellerName) {
        sellerName = "Seller";
      }
    } else {
      // If "All Sellers" is selected, use "All-Sellers"
      sellerName = "All-Sellers";
    }
    
    const filename = `${sellerName}-NPI-${date}.xlsx`;

    // Write and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);

    utils.showToast(`Exported ${exportData.length} row${exportData.length !== 1 ? "s" : ""} successfully!`, "success");
  } catch (error) {
    console.error("Error exporting seller overrides:", error);
    utils.showToast("Error exporting seller overrides. Please try again.", "error");
  }
}

// ==================== COGM Functions ====================

// Load COGM data
async function loadCOGM() {
  try {
    utils.showLoading("cogmTbody");
    const response = await api.request(`${API_BASE}/cost-of-goods-manufactured`);
    if (response.success) {
      state.cogm = response.data || [];
      renderCOGM();
      populateCOGMFilters();
    } else {
      utils.showError("cogmTbody", "Failed to load COGM data");
    }
  } catch (error) {
    console.error("Error loading COGM:", error);
    utils.showError("cogmTbody", "Error loading COGM data");
  }
}

// Render COGM table
function renderCOGM() {
  const tbody = document.getElementById("cogmTbody");
  if (!tbody) return;

  // Get filter values
  const searchInput = document.getElementById("cogmSearch");
  const categoryFilter = document.getElementById("cogmCategoryFilter");
  const subcategoryFilter = document.getElementById("cogmSubcategoryFilter");

  let filteredCOGM = [...state.cogm];

  // Apply search filter
  if (searchInput && searchInput.value) {
    const searchTerm = searchInput.value.toLowerCase();
    filteredCOGM = filteredCOGM.filter((cogm) => {
      const productName = (cogm.product_name || cogm.product_name_alias || "").toLowerCase();
      return productName.includes(searchTerm);
    });
  }

  // Apply category filter
  if (categoryFilter && categoryFilter.value) {
    filteredCOGM = filteredCOGM.filter((cogm) => cogm.category_id == categoryFilter.value);
  }

  // Apply subcategory filter
  if (subcategoryFilter && subcategoryFilter.value) {
    filteredCOGM = filteredCOGM.filter((cogm) => cogm.subcategory_id == subcategoryFilter.value);
  }

  if (filteredCOGM.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No COGM data found</td></tr>';
    return;
  }

  tbody.innerHTML = filteredCOGM
    .map((cogm) => {
      const productName = cogm.product_name_alias || cogm.product_name || "N/A";
      const grammage = cogm.grammage || cogm.unit_size || "";
      const displayName = grammage ? `${productName} (${grammage})` : productName;
      const category = cogm.category_name || "";
      const productDisplay = category ? `${displayName}<br><span class="text-xs text-gray-500 dark:text-gray-400">${category}</span>` : displayName;
      const sourcingCost = parseFloat(cogm.sourcing_cost || 0).toFixed(2);
      const transportCost = parseFloat(cogm.transport_cost || 0).toFixed(2);
      const packingCost = parseFloat(cogm.packing_cost || 0).toFixed(2);
      const deliveryCost = parseFloat(cogm.delivery_cost || 0).toFixed(2);
      const softwareCost = parseFloat(cogm.software_cost || 0).toFixed(2);
      const paymentGatewayCost = parseFloat(cogm.payment_gateway_cost || 0).toFixed(2);
      const totalCost = parseFloat(cogm.total_cost || 0).toFixed(2);
      const details = cogm.details || "";
      const hasDetails = details.trim().length > 0;
      const escapedDetails = details.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

      return `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
        <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">${productDisplay}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
          <div class="flex items-center gap-1">
            <span>₹${sourcingCost}</span>
            ${
              hasDetails
                ? `
              <span class="relative inline-block group">
                <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div class="absolute left-0 bottom-full mb-2 w-64 p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                  <div class="font-semibold mb-1">Details:</div>
                  <div class="whitespace-pre-wrap">${escapedDetails}</div>
                  <div class="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                </div>
              </span>
            `
                : ""
            }
          </div>
        </td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">₹${transportCost}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">₹${packingCost}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">₹${deliveryCost}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">₹${softwareCost}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">₹${paymentGatewayCost}</td>
        <td class="px-3 py-3 whitespace-nowrap text-sm font-semibold text-green-600 dark:text-green-400">₹${totalCost}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm">
          <button onclick="editCOGM(${cogm.product_id})" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
            ${cogm.cogm_id ? "Edit" : "Add"}
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

// Populate COGM filters
function populateCOGMFilters() {
  const categoryFilter = document.getElementById("cogmCategoryFilter");
  const subcategoryFilter = document.getElementById("cogmSubcategoryFilter");

  if (categoryFilter) {
    // Get unique categories by ID
    const categoryMap = new Map();
    state.cogm.forEach((cogm) => {
      if (cogm.category_id && cogm.category_name && !categoryMap.has(cogm.category_id)) {
        categoryMap.set(cogm.category_id, cogm.category_name);
      }
    });
    const categories = Array.from(categoryMap.entries()).map(([id, name]) => ({ id, name }));
    categories.sort((a, b) => a.name.localeCompare(b.name));
    const currentValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>' + categories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join("");
    if (currentValue && categoryFilter.querySelector(`option[value="${currentValue}"]`)) {
      categoryFilter.value = currentValue;
    }
    // Update subcategories when category is set
    updateCOGMSubcategoryFilter();
  }

  // Update subcategories based on selected category
  updateCOGMSubcategoryFilter();
}

// Update COGM subcategory filter based on selected category
function updateCOGMSubcategoryFilter() {
  const categoryFilter = document.getElementById("cogmCategoryFilter");
  const subcategoryFilter = document.getElementById("cogmSubcategoryFilter");

  if (!subcategoryFilter) return;

  const selectedCategoryId = categoryFilter ? categoryFilter.value : null;
  const currentSubValue = subcategoryFilter.value;

  // Get unique subcategories by ID, with their category_id
  const subcategoryMap = new Map();
  state.cogm.forEach((cogm) => {
    if (cogm.subcategory_id && cogm.subcategory_name && !subcategoryMap.has(cogm.subcategory_id)) {
      subcategoryMap.set(cogm.subcategory_id, {
        name: cogm.subcategory_name,
        category_id: cogm.category_id,
      });
    }
  });

  let subcategories = Array.from(subcategoryMap.entries()).map(([id, data]) => ({ id, name: data.name, category_id: data.category_id }));

  // Filter subcategories by selected category if category is selected
  if (selectedCategoryId) {
    subcategories = subcategories.filter((sub) => sub.category_id == selectedCategoryId);
  }

  subcategories.sort((a, b) => a.name.localeCompare(b.name));
  subcategoryFilter.innerHTML = '<option value="">All Sub-categories</option>' + subcategories.map((sub) => `<option value="${sub.id}">${sub.name}</option>`).join("");

  // Restore previous selection if it's still valid
  if (currentSubValue && subcategoryFilter.querySelector(`option[value="${currentSubValue}"]`)) {
    subcategoryFilter.value = currentSubValue;
  } else {
    subcategoryFilter.value = "";
  }
}

// Update Product subcategory filter based on selected category
function updateProductSubcategoryFilter() {
  const categoryFilter = document.getElementById("productCategoryFilter");
  const subcategoryFilter = document.getElementById("productSubcategoryFilter");

  if (!subcategoryFilter) return;

  const selectedCategoryId = categoryFilter ? categoryFilter.value : null;
  const currentSubValue = subcategoryFilter.value;

  let subcategories = [...state.subcategories];

  // Filter subcategories by selected category if category is selected
  if (selectedCategoryId) {
    subcategories = subcategories.filter((sub) => sub.category_id == selectedCategoryId);
  }

  subcategories.sort((a, b) => a.name.localeCompare(b.name));
  subcategoryFilter.innerHTML = '<option value="">All Sub-categories</option>' + subcategories.map((sub) => `<option value="${sub.id}">${sub.name}</option>`).join("");

  // Restore previous selection if it's still valid
  if (currentSubValue && subcategoryFilter.querySelector(`option[value="${currentSubValue}"]`)) {
    subcategoryFilter.value = currentSubValue;
  } else {
    subcategoryFilter.value = "";
  }
}

// Update Seller Override subcategory filter based on selected category
function updateSellerOverrideSubcategoryFilter() {
  const categoryFilter = document.getElementById("sellerOverrideCategoryFilter");
  const subcategoryFilter = document.getElementById("sellerOverrideSubcategoryFilter");

  if (!subcategoryFilter) return;

  const selectedCategoryId = categoryFilter ? categoryFilter.value : null;
  const currentSubValue = subcategoryFilter.value;

  let subcategories = [...state.subcategories];

  // Filter subcategories by selected category if category is selected
  if (selectedCategoryId) {
    subcategories = subcategories.filter((sub) => sub.category_id == selectedCategoryId);
  }

  subcategories.sort((a, b) => a.name.localeCompare(b.name));
  subcategoryFilter.innerHTML = '<option value="">All Sub-categories</option>' + subcategories.map((sub) => `<option value="${sub.id}">${sub.name}</option>`).join("");

  // Restore previous selection if it's still valid
  if (currentSubValue && subcategoryFilter.querySelector(`option[value="${currentSubValue}"]`)) {
    subcategoryFilter.value = currentSubValue;
  } else {
    subcategoryFilter.value = "";
  }
}

// Update Vrindavan Margins subcategory filter based on selected category
function updateVrindavanSubcategoryFilter() {
  const categoryFilter = document.getElementById("vrindavanCategoryFilter");
  const subcategoryFilter = document.getElementById("vrindavanSubcategoryFilter");

  if (!subcategoryFilter) return;

  const selectedCategoryId = categoryFilter ? categoryFilter.value : null;
  const currentSubValue = subcategoryFilter.value;

  let subcategories = [...state.subcategories];

  // Filter subcategories by selected category if category is selected
  if (selectedCategoryId) {
    subcategories = subcategories.filter((sub) => sub.category_id == selectedCategoryId);
  }

  subcategories.sort((a, b) => a.name.localeCompare(b.name));
  subcategoryFilter.innerHTML = '<option value="">All Sub-categories</option>' + subcategories.map((sub) => `<option value="${sub.id}">${sub.name}</option>`).join("");

  // Restore previous selection if it's still valid
  if (currentSubValue && subcategoryFilter.querySelector(`option[value="${currentSubValue}"]`)) {
    subcategoryFilter.value = currentSubValue;
  } else {
    subcategoryFilter.value = "";
  }
}

// Edit COGM
async function editCOGM(productId) {
  try {
    // Get product details
    const product = state.products.find((p) => p.id == productId);
    if (!product) {
      utils.showToast("Product not found", "error");
      return;
    }

    // Get existing COGM data
    const response = await api.request(`${API_BASE}/cost-of-goods-manufactured/product/${productId}`);
    const cogmData =
      response.success && response.data
        ? response.data
        : {
            sourcing_cost: 0,
            transport_cost: 0,
            packing_cost: 0,
            delivery_cost: 0,
            software_cost: 0,
            payment_gateway_cost: 0,
            details: "",
            total_cost: 0,
          };

    const productName = product.name_alias || product.name || "Unknown";
    const grammage = product.grammage || product.unit_size || "";

    // Create modal
    const modal = `
      <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Edit COGM - ${productName}${grammage ? ` (${grammage})` : ""}</h3>
          </div>
          <div class="p-6">
            <form id="cogmForm" onsubmit="saveCOGM(event, ${productId})">
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sourcing Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="sourcingCost" value="${cogmData.sourcing_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transport Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="transportCost" value="${cogmData.transport_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Packing Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="packingCost" value="${cogmData.packing_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Delivery Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="deliveryCost" value="${cogmData.delivery_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Software Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="softwareCost" value="${cogmData.software_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payment Gateway Cost (₹)</label>
                  <input type="number" step="0.01" min="0" id="paymentGatewayCost" value="${cogmData.payment_gateway_cost || 0}" required
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    oninput="calculateCOGMTotal()">
                </div>
              </div>
              <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Total Cost (₹)</label>
                <input type="number" step="0.01" id="totalCost" value="${cogmData.total_cost || 0}" readonly
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white font-semibold">
              </div>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Details</label>
                <textarea id="cogmDetails" rows="4" placeholder="Notes about how sourcing cost is derived and other details..."
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none">${cogmData.details || ""}</textarea>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Add notes about cost calculations, sourcing details, etc.</p>
              </div>
              <div class="flex justify-end gap-3">
                <button type="button" onclick="closeCOGMModal()" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById("modalContainer").innerHTML = modal;
    calculateCOGMTotal();
  } catch (error) {
    console.error("Error loading COGM for edit:", error);
    utils.showToast("Error loading COGM data", "error");
  }
}

// Calculate COGM total
function calculateCOGMTotal() {
  const sourcingCost = parseFloat(document.getElementById("sourcingCost")?.value || 0);
  const transportCost = parseFloat(document.getElementById("transportCost")?.value || 0);
  const packingCost = parseFloat(document.getElementById("packingCost")?.value || 0);
  const deliveryCost = parseFloat(document.getElementById("deliveryCost")?.value || 0);
  const softwareCost = parseFloat(document.getElementById("softwareCost")?.value || 0);
  const paymentGatewayCost = parseFloat(document.getElementById("paymentGatewayCost")?.value || 0);

  const total = sourcingCost + transportCost + packingCost + deliveryCost + softwareCost + paymentGatewayCost;
  const totalCostInput = document.getElementById("totalCost");
  if (totalCostInput) {
    totalCostInput.value = total.toFixed(2);
  }
}

// Save COGM
async function saveCOGM(event, productId) {
  event.preventDefault();
  try {
    const costData = {
      sourcing_cost: parseFloat(document.getElementById("sourcingCost").value || 0),
      transport_cost: parseFloat(document.getElementById("transportCost").value || 0),
      packing_cost: parseFloat(document.getElementById("packingCost").value || 0),
      delivery_cost: parseFloat(document.getElementById("deliveryCost").value || 0),
      software_cost: parseFloat(document.getElementById("softwareCost").value || 0),
      payment_gateway_cost: parseFloat(document.getElementById("paymentGatewayCost").value || 0),
      details: document.getElementById("cogmDetails").value?.trim() || null,
    };

    const response = await api.request(`${API_BASE}/cost-of-goods-manufactured/product/${productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(costData),
    });

    if (response.success) {
      utils.showToast("COGM saved successfully", "success");
      closeCOGMModal();
      await loadCOGM();
      // Reload products to get updated cost_price
      await dataLoader.loadAll();
    } else {
      utils.showToast(response.error || "Failed to save COGM", "error");
    }
  } catch (error) {
    console.error("Error saving COGM:", error);
    utils.showToast("Error saving COGM", "error");
  }
}

// Close COGM modal
function closeCOGMModal() {
  document.getElementById("modalContainer").innerHTML = "";
}

// Toggle product active status for a seller margin (when override exists)
async function toggleProductActive(marginId) {
  try {
    const response = await fetch(`${API_BASE}/seller-product-margins/${marginId}/toggle-product-active`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (result.success) {
      utils.showToast("Product active status updated successfully", "success");
      // Reload seller margins to reflect the change
      await dataLoader.loadAll();
      dataLoader.renderSellerMargins();
    } else {
      utils.showToast(result.error || "Failed to update product active status", "error");
    }
  } catch (error) {
    console.error("Error toggling product active status:", error);
    utils.showToast("Error updating product active status", "error");
  }
}

// Toggle product active status for a product without override (creates minimal override)
async function toggleProductActiveForProduct(productId, sellerId, activate) {
  try {
    // Get product details to use as defaults
    const product = state.products.find((p) => p.id === productId);
    if (!product) {
      utils.showToast("Product not found", "error");
      return;
    }

    // Create minimal override with product defaults
    const computedCostPrice = Math.round((getComputedCostPriceFromState(productId) || 0) * 100) / 100;

    const data = {
      seller_id: sellerId,
      product_id: productId,
      mrp: parseFloat(product.mrp) || null,
      margin_percentage: parseFloat(product.margin_percentage) || null,
      gst_percentage: parseFloat(product.gst_percentage) || null,
      cost_price: computedCostPrice,
      effective_from: new Date().toISOString().split("T")[0],
      is_active: 1,
      product_active: activate ? 1 : 0,
      notes: "Minimal override created to track product active status",
    };

    const response = await fetch(`${API_BASE}/seller-product-margins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (result.success) {
      utils.showToast(`Product ${activate ? "activated" : "deactivated"} successfully`, "success");
      // Reload seller margins to reflect the change
      await dataLoader.loadAll();
      dataLoader.renderSellerMargins();
    } else {
      utils.showToast(result.error || "Failed to update product active status", "error");
    }
  } catch (error) {
    console.error("Error toggling product active status:", error);
    utils.showToast("Error updating product active status", "error");
  }
}

// Make functions globally accessible
window.editCOGM = editCOGM;
window.saveCOGM = saveCOGM;
window.calculateCOGMTotal = calculateCOGMTotal;
window.closeCOGMModal = closeCOGMModal;
window.toggleProductActive = toggleProductActive;
window.toggleProductActiveForProduct = toggleProductActiveForProduct;

// Add event listeners for COGM filters
document.addEventListener("DOMContentLoaded", function () {
  const cogmSearch = document.getElementById("cogmSearch");
  const cogmCategoryFilter = document.getElementById("cogmCategoryFilter");
  const cogmSubcategoryFilter = document.getElementById("cogmSubcategoryFilter");

  if (cogmSearch) {
    cogmSearch.addEventListener("input", () => renderCOGM());
  }
  if (cogmCategoryFilter) {
    cogmCategoryFilter.addEventListener("change", () => {
      updateCOGMSubcategoryFilter();
      renderCOGM();
    });
  }
  if (cogmSubcategoryFilter) {
    cogmSubcategoryFilter.addEventListener("change", () => renderCOGM());
  }
});
