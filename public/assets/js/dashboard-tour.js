/**
 * Dashboard Tour System
 * Provides a guided tour of the CP dashboard
 */

class DashboardTour {
  constructor() {
    this.currentStep = 0;
    this.steps = [
      {
        target: '[data-tour="date-filter"]',
        title: 'Date Range Filter',
        content: 'Use this filter to view data for different time periods. Try selecting "Last 7 Days", "Last 30 Days", or "This Month" to see how your statistics change.',
        position: 'bottom'
      },
      {
        target: '[data-tour="total-customers"]',
        title: 'Total Customers',
        content: 'This shows the total number of customers mapped to you. These are customers who can place orders through your referral.',
        position: 'bottom'
      },
      {
        target: '[data-tour="total-orders"]',
        title: 'Total Orders',
        content: 'This displays the total number of orders placed by all your customers. The count updates based on your selected date range.',
        position: 'bottom'
      },
      {
        target: '[data-tour="total-commission"]',
        title: 'Total Commission',
        content: 'This shows your total earnings from all orders. Commission is calculated based on your margin settings (product-specific, category-specific, or default margins).',
        position: 'bottom'
      },
      {
        target: '[data-tour="this-month"]',
        title: 'This Month',
        content: 'This displays your commission earnings for the current month. This helps you track your monthly performance.',
        position: 'bottom'
      },
      {
        target: '[data-tour="quick-actions"]',
        title: 'Quick Actions',
        content: 'Quick access to major sections: Customers (manage your customer base), Orders (track all orders), Earnings (view commission breakdown), Margins (check your commission rates), and Promotions (access marketing materials).',
        position: 'bottom'
      },
      {
        target: '[data-tour="promotions-header"]',
        title: 'Share Promotions with Customers',
        content: 'Browse available promotional materials here. Click on any promotion to view details, copy images and messages, and share them with your customers via WhatsApp or other channels.',
        position: 'bottom'
      },
      {
        target: '[data-tour="recent-customers-header"]',
        title: 'Recent Customers',
        content: 'View your latest customer registrations here. You can see customer details, send WhatsApp invitations, and track their status (Active, Registered, or Pending).',
        position: 'bottom'
      },
      {
        target: '[data-tour="recent-orders-header"]',
        title: 'Recent Orders',
        content: 'Monitor orders from your customers here. Review order details, commission earned per order, and order status. This helps you track your earnings in real-time.',
        position: 'bottom'
      },
      {
        target: null,
        title: 'You\'re All Set!',
        content: 'Great! You\'ve learned about the dashboard. Now, go to the Promotions section and share your first promotional content with potential customers. This will help you grow your business and earn more commissions!',
        position: 'center'
      }
    ];
    this.overlay = null;
    this.tooltip = null;
    this.init();
  }

