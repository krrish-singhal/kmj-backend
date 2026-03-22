/**
 * Application Constants
 */

// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
};

// Bill Categories
export const BILL_CATEGORIES = {
  JAMAATH: 'Jamaath',
  MADRASSA: 'Madrassa',
  LAND: 'Land',
  NERCHA: 'Nercha',
  SADHU: 'Sadhu',
};

// Jamaath Account Types
export const JAMAATH_TYPES = {
  DUA_FRIDAY: 'Dua_Friday',
  DONATION: 'Donation',
  SUNNATH_FEE: 'Sunnath Fee',
  MARRIAGE_FEE: 'Marriage Fee',
  PRODUCT_TURNOVER: 'Product Turnover',
  RENTAL_BASIS: 'Rental_Basis',
  DEVOTIONAL: 'Devotional Dedication',
  DEAD_FEE: 'Dead Fee',
  NEW_MEMBERSHIP: 'New Membership',
  CERTIFICATE_FEE: 'Certificate Fee',
  EID_UL_ADHA: 'Eid ul Adha',
  EID_AL_FITR: 'Eid al-Fitr',
};

// Madrassa Account Types
export const MADRASSA_TYPES = {
  ADMISSION: 'Admission Fee',
  MONTHLY: 'Monthly Fee',
  ANNUAL: 'Annual Fee',
  EXAM: 'Exam Fee',
  DONATION: 'Donation',
};

// Land Account Types
export const LAND_TYPES = {
  LAND_MAINTENANCE: 'Land & Maintenance',
  BUILDING_MAINTENANCE: 'Building & Maintenance',
  RENOVATION: 'Renovation',
};

// Account Categories for Discriminators
export const ACCOUNT_CATEGORIES_LAND = {
  LAND_MAINTENANCE: 'Land & Maintenance',
  BUILDING_MAINTENANCE: 'Building & Maintenance',
  RENOVATION: 'Renovation',
};

export const ACCOUNT_CATEGORIES_MADRASSA = {
  ADMISSION: 'Admission Fee',
  MONTHLY: 'Monthly Fee',
  ANNUAL: 'Anual Fee', // Keep original spelling from database
  EXAM: 'Exam Fee',
  DONATION: 'Madrassa Donation',
  OTHERS: 'Madrassa Others',
  MADRASSA: 'Madrassa', // From database
};

// Nercha Account Types
export const NERCHA_TYPES = {
  RAMADHAN: 'Ramadhan',
  RAVU_27: '27_Ravu',
  MELADHUN_NABI: 'Meladhun Nabi',
  OTHERS: 'Others',
};

export const ACCOUNT_CATEGORIES_NERCHA = {
  RAMADHAN: 'Ramadhan',
  RAVU_27: '27_Ravu',
  MELADHUN_NABI: 'Meladhun Nabi',
  OTHERS: 'Others',
};

// Sadhu Account Types
export const SADHU_TYPES = {
  SADHU_SAHAYAM: 'Sadhu Sahayam',
  OTHERS: 'Others',
};

export const ACCOUNT_CATEGORIES_SADHU = {
  SADHU_SAHAYAM: 'Sadhu Sahayam',
  OTHERS: 'Others',
};

// Bill Status
export const BILL_STATUS = {
  PAID: 'Paid',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
  VOIDED: 'Voided',
  REFUNDED: 'Refunded',
};

// Bill Types (from database)
export const BILL_TYPES = {
  EID_UL_ADHA: 'Eid ul Adha',
  EID_AL_FITR: 'Eid al-Fitr',
  DUA_FRIDAY: 'Dua_Friday',
  DONATION: 'Donation',
  SUNNATH_FEE: 'Sunnath Fee',
  MARRIAGE_FEE: 'Marriage Fee',
  PRODUCT_TURNOVER: 'Product Turnover',
  RENTAL_BASIS: 'Rental_Basis',
  DEVOTIONAL: 'Devotional Dedication',
  DEAD_FEE: 'Dead Fee',
  NEW_MEMBERSHIP: 'New Membership',
  CERTIFICATE_FEE: 'Certificate Fee',
};

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
};

// Gender Options
export const GENDER = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

// Marital Status
export const MARITAL_STATUS = {
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOW: 'Widow',
  WIDOWED: 'Widowed',
};

