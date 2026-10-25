const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
};

/**
 * @desc    Authenticate user & get JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both username and password'
            });
        }

        const normalizedUsername = username.trim().toLowerCase();

        // Include password explicitly since schema sets select: false
        const user = await User.findOne({ username: normalizedUsername }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        if (user.status === 'inactive') {
            return res.status(403).json({
                success: false,
                message: 'This account is deactivated. Contact administrator.'
            });
        }

        const isMatch = await user.matchPassword(password.trim());

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                role: user.role,
                department: user.department,
                year: user.year
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
            error: error.message
        });
    }
};

/**
 * @desc    Get current logged in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                name: req.user.name,
                username: req.user.username,
                role: req.user.role,
                department: req.user.department,
                year: req.user.year,
                status: req.user.status,
                createdAt: req.user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve profile',
            error: error.message
        });
    }
};

/**
 * @desc    Logout user (clears token)
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
    try {
        // Token is already invalidated on the client side by clearing localStorage
        // This endpoint exists for future session management if needed
        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to logout',
            error: error.message
        });
    }
};

/**
 * @desc    Create staff account (Admin Only)
 * @route   POST /api/auth/staff
 * @access  Private/Admin
 */
const createStaff = async (req, res) => {
    try {
        const { username, password, name, department, year } = req.body;

        if (!username || !password || !department) {
            return res.status(400).json({
                success: false,
                message: 'Username, password, and department are required'
            });
        }

        const existing = await User.findOne({ username: username.trim().toLowerCase() });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Username '${username}' is already taken`
            });
        }

        const staff = await User.create({
            username: username.trim().toLowerCase(),
            password: password.trim(),
            name: name || username,
            role: 'staff',
            department: department.trim(),
            year: year || '1',
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Staff account created successfully',
            staff: {
                id: staff._id,
                username: staff.username,
                name: staff.name,
                role: staff.role,
                department: staff.department,
                year: staff.year
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create staff account',
            error: error.message
        });
    }
};

/**
 * @desc    List all staff accounts (Admin Only)
 * @route   GET /api/auth/staff
 * @access  Private/Admin
 */
const listStaff = async (req, res) => {
    try {
        const staffList = await User.find({ role: 'staff' }).select('-password').sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: staffList.length,
            staff: staffList
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve staff accounts',
            error: error.message
        });
    }
};

/**
 * @desc    Update staff status or details (Admin Only)
 * @route   PUT /api/auth/staff/:id
 * @access  Private/Admin
 */
const updateStaff = async (req, res) => {
    try {
        const { name, department, year, status } = req.body;
        const staff = await User.findById(req.params.id);

        if (!staff || staff.role !== 'staff') {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        if (name) staff.name = name;
        if (department) staff.department = department;
        if (year) staff.year = year;
        if (status) staff.status = status;

        await staff.save();

        res.status(200).json({
            success: true,
            message: 'Staff updated successfully',
            staff: {
                id: staff._id,
                username: staff.username,
                name: staff.name,
                department: staff.department,
                year: staff.year,
                status: staff.status
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update staff member',
            error: error.message
        });
    }
};

module.exports = {
    login,
    getMe,
    logout,
    createStaff,
    listStaff,
    updateStaff
};
