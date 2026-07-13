// ==========================================
// 1. PASTE YOUR FIREBASE API DETAILS HERE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBRTH0niMDYdcbYzLeJmFYxJdr5clmlWGg",
    authDomain: "nitrotodolist.firebaseapp.com",
    projectId: "nitrotodolist",
    storageBucket: "nitrotodolist.firebasestorage.app",
    messagingSenderId: "605856204166",
    appId: "1:605856204166:web:c212ac6e628e6e0eae5807"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Constants
const CATEGORIES = ["Design", "Mechanical", "Electrical", "Software", "Media"];
const DOC_REF = db.collection("nitro_todo").doc("season_2026");

// DOM Elements
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const authMessage = document.getElementById("auth-message");
const robotNameInput = document.getElementById("robot-name-input");
const sectionsWrapper = document.getElementById("sections-wrapper");

// ==========================================
// 2. AUTHENTICATION LOGIC
// ==========================================

// Track Auth State
auth.onAuthStateChanged((user) => {
    if (user) {
        loginContainer.classList.add("hidden");
        appContainer.classList.remove("hidden");
        initializeRealtimeSync();
    } else {
        loginContainer.classList.remove("hidden");
        appContainer.classList.add("hidden");
    }
});

// Google Sign-In
document.getElementById("google-login-btn").addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch((error) => {
        authMessage.innerText = error.message;
    });
});

// Email/Password Sign-In
document.getElementById("email-login-btn").addEventListener("click", () => {
    const email = document.getElementById("email-input").value;
    const password = document.getElementById("password-input").value;
    
    if (!email || !password) {
        authMessage.innerText = "Please enter both email and password.";
        return;
    }

    auth.signInWithEmailAndPassword(email, password).catch((error) => {
        // If account doesn't exist, try creating one automatically
        if (error.code === 'auth/user-not-found') {
            auth.createUserWithEmailAndPassword(email, password).catch((err) => {
                authMessage.innerText = err.message;
            });
        } else {
            authMessage.innerText = error.message;
        }
    });
});

// Password Reset Email (with Spam Warning)
document.getElementById("forgot-password-btn").addEventListener("click", () => {
    const email = document.getElementById("email-input").value;
    if (!email) {
        authMessage.innerText = "Please enter your email address above first.";
        return;
    }

    auth.sendPasswordResetEmail(email)
        .then(() => {
            alert("Password reset email sent to your inbox! Be sure to check your SPAM or JUNK folder if you do not see it within a few minutes.");
            authMessage.innerText = "Reset email sent! Check spam folder if needed.";
        })
        .catch((error) => {
            authMessage.innerText = error.message;
        });
});

// Log Out
document.getElementById("logout-btn").addEventListener("click", () => {
    auth.signOut();
});


// ==========================================
// 3. UI GENERATION & REAL-TIME SYNC
// ==========================================

// Build the HTML structure for the 5 categories
function buildCategoriesUI() {
    sectionsWrapper.innerHTML = "";
    CATEGORIES.forEach(cat => {
        const catDiv = document.createElement("div");
        catDiv.className = "category-card";
        catDiv.innerHTML = `
            <h3>${cat}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Task</th>
                        <th class="status-col">Status</th>
                    </tr>
                </thead>
                <tbody id="tbody-${cat}"></tbody>
            </table>
            <div class="table-actions">
                <button class="btn secondary-btn" onclick="addRow('${cat}')">+ Add Row</button>
                <button class="btn danger-btn" onclick="removeRow('${cat}')">- Remove Row</button>
            </div>
        `;
        sectionsWrapper.appendChild(catDiv);
    });
}

// Listen for real-time updates from Firestore
let isUpdatingLocal = false;
function initializeRealtimeSync() {
    buildCategoriesUI();

    DOC_REF.onSnapshot((doc) => {
        if (!doc.exists) {
            // Initialize document in database if it doesn't exist yet
            const initialData = { robotName: "" };
            CATEGORIES.forEach(cat => initialData[cat] = [{ task: "", completed: false }]);
            DOC_REF.set(initialData);
            return;
        }

        const data = doc.data();

        // Avoid cursor jumping while typing by checking local focus
        if (document.activeElement !== robotNameInput) {
            robotNameInput.value = data.robotName || "";
        }

        CATEGORIES.forEach(cat => {
            const tbody = document.getElementById(`tbody-${cat}`);
            const rowsData = data[cat] || [];
            
            // Rebuild rows if length changed or if not currently editing this table
            if (tbody.children.length !== rowsData.length) {
                renderRows(cat, rowsData);
            } else {
                // Soft update to keep checkboxes and text in sync across devices
                rowsData.forEach((row, idx) => {
                    const rowEl = tbody.children[idx];
                    const input = rowEl.querySelector(".task-input");
                    const checkbox = rowEl.querySelector(".task-checkbox");
                    
                    if (document.activeElement !== input) {
                        input.value = row.task;
                    }
                    checkbox.checked = row.completed;
                    if (row.completed) {
                        rowEl.classList.add("completed");
                    } else {
                        rowEl.classList.remove("completed");
                    }
                });
            }
        });
    });
}

function renderRows(category, rowsData) {
    const tbody = document.getElementById(`tbody-${category}`);
    tbody.innerHTML = "";

    rowsData.forEach((rowData, index) => {
        const tr = document.createElement("tr");
        if (rowData.completed) tr.classList.add("completed");

        tr.innerHTML = `
            <td>
                <input type="text" class="task-input" placeholder="Insert task" 
                    value="${rowData.task}" 
                    oninput="updateData('${category}', ${index}, 'task', this.value)">
            </td>
            <td class="status-col">
                <input type="checkbox" class="task-checkbox" 
                    ${rowData.completed ? "checked" : ""} 
                    onchange="updateData('${category}', ${index}, 'completed', this.checked)">
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 4. DATABASE MODIFICATION FUNCTIONS
// ==========================================

window.updateData = function(category, index, field, value) {
    DOC_REF.get().then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        data[category][index][field] = value;
        DOC_REF.update({ [category]: data[category] });
    });
};

window.addRow = function(category) {
    DOC_REF.get().then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        const currentList = data[category] || [];
        currentList.push({ task: "", completed: false });
        DOC_REF.update({ [category]: currentList });
    });
};

window.removeRow = function(category) {
    DOC_REF.get().then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        const currentList = data[category] || [];
        if (currentList.length > 0) {
            currentList.pop(); // Removes the bottom row
            DOC_REF.update({ [category]: currentList });
        }
    });
};

// Sync Robot Name Changes
robotNameInput.addEventListener("input", (e) => {
    DOC_REF.update({ robotName: e.target.value });
});
