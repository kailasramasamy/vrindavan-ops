/**
 * Format number in Indian Lakh numbering system
 * Example: 1427835 -> 14,27,835
 *
 * Indian numbering format:
 * - First comma after 3 digits from right (thousands)
 * - Then commas every 2 digits (lakhs, crores, etc.)
 */
function formatIndianNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return "0";
  }

  // Convert to number and round
  num = Math.round(Number(num));

  // Handle negative numbers
  const isNegative = num < 0;
  num = Math.abs(num);

  // Convert to string
  let numStr = num.toString();

  // If less than 1000, no formatting needed
  if (numStr.length <= 3) {
    return isNegative ? "-" + numStr : numStr;
  }

  // Split into last 3 digits and remaining
  const lastThree = numStr.substring(numStr.length - 3);
  const otherDigits = numStr.substring(0, numStr.length - 3);

  // Format remaining digits with commas every 2 digits
  let formatted = "";
  let count = 0;

  for (let i = otherDigits.length - 1; i >= 0; i--) {
    if (count === 2) {
      formatted = "," + formatted;
      count = 0;
    }
    formatted = otherDigits[i] + formatted;
    count++;
  }

  // Combine
  const result = formatted + "," + lastThree;
  return isNegative ? "-" + result : result;
}

/**
 * Format currency in Indian Lakh format with Rupee symbol
 */
function formatIndianCurrency(num) {
  return "₹" + formatIndianNumber(num);
}

// Make functions available globally
if (typeof window !== "undefined") {
  window.formatIndianNumber = formatIndianNumber;
  window.formatIndianCurrency = formatIndianCurrency;
}
