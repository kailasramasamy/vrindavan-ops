(function () {
  const API_BASE = "/employees/api";
  const employeeId = window.EMPLOYEE_ID;
  const employeeData = window.EMPLOYEE_DATA || {};
  const roles = window.ROLES || [];

  const elements = {
    editEmployeeBtn: document.getElementById("editEmployeeBtn"),
    editSalaryBtn: document.getElementById("editSalaryBtn"),
    addLoanBtn: document.getElementById("addLoanBtn"),
    addDocumentBtn: document.getElementById("addDocumentBtn"),
    documentsContent: document.getElementById("documentsContent"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (elements.editEmployeeBtn) {
      elements.editEmployeeBtn.addEventListener("click", () => showEmployeeModal(employeeData));
    }
    if (elements.editSalaryBtn) {
      elements.editSalaryBtn.addEventListener("click", handleEditSalary);
    }
    if (elements.addLoanBtn) {
      elements.addLoanBtn.addEventListener("click", () => window.showLoanModal());
    }
    if (elements.addDocumentBtn) {
      elements.addDocumentBtn.addEventListener("click", () => showAddDocumentModal());
    }

    // Document action buttons
    document.querySelectorAll(".document-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const documentId = e.target.dataset.documentId;
        handleDeleteDocument(documentId);
      });
    });

    // Loan action buttons
    document.querySelectorAll(".loan-repayments-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const loanId = e.target.dataset.loanId;
        handleViewRepayments(loanId);
      });
    });

    document.querySelectorAll(".loan-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const loanId = e.target.dataset.loanId;
        handleEditLoan(loanId);
      });
    });
  }

  // Modal Functions
  function showModal(title, content, onClose = null) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 modal-backdrop"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${title}</h3>
            <button type="button" class="modal-close-btn text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div class="px-6 py-4 max-h-[80vh] overflow-y-auto">
            ${content}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    window.currentModal = modal;
    window.currentModalOnClose = onClose;
    
    // Add event listeners for close functionality
    const closeBtn = modal.querySelector(".modal-close-btn");
    const backdrop = modal.querySelector(".modal-backdrop");
    
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeModal();
      });
    }
    
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        e.stopPropagation();
        closeModal();
      });
    }
    
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
  function showEmployeeModal(employee) {
    const content = `
      <form id="employeeForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input type="text" name="name" value="${employee?.name || ""}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
            <input type="number" name="age" value="${employee?.age || ""}" min="1" max="100"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
            <select name="gender"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">Select</option>
              <option value="male" ${employee?.gender === "male" ? "selected" : ""}>Male</option>
              <option value="female" ${employee?.gender === "female" ? "selected" : ""}>Female</option>
              <option value="other" ${employee?.gender === "other" ? "selected" : ""}>Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label>
            <input type="date" name="dob" value="${employee?.dob || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select name="role_id"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">Select Role</option>
              ${roles.map(role => `<option value="${role.id}" ${employee?.role_id == role.id ? "selected" : ""}>${role.name}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input type="date" name="start_date" value="${employee?.start_date || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input type="tel" name="phone" value="${employee?.phone || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" name="email" value="${employee?.email || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
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
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="active" ${employee?.status === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${employee?.status === "inactive" ? "selected" : ""}>Inactive</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
          <textarea name="address" rows="2"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${employee?.address || ""}</textarea>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Location</label>
            <input type="text" name="job_location" value="${employee?.job_location || ""}" placeholder="e.g., Bangalore, Factory Unit 1"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Description</label>
            <textarea name="job_description" rows="3" placeholder="Describe the employee's role and responsibilities"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500">${employee?.job_description || ""}</textarea>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact Name</label>
            <input type="text" name="emergency_contact_name" value="${employee?.emergency_contact_name || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact Phone</label>
            <input type="tel" name="emergency_contact_phone" value="${employee?.emergency_contact_phone || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
        </div>
      </form>
    `;

    const modal = showModal("Edit Employee", content);
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
        // Use FormData if file is present, otherwise convert to JSON
        let response;
        if (hasFile) {
          // Send FormData with all fields including file
          response = await fetch(`${API_BASE}/employees/${employeeId}`, {
            method: "PATCH",
            body: formData,
          });
        } else {
          // Convert FormData to JSON object
          const data = {};
          for (const [key, value] of formData.entries()) {
            data[key] = value === "" ? null : value;
          }
          response = await fetch(`${API_BASE}/employees/${employeeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        }

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Employee updated successfully");
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        } else {
          showErrorToast(result.error || "Failed to update employee");
        }
      } catch (error) {
        showErrorToast("Failed to update employee: " + error.message);
      }
    });
  }

  // Salary Package Modal
  async function handleEditSalary() {
    try {
      const response = await fetch(`${API_BASE}/employees/${employeeId}/salary`);
      const result = await response.json();
      const salaryPackage = result.success ? result.salaryPackage : null;

      const isEdit = !!salaryPackage;
      const title = isEdit ? "Edit Salary Package" : "Add Salary Package";

      const content = `
        <form id="salaryForm" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base Salary (₹) *</label>
              <input type="number" name="base_salary" value="${salaryPackage?.base_salary || ""}" step="0.01" min="0" required
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Food Allowance (₹)</label>
              <input type="number" name="food_allowance" value="${salaryPackage?.food_allowance || ""}" step="0.01" min="0"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fuel Allowance (₹)</label>
              <input type="number" name="fuel_allowance" value="${salaryPackage?.fuel_allowance || ""}" step="0.01" min="0"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Effective From *</label>
            <input type="date" name="effective_from" value="${salaryPackage?.effective_from || new Date().toISOString().slice(0, 10)}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? "Update" : "Create"}</button>
          </div>
        </form>
      `;

      const modal = showModal(title, content);
      const form = modal.querySelector("#salaryForm");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.employee_id = employeeId;

        try {
          let response;
          if (isEdit) {
            response = await fetch(`${API_BASE}/salary/${salaryPackage.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
          } else {
            response = await fetch(`${API_BASE}/employees/${employeeId}/salary`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
          }

          const result = await response.json();
          if (result.success) {
            showSuccessToast(isEdit ? "Salary package updated successfully" : "Salary package created successfully");
            closeModal();
            setTimeout(() => window.location.reload(), 500);
          } else {
            showErrorToast(result.error || "Failed to save salary package");
          }
        } catch (error) {
          showErrorToast("Failed to save salary package: " + error.message);
        }
      });
    } catch (error) {
      showErrorToast("Failed to load salary package: " + error.message);
    }
  }

  // Loan Modal
  window.showLoanModal = async function (loan = null) {
    const isEdit = !!loan;
    const title = isEdit ? "Edit Loan" : "Add Loan";

    const content = `
      <form id="loanForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan Amount (₹) *</label>
            <input type="number" name="loan_amount" value="${loan?.loan_amount || ""}" step="0.01" min="0" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Interest Rate (%)</label>
            <input type="number" name="interest_rate" value="${loan?.interest_rate || ""}" step="0.01" min="0"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan Date *</label>
            <input type="date" name="loan_date" value="${loan?.loan_date || new Date().toISOString().slice(0, 10)}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
            <input type="date" name="due_date" value="${loan?.due_date || ""}"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select name="status"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="active" ${loan?.status === "active" ? "selected" : ""}>Active</option>
              <option value="closed" ${loan?.status === "closed" ? "selected" : ""}>Closed</option>
              <option value="defaulted" ${loan?.status === "defaulted" ? "selected" : ""}>Defaulted</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purpose</label>
          <input type="text" name="purpose" value="${loan?.purpose || ""}"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea name="notes" rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${loan?.notes || ""}</textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">${isEdit ? "Update" : "Create"}</button>
        </div>
      </form>
    `;

    const modal = showModal(title, content);
    const form = modal.querySelector("#loanForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      data.employee_id = employeeId;

      Object.keys(data).forEach(key => {
        if (data[key] === "") data[key] = null;
      });

      try {
        let response;
        if (isEdit) {
          response = await fetch(`${API_BASE}/loans/${loan.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } else {
          response = await fetch(`${API_BASE}/employees/${employeeId}/loans`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        }

        const result = await response.json();
        if (result.success) {
          showSuccessToast(isEdit ? "Loan updated successfully" : "Loan created successfully");
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        } else {
          showErrorToast(result.error || "Failed to save loan");
        }
      } catch (error) {
        showErrorToast("Failed to save loan: " + error.message);
      }
    });
  }

  // View Repayments Modal
  async function handleViewRepayments(loanId) {
    try {
      const response = await fetch(`${API_BASE}/loans/${loanId}/repayments`);
      const result = await response.json();
      const repayments = result.success ? result.repayments : [];

      const loanResponse = await fetch(`${API_BASE}/loans/${loanId}`);
      const loanResult = await loanResponse.json();
      const loan = loanResult.success ? loanResult.loan : null;

      const totalRepaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const remaining = loan ? Number(loan.loan_amount || 0) - totalRepaid : 0;

      const content = `
        <div class="space-y-4">
          ${loan ? `
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div class="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div class="text-gray-500 dark:text-gray-400">Loan Amount</div>
                  <div class="font-semibold text-gray-900 dark:text-white">₹${Number(loan.loan_amount || 0).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div class="text-gray-500 dark:text-gray-400">Total Repaid</div>
                  <div class="font-semibold text-emerald-600 dark:text-emerald-400">₹${totalRepaid.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div class="text-gray-500 dark:text-gray-400">Remaining</div>
                  <div class="font-semibold text-gray-900 dark:text-white">₹${remaining.toLocaleString("en-IN")}</div>
                </div>
              </div>
            </div>
          ` : ""}
          <div class="flex justify-between items-center">
            <h4 class="text-md font-semibold text-gray-900 dark:text-white">Repayment History</h4>
            <button onclick="showAddRepaymentModal(${loanId})" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Repayment</button>
          </div>
          <div class="space-y-2 max-h-96 overflow-y-auto">
            ${repayments.length > 0 ? repayments.map(repayment => `
              <div class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <div class="font-medium text-gray-900 dark:text-white">₹${Number(repayment.amount || 0).toLocaleString("en-IN")}</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    ${new Date(repayment.repayment_date).toLocaleDateString("en-IN")}
                    ${repayment.payment_method ? ` · ${repayment.payment_method}` : ""}
                  </div>
                  ${repayment.notes ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${repayment.notes}</div>` : ""}
                </div>
                <div class="flex gap-2">
                  <button onclick="showEditRepaymentModal(${repayment.id}, ${repayment.loan_id}, ${repayment.amount}, '${(repayment.repayment_date || "").replace(/'/g, "\\'")}', '${(repayment.payment_method || "").replace(/'/g, "\\'")}', '${(repayment.notes || "").replace(/'/g, "\\'")}')" class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">Edit</button>
                  <button onclick="deleteRepayment(${repayment.id}, ${loanId})" class="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">Delete</button>
                </div>
              </div>
            `).join("") : `<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No repayments recorded</p>`}
          </div>
        </div>
      `;

      showModal("Loan Repayments", content);
    } catch (error) {
      showErrorToast("Failed to load repayments: " + error.message);
    }
  }

  // Add Repayment Modal
  window.showAddRepaymentModal = function (loanId) {
    const content = `
      <form id="repaymentForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹) *</label>
            <input type="number" name="amount" step="0.01" min="0" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repayment Date *</label>
            <input type="date" name="repayment_date" value="${new Date().toISOString().slice(0, 10)}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
            <select name="payment_method"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">Select</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Cheque">Cheque</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea name="notes" rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Repayment</button>
        </div>
      </form>
    `;

    const modal = showModal("Add Repayment", content);
    const form = modal.querySelector("#repaymentForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      data.loan_id = loanId;

      Object.keys(data).forEach(key => {
        if (data[key] === "") data[key] = null;
      });

      try {
        const response = await fetch(`${API_BASE}/loans/${loanId}/repayments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Repayment added successfully");
          closeModal();
          handleViewRepayments(loanId);
        } else {
          showErrorToast(result.error || "Failed to add repayment");
        }
      } catch (error) {
        showErrorToast("Failed to add repayment: " + error.message);
      }
    });
  };

  // Edit Repayment Modal
  window.showEditRepaymentModal = function (repaymentId, loanId, amount, repaymentDate, paymentMethod, notes) {
    const content = `
      <form id="repaymentForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹) *</label>
            <input type="number" name="amount" value="${amount}" step="0.01" min="0" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repayment Date *</label>
            <input type="date" name="repayment_date" value="${repaymentDate}" required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
            <select name="payment_method"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">Select</option>
              <option value="Cash" ${paymentMethod === "Cash" ? "selected" : ""}>Cash</option>
              <option value="Bank Transfer" ${paymentMethod === "Bank Transfer" ? "selected" : ""}>Bank Transfer</option>
              <option value="UPI" ${paymentMethod === "UPI" ? "selected" : ""}>UPI</option>
              <option value="Cheque" ${paymentMethod === "Cheque" ? "selected" : ""}>Cheque</option>
              <option value="Other" ${paymentMethod === "Other" ? "selected" : ""}>Other</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea name="notes" rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">${notes || ""}</textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
        </div>
      </form>
    `;

    const modal = showModal("Edit Repayment", content);
    const form = modal.querySelector("#repaymentForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      Object.keys(data).forEach(key => {
        if (data[key] === "") data[key] = null;
      });

      try {
        const response = await fetch(`${API_BASE}/repayments/${repaymentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Repayment updated successfully");
          closeModal();
          handleViewRepayments(loanId);
        } else {
          showErrorToast(result.error || "Failed to update repayment");
        }
      } catch (error) {
        showErrorToast("Failed to update repayment: " + error.message);
      }
    });
  };

  // Delete Repayment
  window.deleteRepayment = async function (repaymentId, loanId) {
    if (!confirm("Are you sure you want to delete this repayment?")) return;

    try {
      const response = await fetch(`${API_BASE}/repayments/${repaymentId}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        showSuccessToast("Repayment deleted successfully");
        handleViewRepayments(loanId);
      } else {
        showErrorToast(result.error || "Failed to delete repayment");
      }
    } catch (error) {
      showErrorToast("Failed to delete repayment: " + error.message);
    }
  };

  // Edit Loan
  async function handleEditLoan(loanId) {
    try {
      const response = await fetch(`${API_BASE}/loans/${loanId}`);
      const result = await response.json();
      if (result.success) {
        window.showLoanModal(result.loan);
      } else {
        showErrorToast(result.error || "Failed to load loan");
      }
    } catch (error) {
      showErrorToast("Failed to load loan: " + error.message);
    }
  }

  // Document Modal
  function showAddDocumentModal() {
    const documentTypes = [
      "Aadhaar",
      "Driving License",
      "PAN Card",
      "Passport",
      "Voter ID",
      "Bank Statement",
      "Salary Slip",
      "Contract",
      "Other",
    ];

    const content = `
      <form id="documentForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Type *</label>
          <select name="document_type" required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
            <option value="">Select Document Type</option>
            ${documentTypes.map(type => `<option value="${type}">${type}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Name *</label>
          <input type="text" name="document_name" required placeholder="e.g., Aadhaar Card - Front"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document File *</label>
          <input type="file" name="document" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300">
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Accepted: PDF, Word, Images (Max 10MB)</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry Date</label>
          <input type="date" name="expiry_date"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea name="notes" rows="2" placeholder="Additional notes about this document"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Upload</button>
        </div>
      </form>
    `;

    const modal = showModal("Add Document", content);
    const form = modal.querySelector("#documentForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);

      try {
        const response = await fetch(`${API_BASE}/employees/${employeeId}/documents`, {
          method: "POST",
          body: formData,
        });

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Document uploaded successfully");
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        } else {
          showErrorToast(result.error || "Failed to upload document");
        }
      } catch (error) {
        showErrorToast("Failed to upload document: " + error.message);
      }
    });
  }

  // Delete Document
  async function handleDeleteDocument(documentId) {
    if (!confirm("Are you sure you want to delete this document? This action cannot be undone.")) return;

    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        showSuccessToast("Document deleted successfully");
        setTimeout(() => window.location.reload(), 500);
      } else {
        showErrorToast(result.error || "Failed to delete document");
      }
    } catch (error) {
      showErrorToast("Failed to delete document: " + error.message);
    }
  }
})();
