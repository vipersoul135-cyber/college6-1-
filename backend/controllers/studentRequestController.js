const StudentRequest = require('../models/StudentRequest');
const Student = require('../models/Student');

/**
 * @desc    Submit a student registration request
 * @route   POST /api/student-requests
 * @access  Private (Staff only)
 */
exports.submitRequest = async (req, res) => {
    try {
        const { studentName, studentId, department, year, section, phone, parentPhone, photo, reason } = req.body;

        // Validation
        if (!studentName || !studentId || !department || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: studentName, studentId, department, year'
            });
        }

        // Check if student already exists in the system
        const existingStudent = await Student.findOne({ 
            studentId: studentId.trim().toUpperCase() 
        });
        
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: `Student with register number ${studentId} already exists in the system`
            });
        }

        // Check if there's already a pending request for this student
        const existingRequest = await StudentRequest.findOne({
            studentId: studentId.trim().toUpperCase(),
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: `A pending request already exists for register number ${studentId}`
            });
        }

        // Create new request
        const newRequest = new StudentRequest({
            studentName: studentName.trim(),
            studentId: studentId.trim().toUpperCase(),
            department: department.trim(),
            year: year.trim(),
            section: section ? section.trim() : '',
            phone: phone ? phone.trim() : '',
            parentPhone: parentPhone ? parentPhone.trim() : '',
            photo: photo ? photo.trim() : '',
            reason: reason ? reason.trim() : '',
            requestedBy: req.user.username || req.user.id,
            requestedByName: req.user.name || req.user.username
        });

        await newRequest.save();

        res.status(201).json({
            success: true,
            message: 'Student registration request submitted successfully',
            request: newRequest
        });

    } catch (error) {
        console.error('Error submitting student request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit request',
            error: error.message
        });
    }
};

/**
 * @desc    Get logged-in staff's own requests
 * @route   GET /api/student-requests/my-requests
 * @access  Private (Staff)
 */
exports.getMyRequests = async (req, res) => {
    try {
        const username = req.user.username || req.user.id;

        const requests = await StudentRequest.find({ requestedBy: username })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: requests.length,
            requests
        });

    } catch (error) {
        console.error('Error fetching my requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests',
            error: error.message
        });
    }
};

/**
 * @desc    Get all requests with filters (Admin only)
 * @route   GET /api/student-requests/all
 * @access  Private (Admin)
 */
exports.getAllRequests = async (req, res) => {
    try {
        const { status, department, year } = req.query;

        let query = {};
        
        if (status) {
            query.status = status;
        }
        
        if (department) {
            query.department = department;
        }
        
        if (year) {
            query.year = year;
        }

        const requests = await StudentRequest.find(query)
            .sort({ createdAt: -1 });

        // Get summary counts
        const totalRequests = await StudentRequest.countDocuments();
        const pendingRequests = await StudentRequest.countDocuments({ status: 'pending' });
        const approvedRequests = await StudentRequest.countDocuments({ status: 'approved' });
        const rejectedRequests = await StudentRequest.countDocuments({ status: 'rejected' });

        res.json({
            success: true,
            count: requests.length,
            requests,
            summary: {
                total: totalRequests,
                pending: pendingRequests,
                approved: approvedRequests,
                rejected: rejectedRequests
            }
        });

    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests',
            error: error.message
        });
    }
};

/**
 * @desc    Get pending requests (Admin only)
 * @route   GET /api/student-requests/pending
 * @access  Private (Admin)
 */
exports.getPendingRequests = async (req, res) => {
    try {
        const { department, year } = req.query;

        let query = { status: 'pending' };
        
        if (department) {
            query.department = department;
        }
        
        if (year) {
            query.year = year;
        }

        const requests = await StudentRequest.find(query)
            .sort({ createdAt: -1 });

        // Get summary counts
        const totalRequests = await StudentRequest.countDocuments();
        const pendingRequests = requests.length;
        const approvedRequests = await StudentRequest.countDocuments({ status: 'approved' });
        const rejectedRequests = await StudentRequest.countDocuments({ status: 'rejected' });

        res.json({
            success: true,
            count: requests.length,
            requests,
            summary: {
                total: totalRequests,
                pending: pendingRequests,
                approved: approvedRequests,
                rejected: rejectedRequests
            }
        });

    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests',
            error: error.message
        });
    }
};

/**
 * @desc    Approve a student registration request
 * @route   PATCH /api/student-requests/:id/approve
 * @access  Private (Admin only)
 */
exports.approveRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const { remarks } = req.body;

        const request = await StudentRequest.findById(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Request has already been ${request.status}`
            });
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({ 
            studentId: request.studentId 
        });
        
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: 'Student already exists in the system'
            });
        }

        // Create the student in the database
        const newStudent = new Student({
            studentId: request.studentId,
            studentName: request.studentName,
            department: request.department,
            year: request.year,
            section: request.section || '',
            phone: request.phone || '',
            parentPhone: request.parentPhone || '',
            photo: request.photo || '',
            status: 'active'
        });

        await newStudent.save();

        // Update request status
        request.status = 'approved';
        request.approvedBy = req.user.username || req.user.name;
        request.approvedAt = new Date();
        request.adminRemarks = remarks || 'Approved';

        await request.save();

        res.json({
            success: true,
            message: 'Request approved and student registered successfully',
            request,
            student: newStudent
        });

    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve request',
            error: error.message
        });
    }
};

/**
 * @desc    Reject a student registration request
 * @route   PATCH /api/student-requests/:id/reject
 * @access  Private (Admin only)
 */
exports.rejectRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const { reason } = req.body;

        if (!reason || reason.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Please provide a reason for rejection'
            });
        }

        const request = await StudentRequest.findById(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Request has already been ${request.status}`
            });
        }

        // Update request status
        request.status = 'rejected';
        request.rejectedBy = req.user.username || req.user.name;
        request.rejectedAt = new Date();
        request.adminRemarks = reason.trim();

        await request.save();

        res.json({
            success: true,
            message: 'Request rejected successfully',
            request
        });

    } catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject request',
            error: error.message
        });
    }
};
