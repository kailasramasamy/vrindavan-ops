(function () {
  const API_BASE = "/employees/api";
  const state = {
    roles: window.ROLES_DATA || [],
    isLoading: false,
  };

  const elements = {
    addRoleBtn: document.getElementById("addRoleBtn"),
    rolesList: document.getElementById("rolesList"),
    rolesLoading: document.getElementById("rolesLoading"),
    rolesEmpty: document.getElementById("rolesEmpty"),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (elements.addRoleBtn) {
      elements.addRoleBtn.addEventListener("click", () => showAddRoleModal());
    }
    renderRoles();
  }

  function renderRoles() {
    if (!elements.rolesList) return;

    if (state.roles.length === 0) {
      if (elements.rolesEmpty) {
        elements.rolesEmpty.classList.remove("hidden");
      }
      if (elements.rolesList) {
        elements.rolesList.innerHTML = "";
      }
      return;
    }

    if (elements.rolesEmpty) {
      elements.rolesEmpty.classList.add("hidden");
    }

    elements.rolesList.innerHTML = state.roles
      .map(
        (role) => `
      <div class="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <div class="flex-1">
          <div class="font-semibold text-gray-900 dark:text-white">${role.name || "—"}</div>
          ${role.description ? `<div class="text-sm text-gray-500 dark:text-gray-400 mt-1">${role.description}</div>` : ""}
        </div>
        <div class="flex items-center gap-2 ml-4">
          <button onclick="showEditRoleModal(${role.id}, '${(role.name || "").replace(/'/g, "\\'")}', '${(role.description || "").replace(/'/g, "\\'").replace(/\n/g, "\\n")}')" class="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
            Edit
          </button>
          <button onclick="deleteRole(${role.id})" class="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
            Delete
          </button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  // Modal Functions
  function showModal(title, content, onClose = null) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 overflow-y-auto";
    modal.innerHTML = `
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onclick="closeModal()"></div>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-200 dark:border-gray-700">
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

  // Add Role Modal
  function showAddRoleModal() {
    const content = `
      <form id="roleForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Name *</label>
          <input type="text" name="name" required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea name="description" rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
        </div>
      </form>
    `;

    const modal = showModal("Add Role", content);
    const form = modal.querySelector("#roleForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(`${API_BASE}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Role created successfully");
          closeModal();
          await loadRoles();
        } else {
          showErrorToast(result.error || "Failed to create role");
        }
      } catch (error) {
        showErrorToast("Failed to create role: " + error.message);
      }
    });
  }

  // Edit Role Modal
  window.showEditRoleModal = function (roleId, name, description) {
    const content = `
      <form id="roleForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Name *</label>
          <input type="text" name="name" value="${name}" required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea name="description" rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">${description}</textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
        </div>
      </form>
    `;

    const modal = showModal("Edit Role", content);
    const form = modal.querySelector("#roleForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(`${API_BASE}/roles/${roleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
          showSuccessToast("Role updated successfully");
          closeModal();
          await loadRoles();
        } else {
          showErrorToast(result.error || "Failed to update role");
        }
      } catch (error) {
        showErrorToast("Failed to update role: " + error.message);
      }
    });
  };

  // Delete Role
  window.deleteRole = async function (roleId) {
    if (!confirm("Are you sure you want to delete this role? This action cannot be undone.")) return;

    try {
      const response = await fetch(`${API_BASE}/roles/${roleId}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        showSuccessToast("Role deleted successfully");
        await loadRoles();
      } else {
        showErrorToast(result.error || "Failed to delete role");
      }
    } catch (error) {
      showErrorToast("Failed to delete role: " + error.message);
    }
  };

  // Load Roles
  async function loadRoles() {
    state.isLoading = true;
    if (elements.rolesLoading) {
      elements.rolesLoading.classList.remove("hidden");
    }

    try {
      const response = await fetch(`${API_BASE}/roles`);
      const data = await response.json();

      if (data.success) {
        state.roles = data.roles || [];
        renderRoles();
      } else {
        showErrorToast("Failed to load roles: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading roles:", error);
      showErrorToast("Failed to load roles");
    } finally {
      state.isLoading = false;
      if (elements.rolesLoading) {
        elements.rolesLoading.classList.add("hidden");
      }
    }
  }
})();

