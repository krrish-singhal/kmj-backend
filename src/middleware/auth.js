/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */

import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

const isResourceExhausted = (err) =>
  err?.code === 8 || String(err?.message || '').includes('RESOURCE_EXHAUSTED');

// Small in-memory cache to avoid hitting Firestore on every request.
// Defaults to 5 minutes; override with AUTH_USER_CACHE_TTL_MS.
const userCache = new Map();
const USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 5 * 60 * 1000);

const getCachedUser = (userId) => {
  const entry = userCache.get(String(userId));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    userCache.delete(String(userId));
    return null;
  }
  return entry.user;
};

const setCachedUser = (user) => {
  if (!user?._id) return;
  userCache.set(String(user._id), {
    user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
};

const userFromToken = (decoded) => {
  const id = decoded?.id;
  return {
    _id: id,
    id,
    memberId: decoded?.memberId,
    role: decoded?.role,
    isActive: true,
  };
};

/**
 * Verify JWT token and attach user to request
 */
export const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from cache or database
    let user = getCachedUser(decoded.id);
    if (!user) {
      try {
        user = await User.findById(decoded.id).select('-password');
        if (user) setCachedUser(user);
      } catch (dbError) {
        // If quota is exhausted, fall back to token claims (degraded mode)
        if (isResourceExhausted(dbError)) {
          req.user = userFromToken(decoded);
          req.authDegraded = true;
          return next();
        }
        throw dbError;
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or token invalid.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact admin.'
      });
    }

    // Attach user to request
    req.user = user;
    next();
    
  } catch (error) {
    // Firestore / gRPC quota errors (RESOURCE_EXHAUSTED)
    if (isResourceExhausted(error)) return next(error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    return next(error);
  }
};

/**
 * Check if user has required role
 * @param {...string} roles - Allowed roles (admin, user)
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    
    next();
  };
};

/**
 * Optional authentication - attach user if token exists, but don't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = getCachedUser(decoded.id);
    if (!user) {
      try {
        user = await User.findById(decoded.id).select('-password');
        if (user) setCachedUser(user);
      } catch (dbError) {
        if (isResourceExhausted(dbError)) {
          req.user = userFromToken(decoded);
          req.authDegraded = true;
          return next();
        }
        throw dbError;
      }
    }

    if (user && user.isActive) req.user = user;
    
    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
};

/**
 * Verify user owns the resource or is admin
 */
export const isOwnerOrAdmin = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    // Admin can access any resource
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user owns the resource
    const resourceUserId = req.params.id || req.body[resourceUserIdField];
    
    if (resourceUserId !== req.user.memberId && resourceUserId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own resources.'
      });
    }
    
    next();
  };
};

/**
 * Rate limiting middleware (simple in-memory implementation)
 * For production, use Redis or a proper rate limiting service
 */
const requestCounts = new Map();

export const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const now = Date.now();
    const userRequests = requestCounts.get(identifier) || [];
    
    // Filter out requests outside the window
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
      });
    }
    
    validRequests.push(now);
    requestCounts.set(identifier, validRequests);
    
    next();
  };
};

/**
 * Clean up old rate limit data periodically (run every hour)
 */
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  
  for (const [identifier, requests] of requestCounts.entries()) {
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length === 0) {
      requestCounts.delete(identifier);
    } else {
      requestCounts.set(identifier, validRequests);
    }
  }
}, 60 * 60 * 1000);
