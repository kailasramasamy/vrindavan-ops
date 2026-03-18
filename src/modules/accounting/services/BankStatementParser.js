import xlsx from "xlsx";

export class BankStatementParser {
  /**
   * Intelligently detect header row in bank statement
   * Looks for rows with common banking keywords
   */
  static detectHeaderRow(data) {
    const headerKeywords = ["date", "transaction", "description", "narration", "debit", "credit", "balance", "amount", "withdrawal", "deposit", "cheque", "reference", "particulars", "value date", "posting date"];

    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const nonEmptyCells = row.filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");

      if (nonEmptyCells.length < 3) continue; // Header should have at least 3 columns

      const matchCount = nonEmptyCells.filter((cell) => {
        const cellStr = String(cell).toLowerCase();
        return headerKeywords.some((keyword) => cellStr.includes(keyword));
      }).length;

      // If 3 or more cells match header keywords, this is likely the header
      if (matchCount >= 3) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Intelligent column mapping for bank statement columns
   */
  static intelligentColumnMapping(headers) {
    const mapping = {};
    const lowerHeaders = headers.map((h) =>
      String(h || "")
        .toLowerCase()
        .trim(),
    );

    const patterns = {
      transaction_date: ["date", "transaction date", "txn date", "posting date", "value date", "trans date", "value dt", "posting dt"],
      transaction_id: ["transaction id", "txn id", "reference", "ref no", "cheque no", "chq no", "serial", "sr no", "utr", "transaction reference"],
      description: ["description", "narration", "particulars", "details", "transaction details", "remarks", "transaction particulars"],
      debit_amount: ["debit", "withdrawal", "debit amount", "dr amount", "paid out", "withdrawals"],
      credit_amount: ["credit", "deposit", "credit amount", "cr amount", "paid in", "deposits"],
      balance: ["balance", "closing balance", "available balance", "bal", "closing bal"],
      // ICICI/Axis specific columns
      cr_dr_indicator: ["cr/dr", "cr / dr", "dr|cr", "dr | cr", "type", "txn type", "transaction type"],
      transaction_amount: ["transaction amount", "amount", "txn amount", "amount(inr)"],
    };

    // Match headers to fields
    lowerHeaders.forEach((header, index) => {
      for (const [field, keywords] of Object.entries(patterns)) {
        if (keywords.some((keyword) => header.includes(keyword))) {
          if (!mapping[field]) {
            // Only map first match
            mapping[field] = headers[index];
          }
        }
      }
    });

    return mapping;
  }

  /**
   * Parse bank statement file
   */
  static parseFile(filePath) {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Read all data
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

      // Detect header row
      const headerRowIndex = this.detectHeaderRow(data);

      if (headerRowIndex === -1) {
        return { success: false, error: "Could not detect header row in file" };
      }

      // Extract headers (keep original with spaces for mapping, but trim for display)
      const headerRow = data[headerRowIndex];
      const originalHeaders = headerRow;

      // Build headers array maintaining original spacing
      const headers = [];
      headerRow.forEach((h, index) => {
        if (h !== null && h !== undefined && String(h).trim() !== "") {
          headers.push(String(h)); // Keep original spacing
        }
      });

      // Extract data rows (skip header and empty rows)
      const rows = data.slice(headerRowIndex + 1).filter((row) => {
        const nonEmpty = row.filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
        return nonEmpty.length >= 3; // At least 3 columns should have data
      });

      // Map rows to objects - use exact header names including spaces
      const transactions = rows.map((row) => {
        const transaction = {};
        originalHeaders.forEach((header, index) => {
          if (header !== null && header !== undefined && String(header).trim() !== "") {
            const headerKey = String(header); // Use exact header with spaces
            transaction[headerKey] = row[index];
          }
        });
        return transaction;
      });

      // Intelligent column mapping
      const columnMapping = this.intelligentColumnMapping(headers);

      return {
        success: true,
        headers,
        transactions,
        totalRows: transactions.length,
        suggestedMapping: columnMapping,
        headerRowIndex,
      };
    } catch (error) {
      console.error("Error parsing bank statement:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove common separators and normalize text
   */
  static normalizeText(text) {
    return String(text)
      .toLowerCase()
      .replace(/[\/\-_\s\.]/g, "") // Remove separators
      .replace(/[^a-z0-9]/g, ""); // Keep only alphanumeric
  }

  /**
   * Calculate similarity score between two strings (0-1)
   */
  static similarity(str1, str2) {
    const s1 = this.normalizeText(str1);
    const s2 = this.normalizeText(str2);

    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    // Check if shorter is substring of longer
    if (longer.includes(shorter)) {
      // High confidence if shorter string is substantial (>= 8 chars) and fully contained
      if (shorter.length >= 8) {
        return 0.95;
      }
      return (shorter.length / longer.length) * 0.9;
    }

    // Check if they start with same prefix (good for truncated text)
    if (shorter.length >= 8) {
      let commonPrefix = 0;
      for (let i = 0; i < shorter.length; i++) {
        if (s1[i] === s2[i]) {
          commonPrefix++;
        } else {
          break;
        }
      }

      if (commonPrefix >= 8) {
        return (commonPrefix / shorter.length) * 0.85;
      }
    }

    // Levenshtein-like simple similarity (check for common substrings)
    let matches = 0;
    for (let i = 0; i < shorter.length - 2; i++) {
      if (longer.includes(shorter.substring(i, i + 3))) {
        matches++;
      }
    }

    return matches / (shorter.length - 2);
  }

  /**
   * Auto-match transaction to beneficiary based on description
   */
  static async autoMatchBeneficiary(description, beneficiaries) {
    if (!description || !beneficiaries || beneficiaries.length === 0) {
      return null;
    }

    const descLower = String(description).toLowerCase();
    const descNormalized = this.normalizeText(description);

    // Try exact matches first
    for (const ben of beneficiaries) {
      // Check account number (exact)
      if (ben.account_number) {
        const accNum = String(ben.account_number).toLowerCase();
        if (descLower.includes(accNum)) {
          return { beneficiary_id: ben.id, match_type: "account_number", confidence: "high" };
        }
      }

      // Check PAN number
      if (ben.pan_number) {
        const pan = String(ben.pan_number).toLowerCase();
        if (descLower.includes(pan)) {
          return { beneficiary_id: ben.id, match_type: "pan_number", confidence: "high" };
        }
      }

      // Check exact name match
      if (ben.beneficiary_name) {
        const nameLower = String(ben.beneficiary_name).toLowerCase();
        if (descLower.includes(nameLower)) {
          return { beneficiary_id: ben.id, match_type: "exact_name", confidence: "high" };
        }
      }

      // Check alias (exact)
      if (ben.alias) {
        const aliasLower = String(ben.alias).toLowerCase();
        if (descLower.includes(aliasLower)) {
          return { beneficiary_id: ben.id, match_type: "alias", confidence: "high" };
        }
      }
    }

    // Try normalized/fuzzy matches (handles spaces, separators, case, truncation)
    let bestMatch = null;
    let bestScore = 0;

    for (const ben of beneficiaries) {
      // Check if alias/name appears in description (full or partial, normalized)
      if (ben.alias) {
        const aliasNormalized = this.normalizeText(ben.alias);

        // Full match
        if (aliasNormalized.length >= 8 && descNormalized.includes(aliasNormalized)) {
          return { beneficiary_id: ben.id, match_type: "alias_substring", confidence: "high" };
        }

        // Check if description contains truncated alias (at least 70% of alias, min 8 chars)
        if (aliasNormalized.length >= 10) {
          for (let percent = 1.0; percent >= 0.7; percent -= 0.05) {
            const truncLength = Math.floor(aliasNormalized.length * percent);
            if (truncLength >= 8) {
              const truncated = aliasNormalized.substring(0, truncLength);
              if (descNormalized.includes(truncated)) {
                return { beneficiary_id: ben.id, match_type: "alias_truncated", confidence: percent > 0.85 ? "high" : "medium" };
              }
            }
          }
        }

        // REVERSE CHECK: Check if alias starts with a substring from description
        // Common in bank statements where beneficiary names are truncated
        // Example: "INDUSPPKONALDOD" in description matches start of "IndusPPKonaldoddiPreetham"
        if (aliasNormalized.length >= 10) {
          // Extract potential beneficiary name segments from description (min 8 chars)
          const segments = descNormalized.match(/[a-z]{8,}/g) || [];
          for (const segment of segments) {
            if (segment.length >= 8 && aliasNormalized.startsWith(segment)) {
              const matchPercent = segment.length / aliasNormalized.length;
              // Accept if segment is at least 50% of alias and 8+ chars
              if (matchPercent >= 0.5) {
                return {
                  beneficiary_id: ben.id,
                  match_type: "alias_prefix_match",
                  confidence: matchPercent > 0.7 ? "high" : "medium",
                };
              }
            }
          }
        }

        // Fuzzy similarity
        const score = this.similarity(description, ben.alias);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestMatch = { beneficiary_id: ben.id, match_type: "fuzzy_alias", confidence: score > 0.9 ? "high" : "medium" };
        }
      }

      if (ben.beneficiary_name) {
        const nameNormalized = this.normalizeText(ben.beneficiary_name);

        // Full match
        if (nameNormalized.length >= 10 && descNormalized.includes(nameNormalized)) {
          return { beneficiary_id: ben.id, match_type: "name_substring", confidence: "high" };
        }

        // Check if description contains truncated name (at least 70% of name, min 10 chars)
        if (nameNormalized.length >= 12) {
          for (let percent = 1.0; percent >= 0.7; percent -= 0.05) {
            const truncLength = Math.floor(nameNormalized.length * percent);
            if (truncLength >= 10) {
              const truncated = nameNormalized.substring(0, truncLength);
              if (descNormalized.includes(truncated)) {
                return { beneficiary_id: ben.id, match_type: "name_truncated", confidence: percent > 0.85 ? "high" : "medium" };
              }
            }
          }
        }

        // REVERSE CHECK: Check if name starts with a substring from description
        if (nameNormalized.length >= 12) {
          const segments = descNormalized.match(/[a-z]{10,}/g) || [];
          for (const segment of segments) {
            if (segment.length >= 10 && nameNormalized.startsWith(segment)) {
              const matchPercent = segment.length / nameNormalized.length;
              if (matchPercent >= 0.5) {
                return {
                  beneficiary_id: ben.id,
                  match_type: "name_prefix_match",
                  confidence: matchPercent > 0.7 ? "high" : "medium",
                };
              }
            }
          }
        }

        // Fuzzy similarity
        const score = this.similarity(description, ben.beneficiary_name);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestMatch = { beneficiary_id: ben.id, match_type: "fuzzy_name", confidence: score > 0.9 ? "high" : "medium" };
        }
      }
    }

    // Return best fuzzy match if found
    if (bestMatch) {
      return bestMatch;
    }

    // Try partial name word matches (last resort)
    for (const ben of beneficiaries) {
      if (ben.beneficiary_name) {
        const nameParts = String(ben.beneficiary_name)
          .toLowerCase()
          .split(/[\s\-_]+/);
        const matchedParts = nameParts.filter((part) => part.length > 4 && descLower.includes(part));

        if (matchedParts.length >= 2) {
          return { beneficiary_id: ben.id, match_type: "partial_words", confidence: "medium" };
        }
      }

      if (ben.alias) {
        const aliasParts = String(ben.alias)
          .toLowerCase()
          .split(/[\s\-_]+/);
        const matchedParts = aliasParts.filter((part) => part.length > 4 && descLower.includes(part));

        if (matchedParts.length >= 2) {
          return { beneficiary_id: ben.id, match_type: "partial_alias_words", confidence: "medium" };
        }
      }
    }

    return null;
  }

  /**
   * Auto-match transaction to remitter based on description (for CREDIT transactions)
   * Similar algorithm to autoMatchBeneficiary but for incoming payments
   */
  static async autoMatchRemitter(description, remitters) {
    if (!description || !remitters || remitters.length === 0) {
      return null;
    }

    const descLower = String(description).toLowerCase();
    const descNormalized = this.normalizeText(description);

    // Try exact matches first
    for (const rem of remitters) {
      // Check account number (exact) - Note: Often not available for credits in India
      if (rem.account_number) {
        const accNum = String(rem.account_number).toLowerCase();
        if (descLower.includes(accNum)) {
          return { remitter_id: rem.id, match_type: "account_number", confidence: "high" };
        }
      }

      // Check PAN number
      if (rem.pan_number) {
        const pan = String(rem.pan_number).toLowerCase();
        if (descLower.includes(pan)) {
          return { remitter_id: rem.id, match_type: "pan_number", confidence: "high" };
        }
      }

      // Check exact name match
      if (rem.remitter_name) {
        const nameLower = String(rem.remitter_name).toLowerCase();
        if (descLower.includes(nameLower)) {
          return { remitter_id: rem.id, match_type: "exact_name", confidence: "high" };
        }
      }

      // Check alias (exact)
      if (rem.alias) {
        const aliasLower = String(rem.alias).toLowerCase();
        if (descLower.includes(aliasLower)) {
          return { remitter_id: rem.id, match_type: "alias", confidence: "high" };
        }
      }
    }

    // Try normalized/fuzzy matches (handles spaces, separators, case, truncation)
    let bestMatch = null;
    let bestScore = 0;

    for (const rem of remitters) {
      // Check if alias/name appears in description (full or partial, normalized)
      if (rem.alias) {
        const aliasNormalized = this.normalizeText(rem.alias);

        // Full match
        if (aliasNormalized.length >= 8 && descNormalized.includes(aliasNormalized)) {
          return { remitter_id: rem.id, match_type: "alias_substring", confidence: "high" };
        }

        // Check if description contains truncated alias (at least 70% of alias, min 8 chars)
        if (aliasNormalized.length >= 10) {
          for (let percent = 1.0; percent >= 0.7; percent -= 0.05) {
            const truncLength = Math.floor(aliasNormalized.length * percent);
            if (truncLength >= 8) {
              const truncated = aliasNormalized.substring(0, truncLength);
              if (descNormalized.includes(truncated)) {
                return { remitter_id: rem.id, match_type: "alias_truncated", confidence: percent > 0.85 ? "high" : "medium" };
              }
            }
          }
        }

        // REVERSE CHECK: Check if alias starts with a substring from description
        if (aliasNormalized.length >= 10) {
          const segments = descNormalized.match(/[a-z]{8,}/g) || [];
          for (const segment of segments) {
            if (segment.length >= 8 && aliasNormalized.startsWith(segment)) {
              const matchPercent = segment.length / aliasNormalized.length;
              if (matchPercent >= 0.5) {
                return {
                  remitter_id: rem.id,
                  match_type: "alias_prefix_match",
                  confidence: matchPercent > 0.7 ? "high" : "medium",
                };
              }
            }
          }
        }

        // Fuzzy similarity
        const score = this.similarity(description, rem.alias);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestMatch = { remitter_id: rem.id, match_type: "fuzzy_alias", confidence: score > 0.9 ? "high" : "medium" };
        }
      }

      if (rem.remitter_name) {
        const nameNormalized = this.normalizeText(rem.remitter_name);

        // Full match
        if (nameNormalized.length >= 10 && descNormalized.includes(nameNormalized)) {
          return { remitter_id: rem.id, match_type: "name_substring", confidence: "high" };
        }

        // Check if description contains truncated name (at least 70% of name, min 10 chars)
        if (nameNormalized.length >= 12) {
          for (let percent = 1.0; percent >= 0.7; percent -= 0.05) {
            const truncLength = Math.floor(nameNormalized.length * percent);
            if (truncLength >= 10) {
              const truncated = nameNormalized.substring(0, truncLength);
              if (descNormalized.includes(truncated)) {
                return { remitter_id: rem.id, match_type: "name_truncated", confidence: percent > 0.85 ? "high" : "medium" };
              }
            }
          }
        }

        // REVERSE CHECK: Check if name starts with a substring from description
        if (nameNormalized.length >= 12) {
          const segments = descNormalized.match(/[a-z]{10,}/g) || [];
          for (const segment of segments) {
            if (segment.length >= 10 && nameNormalized.startsWith(segment)) {
              const matchPercent = segment.length / nameNormalized.length;
              if (matchPercent >= 0.5) {
                return {
                  remitter_id: rem.id,
                  match_type: "name_prefix_match",
                  confidence: matchPercent > 0.7 ? "high" : "medium",
                };
              }
            }
          }
        }

        // Fuzzy similarity
        const score = this.similarity(description, rem.remitter_name);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestMatch = { remitter_id: rem.id, match_type: "fuzzy_name", confidence: score > 0.9 ? "high" : "medium" };
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // Try partial name word matches (last resort)
    for (const rem of remitters) {
      if (rem.remitter_name) {
        const nameParts = String(rem.remitter_name)
          .toLowerCase()
          .split(/[\s\-_]+/);
        const matchedParts = nameParts.filter((part) => part.length > 4 && descLower.includes(part));

        if (matchedParts.length >= 2) {
          return { remitter_id: rem.id, match_type: "partial_words", confidence: "medium" };
        }
      }

      if (rem.alias) {
        const aliasParts = String(rem.alias)
          .toLowerCase()
          .split(/[\s\-_]+/);
        const matchedParts = aliasParts.filter((part) => part.length > 4 && descLower.includes(part));

        if (matchedParts.length >= 2) {
          return { remitter_id: rem.id, match_type: "partial_alias_words", confidence: "medium" };
        }
      }
    }

    return null;
  }

  /**
   * Auto-fill narration from past similar transactions
   * Works for both debit (beneficiary) and credit (remitter) transactions
   */
  static autoFillNarration(transaction, pastTransactions) {
    if (!pastTransactions || pastTransactions.length === 0) {
      return null;
    }

    const txnBeneficiaryId = transaction.beneficiary_id;
    const txnRemitterId = transaction.remitter_id;
    const txnDescription = this.normalizeText(transaction.description || "");
    const txnAmount = transaction.debit_amount > 0 ? transaction.debit_amount : transaction.credit_amount;
    const isDebit = transaction.debit_amount > 0;

    let bestMatch = null;
    let bestScore = 0;

    for (const past of pastTransactions) {
      let score = 0;

      // Same beneficiary/remitter (highest priority)
      // For debit transactions, match by beneficiary; for credit transactions, match by remitter
      const matchesPayer = isDebit ? txnBeneficiaryId && past.beneficiary_id === txnBeneficiaryId : txnRemitterId && past.remitter_id === txnRemitterId;

      if (matchesPayer) {
        score += 50;

        // Same description (very high confidence)
        if (past.description && transaction.description) {
          const pastDesc = this.normalizeText(past.description);
          if (pastDesc === txnDescription) {
            score += 40;
          } else if (txnDescription.includes(pastDesc) || pastDesc.includes(txnDescription)) {
            score += 30;
          } else {
            const similarity = this.similarity(transaction.description, past.description);
            if (similarity > 0.7) {
              score += Math.floor(similarity * 20);
            }
          }
        }

        // Similar amount (±10%)
        const pastAmount = past.debit_amount > 0 ? past.debit_amount : past.credit_amount;
        const pastIsDebit = past.debit_amount > 0;

        if (isDebit === pastIsDebit) {
          score += 5;
          const amountDiff = Math.abs(txnAmount - pastAmount) / Math.max(txnAmount, pastAmount);
          if (amountDiff <= 0.1) {
            score += 10;
          } else if (amountDiff <= 0.2) {
            score += 5;
          }
        }
      } else {
        // Different beneficiary - only match if description is very similar
        if (past.description && transaction.description) {
          const pastDesc = this.normalizeText(past.description);
          if (pastDesc === txnDescription && pastDesc.length >= 20) {
            score += 60; // Exact description match
          } else {
            const similarity = this.similarity(transaction.description, past.description);
            if (similarity > 0.85 && pastDesc.length >= 15) {
              score += Math.floor(similarity * 40);
            }
          }
        }
      }

      // Update best match
      if (score > bestScore && score >= 50) {
        // Minimum threshold of 50
        bestScore = score;
        bestMatch = {
          narration: past.narration,
          category_id: past.category_id,
          payment_mode: past.payment_mode,
          confidence: score >= 80 ? "high" : score >= 60 ? "medium" : "low",
          score: score,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Parse amount from string (handles Indian number format)
   */
  static parseAmount(value) {
    if (!value) return 0;

    // Remove currency symbols and commas
    const cleaned = String(value)
      .replace(/[₹$,\s]/g, "")
      .trim();

    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : Math.abs(amount);
  }

  /**
   * Parse date from various formats including Excel serial dates
   */
  static parseDate(value) {
    if (!value) return null;

    try {
      // Handle Excel serial date numbers (e.g., 45667 = 2025-01-01)
      if (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()))) {
        const numValue = typeof value === "number" ? value : parseFloat(value);

        // Excel dates are days since 1900-01-01 (with 1900 leap year bug)
        if (numValue > 1 && numValue < 100000) {
          const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
          const date = new Date(excelEpoch.getTime() + numValue * 86400000);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split("T")[0];
          }
        }
      }

      const dateStr = String(value).trim();

      // Handle DD/MM/YYYY or DD-MM-YYYY
      if (dateStr.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/)) {
        const parts = dateStr.split(/[\/\-]/);
        const day = parts[0].padStart(2, "0");
        const month = parts[1].padStart(2, "0");
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }

      // Handle YYYY-MM-DD
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return dateStr.split(" ")[0];
      }

      // Try standard parsing
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }

      return null;
    } catch (e) {
      console.warn(`Failed to parse date: ${value}`, e);
      return null;
    }
  }

  /**
   * Detect bank type from statement
   */
  static detectBankType(data) {
    const firstRows = data.slice(0, 15).flat().join(" ").toLowerCase();

    if (firstRows.includes("icici") || firstRows.includes("icicibank")) {
      return "ICICI";
    }
    if (firstRows.includes("axis") || firstRows.includes("axisbank") || firstRows.includes("axis bank")) {
      return "AXIS";
    }
    if (firstRows.includes("hdfc") || firstRows.includes("hdfcbank")) {
      return "HDFC";
    }
    if (firstRows.includes("sbi") || firstRows.includes("state bank")) {
      return "SBI";
    }

    return "UNKNOWN";
  }
}
