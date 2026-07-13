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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Pointers
const CATEGORIES = ["Design", "Mechanical", "Electrical", "Software", "Media"];
const TODO_REF = db.collection("nitro_todo").doc("season_2026");
const CHAT_REF = db.collection("nitro_workspace_chat");

// State Global Tracking Variables
let currentUserEmail = "";
let currentWidget = "todo";
let lastReadTimestamp = 0;
let highestMessageTimestamp = 0;
let pressTimer = null;

// DOM Selectors
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const authMessage = document.getElementById("auth-message");
const robotNameInput = document.getElementById("robot-name-input");
const sectionsWrapper = document.getElementById("sections-wrapper");
const chatBadge = document.getElementById("chat-badge");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const pinnedDrawer = document.getElementById("pinned-messages-drawer");
const pinnedList = document.getElementById("pinned-list");

const contextMenu = document.getElementById("custom-context-menu");
const menuPinBtn = document.getElementById("menu-pin-btn");
const menuDeleteBtn = document.getElementById("menu-delete-btn");

// ==========================================
// 2. AUTH REGISTRATION AND ROUTING HOOKS
// ==========================================

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserEmail = user.email || "unknown@team.com";
        loginContainer.classList.add("hidden");
        appContainer.classList.remove("hidden");
        
        lastReadTimestamp = parseInt(localStorage.getItem(`chat_last_read_${currentUserEmail}`)) || 0;
        
        initializeTodoSync();
        initializeChatSync();
    } else {
        loginContainer.classList.remove("hidden");
        appContainer.classList.add("hidden");
    }
});

window.switchWidget = function(targetWidget) {
    currentWidget = targetWidget;
    document.getElementById("tab-todo-btn").classList.remove("active");
    document.getElementById("tab-chat-btn").classList.remove("active");
    document.getElementById("widget-todo").classList.add("hidden");
    document.getElementById("widget-chat").classList.add("hidden");

    if (targetWidget === 'todo') {
        document.getElementById("tab-todo-btn").classList.add("active");
        document.getElementById("widget-todo").classList.remove("hidden");
    } else if (targetWidget === 'chat') {
        document.getElementById("tab-chat-btn").classList.add("active");
        document.getElementById("widget-chat").classList.remove("hidden");
        
        lastReadTimestamp = Date.now();
        localStorage.setItem(`chat_last_read_${currentUserEmail}`, lastReadTimestamp);
        chatBadge.classList.add("hidden");
        
        setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);
    }
};

window.togglePinsView = function() {
    pinnedDrawer.classList.toggle("hidden");
};

document.getElementById("email-auth-btn").addEventListener("click", () => {
    const email = document.getElementById("email-input").value;
    const password = document.getElementById("password-input").value;
    if (!email || !password) return;
    
    auth.signInWithEmailAndPassword(email, password).catch(() => {
        auth.createUserWithEmailAndPassword(email, password).catch(err => {
            authMessage.innerText = err.message;
        });
    });
});

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut());

// ==========================================
// 3. TO-DO BOARD SYNC ENGINE
// ==========================================

function buildTodoUI() {
    sectionsWrapper.innerHTML = "";
    CATEGORIES.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category-card";
        div.innerHTML = `
            <h3>${cat}</h3>
            <table>
                <thead><tr><th>Task</th><th class="status-col">Status</th><th class="action-col"></th></tr></thead>
                <tbody id="tbody-${cat}"></tbody>
            </table>
            <div class="table-actions"><button class="btn secondary-btn" onclick="addTodoRow('${cat}')">+ Add Task Row</button></div>
        `;
        sectionsWrapper.appendChild(div);
    });
}

function initializeTodoSync() {
    buildTodoUI();
    TODO_REF.onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        if (document.activeElement !== robotNameInput) {
            robotNameInput.value = data.robotName || "";
        }
        CATEGORIES.forEach(cat => {
            const tbody = document.getElementById(`tbody-${cat}`);
            const rows = data[cat] || [];
            tbody.innerHTML = "";
            rows.forEach((row) => {
                const tr = document.createElement("tr");
                if (row.completed) tr.classList.add("completed");
                tr.innerHTML = `
                    <td><input type="text" class="task-input" value="${row.task}" oninput="updateTodoData('${cat}', '${row.id}', 'task', this.value)"></td>
                    <td class="status-col"><input type="checkbox" class="task-checkbox" ${row.completed ? "checked" : ""} onchange="updateTodoData('${cat}', '${row.id}', 'completed', this.checked)"></td>
                    <td class="action-col"><button class="row-delete-btn" onclick="removeTodoRow('${cat}', '${row.id}')">×</button></td>
                `;
                tbody.appendChild(tr);
            });
        });
    });
}

window.addTodoRow = function(cat) {
    const rowId = "row-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    TODO_REF.update({ [cat]: firebase.firestore.FieldValue.arrayUnion({ id: rowId, task: "", completed: false }) });
};

window.updateTodoData = function(cat, rowId, field, val) {
    TODO_REF.get().then(doc => {
        if (!doc.exists) return;
        const list = doc.data()[cat] || [];
        const idx = list.findIndex(item => item.id === rowId);
        if (idx !== -1) {
            list[idx][field] = val;
            TODO_REF.update({ [cat]: list });
        }
    });
};

window.removeTodoRow = function(cat, rowId) {
    TODO_REF.get().then(doc => {
        if (!doc.exists) return;
        const list = doc.data()[cat] || [];
        const filtered = list.filter(item => item.id !== rowId);
        TODO_REF.update({ [cat]: filtered });
    });
};

// ==========================================
// 4. REAL-TIME MULTIFUNCTIONAL CHAT ENGINE
// ==========================================

