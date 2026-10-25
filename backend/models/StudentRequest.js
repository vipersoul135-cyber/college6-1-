const mongoose = require('mongoose');

const studentRequestSchema = new mongoose.Schema(
    {
        studentName: {
            type: String,
            required: [true, 'Student name is required'],
            trim: true
        },
        studentId: {
            type: String,
            required: [true, 'Student register number is required'],
            trim: true,
            uppercase: true
        },
        department: {
            type: String,
            required: [true, 'Department is required'],
            trim: true
        },
        year: {
            type: String,
            required: [true, 'Academic year is required'],
            enum: ['1', '2', '3']
        },
        section: {
            type: String,
            trim: true,
            default: ''
        },
        phone: {
            type: String,
            trim: true,
            default: ''
        },
        parentPhone: {
            type: String,
            trim: true,
            default: ''
        },
        photo: {
            type: String,
            trim: true,
            default: ''
        },
        reason: {
            type: String,
            trim: true,
            default: ''
        },
        requestedBy: {
            type: String,
            required: [true, 'Requester information is required'],
            trim: true
        },
        requestedByName: {
            type: String,
            required: [true, 'Requester name is required'],
            trim: true
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        adminRemarks: {
            type: String,
            trim: true,
            default: ''
        },
        approvedBy: {
            type: String,
            trim: true
        },
        approvedAt: {
            type: Date
        },
        rejectedBy: {
            type: String,
            trim: true
        },
        rejectedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

// Index for faster queries
studentRequestSchema.index({ requestedBy: 1, status: 1 });
studentRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('StudentRequest', studentRequestSchema);