  init() {
    // Check cookie first (set by server when welcome is completed)
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    // If cookie exists, set localStorage
    if (cookies.cp_welcome_completed === 'true') {
      localStorage.setItem('cp_welcome_completed', 'true');
      // Clear cookie
      document.cookie = 'cp_welcome_completed=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    
    // Check if tour should start automatically (after welcome page)
    const welcomeCompleted = localStorage.getItem('cp_welcome_completed') === 'true';
    const tourCompleted = localStorage.getItem('cp_dashboard_tour_completed') === 'true';
    
    // If cookie is present, it means user just completed welcome page
    // Start tour regardless of previous completion status
    const cookieJustSet = cookies.cp_welcome_completed === 'true';
    
    if (cookieJustSet) {
      // User just came from welcome page - always start tour
      // Clear the tour completion flag so it can run fresh
      localStorage.removeItem('cp_dashboard_tour_completed');
      setTimeout(() => {
        this.start();
      }, 1000);
    } else if (welcomeCompleted && !tourCompleted) {
      // Fallback: if welcome was completed before and tour not completed
      setTimeout(() => {
        this.start();
      }, 1000);
    }

    // Listen for manual tour start
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-start-tour]')) {
        e.preventDefault();
        this.start();
      }
    });
  }

  start() {
    this.currentStep = 0;
    this.createOverlay();
    this.createTooltip();
    this.showStep(0);
    document.body.style.overflow = 'hidden';
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'tour-overlay';
    this.overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity';
    this.overlay.style.pointerEvents = 'auto';
    document.body.appendChild(this.overlay);
  }

  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tour-tooltip';
    this.tooltip.className = 'fixed z-50 bg-white rounded-lg shadow-2xl p-6 max-w-sm';
    this.tooltip.style.pointerEvents = 'auto';
    this.tooltip.style.display = 'block';
    this.tooltip.style.visibility = 'visible';
    this.tooltip.style.opacity = '1';
    this.tooltip.style.zIndex = '9999';
    document.body.appendChild(this.tooltip);
  }

  showStep(stepIndex) {
    const step = this.steps[stepIndex];
    
    if (!step) {
      this.end();
      return;
    }

    // Ensure tooltip is visible before updating
    if (!this.tooltip || !this.overlay) {
      return;
    }

    // Update tooltip content
    this.tooltip.innerHTML = `
      <div class="mb-4">
        <h3 class="text-lg font-bold text-gray-900 mb-2">${step.title}</h3>
        <p class="text-sm text-gray-600 leading-relaxed">${step.content}</p>
      </div>
      <div class="flex items-center justify-between pt-4 border-t border-gray-200">
        <div class="text-xs text-gray-500">
          Step ${stepIndex + 1} of ${this.steps.length}
        </div>
        <div class="flex gap-2">
          ${stepIndex > 0 ? '<button id="tour-prev" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Previous</button>' : ''}
          <button id="tour-next" class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
            ${stepIndex === this.steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
      <button id="tour-close" class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `;

    // Force tooltip to be visible
    this.tooltip.style.display = 'block';
    this.tooltip.style.visibility = 'visible';
    this.tooltip.style.opacity = '1';
    this.tooltip.style.zIndex = '9999';

    // Position tooltip
    if (step.target) {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        // Scroll element into view first
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait for scroll to complete before positioning
        setTimeout(() => {
          this.highlightElement(targetElement);
          this.positionTooltip(targetElement, step.position);
          
          // Add event listeners after positioning
          const nextBtn = document.getElementById('tour-next');
          const prevBtn = document.getElementById('tour-prev');
          const closeBtn = document.getElementById('tour-close');
          
          if (nextBtn) {
            nextBtn.addEventListener('click', () => this.next());
          }
          if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prev());
          }
          if (closeBtn) {
            closeBtn.addEventListener('click', () => this.end());
          }
        }, 300);
      } else {
        // Element not found, skip to next step
        if (this.currentStep < this.steps.length - 1) {
          this.currentStep++;
          setTimeout(() => this.showStep(this.currentStep), 500);
        } else {
          this.end();
        }
        return;
      }
    } else {
      // Final step - center tooltip
      this.highlightElement(null);
      this.positionTooltip(null, 'center');
      
      // Add event listeners
      const nextBtn = document.getElementById('tour-next');
      const prevBtn = document.getElementById('tour-prev');
      const closeBtn = document.getElementById('tour-close');
      
      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.next());
      }
      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.prev());
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.end());
      }
    }
  }

  highlightElement(element) {
    // Remove previous highlights
    const previousHighlights = document.querySelectorAll('.tour-highlight');
    previousHighlights.forEach(el => {
      el.classList.remove('tour-highlight');
      el.style.zIndex = '';
    });

    if (element) {
      element.classList.add('tour-highlight');
      element.style.zIndex = '51';
      element.style.position = 'relative';
      
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  positionTooltip(element, position) {
    if (!element && position === 'center') {
      // Center tooltip on screen
      this.tooltip.style.top = '50%';
      this.tooltip.style.left = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
      this.tooltip.style.position = 'fixed';
      this.tooltip.style.display = 'block';
      this.tooltip.style.visibility = 'visible';
      this.tooltip.style.opacity = '1';
      return;
    }

    if (!element) return;

    // Force tooltip to be visible
    this.tooltip.style.display = 'block';
    this.tooltip.style.visibility = 'visible';
    this.tooltip.style.opacity = '1';
    this.tooltip.style.position = 'fixed';
    this.tooltip.style.zIndex = '9999';

    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const spacing = 20;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top, left, transform = '';

    switch (position) {
      case 'top':
        top = rect.top - tooltipRect.height - spacing;
        left = rect.left + (rect.width / 2);
        transform = 'translateX(-50%)';
        // If tooltip would go off top, position below instead
        if (top < 10) {
          top = rect.bottom + spacing;
        }
        break;
      case 'bottom':
        top = rect.bottom + spacing;
        left = rect.left + (rect.width / 2);
        transform = 'translateX(-50%)';
        // If tooltip would go off bottom, position above instead
        if (top + tooltipRect.height > viewportHeight - 10) {
          top = rect.top - tooltipRect.height - spacing;
        }
        break;
      case 'left':
        top = rect.top + (rect.height / 2);
        left = rect.left - tooltipRect.width - spacing;
        transform = 'translateY(-50%)';
        // If tooltip would go off left, position right instead
        if (left < 10) {
          left = rect.right + spacing;
        }
        break;
      case 'right':
        top = rect.top + (rect.height / 2);
        left = rect.right + spacing;
        transform = 'translateY(-50%)';
        // If tooltip would go off right, position left instead
        if (left + tooltipRect.width > viewportWidth - 10) {
          left = rect.left - tooltipRect.width - spacing;
        }
        break;
    }

    // Ensure tooltip stays within viewport bounds
    if (left < 10) {
      left = 10;
      transform = '';
    }
    if (left + tooltipRect.width > viewportWidth - 10) {
      left = viewportWidth - tooltipRect.width - 10;
      transform = '';
    }
    if (top < 10) {
      top = 10;
    }
    if (top + tooltipRect.height > viewportHeight - 10) {
      top = viewportHeight - tooltipRect.height - 10;
    }

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.transform = transform;
  }

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.showStep(this.currentStep);
    } else {
      this.end();
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep(this.currentStep);
    }
  }

  end() {
    // Mark tour as completed
    localStorage.setItem('cp_dashboard_tour_completed', 'true');
    
    // Remove overlay and tooltip
    if (this.overlay) {
      this.overlay.remove();
    }
    if (this.tooltip) {
      this.tooltip.remove();
    }
    
    // Remove highlights
    const highlights = document.querySelectorAll('.tour-highlight');
    highlights.forEach(el => {
      el.classList.remove('tour-highlight');
      el.style.zIndex = '';
      el.style.position = '';
    });

    document.body.style.overflow = '';
  }
}