function initializeChatSync() {
    CHAT_REF.orderBy("timestamp", "asc").onSnapshot((snapshot) => {
        chatMessages.innerHTML = "";
        pinnedList.innerHTML = "";
        
        let localHighestTimestamp = 0;

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const msgId = doc.id;
            
            if (msg.timestamp) {
                const msTime = msg.timestamp.toMillis ? msg.timestamp.toMillis() : msg.timestamp;
                if (msTime > localHighestTimestamp) localHighestTimestamp = msTime;
            }

            renderChatMessage(msgId, msg);
            if (msg.pinned) {
                renderPinnedMessage(msgId, msg);
            }
        });

        highestMessageTimestamp = localHighestTimestamp;

        if (currentWidget !== "chat" && highestMessageTimestamp > lastReadTimestamp) {
            chatBadge.classList.remove("hidden");
        } else if (currentWidget === "chat") {
            lastReadTimestamp = Date.now();
            localStorage.setItem(`chat_last_read_${currentUserEmail}`, lastReadTimestamp);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function renderChatMessage(msgId, msg) {
    const isOutgoing = msg.sender === currentUserEmail;
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    const reactions = msg.reactions || [];
    const comments = msg.comments || [];
    
    let reactionsHTML = reactions.map((r) => `<span class="reaction-chip" onclick="addReaction('${msgId}', '${r.emoji}')">${r.emoji} ${r.count}</span>`).join("");
    let commentsHTML = comments.map(c => `<div class="comment-line"><span class="comment-author">${c.author.split('@')[0]}</span>: ${escapeHTML(c.text)}</div>`).join("");

    wrapper.innerHTML = `
        <div class="msg-meta">${msg.sender} ${msg.pinned ? '📌' : ''}</div>
        <div class="msg-bubble" id="bubble-${msgId}">
            ${escapeHTML(msg.text)}
        </div>
        <div class="msg-addons">
            <div class="reactions-row">${reactionsHTML} <span class="reaction-chip" onclick="promptReaction('${msgId}')">+ React</span> <span class="reaction-chip" onclick="promptComment('${msgId}')">💬 Reply</span></div>
            <div class="comments-box ${comments.length === 0 ? 'hidden' : ''}">${commentsHTML}</div>
        </div>
    `;

    chatMessages.appendChild(wrapper);

    const bubbleElement = document.getElementById(`bubble-${msgId}`);
    
    // Desktop Right-Click UI Trigger
    bubbleElement.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMessageMenu(msgId, isOutgoing, msg.pinned, e.clientX, e.clientY);
    });

    // Mobile Long Press UI Trigger
    bubbleElement.addEventListener("touchstart", (e) => {
        pressTimer = setTimeout(() => {
            const touch = e.touches[0];
            openMessageMenu(msgId, isOutgoing, msg.pinned, touch.clientX, touch.clientY);
        }, 600);
    });
    
    bubbleElement.addEventListener("touchend", () => clearTimeout(pressTimer));
}

function renderPinnedMessage(msgId, msg) {
    const item = document.createElement("div");
    item.className = "comment-line";
    item.innerHTML = `📌 <strong>${msg.sender.split('@')[0]}</strong>: ${escapeHTML(msg.text)}`;
    pinnedList.appendChild(item);
}

// Custom Context Menu Overlay Engine
function openMessageMenu(msgId, isOwner, isPinned, clientX, clientY) {
    contextMenu.style.left = `${clientX}px`;
    contextMenu.style.top = `${clientY}px`;
    contextMenu.classList.remove("hidden");

    menuPinBtn.onclick = () => {
        CHAT_REF.doc(msgId).update({ pinned: !isPinned });
        closeCustomMenu();
    };

    if (isOwner) {
        menuDeleteBtn.classList.remove("hidden");
        menuDeleteBtn.onclick = () => {
            if (confirm("Delete this message?")) {
                CHAT_REF.doc(msgId).delete();
            }
            closeCustomMenu();
        };
    } else {
        menuDeleteBtn.classList.add("hidden");
    }
}

function closeCustomMenu() {
    contextMenu.classList.add("hidden");
}

document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target)) {
        closeCustomMenu();
    }
});

// ==========================================
// 5. CHAT ENGAGEMENT ADD-ON ACTIONS
// ==========================================

function sendMsg() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";

    CHAT_REF.add({
        text: text,
        sender: currentUserEmail,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        pinned: false,
        reactions: [],
        comments: []
    });
}

chatSendBtn.addEventListener("click", sendMsg);
chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMsg(); });

window.promptReaction = function(msgId) {
    const emoji = prompt("Enter an emoji to react (e.g., 👍, 🔥, 👀):");
    if (emoji) addReaction(msgId, emoji.trim());
};

window.addReaction = function(msgId, emoji) {
    CHAT_REF.doc(msgId).get().then(doc => {
        if (!doc.exists) return;
        let reactions = doc.data().reactions || [];
        const idx = reactions.findIndex(r => r.emoji === emoji);
        
        if (idx !== -1) {
            reactions[idx].count += 1;
        } else {
            reactions.push({ emoji: emoji, count: 1 });
        }
        CHAT_REF.doc(msgId).update({ reactions: reactions });
    });
};

window.promptComment = function(msgId) {
    const txt = prompt("Write a reply to this message:");
    if (!txt || !txt.trim()) return;
    
    CHAT_REF.doc(msgId).get().then(doc => {
        if (!doc.exists) return;
        let comments = doc.data().comments || [];
        comments.push({
            author: currentUserEmail,
            text: txt.trim()
        });
        CHAT_REF.doc(msgId).update({ comments: comments });
    });
};

function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
