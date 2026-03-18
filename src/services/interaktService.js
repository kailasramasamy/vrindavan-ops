// src/services/interaktService.js
/**
 * Interakt WhatsApp API Service
 * Sends template messages via Interakt API
 * Based on working implementation from vrindavan_v1 project
 */

import pool from "../modules/community-partner/config/database.js";

const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY;
const INTERAKT_API_URL = process.env.INTERAKT_API_URL || "https://api.interakt.ai/v1";
const INTERAKT_WORKSPACE_ID = process.env.INTERAKT_WORKSPACE_ID;

/**
 * Get WhatsApp notification settings from database
 * @returns {Promise<Object>} Settings object with notification toggles
 */
async function getWhatsAppSettings() {
  try {
    const [rows] = await pool.execute(
      "SELECT setting_value FROM cp_admin_settings WHERE setting_key = ?",
      ["whatsapp_notifications"]
    );

    if (rows.length > 0) {
      const settingValue = rows[0].setting_value;
      if (typeof settingValue === "string") {
        return JSON.parse(settingValue);
      }
      return settingValue;
    }

    // Default settings if not found
    return {
      cp_customer_registered: true,
      cp_new_promotion_alert: true,
      cp_new_ticket_admin_notification: true,
    };
  } catch (error) {
    console.error("Error loading WhatsApp settings:", error);
    // Return default settings on error
    return {
      cp_customer_registered: true,
      cp_new_promotion_alert: true,
      cp_new_ticket_admin_notification: true,
    };
  }
}

/**
 * Send a WhatsApp template message via Interakt
 * @param {string} phoneNumber - Recipient phone number (10 digits, without country code)
 * @param {string} templateName - Template name (e.g., 'cp_customer_registered')
 * @param {Object} templateParams - Template parameters/placeholders
 * @returns {Promise<Object>} API response
 */