// Initialize tour when DOM is ready
let tourInstance = null;

function initTour() {
  // Wait a bit longer to ensure all elements are rendered
  setTimeout(() => {
    try {
      tourInstance = new DashboardTour();
      
      // Double-check cookie after tour instance is created (in case init() didn't catch it)
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      
      if (cookies.cp_welcome_completed === 'true') {
        localStorage.setItem('cp_welcome_completed', 'true');
        // If cookie is present, always start tour (user just came from welcome page)
        // Clear the tour completion flag so it can run fresh
        localStorage.removeItem('cp_dashboard_tour_completed');
        if (tourInstance) {
          setTimeout(() => {
            if (tourInstance) {
              tourInstance.start();
            }
          }, 1500);
        }
        // Clear cookie
        document.cookie = 'cp_welcome_completed=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      }
    } catch (error) {
      // Silently handle errors
    }
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTour);
} else {
  initTour();
}

// Expose tour instance globally for manual triggering
window.startDashboardTour = function() {
  // Clear tour completion flag to allow restart
  localStorage.removeItem('cp_dashboard_tour_completed');
  if (tourInstance) {
    tourInstance.start();
  } else {
    tourInstance = new DashboardTour();
    setTimeout(() => {
      if (tourInstance) {
        tourInstance.start();
      }
    }, 500);
  }
};

// Expose function to reset tour completion
window.resetDashboardTour = function() {
  localStorage.removeItem('cp_dashboard_tour_completed');
  localStorage.removeItem('cp_welcome_completed');
};

