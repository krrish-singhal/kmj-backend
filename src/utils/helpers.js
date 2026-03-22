/**
 * Helper utility functions
 */

/**
 * Generate Member ID (Ward/HouseNo format)
 * @param {string} ward - Ward number
 * @param {string} houseNo - House number
 * @returns {string} Member ID (e.g., "1/74")
 */
export const generateMemberId = (ward, houseNo) => {
  return `${ward}/${houseNo}`;
};

/**
 * Parse Member ID to get ward and house number
 * @param {string} memberId - Member ID (e.g., "1/74")
 * @returns {object} { ward, houseNo }
 */
export const parseMemberId = (memberId) => {
  const [ward, houseNo] = memberId.split('/');
  return { ward, houseNo };
};

/**
 * Calculate age from date of birth
 * @param {Date} dob - Date of birth
 * @returns {number} Age in years
 */
export const calculateAge = (dob) => {
  if (!dob) return 0;
  
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Format date to display format
 * @param {Date} date - Date object
 * @param {string} format - Format string (default: 'DD/MM/YYYY')
 * @returns {string} Formatted date
 */
export const formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return '';
  
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

/**
 * Get current financial year
 * @returns {string} Financial year (e.g., "2024-25")
 */
export const getCurrentFinancialYear = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  
  // Financial year starts from April
  if (currentMonth >= 4) {
    return `${currentYear}-${String(currentYear + 1).slice(2)}`;
  } else {
    return `${currentYear - 1}-${String(currentYear).slice(2)}`;
  }
};

/**
 * Sanitize string (remove special characters)
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
export const sanitizeString = (str) => {
  if (!str) return '';
  return str.trim().replace(/[<>]/g, '');
};

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
export const generateRandomString = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Check if string is valid email
 * @param {string} email - Email string
 * @returns {boolean} True if valid
 */
export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Check if string is valid phone number (Indian format)
 * @param {string} phone - Phone number
 * @returns {boolean} True if valid
 */
export const isValidPhone = (phone) => {
  const regex = /^[6-9]\d{9}$/;
  return regex.test(phone);
};

/**
 * Check if string is valid Aadhaar number
 * @param {string} aadhaar - Aadhaar number
 * @returns {boolean} True if valid
 */
export const isValidAadhaar = (aadhaar) => {
  const regex = /^\d{12}$/;
  return regex.test(aadhaar);
};

/**
 * Paginate array
 * @param {Array} array - Input array
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {object} { data, total, page, pages }
 */
export const paginate = (array, page = 1, limit = 20) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  return {
    data: array.slice(startIndex, endIndex),
    total: array.length,
    page: page,
    pages: Math.ceil(array.length / limit),
  };
};

/**
 * Create pagination metadata
 * @param {number} total - Total items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object} Pagination metadata
 */
export const createPaginationMeta = (total, page, limit) => {
  const pages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
};

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Deep clone object
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Remove empty values from object
 * @param {object} obj - Input object
 * @returns {object} Cleaned object
 */
export const removeEmpty = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null && v !== '')
  );
};

/**
 * Capitalize first letter
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Generate slug from string
 * @param {string} str - Input string
 * @returns {string} Slug
 */
export const slugify = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default {
  generateMemberId,
  parseMemberId,
  calculateAge,
  formatDate,
  getCurrentFinancialYear,
  sanitizeString,
  generateRandomString,
  isValidEmail,
  isValidPhone,
  isValidAadhaar,
  paginate,
  createPaginationMeta,
  sleep,
  deepClone,
  removeEmpty,
  capitalize,
  slugify,
};
