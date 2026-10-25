const XLSX = require('xlsx');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

/**
 * @desc    Get students filtered by department and year
 * @route   GET /api/students
 * @access  Private (Staff restricted to their own class, Admin unrestricted)
 */
const getStudents = async (req, res) => {
    try {
        let filter = { status: 'active' };

        if (req.user.role === 'staff') {
            filter.department = req.user.department;
            if (req.user.year && req.user.year !== 'All') {
                filter.year = req.user.year;
            }
        } else {
            // Admin can optionally filter
            if (req.query.department) {
                filter.department = req.query.department;
            }
            if (req.query.year) {
                filter.year = req.query.year;
            }
        }

        const students = await Student.find(filter).sort({ serial: 1, studentId: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            students
        });
    } catch (error) {
        console.error('getStudents error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve students',
            error: error.message
        });
    }
};

/**
 * @desc    Add single student manually
 * @route   POST /api/students/register or POST /api/students
 * @access  Private
 */
const addStudent = async (req, res) => {
    try {
        const { studentName, studentId, serial, department, year } = req.body;

        const targetDept = (req.user.role === 'staff') ? req.user.department : (department || req.user.department);
        const targetYear = (req.user.role === 'staff' && req.user.year !== 'All') ? req.user.year : (year || '1');

        if (!studentName || !studentId) {
            return res.status(400).json({
                success: false,
                message: 'Student name and Register Number/ID are required'
            });
        }

        const normId = studentId.trim().toUpperCase();

        // Check if student already exists in this department and year
        const existing = await Student.findOne({
            studentId: normId,
            department: targetDept,
            year: targetYear
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Student with ID '${normId}' is already registered in ${targetDept} (Year ${targetYear})`
            });
        }

        // Auto-assign serial if not provided
        let assignSerial = serial;
        if (!assignSerial) {
            const count = await Student.countDocuments({ department: targetDept, year: targetYear });
            assignSerial = count + 1;
        }

        const student = await Student.create({
            studentName: studentName.trim(),
            studentId: normId,
            serial: assignSerial,
            department: targetDept,
            year: targetYear,
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Student registered successfully',
            student
        });
    } catch (error) {
        console.error('addStudent error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register student',
            error: error.message
        });
    }
};

/**
 * @desc    Batch add students from JSON array (Client-side Excel parsed)
 * @route   POST /api/students/batch
 * @access  Private
 */
const batchAddStudents = async (req, res) => {
    try {
        const { students, department, year } = req.body;

        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No student data provided'
            });
        }

        const targetDept = (req.user.role === 'staff') ? req.user.department : (department || req.user.department);
        const targetYear = (req.user.role === 'staff' && req.user.year !== 'All') ? req.user.year : (year || '1');

        let createdCount = 0;
        let updatedCount = 0;

        for (let i = 0; i < students.length; i++) {
            const item = students[i];
            const sId = String(item.id || item.studentId || '').trim().toUpperCase();
            const sName = String(item.name || item.studentName || 'Unknown').trim();
            const sSerial = Number(item.serial) || (i + 1);

            if (!sId && !sName) continue;

            const filter = {
                studentId: sId || `STU${i + 1}`,
                department: targetDept,
                year: targetYear
            };

            const update = {
                studentName: sName,
                serial: sSerial,
                email: item.email,
                phone: item.phone,
                dateOfBirth: item.dateOfBirth,
                address: item.address,
                parentName: item.parentName,
                parentPhone: item.parentPhone,
                photo: item.photo,
                status: 'active'
            };

            // Remove undefined/null values to avoid overwriting with empty values
            Object.keys(update).forEach(key => {
                if (update[key] === undefined || update[key] === null || update[key] === '') {
                    delete update[key];
                }
            });

            const result = await Student.findOneAndUpdate(filter, update, {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            });

            if (result) createdCount++;
        }

        res.status(200).json({
            success: true,
            message: `Successfully processed ${createdCount} students for ${targetDept} (Year ${targetYear})`,
            count: createdCount
        });
    } catch (error) {
        console.error('batchAddStudents error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to batch import students',
            error: error.message
        });
    }
};

/**
 * @desc    Upload Excel file (.xlsx, .xls) and parse on server
 * @route   POST /api/students/upload
 * @access  Private
 */
const uploadExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please attach an Excel file (.xlsx or .xls)'
            });
        }

        const targetDept = (req.user.role === 'staff')
            ? req.user.department
            : (req.body.department || req.user.department);

        const targetYear = (req.user.role === 'staff' && req.user.year !== 'All')
            ? req.user.year
            : (req.body.year || '1');

        if (!targetDept || !targetYear) {
            return res.status(400).json({
                success: false,
                message: 'Department and Year are required'
            });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Uploaded Excel sheet is empty'
            });
        }

        let savedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const keys = Object.keys(row);

            // Column match for Register No / ID
            const id = String(
                row['reg number']  || row['Reg Number']  || row['REG NUMBER']  ||
                row['regno']       || row['RegNo']       || row['Reg No']      ||
                row['reg no']      || row['register no'] || row['Register No'] ||
                row['studentId']   || row['StudentId']   || row['student id']  ||
                row['id']          || row['ID']          ||
                (keys[1] !== undefined ? row[keys[1]] : '') || ''
            ).trim().toUpperCase();

            // Column match for Name
            const name = String(
                row['bname']       || row['Bname']       || row['BNAME']       ||
                row['name']        || row['Name']        || row['NAME']        ||
                row['studentName'] || row['StudentName'] || row['student name']||
                row['Student']     || row['student']     ||
                (keys[2] !== undefined ? row[keys[2]] : keys[1] !== undefined ? row[keys[1]] : '') || ''
            ).trim();

            // Optional fields - case-insensitive matching
            const email = row['email'] || row['Email'] || row['EMAIL'] || '';
            const phone = row['phone'] || row['Phone'] || row['PHONE'] || '';
            const dateOfBirth = row['date of birth'] || row['Date of Birth'] || row['Date of birth'] ||
                                row['dob'] || row['Dob'] || row['DOB'] || '';
            const address = row['address'] || row['Address'] || row['ADDRESS'] || '';
            const parentName = row['parent name'] || row['Parent Name'] || row['Parent name'] ||
                               row['father name'] || row['Father Name'] || row['Mother name'] ||
                               row['mother name'] || row['guardian name'] || '';
            const parentPhone = row['parent phone'] || row['Parent Phone'] ||
                                row['Parent phone'] || row['guardian phone'] || '';
            const photo = row['photo'] || row['Photo'] || row['PHOTO'] || row['photo_url'] || row['Photo URL'] || '';

            const serialVal = row['serial number'] || row['Serial Number'] ||
                              row['S.No'] || row['sno'] || row['Sno'] || (i + 1);

            if (!id && !name) continue;

            const updateData = {
                studentName: name || 'Unknown',
                serial: Number(serialVal) || (i + 1),
                status: 'active'
            };

            // Only add optional fields if they have values
            if (email.trim()) updateData.email = email.trim();
            if (phone.trim()) updateData.phone = phone.trim();
            if (dateOfBirth.trim()) updateData.dateOfBirth = dateOfBirth.trim();
            if (address.trim()) updateData.address = address.trim();
            if (parentName.trim()) updateData.parentName = parentName.trim();
            if (parentPhone.trim()) updateData.parentPhone = parentPhone.trim();
            if (photo.trim()) updateData.photo = photo.trim();

            await Student.findOneAndUpdate(
                {
                    studentId: id || `STU${i + 1}`,
                    department: targetDept,
                    year: targetYear
                },
                updateData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            savedCount++;
        }

        res.status(200).json({
            success: true,
            message: `Successfully uploaded and saved ${savedCount} students for ${targetDept} Year ${targetYear}`,
            count: savedCount
        });
    } catch (error) {
        console.error('uploadExcel error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process Excel file',
            error: error.message
        });
    }
};

/**
 * @desc    Delete single student
 * @route   DELETE /api/students/:id
 * @access  Private (Admin only)
 */
const deleteStudent = async (req, res) => {
    try {
        const studentId = req.params.id;

        // Try finding by MongoDB _id or studentId
        let student;
        if (studentId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await Student.findById(studentId);
        } else {
            student = await Student.findOne({ studentId: studentId.trim().toUpperCase() });
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Delete attendance history
        await Attendance.deleteMany({
            studentId: student.studentId,
            department: student.department,
            year: student.year
        });

        await Student.findByIdAndDelete(student._id);

        res.status(200).json({
            success: true,
            message: `Student ${student.studentName} (${student.studentId}) and attendance records removed`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete student',
            error: error.message
        });
    }
};

module.exports = {
    getStudents,
    addStudent,
    batchAddStudents,
    uploadExcel,
    deleteStudent
};
