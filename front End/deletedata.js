/* ========================================================
   deletedata.js - JavaScript for deletedata.html
   ======================================================== */

let currentUser = null;
let students = [];
let attendance = [];

/**
 * Check authentication and load user info
 */
function checkAuth() {
    currentUser = JSON.parse(localStorage.getItem("currentUser"));

    if (!currentUser || currentUser.role !== "admin") {
        alert("Access denied. Admin privileges required.");
        window.location.href = "index.html";
        return false;
    }

    return true;
}



/**
 * Load and display admin info
 */
function loadAdminInfo() {
    if (!checkAuth()) return;

    const userInfoElem = document.getElementById("userInfo");
    if (userInfoElem) {
        const username = currentUser.name || currentUser.username || "admin";
        userInfoElem.innerText = `Admin: ${username}`;
    }
}

/**
 * Load data from localStorage
 */
function loadData() {
    students = JSON.parse(localStorage.getItem("students")) || [];
    attendance = JSON.parse(localStorage.getItem("attendance")) || [];
}

/**
 * Save data to localStorage
 */
function saveData() {
    localStorage.setItem("students", JSON.stringify(students));
    localStorage.setItem("attendance", JSON.stringify(attendance));
}

/**
 * Preview students that will be deleted
 */
function previewStudents() {
    const deptSelect = document.getElementById("deleteDepartment");
    const yearSelect = document.getElementById("deleteYear");
    const previewSection = document.getElementById("previewSection");
    const previewDiv = document.getElementById("studentPreview");
    const statsDiv = document.getElementById("previewStats");
    const messageArea = document.getElementById("messageArea");

    const selectedDept = deptSelect.value.trim();
    const selectedYear = yearSelect.value.trim();

    // Clear previous messages
    messageArea.innerHTML = "";

    if (!selectedDept) {
        messageArea.innerHTML = '<span style="color: red;">Please select a department.</span>';
        deptSelect.focus();
        return;
    }

    if (!selectedYear) {
        messageArea.innerHTML = '<span style="color: red;">Please select a year.</span>';
        yearSelect.focus();
        return;
    }

    loadData();

    // Filter students by department and year
    const filteredStudents = students.filter(s =>
        s.department && s.department.trim().toLowerCase() === selectedDept.toLowerCase() &&
        String(s.year).trim() === String(selectedYear)
    );

    if (filteredStudents.length === 0) {
        previewDiv.innerHTML = `<p style="color: orange;">No students found for ${selectedDept} - Year ${selectedYear}.</p>`;
        statsDiv.innerHTML = "";
        previewSection.style.display = "block";
        return;
    }

    // Display student list
    let html = "<ul style='margin: 0; padding-left: 20px;'>";
    filteredStudents.forEach((student, index) => {
        html += `<li><strong>${student.name}</strong> (ID: ${student.id}) - ${student.department} Year ${student.year}</li>`;
    });
    html += "</ul>";

    previewDiv.innerHTML = html;
    
    // Display statistics
    const attendanceRecords = attendance.filter(a => 
        filteredStudents.some(s => String(s.id).trim().toLowerCase() === String(a.id).trim().toLowerCase())
    );

    statsDiv.innerHTML = `
        <span style="color: #dc3545;">⚠️ ${filteredStudents.length} students will be deleted</span><br>
        <span style="color: #dc3545;">⚠️ ${attendanceRecords.length} attendance records will be deleted</span>
    `;

    previewSection.style.display = "block";
}

/**
 * Delete selected data after confirmation
 */
function deleteSelectedData() {
    const deptSelect = document.getElementById("deleteDepartment");
    const yearSelect = document.getElementById("deleteYear");
    const messageArea = document.getElementById("messageArea");

    const selectedDept = deptSelect.value.trim();
    const selectedYear = yearSelect.value.trim();

    // Clear previous messages
    messageArea.innerHTML = "";

    if (!selectedDept) {
        messageArea.innerHTML = '<span style="color: red;">Please select a department first.</span>';
        return;
    }

    if (!selectedYear) {
        messageArea.innerHTML = '<span style="color: red;">Please select a year first.</span>';
        return;
    }

    loadData();

    // Filter students to be deleted
    const studentsToDelete = students.filter(s =>
        s.department && s.department.trim().toLowerCase() === selectedDept.toLowerCase() &&
        String(s.year).trim() === String(selectedYear)
    );

    if (studentsToDelete.length === 0) {
        messageArea.innerHTML = '<span style="color: orange;">No students found to delete.</span>';
        return;
    }

    // First confirmation
    const confirmMsg1 = `⚠️ WARNING: You are about to permanently delete:\n\n` +
        `• Department: ${selectedDept}\n` +
        `• Year: ${selectedYear}\n` +
        `• Total Students: ${studentsToDelete.length}\n\n` +
        `This will remove all student records and their attendance history.\n\n` +
        `Do you want to continue?`;

    if (!confirm(confirmMsg1)) {
        return;
    }

    // Second confirmation
    const confirmMsg2 = `FINAL CONFIRMATION:\n\n` +
        `Are you absolutely sure you want to permanently delete all ${studentsToDelete.length} students from ${selectedDept} Year ${selectedYear}?\n\n` +
        `This action CANNOT be undone!`;

    if (!confirm(confirmMsg2)) {
        return;
    }

    // Get student IDs to delete attendance records
    const studentIdsToDelete = new Set(
        studentsToDelete.map(s => String(s.id).trim().toLowerCase())
    );

    // Count attendance records to be deleted
    const attendanceToDelete = attendance.filter(a =>
        studentIdsToDelete.has(String(a.id).trim().toLowerCase())
    );

    // Perform deletion
    const initialStudentCount = students.length;
    const initialAttendanceCount = attendance.length;

    // Remove students
    students = students.filter(s =>
        !(s.department && s.department.trim().toLowerCase() === selectedDept.toLowerCase() &&
          String(s.year).trim() === String(selectedYear))
    );

    // Remove attendance records
    attendance = attendance.filter(a =>
        !studentIdsToDelete.has(String(a.id).trim().toLowerCase())
    );

    // Save updated data
    saveData();

    // Calculate deleted counts
    const deletedStudents = initialStudentCount - students.length;
    const deletedAttendance = initialAttendanceCount - attendance.length;

    // Show success message
    messageArea.innerHTML = `
        <div style="color: green; font-weight: bold;">
            ✅ Successfully deleted:<br>
            • ${deletedStudents} students from ${selectedDept} Year ${selectedYear}<br>
            • ${deletedAttendance} attendance records
        </div>
    `;

    // Clear form and preview
    deptSelect.value = "";
    yearSelect.value = "";
    document.getElementById("previewSection").style.display = "none";

    // Show success alert
    alert(`Deletion completed successfully!\n\n` +
          `• Students deleted: ${deletedStudents}\n` +
          `• Attendance records deleted: ${deletedAttendance}`);
}

/**
 * Go back to admin panel
 */
function goBackToAdmin() {
    window.location.href = "admin.html";
}

/**
 * Initialize page when DOM is loaded
 */
document.addEventListener("DOMContentLoaded", function() {
    loadAdminInfo();
    loadData();
});

/**
 * Handle logout (inherited from admin functionality)
 */
function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("currentUser");
        localStorage.removeItem("token");
        window.location.href = "index.html";
    }
}