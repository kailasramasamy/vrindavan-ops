(function () {
  const API_BASE = "/employees/api";
  const state = {
    employees: [],
    roles: [],
    filteredEmployees: [],
    filters: {
      role: "",
      status: "",
      search: "",
    },
    isLoading: false,
  };

  const elements = {
    searchInput: document.getElementById("employeeSearch"),
    roleFilter: document.getElementById("employeeRoleFilter"),
    statusFilter: document.getElementById("employeeStatusFilter"),
    tableBody: document.getElementById("employeesTbody"),
    loadingRow: document.getElementById("employeesLoadingRow"),
    emptyRow: document.getElementById("employeesEmptyRow"),
    createBtn: document.getElementById("createEmployeeBtn"),
    manageRolesBtn: document.getElementById("manageRolesBtn"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!elements.tableBody) return;

    loadRoles();
    loadEmployees();

    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", debounce(applyFilters, 300));
    }
    if (elements.roleFilter) {
      elements.roleFilter.addEventListener("change", applyFilters);
    }
    if (elements.statusFilter) {
      elements.statusFilter.addEventListener("change", applyFilters);
    }
    if (elements.createBtn) {
      elements.createBtn.addEventListener("click", () => showEmployeeModal());
    }
    if (elements.manageRolesBtn) {
      elements.manageRolesBtn.addEventListener("click", () => {
        window.location.href = "/employees/roles";
      });
    }
  }

  async function loadRoles() {
    try {
      const response = await fetch(`${API_BASE}/roles`);
      const data = await response.json();
      if (data.success) {
        state.roles = data.roles || [];
      }
    } catch (error) {
      console.error("Error loading roles:", error);
    }
  }

  async function loadEmployees() {
    state.isLoading = true;
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/employees`);
      const data = await response.json();

      if (data.success) {
        state.employees = data.employees || [];
        applyFilters();
      } else {
        showErrorToast("Failed to load employees: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading employees:", error);
      showErrorToast("Failed to load employees");
    } finally {
      state.isLoading = false;
      hideLoading();
    }
  }

  function applyFilters() {
    state.filters.search = elements.searchInput?.value || "";
    state.filters.role = elements.roleFilter?.value || "";
    state.filters.status = elements.statusFilter?.value || "";

    state.filteredEmployees = state.employees.filter((emp) => {
      const matchesSearch =
        !state.filters.search ||
        emp.name?.toLowerCase().includes(state.filters.search.toLowerCase()) ||
        emp.phone?.includes(state.filters.search) ||
        emp.email?.toLowerCase().includes(state.filters.search.toLowerCase());

      const matchesRole = !state.filters.role || emp.role_id == state.filters.role;
      const matchesStatus = !state.filters.status || emp.status === state.filters.status;

      return matchesSearch && matchesRole && matchesStatus;
    });

    renderEmployees();
  }

  function renderEmployees() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = "";

    if (state.filteredEmployees.length === 0) {
      if (elements.emptyRow) {
        elements.emptyRow.classList.remove("hidden");
        elements.tableBody.appendChild(elements.emptyRow);
      }
      return;
    }

    if (elements.emptyRow) {
      elements.emptyRow.classList.add("hidden");
    }

    state.filteredEmployees.forEach((employee) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";

      const statusClass =
        employee.status === "active"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";

      row.innerHTML = `
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            ${employee.profile_photo ? `<img src="${employee.profile_photo}" alt="${employee.name}" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><span class="text-sm font-semibold text-gray-500 dark:text-gray-400">${(employee.name || "E").charAt(0).toUpperCase()}</span></div>`}
            <div>
              <div class="font-medium text-gray-900 dark:text-white">${employee.name || "—"}</div>
              ${employee.email ? `<div class="text-xs text-gray-500 dark:text-gray-400">${employee.email}</div>` : ""}
            </div>
          </div>
        </td>
        <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">${employee.role_name || "—"}</td>
        <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">${employee.job_location || "—"}</td>
        <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">${employee.phone || "—"}</td>
        <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">${employee.start_date ? new Date(employee.start_date).toLocaleDateString("en-IN") : "—"}</td>
        <td class="px-3 py-3">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${(employee.status || "active").charAt(0).toUpperCase() + (employee.status || "active").slice(1)}
          </span>
        </td>
        <td class="px-4 py-3">
          <a href="/employees/${employee.id}" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
            View Details
          </a>
        </td>
      `;

      elements.tableBody.appendChild(row);
    });
  }

  function showLoading() {
    if (elements.loadingRow) {
      elements.loadingRow.classList.remove("hidden");
      if (elements.tableBody && !elements.tableBody.contains(elements.loadingRow)) {
        elements.tableBody.appendChild(elements.loadingRow);
      }
    }
  }

  function hideLoading() {
    if (elements.loadingRow) {
      elements.loadingRow.classList.add("hidden");
    }
  }

  // Modal Functions
  function showModal(title, content, onClose = null) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closeModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${title}</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div class="px-6 py-4">
            ${content}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    window.currentModal = modal;
    window.currentModalOnClose = onClose;
    return modal;
  }

  window.closeModal = function () {
    if (window.currentModal) {
      if (window.currentModalOnClose) {
        window.currentModalOnClose();
      }
      window.currentModal.remove();
      window.currentModal = null;
      window.currentModalOnClose = null;
    }
  };

  // Employee Modal
  function showEmployeeModal(employee = null) {
    const isEdit = !!employee;
    const title = isEdit ? "Edit Employee" : "Add Employee";

    const content = `
      <form id="employeeForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input type="text" name="name" value="${employee?.name || ""}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
            <input type="number" name="age" value="${employee?.age || ""}" min="1" max="100"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
            <select name="gender"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
              <option value="">Select</option>
              <option value="male" ${employee?.gender === "male" ? "selected" : ""}>Male</option>
              <option value="female" ${employee?.gender === "female" ? "selected" : ""}>Female</option>
              <option value="other" ${employee?.gender === "other" ? "selected" : ""}>Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label>
            <input type="date" name="dob" value="${employee?.dob || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select name="role_id"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
              <option value="">Select Role</option>
              ${state.roles.map(role => `<option value="${role.id}" ${employee?.role_id == role.id ? "selected" : ""}>${role.name}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input type="date" name="start_date" value="${employee?.start_date || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input type="tel" name="phone" value="${employee?.phone || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" name="email" value="${employee?.email || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile Photo</label>
            <div class="space-y-2">
              <div class="flex items-center gap-4">
                <div class="flex-1">
                  <input type="file" id="profilePhotoInput" name="photo" accept="image/*"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300">
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">OR</div>
                <div class="flex-1">
                  <input type="url" name="profile_photo_url" value="${employee?.profile_photo || ""}" placeholder="Enter photo URL"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
                </div>
              </div>
              <div id="photoPreview" class="hidden mt-2">
                <img id="previewImage" src="" alt="Preview" class="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700">
              </div>
              ${employee?.profile_photo ? `
              <div class="mt-2">
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Photo:</p>
                <img src="${employee.profile_photo}" alt="Current" class="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" onerror="this.style.display='none'">
              </div>
              ` : ""}
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select name="status"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
              <option value="active" ${employee?.status === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${employee?.status === "inactive" ? "selected" : ""}>Inactive</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
          <textarea name="address" rows="2"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">${employee?.address || ""}</textarea>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Location</label>
            <input type="text" name="job_location" value="${employee?.job_location || ""}" placeholder="e.g., Bangalore, Factory Unit 1"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Description</label>
            <textarea name="job_description" rows="3" placeholder="Describe the employee's role and responsibilities"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">${employee?.job_description || ""}</textarea>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact Name</label>
            <input type="text" name="emergency_contact_name" value="${employee?.emergency_contact_name || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact Phone</label>
            <input type="tel" name="emergency_contact_phone" value="${employee?.emergency_contact_phone || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? "Update" : "Create"}</button>
        </div>
      </form>
    `;

    const modal = showModal(title, content);
    const form = modal.querySelector("#employeeForm");
    const photoInput = modal.querySelector("#profilePhotoInput");
    const photoPreview = modal.querySelector("#photoPreview");
    const previewImage = modal.querySelector("#previewImage");
    const photoUrlInput = modal.querySelector('input[name="profile_photo_url"]');

    // Handle photo preview
    if (photoInput) {
      photoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            previewImage.src = e.target.result;
            photoPreview.classList.remove("hidden");
            // Clear URL input when file is selected
            if (photoUrlInput) photoUrlInput.value = "";
          };
          reader.readAsDataURL(file);
        } else {
          photoPreview.classList.add("hidden");
        }
      });
    }

    // Handle URL input change - hide preview if URL is entered
    if (photoUrlInput) {
      photoUrlInput.addEventListener("input", (e) => {
        if (e.target.value) {
          photoPreview.classList.add("hidden");
          if (photoInput) photoInput.value = "";
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      
      // Handle photo upload vs URL
      const hasFile = photoInput && photoInput.files.length > 0;
      const photoUrl = photoUrlInput?.value?.trim() || "";
      
      if (hasFile) {
        // File upload - remove URL field
        formData.delete("profile_photo_url");
      } else if (photoUrl) {
        // URL provided - remove file field and set profile_photo
        formData.delete("photo");
        formData.set("profile_photo", photoUrl);
        formData.delete("profile_photo_url");
      } else {
        // No photo - remove both fields
        formData.delete("photo");
        formData.delete("profile_photo_url");
      }

      try {
        const url = isEdit ? `${API_BASE}/employees/${employee.id}` : `${API_BASE}/employees`;
        const method = isEdit ? "PATCH" : "POST";
        
        // Use FormData if file is present, otherwise convert to JSON
        let response;
        if (hasFile) {
          // Send FormData with all fields including file
          response = await fetch(url, {
            method,
            body: formData,
          });
        } else {
          // Convert FormData to JSON object
          const data = {};
          for (const [key, value] of formData.entries()) {
            data[key] = value === "" ? null : value;
          }
          response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        }

        const result = await response.json();
        if (result.success) {
          showSuccessToast(isEdit ? "Employee updated successfully" : "Employee created successfully");
          closeModal();
          loadEmployees();
        } else {
          showErrorToast(result.error || "Failed to save employee");
        }
      } catch (error) {
        showErrorToast("Failed to save employee: " + error.message);
      }
    });
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
})();
