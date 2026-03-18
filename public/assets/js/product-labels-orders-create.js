// Label Order Create/Edit Page JavaScript

(function () {
  const state = {
    vendors: [],
    labels: [],
    orderItems: [],
    currentOrder: null,
  };

  const elements = {
    orderForm: document.getElementById("orderForm"),
    orderId: document.getElementById("orderId"),
    vendorId: document.getElementById("vendorId"),
    orderDate: document.getElementById("orderDate"),
    expectedDeliveryDate: document.getElementById("expectedDeliveryDate"),
    status: document.getElementById("status"),
    addItemSearch: document.getElementById("addItemSearch"),
    addItemLabelId: document.getElementById("addItemLabelId"),
    addItemDropdown: document.getElementById("addItemDropdown"),
    orderItemsContainer: document.getElementById("orderItemsContainer"),
    totalItemsCount: document.getElementById("totalItemsCount"),
    totalCost: document.getElementById("totalCost"),
    notes: document.getElementById("notes"),
  };

  // Initialize
  function init() {
    // Set default order date to today
    if (elements.orderDate) {
      const today = new Date().toISOString().split("T")[0];
      elements.orderDate.value = today;
    }

    // Load data from window globals
    if (window.LABELS_DATA) {
      state.labels = window.LABELS_DATA.filter((l) => l.active === 1 || l.active === true);
    }

    // Load vendors
    loadVendors();

    // Initialize add item search
    initAddItemSearch();

    // If editing, load order data
    const orderId = elements.orderId?.value;
    if (orderId) {
      loadOrderDetails(orderId);
    } else {
      renderOrderItems();
    }

    if (elements.orderForm) {
      elements.orderForm.addEventListener("submit", handleFormSubmit);
    }
  }

  // Initialize add item searchable dropdown
  function initAddItemSearch() {
    if (!elements.addItemSearch || !elements.addItemDropdown) return;

    let currentSearchHandler = null;
    let currentClickHandler = null;
    let currentKeydownHandler = null;
    let clickOutsideHandler = null;

    // Filter labels based on search
    const filterLabels = (searchTerm) => {
      const term = searchTerm.toLowerCase();
      return state.labels.filter((label) => {
        const name = (label.name || "").toLowerCase();
        const unitSize = (label.unit_size || "").toLowerCase();
        const productName = (label.product_name || "").toLowerCase();
        return name.includes(term) || unitSize.includes(term) || productName.includes(term);
      });
    };

    // Render dropdown options
    const renderDropdown = (labels) => {
      elements.addItemDropdown.innerHTML = "";
      if (labels.length === 0) {
        const empty = document.createElement("div");
        empty.className = "px-4 py-2 text-sm text-gray-500 dark:text-gray-400";
        empty.textContent = "No labels found";
        elements.addItemDropdown.appendChild(empty);
      } else {
        labels.forEach((label) => {
          const option = document.createElement("div");
          option.className = "px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 last:border-b-0";
          option.innerHTML = `
            <div class="font-medium">${escapeHtml(label.name || "Unknown")}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(label.unit_size || "—")}</div>
          `;
          option.onclick = () => {
            elements.addItemLabelId.value = label.id;
            elements.addItemSearch.value = `${label.name || "Unknown"} (${label.unit_size || "—"})`;
            elements.addItemDropdown.classList.add("hidden");
            
            // Add item to list
            addOrderItem(label.id, label.name, label.unit_size, label.label_type);
            
            // Clear search
            elements.addItemSearch.value = "";
            elements.addItemLabelId.value = "";
          };
          elements.addItemDropdown.appendChild(option);
        });
      }
    };

    // Search handler
    currentSearchHandler = (e) => {
      const searchTerm = e.target.value;
      if (searchTerm.length > 0) {
        const filtered = filterLabels(searchTerm);
        renderDropdown(filtered);
        elements.addItemDropdown.classList.remove("hidden");
      } else {
        elements.addItemDropdown.classList.add("hidden");
        elements.addItemLabelId.value = "";
      }
    };

    // Click handler
    currentClickHandler = (e) => {
      e.stopPropagation();
    };

    // Keydown handler
    currentKeydownHandler = (e) => {
      if (e.key === "Escape") {
        elements.addItemDropdown.classList.add("hidden");
      } else if (e.key === "Enter" && elements.addItemLabelId.value) {
        e.preventDefault();
        const labelId = elements.addItemLabelId.value;
        const label = state.labels.find(l => l.id == labelId);
        if (label) {
          addOrderItem(label.id, label.name, label.unit_size, label.label_type);
          elements.addItemSearch.value = "";
          elements.addItemLabelId.value = "";
          elements.addItemDropdown.classList.add("hidden");
        }
      }
    };

    // Click outside handler
    clickOutsideHandler = (e) => {
      if (!elements.addItemSearch.contains(e.target) && !elements.addItemDropdown.contains(e.target)) {
        elements.addItemDropdown.classList.add("hidden");
      }
    };

    elements.addItemSearch.addEventListener("input", currentSearchHandler);
    elements.addItemDropdown.addEventListener("click", currentClickHandler);
    elements.addItemSearch.addEventListener("keydown", currentKeydownHandler);
    document.addEventListener("click", clickOutsideHandler);
  }

  // Load vendors
  async function loadVendors() {
    try {
      const response = await fetch("/product-labels/api/vendors?limit=1000&offset=0");
      const data = await response.json();

      if (data.success) {
        state.vendors = (data.vendors || []).filter((v) => v.active === 1 || v.active === true);
        populateVendorDropdown();
      }
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  }

  // Populate vendor dropdown
  function populateVendorDropdown() {
    if (elements.vendorId) {
      elements.vendorId.innerHTML = '<option value="">Select Vendor</option>';
      state.vendors.forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor.id;
        option.textContent = vendor.name;
        elements.vendorId.appendChild(option);
      });
    }
  }

  // Load order details for editing
  async function loadOrderDetails(orderId) {
    try {
      const response = await fetch(`/product-labels/api/orders/${orderId}`);
      const data = await response.json();

      if (data.success && data.order) {
        const order = data.order;
        state.currentOrder = order;
        
        elements.vendorId.value = order.vendor_id || "";
        elements.orderDate.value = order.order_date ? order.order_date.split("T")[0] : "";
        elements.expectedDeliveryDate.value = order.expected_delivery_date ? order.expected_delivery_date.split("T")[0] : "";
        elements.status.value = order.status || "draft";
        elements.totalCost.value = order.total_cost || 0;
        elements.notes.value = order.notes || "";

        // Load order items
        if (order.items && order.items.length > 0) {
          state.orderItems = order.items.map((item) => ({
            label_id: item.label_id,
            label_name: item.label_name,
            unit_size: item.unit_size,
            label_type: item.label_type,
            quantity: item.quantity,
          }));
        }

        renderOrderItems();
      }
    } catch (error) {
      console.error("Error loading order details:", error);
      showError("Failed to load order details");
    }
  }

  // Add order item
  function addOrderItem(labelId, labelName, unitSize, labelType) {
    // Check if item already exists
    const existingIndex = state.orderItems.findIndex(item => item.label_id == labelId);
    if (existingIndex >= 0) {
      // Increment quantity if already exists
      state.orderItems[existingIndex].quantity = (parseInt(state.orderItems[existingIndex].quantity) || 1) + 1;
    } else {
      // Add new item
      state.orderItems.push({
        label_id: labelId,
        label_name: labelName,
        unit_size: unitSize,
        label_type: labelType,
        quantity: 1,
      });
    }
    renderOrderItems();
  }

  // Remove order item
  window.removeOrderItem = function (index) {
    state.orderItems.splice(index, 1);
    renderOrderItems();
  };

  // Update total items count
  function updateTotalItemsCount() {
    if (elements.totalItemsCount) {
      const total = state.orderItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
      elements.totalItemsCount.textContent = total;
    }
  }

  // Render order items
  function renderOrderItems() {
    if (!elements.orderItemsContainer) return;

    elements.orderItemsContainer.innerHTML = "";

    // Update total items count
    updateTotalItemsCount();

    if (state.orderItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600";
      emptyMsg.textContent = "No items added. Search and select a label above to add items.";
      elements.orderItemsContainer.appendChild(emptyMsg);
      return;
    }

    state.orderItems.forEach((item, index) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-4";

      const labelName = item.label_name || state.labels.find(l => l.id == item.label_id)?.name || "Unknown";
      const unitSize = item.unit_size || state.labels.find(l => l.id == item.label_id)?.unit_size || "—";
      const labelType = item.label_type || state.labels.find(l => l.id == item.label_id)?.label_type || "—";
      const labelTypeDisplay = labelType ? labelType.charAt(0).toUpperCase() + labelType.slice(1) : "—";

      itemDiv.innerHTML = `
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-900 dark:text-white">${escapeHtml(labelName)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(unitSize)}</div>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-24">
            <input
              type="number"
              min="1"
              value="${item.quantity || 1}"
              onchange="updateOrderItem(${index}, 'quantity', this.value)"
              class="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-300 font-medium w-20">
            ${escapeHtml(labelTypeDisplay)}
          </div>
          <button
            type="button"
            onclick="removeOrderItem(${index})"
            class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
            title="Remove item"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      `;

      elements.orderItemsContainer.appendChild(itemDiv);
    });
  }

  // Update order item
  window.updateOrderItem = function (index, field, value) {
    if (state.orderItems[index]) {
      if (field === "quantity") {
        state.orderItems[index][field] = parseInt(value) || 1;
        updateTotalItemsCount();
      } else {
        state.orderItems[index][field] = value;
      }
    }
  };

  // Handle form submit
  async function handleFormSubmit(e) {
    e.preventDefault();

    if (state.orderItems.length === 0) {
      showError("Please add at least one order item");
      return;
    }

    // Validate all items have labels
    const invalidItems = state.orderItems.filter((item) => !item.label_id);
    if (invalidItems.length > 0) {
      showError("Please select a label for all items");
      return;
    }

    const formData = new FormData(elements.orderForm);
    const orderId = elements.orderId.value;

    // Calculate total quantity
    const totalQuantity = state.orderItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

    const orderData = {
      vendor_id: parseInt(formData.get("vendor_id")),
      order_date: formData.get("order_date"),
      expected_delivery_date: formData.get("expected_delivery_date") || null,
      total_quantity: totalQuantity,
      total_cost: parseFloat(formData.get("total_cost")) || 0,
      status: formData.get("status") || "draft",
      notes: formData.get("notes") || null,
      items: state.orderItems.map((item) => {
        const quantity = parseInt(item.quantity) || 1;
        return {
          label_id: parseInt(item.label_id),
          quantity: quantity,
          unit_price: null,
          total_price: null,
        };
      }),
    };

    try {
      let response;
      if (orderId) {
        // Update
        response = await fetch(`/product-labels/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      } else {
        // Create
        response = await fetch("/product-labels/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      }

      const data = await response.json();

      if (data.success) {
        showSuccess(orderId ? "Order updated successfully" : "Order created successfully");
        setTimeout(() => {
          window.location.href = "/product-labels/orders";
        }, 1000);
      } else {
        showError(data.error || "Failed to save order");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      showError("Failed to save order");
    }
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function showError(message) {
    if (typeof window.showErrorToast === 'function') {
      window.showErrorToast(message);
    } else {
      alert("Error: " + message);
    }
  }

  function showSuccess(message) {
    if (typeof window.showSuccessToast === 'function') {
      window.showSuccessToast(message);
    } else {
      alert(message);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

