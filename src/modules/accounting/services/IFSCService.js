import fetch from "node-fetch";

export class IFSCService {
  /**
   * Fetch bank details from IFSC code using RazorPay's public API
   * @param {string} ifscCode - IFSC code (e.g., BARB0DBNRGA)
   * @returns {Promise<Object>} Bank details including name, branch, address, etc.
   */
  static async getBankDetails(ifscCode) {
    if (!ifscCode || typeof ifscCode !== "string") {
      return { success: false, error: "Invalid IFSC code" };
    }

    // Clean and validate IFSC code
    const cleanIFSC = ifscCode.trim().toUpperCase();
    if (cleanIFSC.length !== 11) {
      return { success: false, error: "IFSC code must be 11 characters" };
    }

    try {
      const url = `https://ifsc.razorpay.com/${cleanIFSC}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Vrindavan-Accounting/1.0",
        },
        timeout: 5000, // 5 second timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: "IFSC code not found" };
        }
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();

      // Extract relevant details
      return {
        success: true,
        data: {
          ifsc: data.IFSC,
          bank_name: data.BANK || null,
          branch: data.BRANCH || null,
          address: data.ADDRESS || null,
          city: data.CITY || null,
          district: data.DISTRICT || null,
          state: data.STATE || null,
          contact: data.CONTACT || null,
          micr: data.MICR || null,
        },
      };
    } catch (error) {
      console.error(`Error fetching IFSC details for ${cleanIFSC}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch bank details for multiple IFSC codes with rate limiting
   * @param {Array<string>} ifscCodes - Array of IFSC codes
   * @param {number} delayMs - Delay between requests in milliseconds (default: 100ms)
   * @returns {Promise<Object>} Map of IFSC codes to bank details
   */
  static async getBankDetailsMultiple(ifscCodes, delayMs = 100) {
    const results = {};
    const uniqueIFSCs = [...new Set(ifscCodes.filter((code) => code && code.trim()))];

    for (const ifsc of uniqueIFSCs) {
      const result = await IFSCService.getBankDetails(ifsc);
      results[ifsc] = result;

      // Add delay to avoid rate limiting
      if (delayMs > 0 && uniqueIFSCs.indexOf(ifsc) < uniqueIFSCs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Extract bank name from IFSC code (first 4 characters)
   * Fallback when API is unavailable
   */
  static getBankCodeFromIFSC(ifscCode) {
    if (!ifscCode || typeof ifscCode !== "string") {
      return null;
    }
    const bankCode = ifscCode.trim().substring(0, 4).toUpperCase();

    // Common bank codes mapping
    const bankCodes = {
      SBIN: "State Bank of India",
      ICIC: "ICICI Bank",
      HDFC: "HDFC Bank",
      UTIB: "Axis Bank",
      KKBK: "Kotak Mahindra Bank",
      IDIB: "Indian Bank",
      BARB: "Bank of Baroda",
      PUNB: "Punjab National Bank",
      UBIN: "Union Bank of India",
      CNRB: "Canara Bank",
      IOBA: "Indian Overseas Bank",
      ALLA: "Allahabad Bank",
      MAHB: "Bank of Maharashtra",
      INDB: "IndusInd Bank",
      YESB: "Yes Bank",
      FDRL: "Federal Bank",
      KARB: "Karnataka Bank",
      CBIN: "Central Bank of India",
      CORP: "Corporation Bank",
      ANDB: "Andhra Bank",
    };

    return bankCodes[bankCode] || `${bankCode} Bank`;
  }
}
