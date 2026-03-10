/* =========================
DEPARTMENTS
========================= */

const departments = {
    cs: "Computer Science",
    it: "Information Technology",
    tam: "Tamil",
    eng: "English"
};


/* =========================
LOCAL STORAGE DATA
========================= */

let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;
let students = JSON.parse(localStorage.getItem("students")) || [];
let attendance = JSON.parse(localStorage.getItem("attendance")) || [];


/* =========================
SAVE DATA
========================= */

function saveData() {

    localStorage.setItem("students", JSON.stringify(students));
    localStorage.setItem("attendance", JSON.stringify(attendance));
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

}


/* =========================
LOGIN (POST METHOD BACKEND)
========================= */

async function login() {

    let username = document.getElementById("loginUser").value.trim();
    let password = document.getElementById("loginPass").value.trim();

    if (!username || !password) {

        document.getElementById("loginMsg").innerText = "Enter Username and Password";
        return;

    }

    try {

        const response = await fetch("https://attendancesystem-ln29.onrender.com/api/auth/login", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                username: username,
                password: password
            })

        });

        const data = await response.json();

        if (!response.ok) {

            document.getElementById("loginMsg").innerText =
                data.message || "Login Failed";

            return;

        }

        currentUser = {
            dept: data.dept,
            year: data.year
        };

        saveData();

        window.location.href = "home.html";

    }

    catch (error) {

        console.error("Login Error:", error);
        document.getElementById("loginMsg").innerText = "Server Error";

    }

}


/* =========================
LOAD USER INFO
========================= */

function loadUser() {

    currentUser = JSON.parse(localStorage.getItem("currentUser"));

    if (!currentUser) {

        window.location.href = "index.html";
        return;

    }

    let userInfo = document.getElementById("userInfo");

    if (userInfo) {

        userInfo.innerText =
            currentUser.dept + " - " + currentUser.year + " Year";

    }

}


/* =========================
LOGOUT
========================= */

function logout() {

    fetch("/api/logout");

    localStorage.removeItem("currentUser");

    window.location.href = "index.html";

}


/* =========================
ADD STUDENT
========================= */

function addStudent() {

    let name = document.getElementById("studentName").value.trim();
    let id = document.getElementById("studentID").value.trim();

    if (!name || !id) {

        alert("Fill all fields");
        return;

    }

    students.push({

        serial: students.length + 1,
        id: id,
        name: name,
        dept: currentUser.department,
        year: currentUser.year

    });

    saveData();

    alert("Student Added");

    document.getElementById("studentName").value = "";
    document.getElementById("studentID").value = "";

}


/* =========================
UPLOAD EXCEL
========================= */

function uploadExcel() {

    const file = document.getElementById("excelFile").files[0];

    if (!file) {

        alert("Select Excel File");
        return;

    }

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, { type: "array" });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        for (let i = 1; i < rows.length; i++) {

            let regNo = rows[i][1];
            let name = rows[i][2];

            if (!regNo || !name) continue;

            students.push({

                serial: students.length + 1,
                id: regNo.toString(),
                name: name.toString(),
                dept: currentUser.dept,
                year: currentUser.year

            });

        }

        saveData();

        alert("Students Imported");

    };

    reader.readAsArrayBuffer(file);

}


/* =========================
CLEAR STUDENTS
========================= */

function clearStudents() {

    if (!confirm("Delete all students?")) return;

    students = students.filter(s =>
        !(s.dept === currentUser.dept && s.year === currentUser.year)
    );

    saveData();

    alert("Students Deleted");

}


/* =========================
RENDER ATTENDANCE
========================= */

function renderAttendance() {

    let dateInput = document.getElementById("attendanceDate");

    if (!dateInput) return;

    let date = dateInput.value;

    if (!date) {

        let today = new Date().toISOString().split("T")[0];
        dateInput.value = today;
        date = today;

    }

    let body = document.getElementById("attendanceBody");

    if (!body) return;

    body.innerHTML = "";

    let filtered = students.filter(s =>
        s.dept === currentUser.dept &&
        s.year === currentUser.year
    );

    filtered.forEach(s => {

        let absent = attendance.find(a =>
            a.id === s.id && a.date === date
        );

        body.innerHTML += `

<tr>

<td>${s.serial}</td>
<td>${s.id}</td>
<td>${s.name}</td>

<td>

<input type="radio"
name="att_${s.id}"
${!absent ? "checked" : ""}
onclick="markAttendance('${s.id}','${date}','present')">

Present

<input type="radio"
name="att_${s.id}"
${absent ? "checked" : ""}
onclick="markAttendance('${s.id}','${date}','absent')">

Absent

</td>

</tr>

`;

    });

}


/* =========================
MARK ATTENDANCE
========================= */

function markAttendance(id, date, status) {

    attendance = attendance.filter(a =>
        !(a.id === id && a.date === date)
    );

    if (status === "absent") {

        attendance.push({ id, date });

    }

    saveData();

}


/* =========================
GENERATE REPORT
========================= */

function generateReport() {

    let from = document.getElementById("fromDate").value;
    let to = document.getElementById("toDate").value;

    if (!from || !to) {

        alert("Select dates");
        return;

    }

    let body = document.getElementById("reportBody");

    body.innerHTML = "";

    let days = new Set(
        attendance
            .filter(a => a.date >= from && a.date <= to)
            .map(a => a.date)
    );

    let total = days.size;

    students
        .filter(s =>
            s.dept === currentUser.dept &&
            s.year === currentUser.year
        )
        .forEach(s => {

            let absent = attendance.filter(a =>
                a.id === s.id &&
                a.date >= from &&
                a.date <= to
            ).length;

            let present = total - absent;

            let percent = total
                ? Math.round((present / total) * 100)
                : 100;

            body.innerHTML += `

<tr>

<td>${s.serial}</td>
<td>${s.id}</td>
<td>${s.name}</td>
<td>${total}</td>
<td>${present}</td>
<td>${absent}</td>
<td>${percent}%</td>

</tr>

`;

        });

}


/* =========================
DOWNLOAD REPORT
========================= */

function downloadReport() {

    let table = document.querySelector("table");

    if (!table) {

        alert("No table found");
        return;

    }

    let wb = XLSX.utils.table_to_book(table, { sheet: "Report" });

    XLSX.writeFile(wb, "Attendance_Report.xlsx");

}


/* =========================
AUTO LOAD
========================= */

window.onload = function () {

    if (localStorage.getItem("currentUser")) {

        loadUser();
        renderAttendance();

    }

};

