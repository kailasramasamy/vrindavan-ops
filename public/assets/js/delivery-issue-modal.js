/**
 * Shared Delivery Issue Details Modal Logic
 * Used by:
 * - /analytics/delivery (delivery.ejs)
 * - /analytics/delivery/issues (delivery-issues.ejs)
 * 
 * Version: 2.0 - Added product details section
 */

(function() {
  "use strict";

  // State
  let issueDetailsModalCreated = false;

  // Helper Functions
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { 
        year: "numeric", 
        month: "long", 
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return dateStr;
    }
  }

  function getPriorityBadge(priority) {
    if (!priority) return '<span class="px-2 py-1 text-xs font-medium rounded">—</span>';
    const priorityLower = priority.toLowerCase();
    let colorClass = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    if (priorityLower === "high" || priorityLower === "urgent") {
      colorClass = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    } else if (priorityLower === "medium" || priorityLower === "normal") {
      colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    } else if (priorityLower === "low") {
      colorClass = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
    return `<span class="px-2 py-1 text-xs font-medium rounded capitalize ${colorClass}">${escapeHtml(priority)}</span>`;
  }

  function getStatusBadge(status) {
    if (!status) return '<span class="px-2 py-1 text-xs font-medium rounded">—</span>';
    return `<span class="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">${escapeHtml(status)}</span>`;
  }

  // Modal Functions
  function createIssueDetailsModal() {
    // Check if modal already exists in DOM
    if (document.getElementById("issueDetailsModal")) {
      issueDetailsModalCreated = true;
      return;
    }

    const modalHTML = `
      <div id="issueDetailsModal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-4 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Issue Details</h3>
            <button 
              onclick="closeIssueDetailsModal()"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div id="issueDetailsContent" class="mt-3">
            <!-- Content will be loaded here -->
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    issueDetailsModalCreated = true;
  }

  async function viewIssueDetails(issueId) {
    try {
      // Create modal if not already created
      if (!issueDetailsModalCreated) {
        createIssueDetailsModal();
      }
      
      // Show modal with loading state
      const modal = document.getElementById("issueDetailsModal");
      const contentDiv = document.getElementById("issueDetailsContent");
      
      if (modal) {
        modal.classList.remove("hidden");
      }
      
      if (contentDiv) {
        contentDiv.innerHTML = `
          <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p class="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading issue details...</p>
          </div>
        `;
      }

      const response = await fetch(`/analytics/api/delivery/issues/${issueId}`);
      const data = await response.json();

      if (data && data.success && data.data) {
        console.log("Issue details data:", data.data);
        console.log("Products:", data.data.products);
        renderIssueDetails(data.data);
      } else {
        if (contentDiv) {
          contentDiv.innerHTML = `
            <div class="text-center py-12">
              <p class="text-sm text-red-500 dark:text-red-400">Failed to load issue details.</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error("Error loading issue details:", error);
      const contentDiv = document.getElementById("issueDetailsContent");
      if (contentDiv) {
        contentDiv.innerHTML = `
          <div class="text-center py-12">
            <p class="text-sm text-red-500 dark:text-red-400">Error loading issue details.</p>
          </div>
        `;
      }
    }
  }

  function renderIssueDetails(data) {
    // Debug: Log products data
    console.log("Rendering issue details, products:", data.products);
    
    const content = `
      <div class="space-y-4">
        <!-- Header Section: Key Information -->
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700/50 dark:to-gray-600/50 rounded-lg p-3 border border-blue-200 dark:border-gray-600">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="text-base font-bold text-gray-900 dark:text-white mb-0.5">Issue #${escapeHtml(data.id || "—")}</h3>
              <p class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(data.issue_type_name || "Unknown Issue Type")}</p>
            </div>
            <div class="text-right flex items-center gap-2">
              ${getStatusBadge(data.current_status_name)}
              ${getPriorityBadge(data.priority)}
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3 pt-2 border-t border-blue-200 dark:border-gray-600">
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Order ID</p>
              <p class="text-xs font-semibold text-gray-900 dark:text-white">${escapeHtml(data.order_id || "—")}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Reported Via</p>
              <p class="text-xs font-semibold text-gray-900 dark:text-white capitalize">${escapeHtml(data.reported_via || "—")}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Created</p>
              <p class="text-xs font-semibold text-gray-900 dark:text-white">${formatDate(data.created_at)}</p>
            </div>
          </div>
        </div>

        <!-- Description Section -->
        ${data.description ? `
        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
          <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Description
          </h4>
          <p class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(data.description)}</p>
        </div>
        ` : ''}

        <!-- Details Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <!-- Customer Information Card -->
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
            <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
              Customer Information
            </h4>
            <div class="space-y-2">
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Name</p>
                <p class="text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(data.customer?.name || "—")}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Phone</p>
                <p class="text-xs font-medium text-gray-900 dark:text-white">
                  ${data.customer?.phone ? `<a href="tel:${escapeHtml(data.customer.phone)}" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(data.customer.phone)}</a>` : "—"}
                </p>
              </div>
            </div>
          </div>

          <!-- Delivery Information Card (merged with address) -->
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
            <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              Delivery Information
            </h4>
            <div class="space-y-2">
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Delivery Boy</p>
                <p class="text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(data.delivery_boy?.name || "—")}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Locality</p>
                <p class="text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(data.delivery_address?.locality_name || "—")}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Address</p>
                <p class="text-xs font-medium text-gray-900 dark:text-white leading-relaxed">${escapeHtml(data.delivery_address?.complete_address || "—")}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Product Details Section -->
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
          <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
            </svg>
            Affected Products
          </h4>
          ${data.products && data.products.length > 0 ? `
          <div class="space-y-2">
            ${data.products.map(product => `
              <div class="flex items-center justify-between py-1.5 px-2 bg-gray-50 dark:bg-gray-700/30 rounded border border-gray-200 dark:border-gray-600">
                <div class="flex-1">
                  <p class="text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(product.name)}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Unit: ${escapeHtml(product.unit_size)}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs font-semibold text-gray-900 dark:text-white">Qty: ${product.quantity}</p>
                </div>
              </div>
            `).join('')}
          </div>
          ` : `
          <div class="text-center py-4">
            <p class="text-xs text-gray-500 dark:text-gray-400">No products found for this order</p>
          </div>
          `}
        </div>

        <!-- Timestamp -->
        <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Last Updated: <span class="font-medium text-gray-700 dark:text-gray-300">${formatDate(data.updated_at)}</span>
          </p>
        </div>
      </div>
    `;
    document.getElementById("issueDetailsContent").innerHTML = content;
  }

  function closeIssueDetailsModal() {
    const modal = document.getElementById("issueDetailsModal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }

  // Expose functions globally
  window.viewIssueDetails = viewIssueDetails;
  window.closeIssueDetailsModal = closeIssueDetailsModal;
  window.DeliveryIssueModal = {
    escapeHtml,
    formatDate,
    getPriorityBadge,
    getStatusBadge
  };

})();