// Area Types
export const AREA_TYPES = {
  PANCHAYATH: 'Panchayath',
  MUNICIPALITY: 'Municipality',
  CORPORATION: 'Corporation',
};

// Ration Card Types
export const RATION_CARD_TYPES = {
  WHITE: 'White',
  PINK: 'Pink',
  BLUE: 'Blue',
  YELLOW: 'Yellow',
  APL: 'APL',
  BPL: 'BPL',
  AAY: 'AAY',
  NONE: 'None',
};

// Resident Types
export const RESIDENT_TYPES = {
  OWN: 'Own',
  RENT: 'Rent',
  LEASE: 'Lease',
  OTHER: 'Other',
};

// Relations
export const RELATIONS = {
  HEAD: 'The Head of the Household',
  WIFE: 'Wife',
  SPOUSE: 'Spouse',
  SON: 'Son',
  DAUGHTER: 'Daughter',
  FATHER: 'Father',
  MOTHER: 'Mother',
  BROTHER: 'Brother',
  SISTER: 'Sister',
  GRANDSON: 'Grandson',
  GRAND_SON: 'Grand Son',
  GRANDDAUGHTER: 'Granddaughter',
  GRAND_DAUGHTER: 'Grand Daughter',
  FATHER_IN_LAW: 'Father-in-Law',
  MOTHER_IN_LAW: 'Mother-in-Law',
  SON_IN_LAW: 'Son-in-Law',
  DAUGHTER_IN_LAW: 'Daughter-in-Law',
  UNCLE: 'Uncle',
  AUNT: 'Aunt',
  NEPHEW: 'Nephew',
  NIECE: 'Niece',
  COUSIN: 'Cousin',
  GRAND_FATHER: 'Grand Father',
  GRAND_MOTHER: 'Grand Mother',
  OTHER: 'Other',
  EMPTY: '', // For legacy data with no relation specified
};

// Health Status
export const HEALTH_STATUS = {
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  CRITICAL: 'Critical',
  DISABLED: 'Disabled',
};

// Notice Priority
export const NOTICE_PRIORITY = {
  URGENT: 'urgent',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  UNAUTHORIZED: 'Not authorized to access this resource',
  TOKEN_EXPIRED: 'Token has expired',
  TOKEN_INVALID: 'Invalid token',
  USER_EXISTS: 'User already exists',
  USER_NOT_FOUND: 'User not found',
  MEMBER_NOT_FOUND: 'Member not found',
  BILL_NOT_FOUND: 'Bill not found',
  NOTICE_NOT_FOUND: 'Notice not found',
  VALIDATION_ERROR: 'Validation error',
  SERVER_ERROR: 'Internal server error',
  RESOURCE_NOT_FOUND: 'Resource not found',
  DUPLICATE_ENTRY: 'Duplicate entry found',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTER_SUCCESS: 'Registration successful',
  UPDATE_SUCCESS: 'Updated successfully',
  DELETE_SUCCESS: 'Deleted successfully',
  CREATE_SUCCESS: 'Created successfully',
};

// Regex Patterns
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[6-9]\d{9}$/,
  AADHAAR: /^\d{12}$/,
  MEMBER_ID: /^\d+\/\d+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
};

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

// Date Formats
export const DATE_FORMATS = {
  DB_DATE: 'YYYY-MM-DD',
  DB_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DISPLAY_DATE: 'DD/MM/YYYY',
  DISPLAY_DATETIME: 'DD/MM/YYYY hh:mm A',
};

// File Upload
export const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

export default {
  USER_ROLES,
  BILL_CATEGORIES,
  BILL_TYPES,
  BILL_STATUS,
  JAMAATH_TYPES,
  MADRASSA_TYPES,
  LAND_TYPES,
  NERCHA_TYPES,
  SADHU_TYPES,
  ACCOUNT_CATEGORIES_LAND,
  ACCOUNT_CATEGORIES_MADRASSA,
  ACCOUNT_CATEGORIES_NERCHA,
  ACCOUNT_CATEGORIES_SADHU,
  PAYMENT_METHODS,
  GENDER,
  MARITAL_STATUS,
  AREA_TYPES,
  RATION_CARD_TYPES,
  RESIDENT_TYPES,
  RELATIONS,
  HEALTH_STATUS,
  NOTICE_PRIORITY,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  REGEX_PATTERNS,
  PAGINATION,
  DATE_FORMATS,
  FILE_UPLOAD,
};
