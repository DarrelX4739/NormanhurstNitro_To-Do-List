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

const authTitle = document.getElementById("auth-title");
const emailAuthBtn = document.getElementById("email-auth-btn");
const toggleAuthText = document.getElementById("toggle-auth-text");
const forgotPasswordWrapper = document.getElementById("forgot-password-wrapper");

let isSignUpMode = false;

// ==========================================
// 2. AUTHENTICATION LOGIC
// ==========================================

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

function setupToggleLink() {
    const link = document.getElementById("toggle-auth-link");
    if (link) {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            authMessage.innerText = ""; 

            if (isSignUpMode) {
                authTitle.innerText = "Create New Account";
                emailAuthBtn.innerText = "Sign Up & Register";
                toggleAuthText.innerHTML = `Already have an account? <a href="#" id="toggle-auth-link">Sign In here</a>`;
                forgotPasswordWrapper.classList.add("hidden");
            } else {
                authTitle.innerText = "Build Season To-Do List";
                emailAuthBtn.innerText = "Sign In with Email";
                toggleAuthText.innerHTML = `Don't have an account? <a href="#" id="toggle-auth-link">Create one here</a>`;
                forgotPasswordWrapper.classList.remove("hidden");
            }
            setupToggleLink(); 
        });
    }
}
setupToggleLink();

emailAuthBtn.addEventListener("click", () => {
    const email = document.getElementById("email-input").value;
    const password = document.getElementById("password-input").value;
    
    if (!email || !password) {
        authMessage.innerText = "Please enter both email and password.";
        return;
    }

    if (isSignUpMode) {
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                return db.collection("users").doc(userCredential.user.uid).set({
                    email: email,
                    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .catch((error) => { authMessage.innerText = error.message; });
    } else {
        auth.signInWithEmailAndPassword(email, password)
            .catch((error) => { authMessage.innerText = error.message; });
    }
});

document.getElementById("google-login-btn").addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch((error) => {
        authMessage.innerText = error.message;
    });
});

document.getElementById("forgot-password-btn").addEventListener("click", (e) => {
    e.preventDefault();
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

document.getElementById("logout-btn").addEventListener("click", () => {
    auth.signOut();
});

function resizeRobotInput() {
    const tempSpan = document.createElement("span");
    tempSpan.style.font = window.getComputedStyle(robotNameInput).font;
    tempSpan.style.visibility = "hidden";
    tempSpan.style.position = "absolute";
    tempSpan.style.whiteSpace = "pre";
    tempSpan.innerText = robotNameInput.value || robotNameInput.placeholder;
    document.body.appendChild(tempSpan);
    robotNameInput.style.width = (tempSpan.getBoundingClientRect().width + 12) + "px";
    document.body.removeChild(tempSpan);
}

// ==========================================
// 3. UI GENERATION & REAL-TIME SYNC
// ==========================================

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
                        <th class="action-col"></th>
                    </tr>
                </thead>
                <tbody id="tbody-${cat}"></tbody>
            </table>
            <div class="table-actions">
                <button class="btn secondary-btn" onclick="addRow('${cat}')">+ Add Task Row</button>
            </div>
        `;
        sectionsWrapper.appendChild(catDiv);
    });
}

function initializeRealtimeSync() {
    buildCategoriesUI();

    DOC_REF.onSnapshot((doc) => {
        if (!doc.exists) {
            const initialData = { robotName: "" };
            CATEGORIES.forEach(cat => initialData[cat] = [{ id: "init-" + Date.now(), task: "", completed: false }]);
            DOC_REF.set(initialData);
            return;
        }

        const data = doc.data();

        if (document.activeElement !== robotNameInput) {
            robotNameInput.value = data.robotName || "";
            resizeRobotInput();
        }

        CATEGORIES.forEach(cat => {
            const tbody = document.getElementById(`tbody-${cat}`);
            const rowsData = data[cat] || [];
            
            if (tbody.children.length !== rowsData.length) {
                renderRows(cat, rowsData);
            } else {
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
                    rowEl.querySelector(".row-delete-btn").onclick = () => removeRow(cat, row.id);
                });
            }
        });
    });
}

function renderRows(category, rowsData) {
    const tbody = document.getElementById(`tbody-${category}`);
    tbody.innerHTML = "";

    rowsData.forEach((rowData) => {
        const tr = document.createElement("tr");
        if (rowData.completed) tr.classList.add("completed");

        tr.innerHTML = `
            <td>
                <input type="text" class="task-input" placeholder="Insert task" 
                    value="${rowData.task}" 
                    oninput="updateData('${category}', '${rowData.id}', 'task', this.value)">
            </td>
            <td class="status-col">
                <input type="checkbox" class="task-checkbox" 
                    ${rowData.completed ? "checked" : ""} 
                    onchange="updateData('${category}', '${rowData.id}', 'completed', this.checked)">
            </td>
            <td class="action-col">
                <button class="row-delete-btn" onclick="removeRow('${category}', '${rowData.id}')">×</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 4. DATABASE MODIFICATION FUNCTIONS
// ==========================================

window.updateData = function(category, rowId, field, value) {
    DOC_REF.get().then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        const currentList = data[category] || [];
        const index = currentList.findIndex(item => item.id === rowId);

        if (index !== -1) {
            currentList[index][field] = value;
            
            if (field === 'completed') {
                const tbody = document.getElementById(`tbody-${category}`);
                if (tbody && tbody.children[index]) {
                    if (value) {
                        tbody.children[index].classList.add("completed");
                    } else {
                        tbody.children[index].classList.remove("completed");
                    }
                }
            }

            DOC_REF.update({ [category]: currentList });
        }
    });
};

window.addRow = function(category) {
    const rowId = "row-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const newRow = { id: rowId, task: "", completed: false };
    
    const tbody = document.getElementById(`tbody-${category}`);
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><input type="text" class="task-input" placeholder="Insert task" value=""></td>
        <td class="status-col"><input type="checkbox" class="task-checkbox"></td>
        <td class="action-col"><button class="row-delete-btn">×</button></td>
    `;
    tbody.appendChild(tr);

    DOC_REF.update({
        [category]: firebase.firestore.FieldValue.arrayUnion(newRow)
    }).catch(err => { console.error("Error adding row: ", err); });
};

window.removeRow = function(category, rowId) {
    DOC_REF.get().then((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        const currentList = data[category] || [];
        const index = currentList.findIndex(item => item.id === rowId);
        
        if (index !== -1) {
            const tbody = document.getElementById(`tbody-${category}`);
            if (tbody && tbody.children[index]) {
                tbody.removeChild(tbody.children[index]);
            }

            currentList.splice(index, 1);
            DOC_REF.update({ [category]: currentList });
        }
    });
};

robotNameInput.addEventListener("input", (e) => {
    resizeRobotInput();
    DOC_REF.update({ robotName: e.target.value });
});
