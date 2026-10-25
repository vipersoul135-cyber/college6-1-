const express = require('express');
const router = express.Router();
const StudentRequest = require('../models/StudentRequest');
const Student = require('../models/Student');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const {
    submitRequest,
    getMyRequests,
    getAllRequests,
    getPendingRequests,
    approveRequest,
    rejectRequest
} = require('../controllers/studentRequestController');

// Middleware to handle both real JWT and local token authentication
const flexibleAuth = async (req, res, next) => {
    // First try the normal protect middleware
    try {
        await protect(req, res, (err) => {
            if (!err) {
                return next();
            }
            
            // If JWT auth fails, check for local token and create a mock user
            const token = req.headers.authorization?.split(' ')[1];
            
            if (token && token.startsWith('local-token-')) {
                const username = token.replace('local-token-', '');
                
                // Create a mock user object for local authentication
                if (username === 'admin') {
                    req.user = {
                        id: 'local-admin',
                        username: 'admin',
                        name: 'System Administrator',
                        role: 'admin',
                        department: 'Administration',
                        year: 'All'
                    };
                } else if (username.startsWith('cs')) {
                    const year = username.replace('cs', '');
                    req.user = {
                        id: `local-${username}`,
                        username: username,
                        name: `CS Staff (Year ${year})`,
                        role: 'staff',
                        department: 'Computer Science',
                        year: year
                    };
                }
                
                if (req.user) {
                    return next();
                }
            }
            
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Flexible role check
const flexibleRoleCheck = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: Access restricted to ${roles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * @route   POST /api/student-requests
 * @desc    Submit a student registration request (Staff only)
 * @access  Private (Staff)
 */
router.post('/', flexibleAuth, flexibleRoleCheck('staff'), submitRequest);

/**
 * @route   GET /api/student-requests/my-requests
 * @desc    Get logged-in staff's own requests (Staff only)
 * @access  Private (Staff)
 */
router.get('/my-requests', flexibleAuth, flexibleRoleCheck('staff'), getMyRequests);

/**
 * @route   GET /api/student-requests/all
 * @desc    Get all requests with filters (Admin only)
 * @access  Private (Admin)
 */
router.get('/all', flexibleAuth, flexibleRoleCheck('admin'), getAllRequests);

/**
 * @route   GET /api/student-requests/pending
 * @desc    Get pending requests (Admin only)
 * @access  Private (Admin)
 */
router.get('/pending', flexibleAuth, flexibleRoleCheck('admin'), getPendingRequests);

/**
 * @route   PATCH /api/student-requests/:id/approve
 * @desc    Approve a student registration request (Admin only)
 * @access  Private (Admin)
 */
router.patch('/:id/approve', flexibleAuth, flexibleRoleCheck('admin'), approveRequest);

/**
 * @route   PATCH /api/student-requests/:id/reject
 * @desc    Reject a student registration request (Admin only)
 * @access  Private (Admin)
 */
router.patch('/:id/reject', flexibleAuth, flexibleRoleCheck('admin'), rejectRequest);

module.exports = router;
