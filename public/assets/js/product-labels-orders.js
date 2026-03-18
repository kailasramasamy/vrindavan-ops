// Label Orders Management JavaScript

(function () {
  const state = {
    orders: [],
    filteredOrders: [],
    vendors: [],
    labels: [],
    currentOrder: null,
    orderItems: [],
  };

  const elements = {
    createOrderBtn: document.getElementById("createOrderBtn"),
    searchInput: document.getElementById("searchInput"),
    vendorFilter: document.getElementById("vendorFilter"),
    statusFilter: document.getElementById("statusFilter"),
    ordersTableBody: document.getElementById("ordersTableBody"),
    ordersLoadingRow: document.getElementById("ordersLoadingRow"),
    ordersEmptyRow: document.getElementById("ordersEmptyRow"),
    orderModal: document.getElementById("orderModal"),
    orderForm: document.getElementById("orderForm"),
    modalTitle: document.getElementById("modalTitle"),
    orderId: document.getElementById("orderId"),
    vendorId: document.getElementById("vendorId"),
    orderDate: document.getElementById("orderDate"),
    expectedDeliveryDate: document.getElementById("expectedDeliveryDate"),
    status: document.getElementById("status"),
    orderItemsContainer: document.getElementById("orderItemsContainer"),
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

    // Create order button is now a link, no event listener needed

    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", debounce(applyFilters, 300));
    }

    if (elements.vendorFilter) {
      elements.vendorFilter.addEventListener("change", applyFilters);
    }

    if (elements.statusFilter) {
      elements.statusFilter.addEventListener("change", applyFilters);
    }

    if (elements.orderForm) {
      elements.orderForm.addEventListener("submit", handleFormSubmit);
    }

    loadVendors();
    loadLabels();
    loadOrders();
  }

  // Load vendors
  async function loadVendors() {
    try {
      const response = await fetch("/product-labels/api/vendors?limit=100&offset=0");
      const data = await response.json();

      if (data.success) {
        state.vendors = data.vendors || [];
        populateVendorDropdowns();
      }
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  }

  // Load labels
  async function loadLabels() {
    try {
      const response = await fetch("/product-labels/api/labels?limit=1000&offset=0");
      const data = await response.json();

      if (data.success) {
        state.labels = data.labels || [];
      }
    } catch (error) {
      console.error("Error loading labels:", error);
    }
  }

  // Populate vendor dropdowns
  function populateVendorDropdowns() {
    const activeVendors = state.vendors.filter((v) => v.active === 1);

    // Populate modal dropdown
    if (elements.vendorId) {
      elements.vendorId.innerHTML = '<option value="">Select Vendor</option>';
      activeVendors.forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor.id;
        option.textContent = vendor.name;
        elements.vendorId.appendChild(option);
      });
    }

    // Populate filter dropdown
    if (elements.vendorFilter) {
      elements.vendorFilter.innerHTML = '<option value="">All Vendors</option>';
      activeVendors.forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor.id;
        option.textContent = vendor.name;
        elements.vendorFilter.appendChild(option);
      });
    }
  }

  // Load orders
  async function loadOrders() {
    try {
      showLoading();

      const response = await fetch("/product-labels/api/orders?limit=100&offset=0");
      const data = await response.json();

      if (data.success) {
        state.orders = data.orders || [];
        applyFilters();
      } else {
        showError(data.error || "Failed to load orders");
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      showError("Failed to load orders");
    }
  }

  // Apply filters
  function applyFilters() {
    const search = (elements.searchInput?.value || "").toLowerCase();
    const vendorId = elements.vendorFilter?.value || "";
    const status = elements.statusFilter?.value || "";

    state.filteredOrders = state.orders.filter((order) => {
      const matchesSearch =
        !search ||
        (order.order_number || "").toLowerCase().includes(search) ||
        (order.vendor_name || "").toLowerCase().includes(search);

      const matchesVendor = !vendorId || String(order.vendor_id) === vendorId;
      const matchesStatus = !status || order.status === status;

      return matchesSearch && matchesVendor && matchesStatus;
    });

    renderOrders();
  }

  // Render orders table
  function renderOrders() {
    if (!elements.ordersTableBody) return;

    // Remove existing rows
    const existingRows = Array.from(
      elements.ordersTableBody.querySelectorAll(
        "tr:not(#ordersLoadingRow):not(#ordersEmptyRow)"
      )
    );
    existingRows.forEach((row) => row.remove());

    if (elements.ordersLoadingRow) {
      elements.ordersLoadingRow.classList.add("hidden");
    }

    if (state.filteredOrders.length === 0) {
      if (elements.ordersEmptyRow) {
        elements.ordersEmptyRow.classList.remove("hidden");
      }
      return;
    }

    if (elements.ordersEmptyRow) {
      elements.ordersEmptyRow.classList.add("hidden");
    }

    state.filteredOrders.forEach((order) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusColors = {
        draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
        pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        in_production: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
        completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      };

      const statusText = {
        draft: "Draft",
        pending: "Pending",
        confirmed: "Confirmed",
        in_production: "In Production",
        completed: "Completed",
        cancelled: "Cancelled",
      };

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(order.order_number || "—")}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(order.vendor_name || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${order.order_date ? formatDate(order.order_date) : "—"}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${order.expected_delivery_date ? formatDate(order.expected_delivery_date) : "—"}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${order.item_count || 0}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
          ₹${(order.total_cost || 0).toFixed(2)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.status] || statusColors.draft}">
            ${statusText[order.status] || "Draft"}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <a href="/product-labels/orders/${order.order_number}" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4">
            View
          </a>
          <a href="/product-labels/orders/edit/${order.id}" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4">
            Edit
          </a>
          <button onclick="deleteOrder(${order.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
            Delete
          </button>
        </td>
      `;

      elements.ordersTableBody.appendChild(row);
    });
  }

  // Open order modal
  function openOrderModal(orderId = null) {
    state.orderItems = [];

    if (orderId) {
      state.currentOrder = state.orders.find((o) => o.id === orderId);
      if (state.currentOrder) {
        loadOrderDetails(orderId);
      }
    } else {
      state.currentOrder = null;
      elements.modalTitle.textContent = "Create Label Order";
      elements.orderForm.reset();
      elements.orderId.value = "";
      if (elements.orderDate) {
        const today = new Date().toISOString().split("T")[0];
        elements.orderDate.value = today;
      }
      renderOrderItems();
    }

    if (elements.orderModal) {
      elements.orderModal.classList.remove("hidden");
    }
  }

  // Load order details for editing
  async function loadOrderDetails(orderId) {
    try {
      const response = await fetch(`/product-labels/api/orders/${orderId}`);
      const data = await response.json();

      if (data.success && data.order) {
        const order = data.order;
        elements.modalTitle.textContent = "Edit Label Order";
        elements.orderId.value = order.id;
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
            quantity: item.quantity,
            unit_price: item.unit_price,
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
  window.addOrderItem = function () {
    state.orderItems.push({
      label_id: "",
      quantity: 1,
      unit_price: 0,
    });
    renderOrderItems();
  };

  // Remove order item
  window.removeOrderItem = function (index) {
    state.orderItems.splice(index, 1);
    renderOrderItems();
    calculateTotal();
  };

  // Render order items
  function renderOrderItems() {
    if (!elements.orderItemsContainer) return;

    elements.orderItemsContainer.innerHTML = "";

    if (state.orderItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "text-sm text-gray-500 dark:text-gray-400 text-center py-4";
      emptyMsg.textContent = "No items added. Click 'Add Item' to add products.";
      elements.orderItemsContainer.appendChild(emptyMsg);
      return;
    }

    state.orderItems.forEach((item, index) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600";

      const activeLabels = state.labels.filter((l) => l.active === 1);

      itemDiv.innerHTML = `
        <div class="grid grid-cols-12 gap-3 items-end">
          <div class="col-span-5">
            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Product Label</label>
            <select
              onchange="updateOrderItem(${index}, 'label_id', this.value)"
              class="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Label</option>
              ${activeLabels
                .map(
                  (label) =>
                    `<option value="${label.id}" ${item.label_id == label.id ? "selected" : ""}>${escapeHtml(label.name || "Unknown")} (${escapeHtml(label.unit_size || "—")})</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="col-span-3">
            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value="${item.quantity || 1}"
              onchange="updateOrderItem(${index}, 'quantity', this.value)"
              class="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div class="col-span-3">
            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value="${item.unit_price || 0}"
              onchange="updateOrderItem(${index}, 'unit_price', this.value); calculateTotal();"
              class="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div class="col-span-1">
            <button
              type="button"
              onclick="removeOrderItem(${index})"
              class="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      `;

      elements.orderItemsContainer.appendChild(itemDiv);
    });

    calculateTotal();
  }

  // Update order item
  window.updateOrderItem = function (index, field, value) {
    if (state.orderItems[index]) {
      if (field === "quantity" || field === "unit_price") {
        state.orderItems[index][field] = parseFloat(value) || 0;
      } else {
        state.orderItems[index][field] = value;
      }
      calculateTotal();
    }
  };

  // Calculate total
  function calculateTotal() {
    const total = state.orderItems.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      return sum + quantity * unitPrice;
    }, 0);

    if (elements.totalCost) {
      elements.totalCost.value = total.toFixed(2);
    }
  }

  // Close order modal
  window.closeOrderModal = function () {
    if (elements.orderModal) {
      elements.orderModal.classList.add("hidden");
    }
    state.currentOrder = null;
    state.orderItems = [];
    elements.orderForm.reset();
  };

  // Edit order
  window.editOrder = function (orderId) {
    openOrderModal(orderId);
  };

  // Handle form submit
  async function handleFormSubmit(e) {
    e.preventDefault();

    if (state.orderItems.length === 0) {
      showError("Please add at least one order item");
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
        const unitPrice = parseFloat(item.unit_price) || 0;
        return {
          label_id: parseInt(item.label_id),
          quantity: quantity,
          unit_price: unitPrice,
          total_price: quantity * unitPrice,
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
        closeOrderModal();
        loadOrders();
        showSuccess(orderId ? "Order updated successfully" : "Order created successfully");
      } else {
        showError(data.error || "Failed to save order");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      showError("Failed to save order");
    }
  }

  // Delete order
  window.deleteOrder = async function (orderId) {
    if (!confirm("Are you sure you want to delete this order?")) {
      return;
    }

    try {
      const response = await fetch(`/product-labels/api/orders/${orderId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        loadOrders();
        showSuccess("Order deleted successfully");
      } else {
        showError(data.error || "Failed to delete order");
      }
    } catch (error) {
      console.error("Error deleting order:", error);
      showError("Failed to delete order");
    }
  };

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
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

  function showLoading() {
    if (elements.ordersLoadingRow) {
      elements.ordersLoadingRow.classList.remove("hidden");
    }
    if (elements.ordersEmptyRow) {
      elements.ordersEmptyRow.classList.add("hidden");
    }
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

