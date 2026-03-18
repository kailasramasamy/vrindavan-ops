// Product Labels Management JavaScript

(function () {
  const state = {
    labels: [],
    filteredLabels: [],
    currentLabel: null,
    products: window.PRODUCTS_DATA || [],
  };

  const elements = {
    createLabelBtn: document.getElementById("createLabelBtn"),
    searchInput: document.getElementById("searchInput"),
    productFilter: document.getElementById("productFilter"),
    activeFilter: document.getElementById("activeFilter"),
    labelsTableBody: document.getElementById("labelsTableBody"),
    labelsLoadingRow: document.getElementById("labelsLoadingRow"),
    labelsEmptyRow: document.getElementById("labelsEmptyRow"),
    labelModal: document.getElementById("labelModal"),
    labelForm: document.getElementById("labelForm"),
    modalTitle: document.getElementById("modalTitle"),
    labelId: document.getElementById("labelId"),
    productId: document.getElementById("productId"),
    productName: document.getElementById("productName"),
    productSearch: document.getElementById("productSearch"),
    productDropdown: document.getElementById("productDropdown"),
    selectedProductInfo: document.getElementById("selectedProductInfo"),
    labelType: document.getElementById("labelType"),
    labelMaterial: document.getElementById("labelMaterial"),
    cutting: document.getElementById("cutting"),
    designFile: document.getElementById("designFile"),
    existingFile: document.getElementById("existingFile"),
    currentFileName: document.getElementById("currentFileName"),
    currentFileLink: document.getElementById("currentFileLink"),
    notes: document.getElementById("notes"),
    active: document.getElementById("active"),
  };

  // Initialize
  function init() {
    if (elements.createLabelBtn) {
      elements.createLabelBtn.addEventListener("click", () => {
        openLabelModal();
      });
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener("input", debounce(applyFilters, 300));
    }

    if (elements.productFilter) {
      elements.productFilter.addEventListener("change", applyFilters);
    }

    if (elements.activeFilter) {
      elements.activeFilter.addEventListener("change", applyFilters);
    }

    if (elements.labelForm) {
      elements.labelForm.addEventListener("submit", handleFormSubmit);
    }

    // Initialize searchable product dropdown
    // Products will be loaded when modal opens, so we'll initialize it then

    loadLabels();
  }

  // Store handlers to remove them later
  let currentSearchHandler = null;
  let currentClickHandler = null;
  let currentKeydownHandler = null;
  let clickOutsideHandler = null;

  // Initialize searchable product dropdown
  function initProductSearch() {
    const productSearchEl = document.getElementById("productSearch");
    const productDropdownEl = document.getElementById("productDropdown");
    const productIdEl = document.getElementById("productId");
    const selectedProductInfoEl = document.getElementById("selectedProductInfo");
    
    if (!productSearchEl || !productDropdownEl) {
      return;
    }

    // Ensure products are loaded
    const products = window.PRODUCTS_DATA || state.products || [];
    if (products.length === 0) {
      return;
    }

    // Remove old handlers if they exist (before attaching new ones)
    if (currentSearchHandler) {
      const oldSearchEl = document.getElementById("productSearch");
      if (oldSearchEl) {
        oldSearchEl.removeEventListener("input", currentSearchHandler);
      }
    }
    if (currentClickHandler) {
      const oldDropdownEl = document.getElementById("productDropdown");
      if (oldDropdownEl) {
        oldDropdownEl.removeEventListener("click", currentClickHandler);
      }
    }
    if (currentKeydownHandler) {
      const oldSearchEl = document.getElementById("productSearch");
      if (oldSearchEl) {
        oldSearchEl.removeEventListener("keydown", currentKeydownHandler);
      }
    }
    if (clickOutsideHandler) {
      document.removeEventListener("click", clickOutsideHandler);
      clickOutsideHandler = null;
    }

    // Update elements object reference
    elements.productSearch = productSearchEl;

    // Handle search input
    currentSearchHandler = function(e) {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      if (searchTerm.length === 0) {
        productDropdownEl.classList.add("hidden");
        return;
      }

      // Get fresh products list
      const currentProducts = window.PRODUCTS_DATA || state.products || [];
      
      if (!currentProducts || currentProducts.length === 0) {
        productDropdownEl.classList.add("hidden");
        return;
      }
      
      // Filter products
      const filtered = currentProducts.filter((p) => {
        const name = (p.name || "").toLowerCase();
        const unitSize = (p.unit_size || "").toLowerCase();
        return name.includes(searchTerm) || unitSize.includes(searchTerm);
      });

      // Render dropdown
      if (filtered.length > 0) {
        productDropdownEl.innerHTML = filtered
          .map(
            (product) => `
            <div
              class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-b-0"
              data-product-id="${product.id}"
              data-product-name="${escapeHtml(product.name || "")}"
              data-product-unit="${escapeHtml(product.unit_size || "")}"
            >
              <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(product.name || "")}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(product.unit_size || "N/A")}</div>
            </div>
          `
          )
          .join("");
        productDropdownEl.classList.remove("hidden");
      } else {
        productDropdownEl.innerHTML = `
          <div class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
            No products found
          </div>
        `;
        productDropdownEl.classList.remove("hidden");
      }
    };
    productSearchEl.addEventListener("input", currentSearchHandler);

    // Handle product selection
    currentClickHandler = function(e) {
      const item = e.target.closest("[data-product-id]");
      if (item) {
        const productId = item.dataset.productId;
        const productName = item.dataset.productName;
        const productUnit = item.dataset.productUnit;

        if (productIdEl) productIdEl.value = productId;
        const currentSearchEl = document.getElementById("productSearch");
        const productNameEl = document.getElementById("productName");
        if (currentSearchEl) {
          currentSearchEl.value = productName;
          // Update hidden name field with the exact text from search field
          if (productNameEl) {
            productNameEl.value = currentSearchEl.value;
          }
        }
        productDropdownEl.classList.add("hidden");
        if (selectedProductInfoEl) {
          selectedProductInfoEl.textContent = `Unit Size: ${productUnit || "N/A"}`;
        }
      }
    };
    productDropdownEl.addEventListener("click", currentClickHandler);

    // Close dropdown when clicking outside
    clickOutsideHandler = function(e) {
      const currentSearchEl = document.getElementById("productSearch");
      const currentDropdownEl = document.getElementById("productDropdown");
      if (
        currentSearchEl &&
        currentDropdownEl &&
        !currentSearchEl.contains(e.target) &&
        !currentDropdownEl.contains(e.target)
      ) {
        currentDropdownEl.classList.add("hidden");
      }
    };
    document.addEventListener("click", clickOutsideHandler);

    // Handle keyboard navigation
    currentKeydownHandler = function(e) {
      if (e.key === "Escape") {
        productDropdownEl.classList.add("hidden");
      }
    };
    productSearchEl.addEventListener("keydown", currentKeydownHandler);
    
    // Sync hidden name field whenever user types in search field
    // This allows users to edit the product name after selection
    productSearchEl.addEventListener("input", function() {
      const productNameEl = document.getElementById("productName");
      if (productNameEl) {
        productNameEl.value = productSearchEl.value;
      }
    });
  }

  // Load labels
  async function loadLabels() {
    try {
      showLoading();

      const params = new URLSearchParams();
      params.append("limit", "100");
      params.append("offset", "0");

      const response = await fetch(`/product-labels/api/labels?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        state.labels = data.labels || [];
        applyFilters();
      } else {
        showError(data.error || "Failed to load labels");
      }
    } catch (error) {
      console.error("Error loading labels:", error);
      showError("Failed to load labels");
    }
  }

  // Apply filters
  function applyFilters() {
    const search = (elements.searchInput?.value || "").toLowerCase();
    const productId = elements.productFilter?.value || "";
    const active = elements.activeFilter?.value || "";

    state.filteredLabels = state.labels.filter((label) => {
      const matchesSearch =
        !search ||
        (label.name || "").toLowerCase().includes(search) ||
        (label.product_name || "").toLowerCase().includes(search);

      const matchesProduct = !productId || String(label.product_id) === productId;
      const matchesActive =
        active === "" || String(label.active) === (active === "true" ? "1" : "0");

      return matchesSearch && matchesProduct && matchesActive;
    });

    renderLabels();
  }

  // Render labels table
  function renderLabels() {
    if (!elements.labelsTableBody) return;

    // Remove existing rows (except loading and empty rows)
    const existingRows = Array.from(
      elements.labelsTableBody.querySelectorAll(
        "tr:not(#labelsLoadingRow):not(#labelsEmptyRow)"
      )
    );
    existingRows.forEach((row) => row.remove());

    if (elements.labelsLoadingRow) {
      elements.labelsLoadingRow.classList.add("hidden");
    }

    if (state.filteredLabels.length === 0) {
      if (elements.labelsEmptyRow) {
        elements.labelsEmptyRow.classList.remove("hidden");
      }
      return;
    }

    if (elements.labelsEmptyRow) {
      elements.labelsEmptyRow.classList.add("hidden");
    }

    state.filteredLabels.forEach((label) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors";
      row.setAttribute('data-label-id', label.id);

      // Generate thumbnail path
      let thumbnailCell = '<div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center"><span class="text-xs text-gray-400 dark:text-gray-500 text-center px-2">No Design</span></div>';
      
      if (label.design_file_path) {
        const fileName = label.design_file_path.split('/').pop().replace(/\.pdf$/i, '');
        const thumbnailPath = `/uploads/product-labels/thumbnails/${fileName}.png`;
        thumbnailCell = `<a href="${escapeHtml(label.design_file_path)}" target="_blank" class="block group relative" title="Click to view design file">
          <div class="w-20 h-20 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden hover:border-blue-500 dark:hover:border-blue-400 transition-all shadow-sm hover:shadow-md">
            <img 
              src="${escapeHtml(thumbnailPath)}?t=${Date.now()}" 
              alt="${escapeHtml(label.design_file_name || 'Design thumbnail')}"
              data-thumbnail-path="${escapeHtml(thumbnailPath)}"
              class="w-full h-full object-contain"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'; setTimeout(() => { const img = this; const path = img.getAttribute('data-thumbnail-path'); if (path) { const retry = new Image(); retry.src = path + '?t=' + Date.now(); retry.onload = function() { img.src = retry.src; img.style.display = 'block'; img.nextElementSibling.style.display = 'none'; }; } }, 3000);"
              loading="lazy"
            />
            <div class="text-center p-2 hidden">
              <svg class="w-8 h-8 mx-auto text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
              </svg>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 font-medium truncate max-w-[60px]" title="${escapeHtml(label.design_file_name || 'PDF')}">${escapeHtml(label.design_file_name || 'PDF')}</p>
            </div>
            <div class="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-10 transition-opacity rounded-lg"></div>
          </div>
        </a>`;
      }

      const designFileCell = label.design_file_path
        ? `<a href="${escapeHtml(label.design_file_path)}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
            View PDF
          </a>`
        : '<span class="text-gray-400 text-sm">No file</span>';

      // Ensure we're accessing the correct fields from the label object
      // Use product_unit if unit_size is not available (fallback to product's unit size)
      const labelName = label.name || "—";
      const unitSize = label.unit_size || label.product_unit || "—";
      const labelType = label.label_type || "—";
      const labelMaterial = label.label_material || "—";
      const cutting = label.cutting || "—";
      const isActive = label.active === 1 || label.active === true;

      // Table cell order must match header order exactly:
      // 1. Design (thumbnail)
      // 2. Label Name (label.name)
      // 3. Unit Size (label.unit_size or label.product_unit)
      // 4. Label Type (label.label_type)
      // 5. Label Material (label.label_material)
      // 6. Cutting (label.cutting)
      // 7. Design File (label.design_file_path)
      // 8. Status (label.active)
      // 9. Actions (Edit/Delete buttons)
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          ${thumbnailCell}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(labelName)}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(unitSize)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(labelType)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(labelMaterial)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${escapeHtml(cutting)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${designFileCell}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${
            isActive
              ? '<span class="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>'
              : '<span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Inactive</span>'
          }
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button onclick="editLabel(${label.id})" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4">
            Edit
          </button>
          <button onclick="deleteLabel(${label.id})" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
            Delete
          </button>
        </td>
      `;

      elements.labelsTableBody.appendChild(row);
    });
    
    // Check for thumbnails that might not be ready yet
    checkAndUpdateThumbnails();
  }

  // Poll for thumbnail to become available for a specific label
  function pollForThumbnail(labelId, maxAttempts = 10, attempt = 0) {
    if (attempt >= maxAttempts) {
      // Give up after max attempts
      checkAndUpdateThumbnails();
      return;
    }
    
    // Find the thumbnail image for this label
    const row = document.querySelector(`tr[data-label-id="${labelId}"]`);
    if (!row) {
      // Row not found yet, try again
      setTimeout(() => pollForThumbnail(labelId, maxAttempts, attempt + 1), 500);
      return;
    }
    
    const img = row.querySelector('img[data-thumbnail-path]');
    if (!img) {
      // Image not found, try again
      setTimeout(() => pollForThumbnail(labelId, maxAttempts, attempt + 1), 500);
      return;
    }
    
    const thumbnailPath = img.getAttribute('data-thumbnail-path');
    if (!thumbnailPath) {
      return;
    }
    
    // Check if thumbnail is available
    const testImg = new Image();
    testImg.onload = () => {
      // Thumbnail is available, update the image
      img.src = thumbnailPath + '?t=' + Date.now();
      img.style.display = 'block';
      const fallback = img.parentElement.querySelector('.text-center.p-2');
      if (fallback) {
        fallback.classList.add('hidden');
      }
    };
    testImg.onerror = () => {
      // Thumbnail not ready yet, try again
      if (attempt < maxAttempts - 1) {
        setTimeout(() => pollForThumbnail(labelId, maxAttempts, attempt + 1), 2000);
      } else {
        // Last attempt, just check all thumbnails
        checkAndUpdateThumbnails();
      }
    };
    testImg.src = thumbnailPath + '?t=' + Date.now();
  }

  // Check and update thumbnails that might not be ready yet
  function checkAndUpdateThumbnails() {
    const thumbnailImages = document.querySelectorAll('#labelsTableBody img[data-thumbnail-path]');
    thumbnailImages.forEach(img => {
      const thumbnailPath = img.getAttribute('data-thumbnail-path');
      if (thumbnailPath) {
        // Check if image failed to load or is still loading
        if (!img.complete || img.naturalHeight === 0) {
          // Retry loading thumbnail with cache-busting
          const retryImg = new Image();
          retryImg.onload = () => {
            img.src = retryImg.src;
            img.style.display = 'block';
            // Hide fallback if visible
            const fallback = img.parentElement.querySelector('.text-center.p-2');
            if (fallback) {
              fallback.classList.add('hidden');
            }
          };
          retryImg.onerror = () => {
            // Still not available, retry again after delay
            setTimeout(() => {
              const retryAgain = new Image();
              retryAgain.src = thumbnailPath + '?t=' + Date.now();
              retryAgain.onload = () => {
                img.src = retryAgain.src;
                img.style.display = 'block';
                const fallback = img.parentElement.querySelector('.text-center.p-2');
                if (fallback) {
                  fallback.classList.add('hidden');
                }
              };
            }, 2000);
          };
          retryImg.src = thumbnailPath + '?t=' + Date.now();
        }
      }
    });
  }

  // Open label modal
  function openLabelModal(labelId = null) {
    // Ensure products are loaded
    if (window.PRODUCTS_DATA && window.PRODUCTS_DATA.length > 0) {
      state.products = window.PRODUCTS_DATA;
    }

    if (labelId) {
      state.currentLabel = state.labels.find((l) => l.id === labelId);
      if (state.currentLabel) {
        elements.modalTitle.textContent = "Edit Product Label";
        elements.labelId.value = state.currentLabel.id;
        elements.productId.value = state.currentLabel.product_id || "";
        
        // Set product search value - use label's name (which may be customized)
        const labelName = state.currentLabel.name || "";
        const products = window.PRODUCTS_DATA || state.products || [];
        const product = products.find((p) => p.id == state.currentLabel.product_id);
        
        if (labelName) {
          // Use the label's custom name
          elements.productSearch.value = labelName;
          const productNameEl = document.getElementById("productName");
          if (productNameEl) {
            productNameEl.value = labelName;
          }
        } else if (product) {
          elements.productSearch.value = product.name || "";
          const productNameEl = document.getElementById("productName");
          if (productNameEl) {
            productNameEl.value = product.name || "";
          }
        } else {
          elements.productSearch.value = state.currentLabel.product_name || "";
          const productNameEl = document.getElementById("productName");
          if (productNameEl) {
            productNameEl.value = state.currentLabel.product_name || "";
          }
        }
        
        if (product) {
          elements.selectedProductInfo.textContent = `Unit Size: ${product.unit_size || "N/A"}`;
        } else {
          elements.selectedProductInfo.textContent = `Unit Size: ${state.currentLabel.unit_size || "N/A"}`;
        }
        
        elements.labelType.value = state.currentLabel.label_type || "sticker";
        elements.labelMaterial.value = state.currentLabel.label_material || "white pvc";
        elements.cutting.value = state.currentLabel.cutting || "Full";
        elements.notes.value = state.currentLabel.notes || "";
        elements.active.checked = state.currentLabel.active === 1;

        if (state.currentLabel.design_file_path) {
          elements.existingFile.classList.remove("hidden");
          elements.currentFileName.textContent = state.currentLabel.design_file_name || "Design file";
          elements.currentFileLink.href = state.currentLabel.design_file_path;
        } else {
          elements.existingFile.classList.add("hidden");
        }
      }
    } else {
      state.currentLabel = null;
      elements.modalTitle.textContent = "Add Product Label";
      elements.labelForm.reset();
      elements.labelId.value = "";
      elements.productSearch.value = "";
      elements.productId.value = "";
      const productNameEl = document.getElementById("productName");
      if (productNameEl) {
        productNameEl.value = "";
      }
      elements.selectedProductInfo.textContent = "";
      elements.existingFile.classList.add("hidden");
    }

    if (elements.labelModal) {
      elements.labelModal.classList.remove("hidden");
    }
    
    // Initialize search after modal is visible (small delay to ensure DOM is ready)
    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        initProductSearch();
      }, 50);
    });
  }

  // Close label modal
  window.closeLabelModal = function () {
    if (elements.labelModal) {
      elements.labelModal.classList.add("hidden");
    }
    state.currentLabel = null;
    elements.labelForm.reset();
    
    // Reset product search elements - get fresh references
    const productSearchEl = document.getElementById("productSearch");
    const productIdEl = document.getElementById("productId");
    const selectedProductInfoEl = document.getElementById("selectedProductInfo");
    const productDropdownEl = document.getElementById("productDropdown");
    
    if (productSearchEl) {
      productSearchEl.value = "";
      elements.productSearch = productSearchEl; // Update reference
    }
    if (productIdEl) {
      productIdEl.value = "";
    }
    if (selectedProductInfoEl) {
      selectedProductInfoEl.textContent = "";
    }
    if (productDropdownEl) {
      productDropdownEl.classList.add("hidden");
      productDropdownEl.innerHTML = "";
    }
  };

  // Edit label
  window.editLabel = function (labelId) {
    openLabelModal(labelId);
  };

  // Expose openLabelModal for testing
  window.openLabelModal = openLabelModal;

  // Handle form submit
  async function handleFormSubmit(e) {
    e.preventDefault();

    // Get submit button and show loading state
    const submitButton = elements.labelForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.innerHTML : '';
    const originalButtonDisabled = submitButton ? submitButton.disabled : false;
    
    // Show loading state
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `
        <span class="inline-flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Saving...
        </span>
      `;
    }

    const formData = new FormData(elements.labelForm);
    const labelId = elements.labelId.value;

    try {
      let response;
      if (labelId) {
        // Update
        response = await fetch(`/product-labels/api/labels/${labelId}`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        // Create
        response = await fetch("/product-labels/api/labels", {
          method: "POST",
          body: formData,
        });
      }

      const data = await response.json();

      if (data.success) {
        closeLabelModal();
        
        // If a design file was uploaded, wait for thumbnail generation
        const designFile = elements.designFile?.files?.[0];
        const savedLabelId = data.label?.id || labelId;
        
        loadLabels();
        showSuccess(labelId ? "Label updated successfully" : "Label created successfully");
        
        // After labels are loaded, check for thumbnails and update them when available
        if (designFile && savedLabelId) {
          // Wait a bit for the table to render, then poll for thumbnail
          setTimeout(() => {
            pollForThumbnail(savedLabelId);
          }, 1000);
        }
      } else {
        showError(data.error || "Failed to save label");
      }
    } catch (error) {
      console.error("Error saving label:", error);
      showError("Failed to save label");
    } finally {
      // Restore button state
      if (submitButton) {
        submitButton.disabled = originalButtonDisabled;
        submitButton.innerHTML = originalButtonText;
      }
    }
  }

  // Delete label
  window.deleteLabel = async function (labelId) {
    if (!confirm("Are you sure you want to delete this label?")) {
      return;
    }

    try {
      const response = await fetch(`/product-labels/api/labels/${labelId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        loadLabels();
        showSuccess("Label deleted successfully");
      } else {
        showError(data.error || "Failed to delete label");
      }
    } catch (error) {
      console.error("Error deleting label:", error);
      showError("Failed to delete label");
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
    if (elements.labelsLoadingRow) {
      elements.labelsLoadingRow.classList.remove("hidden");
    }
    if (elements.labelsEmptyRow) {
      elements.labelsEmptyRow.classList.add("hidden");
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