export async function sendInteraktTemplate(phoneNumber, templateName, templateParams = {}) {
  if (!INTERAKT_API_KEY) {
    console.warn("Interakt API key not configured. Skipping Interakt message.");
    return { success: false, error: "Interakt API key not configured" };
  }

  if (!phoneNumber) {
    console.warn("Phone number not provided. Skipping Interakt message.");
    return { success: false, error: "Phone number required" };
  }

  // Format phone number (remove spaces, hyphens, etc., ensure 10 digits)
  let cleaned = String(phoneNumber).replace(/[\s\-\(\)]/g, "");
  
  // If starts with 0, remove it (Indian number)
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove any existing +91 or 91 prefix to normalize
  cleaned = cleaned.replace(/^\+91/, "").replace(/^91/, "");

  if (cleaned.length !== 10) {
    console.warn(`Invalid phone number format: ${phoneNumber}. Expected 10 digits.`);
    return { success: false, error: "Invalid phone number format" };
  }

  try {
    // Extract body values from templateParams
    // If bodyValues is already an array, use it directly (for ordered parameters)
    // Otherwise, build from individual params
    let bodyValues = [];
    if (Array.isArray(templateParams.bodyValues)) {
      bodyValues = templateParams.bodyValues;
    } else {
      // Build array from individual params (for backward compatibility)
      if (templateParams.cpName) bodyValues.push(templateParams.cpName);
      if (templateParams.customerName) bodyValues.push(templateParams.customerName);
      if (templateParams.customerPhone) bodyValues.push(templateParams.customerPhone);
      // Add any other template parameters in order
    }

    // Build request payload (matching working implementation)
    const payload = {
      countryCode: "+91",
      phoneNumber: cleaned, // 10 digits without country code
      callbackData: `cp_customer_registered_${Date.now()}`,
      type: "Template",
      template: {
        name: templateName,
        languageCode: "en",
        headerValues: [],
        bodyValues: bodyValues,
        buttonValues: {}, // Empty object, not array (as per working implementation)
      },
    };

    // Add workspace ID if provided
    if (INTERAKT_WORKSPACE_ID) {
      payload.workspaceId = INTERAKT_WORKSPACE_ID;
    }
    
    // Endpoint from working implementation
    const endpoint = `${INTERAKT_API_URL}/public/message/`;

    // Auth method from working implementation: 'basic-simple' (just API key, not base64 encoded)
    const authMethod = process.env.INTERAKT_AUTH_METHOD || "basic-simple";
    const headers = {
      "Content-Type": "application/json",
    };

    // Set authentication header based on method (matching working implementation)
    if (authMethod === "basic") {
      // HTTP Basic Authentication - encode api_key as username with empty password
      headers["Authorization"] = `Basic ${Buffer.from(INTERAKT_API_KEY + ":").toString("base64")}`;
    } else if (authMethod === "basic-simple") {
      // Simple Basic auth - just the API key (works with Interakt API)
      headers["Authorization"] = `Basic ${INTERAKT_API_KEY}`;
    } else if (authMethod === "bearer") {
      headers["Authorization"] = `Bearer ${INTERAKT_API_KEY}`;
    } else {
      // Default: X-API-Key header
      headers["X-API-Key"] = INTERAKT_API_KEY;
    }

    let response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    // Check content type before trying to parse
    const contentType = response.headers.get("content-type") || "";
    let result;
    
    if (contentType.includes("application/json")) {
      try {
        result = await response.json();
      } catch (parseError) {
        // If JSON parsing fails, read as text
        const text = await response.text();
        console.error("Failed to parse Interakt API JSON response:", parseError.message);
        return { 
          success: false, 
          error: `Failed to parse JSON response (status: ${response.status})`,
          details: { status: response.status, statusText: response.statusText, body: text.substring(0, 500) }
        };
      }
    } else {
      // If not JSON, read as text to see what we got
      const text = await response.text();
      
      // If it's a 401, try Bearer auth as fallback
      if (response.status === 401) {
        const bearerHeaders = { ...headers };
        bearerHeaders["Authorization"] = `Bearer ${INTERAKT_API_KEY}`;
        const bearerResponse = await fetch(endpoint, {
          method: "POST",
          headers: bearerHeaders,
          body: JSON.stringify(payload),
        });
        
        const bearerContentType = bearerResponse.headers.get("content-type") || "";
        if (bearerContentType.includes("application/json")) {
          result = await bearerResponse.json();
          response = bearerResponse; // Use the bearer response for status check
        } else {
          const bearerText = await bearerResponse.text();
          console.error("Interakt API authentication failed with both Basic and Bearer auth");
          return { 
            success: false, 
            error: `Authentication failed with both Basic and Bearer auth (status: ${bearerResponse.status})`,
            details: { 
              status: bearerResponse.status, 
              body: bearerText.substring(0, 500),
              endpoint: endpoint,
            }
          };
        }
      } else {
        console.error("Interakt API returned non-JSON response:", response.status, response.statusText);
        return { 
          success: false, 
          error: `API returned non-JSON response (status: ${response.status})`,
          details: { status: response.status, statusText: response.statusText, body: text.substring(0, 500) }
        };
      }
    }

    if (!response.ok) {
      console.error("Interakt API error:", result?.message || "Unknown error");
      return { success: false, error: result.message || "Failed to send Interakt message", details: result };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("Error sending Interakt template:", error.message);
    return { success: false, error: error.message || "Failed to send Interakt message" };
  }
}

/**
 * Send CP customer registered notification
 * @param {string} cpPhoneNumber - CP phone number (10 digits)
 * @param {Object} customerData - Customer data (name, phone, cpName, etc.)
 * @returns {Promise<Object>} API response
 */
export async function notifyCPCustomerRegistered(cpPhoneNumber, customerData) {
  // Check if notification is enabled
  const settings = await getWhatsAppSettings();
  if (!settings.cp_customer_registered) {
    console.log("WhatsApp notification 'cp_customer_registered' is disabled. Skipping message.");
    return { success: false, error: "Notification is disabled in settings" };
  }

  const templateName = process.env.INTERAKT_TEMPLATE_CP_CUSTOMER_REGISTERED || "cp_customer_registered";

  // Template expects 3 body values in order: [CP name, Customer name, Customer phone]
  // If customer name is not given, use "N/A"
  const cpName = customerData.cp_name || customerData.cpName || "Community Partner";
  const customerName = customerData.customer_name || customerData.name || "N/A";
  const customerPhone = customerData.customer_phone || customerData.phone || "";

  // Pass bodyValues as an array in the correct order
  const templateParams = {
    bodyValues: [cpName, customerName, customerPhone],
  };

  return await sendInteraktTemplate(cpPhoneNumber, templateName, templateParams);
}

/**
 * Send CP new promotion alert notification
 * @param {string} cpPhoneNumber - CP phone number (10 digits)
 * @param {Object} promotionData - Promotion data (title, cpName, etc.)
 * @returns {Promise<Object>} API response
 */
export async function notifyCPNewPromotion(cpPhoneNumber, promotionData) {
  // Check if notification is enabled
  const settings = await getWhatsAppSettings();
  if (!settings.cp_new_promotion_alert) {
    console.log("WhatsApp notification 'cp_new_promotion_alert' is disabled. Skipping message.");
    return { success: false, error: "Notification is disabled in settings" };
  }

  const templateName = process.env.INTERAKT_TEMPLATE_CP_NEW_PROMOTION_ALERT || "cp_new_promotion_alert";

  // Template expects 2 body values in order: [CP name, Promotion title]
  const cpName = promotionData.cp_name || promotionData.cpName || "Community Partner";
  const promotionTitle = promotionData.title || promotionData.promotion_title || "New Promotion";

  // Pass bodyValues as an array in the correct order
  const templateParams = {
    bodyValues: [cpName, promotionTitle],
  };

  return await sendInteraktTemplate(cpPhoneNumber, templateName, templateParams);
}

/**
 * Send admin new ticket notification
 * @param {string} adminPhoneNumber - Admin phone number (10 digits)
 * @param {Object} ticketData - Ticket data (ticket_number, subject, cpName, etc.)
 * @returns {Promise<Object>} API response
 */
export async function notifyAdminNewTicket(adminPhoneNumber, ticketData) {
  // Check if notification is enabled
  const settings = await getWhatsAppSettings();
  if (!settings.cp_new_ticket_admin_notification) {
    console.log("WhatsApp notification 'cp_new_ticket_admin_notification' is disabled. Skipping message.");
    return { success: false, error: "Notification is disabled in settings" };
  }

  const templateName = process.env.INTERAKT_TEMPLATE_CP_NEW_ADMIN_NOTIFICATION || "cp_new_ticket_admin_notification";

  // Template expects 5 body values in order: [CP name, Ticket ID, Subject, Priority, Link]
  const cpName = ticketData.cp_name || ticketData.cpName || "Community Partner";
  const ticketNumber = ticketData.ticket_number || ticketData.ticketNumber || "";
  const subject = ticketData.subject || "New Ticket";
  const priority = ticketData.priority || "medium";
  const ticketLink = ticketData.ticket_link || ticketData.ticketLink || "";

  // Pass bodyValues as an array in the correct order: [CP name, Ticket ID, Subject, Priority, Link]
  const templateParams = {
    bodyValues: [cpName, ticketNumber, subject, priority, ticketLink],
  };

  return await sendInteraktTemplate(adminPhoneNumber, templateName, templateParams);
}

