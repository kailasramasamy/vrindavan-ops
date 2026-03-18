// Printing Vendors Management JavaScript

(function () {
  const state = {
    vendors: [],
    filteredVendors: [],
    currentVendor: null,
  };

  const elements = {
    createVendorBtn: document.getElementById("createVendorBtn"),
    searchInput: document.getElementById("searchInput"),
    activeFilter: document.getElementById("activeFilter"),
    vendorsTableBody: document.getElementById("vendorsTableBody"),
    vendorsLoadingRow: document.getElementById("vendorsLoadingRow"),
    vendorsEmptyRow: document.getElementById("vendorsEmptyRow"),
    vendorModal: document.getElementById("vendorModal"),
    vendorForm: document.getElementById("vendorForm"),
    modalTitle: document.getElementById("modalTitle"),
    vendorId: document.getElementById("vendorId"),
    vendorName: document.getElementById("vendorName"),
    contactPerson: document.getElementById("contactPerson"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    address: document.getElementById("address"),
    city: document.getElementById("city"),
    state: document.getElementById("state"),
    pincode: document.getElementById("pincode"),
    gstNumber: document.getElementById("gstNumber"),
    notes: document.getElementById("notes"),
    active: document.getElementById("active"),
  };

  // Initialize
  function init() {
    if (elements.createVendorBtn) {
      elements.createVendorBtn.addEventListener("click", () => openVendorModal());
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", debounce(applyFilters, 300));
    }

    if (elements.activeFilter) {
      elements.activeFilter.addEventListener("change", applyFilters);
    }

    if (elements.vendorForm) {
      elements.vendorForm.addEventListener("submit", handleFormSubmit);
    }

    loadVendors();
  }

  // Load vendors
  async function loadVendors() {
    try {
      showLoading();

      const params = new URLSearchParams();
      params.append("limit", "100");
      params.append("offset", "0");

      const response = await fetch(`/product-labels/api/vendors?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        state.vendors = data.vendors || [];
        applyFilters();
      } else {
        showError(data.error || "Failed to load vendors");
      }
    } catch (error) {
      console.error("Error loading vendors:", error);
      showError("Failed to load vendors");
    }
  }

  // Apply filters
  function applyFilters() {
    const search = (elements.searchInput?.value || "").toLowerCase();
    const active = elements.activeFilter?.value || "";

    state.filteredVendors = state.vendors.filter((vendor) => {
      const matchesSearch =
        !search ||
        (vendor.name || "").toLowerCase().includes(search) ||
        (vendor.contact_person || "").toLowerCase().includes(search) ||
        (vendor.email || "").toLowerCase().includes(search) ||
        (vendor.phone || "").toLowerCase().includes(search);

      const matchesActive =
        active === "" || String(vendor.active) === (active === "true" ? "1" : "0");

      return matchesSearch && matchesActive;
    });

    renderVendors();
  }

  // Render vendors table
  function renderVendors() {
    if (!elements.vendorsTableBody) return;

    // Remove existing rows (except loading and empty rows)
    const existingRows = Array.from(
      elements.vendorsTableBody.querySelectorAll(
        "tr:not(#vendorsLoadingRow):not(#vendorsEmptyRow)"
      )
    );
    existingRows.forEach((row) => row.remove());

    if (elements.vendorsLoadingRow) {
      elements.vendorsLoadingRow.classList.add("hidden");
    }

    if (state.filteredVendors.length === 0) {
      if (elements.vendorsEmptyRow) {
        elements.vendorsEmptyRow.classList.remove("hidden");
      }
      return;
    }

    if (elements.vendorsEmptyRow) {
      elements.vendorsEmptyRow.classList.add("hidden");
    }

    state.filteredVendors.forEach((vendor) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(vendor.name || "—")}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(vendor.contact_person || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${vendor.email ? `<a href="mailto:${escapeHtml(vendor.email)}" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(vendor.email)}</a>` : "—"}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${vendor.phone ? `<a href="tel:${escapeHtml(vendor.phone)}" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(vendor.phone)}</a>` : "—"}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(vendor.city || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(vendor.gst_number || "—")}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${
            vendor.active
              ? '<span class="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>'
              : '<span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Inactive</span>'
          }
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button onclick="editVendor(${vendor.id})" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4">
            Edit
          </button>
          <button onclick="deleteVendor(${vendor.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
            Delete
          </button>
        </td>
      `;

      elements.vendorsTableBody.appendChild(row);
    });
  }

  // Open vendor modal
  function openVendorModal(vendorId = null) {
    if (vendorId) {
      state.currentVendor = state.vendors.find((v) => v.id === vendorId);
      if (state.currentVendor) {
        elements.modalTitle.textContent = "Edit Printing Vendor";
        elements.vendorId.value = state.currentVendor.id;
        elements.vendorName.value = state.currentVendor.name || "";
        elements.contactPerson.value = state.currentVendor.contact_person || "";
        elements.email.value = state.currentVendor.email || "";
        elements.phone.value = state.currentVendor.phone || "";
        elements.address.value = state.currentVendor.address || "";
        elements.city.value = state.currentVendor.city || "";
        elements.state.value = state.currentVendor.state || "";
        elements.pincode.value = state.currentVendor.pincode || "";
        elements.gstNumber.value = state.currentVendor.gst_number || "";
        elements.notes.value = state.currentVendor.notes || "";
        elements.active.checked = state.currentVendor.active === 1;
      }
    } else {
      state.currentVendor = null;
      elements.modalTitle.textContent = "Add Printing Vendor";
      elements.vendorForm.reset();
      elements.vendorId.value = "";
    }

    if (elements.vendorModal) {
      elements.vendorModal.classList.remove("hidden");
    }
  }

  // Close vendor modal
  window.closeVendorModal = function () {
    if (elements.vendorModal) {
      elements.vendorModal.classList.add("hidden");
    }
    state.currentVendor = null;
    elements.vendorForm.reset();
  };

  // Edit vendor
  window.editVendor = function (vendorId) {
    openVendorModal(vendorId);
  };

  // Handle form submit
  async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(elements.vendorForm);
    const vendorId = elements.vendorId.value;

    const vendorData = {
      name: formData.get("name"),
      contact_person: formData.get("contact_person") || null,
      email: formData.get("email") || null,
      phone: formData.get("phone") || null,
      address: formData.get("address") || null,
      city: formData.get("city") || null,
      state: formData.get("state") || null,
      pincode: formData.get("pincode") || null,
      gst_number: formData.get("gst_number") || null,
      notes: formData.get("notes") || null,
      active: elements.active.checked ? 1 : 0,
    };

    try {
      let response;
      if (vendorId) {
        // Update
        response = await fetch(`/product-labels/api/vendors/${vendorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vendorData),
        });
      } else {
        // Create
        response = await fetch("/product-labels/api/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vendorData),
        });
      }

      const data = await response.json();

      if (data.success) {
        closeVendorModal();
        loadVendors();
        showSuccess(vendorId ? "Vendor updated successfully" : "Vendor created successfully");
      } else {
        showError(data.error || "Failed to save vendor");
      }
    } catch (error) {
      console.error("Error saving vendor:", error);
      showError("Failed to save vendor");
    }
  }

  // Delete vendor
  window.deleteVendor = async function (vendorId) {
    if (!confirm("Are you sure you want to delete this vendor?")) {
      return;
    }

    try {
      const response = await fetch(`/product-labels/api/vendors/${vendorId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        loadVendors();
        showSuccess("Vendor deleted successfully");
      } else {
        showError(data.error || "Failed to delete vendor");
      }
    } catch (error) {
      console.error("Error deleting vendor:", error);
      showError("Failed to delete vendor");
    }
  };

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
    if (elements.vendorsLoadingRow) {
      elements.vendorsLoadingRow.classList.remove("hidden");
    }
    if (elements.vendorsEmptyRow) {
      elements.vendorsEmptyRow.classList.add("hidden");
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


