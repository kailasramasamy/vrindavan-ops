// Delivery Issues List Page JavaScript
(function() {
  "use strict";

  const API_BASE = "/analytics/api/delivery/issues/list";
  const ISSUE_DETAILS_API = "/analytics/api/delivery/issues";

  const state = {
    issues: [],
    deliveryBoy: window.DELIVERY_ISSUES_DATA?.deliveryBoy || "",
    issueType: window.DELIVERY_ISSUES_DATA?.issueType || "",
    dateRange: window.DELIVERY_ISSUES_DATA?.dateRange || "7d",
    startDate: window.DELIVERY_ISSUES_DATA?.startDate || null,
    endDate: window.DELIVERY_ISSUES_DATA?.endDate || null,
  };

  const elements = {
    issuesTableBody: document.getElementById("issuesTableBody"),
    issuesLoadingRow: document.getElementById("issuesLoadingRow"),
    issuesEmptyRow: document.getElementById("issuesEmptyRow"),
  };

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
        month: "short", 
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

  async function loadIssues() {
    try {
      if (elements.issuesLoadingRow) {
        elements.issuesLoadingRow.classList.remove("hidden");
      }
      if (elements.issuesEmptyRow) {
        elements.issuesEmptyRow.classList.add("hidden");
      }

      // Get parameters from URL (they might be double-encoded)
      const urlParams = new URLSearchParams(window.location.search);
      let deliveryBoy = urlParams.get("deliveryBoy") || state.deliveryBoy;
      let issueType = urlParams.get("issueType") || state.issueType;
      const range = urlParams.get("range") || state.dateRange;
      const startDate = urlParams.get("startDate") || state.startDate;
      const endDate = urlParams.get("endDate") || state.endDate;

      // Decode if double-encoded
      function safeDecode(str) {
        if (!str) return "";
        try {
          let decoded = decodeURIComponent(str);
          // Try decoding again in case of double encoding
          if (decoded.includes('%')) {
            decoded = decodeURIComponent(decoded);
          }
          return decoded;
        } catch (e) {
          return str;
        }
      }

      const decodedDeliveryBoy = safeDecode(deliveryBoy);
      const decodedIssueType = safeDecode(issueType);

      const params = new URLSearchParams();
      if (decodedDeliveryBoy) {
        params.set("deliveryBoy", decodedDeliveryBoy);
      }
      if (decodedIssueType) {
        params.set("issueType", decodedIssueType);
      }
      if (range) {
        params.set("range", range);
      }
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const response = await fetch(`${API_BASE}?${params.toString()}`);
      const data = await response.json();

      if (data && data.success && data.data) {
        state.issues = data.data.issues || [];
        renderIssuesTable();
      } else {
        showError("Failed to load issues");
      }
    } catch (error) {
      console.error("Error loading issues:", error);
      showError("Failed to load issues");
    } finally {
      if (elements.issuesLoadingRow) {
        elements.issuesLoadingRow.classList.add("hidden");
      }
    }
  }

  function renderIssuesTable() {
    if (!elements.issuesTableBody) return;

    if (state.issues.length === 0) {
      if (elements.issuesEmptyRow) {
        elements.issuesEmptyRow.classList.remove("hidden");
      }
      return;
    }

    if (elements.issuesEmptyRow) {
      elements.issuesEmptyRow.classList.add("hidden");
    }

    elements.issuesTableBody.innerHTML = state.issues.map(issue => {
      return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${issue.id || "—"}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${escapeHtml(issue.issue_type_name || "Unknown")}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm">${getStatusBadge(issue.current_status_name)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm">${getPriorityBadge(issue.priority)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${issue.order_id || "—"}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${formatDate(issue.created_at)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm">
            <button 
              onclick="viewIssueDetails(${issue.id})"
              class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
              View
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function showError(message) {
    if (elements.issuesEmptyRow) {
      elements.issuesEmptyRow.innerHTML = `
        <td colspan="7" class="px-6 py-12 text-center text-red-500 dark:text-red-400 text-sm">
          <div class="flex flex-col items-center gap-2">
            <p>${escapeHtml(message)}</p>
          </div>
        </td>
      `;
      elements.issuesEmptyRow.classList.remove("hidden");
    }
  }



  // Make functions globally accessible
  // window.viewIssueDetails = viewIssueDetails; // Handled by shared script
  // window.closeIssueDetailsModal = closeIssueDetailsModal; // Handled by shared script

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadIssues);
  } else {
    loadIssues();
  }
})();
