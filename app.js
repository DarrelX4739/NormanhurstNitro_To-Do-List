// ==========================================
// 1. FIREBASE SETUP & INITIAL CONFIG
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

const CATEGORIES = ["Design", "Mechanical", "Electrical", "Software", "Media"];
const TODO_REF = db.collection("nitro_todo").doc("season_2026");
const CHAT_REF = db.collection("nitro_workspace_chat");
const ANNOUNCEMENTS_COLLECTION = db.collection("nitro_announcements");
const resourcesCollection = db.collection("resources");

let currentUserEmail = "";
let currentWidget = "todo";
let lastReadTimestamp = 0;
let highestMessageTimestamp = 0;
let pressTimer = null;
let activeReplyTarget = null; 

let dismissedAnnouncements = new Set();
let activeAnnouncementTimers = {};

// DOM Elements Linkage
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const authMessage = document.getElementById("auth-message");
const robotNameInput = document.getElementById("robot-name-input");
const robotWrap = document.getElementById("robot-wrap");
const sectionsWrapper = document.getElementById("sections-wrapper");
const chatBadge = document.getElementById("chat-badge");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const pinnedDrawer = document.getElementById("pinned-messages-drawer");
const pinnedList = document.getElementById("pinned-list");
const announcementContainer = document.getElementById("announcement-container");
const contextMenu = document.getElementById("custom-context-menu");
const menuReplyBtn = document.getElementById("menu-reply-btn");
const menuPinBtn = document.getElementById("menu-pin-btn");
const menuDeleteBtn = document.getElementById("menu-delete-btn");
const replyPreviewBar = document.getElementById("reply-preview-bar");
const replyPreviewText = document.getElementById("reply-preview-text");

let activeSelectedMsgId = null;
let activeSelectedMsgData = null;

// ==========================================
// 2. INTELLIGENT ROUTING & AUTHENTICATION
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserEmail = user.email || "unknown@team.com";
        loginContainer.classList.add("hidden");
        appContainer.classList.remove("hidden");
        
        lastReadTimestamp = parseInt(localStorage.getItem(`chat_last_read_${currentUserEmail}`)) || 0;
        
        initializeTodoSync();
        initializeChatSync();
        initializeAnnouncementSync();
        initializeResourceSync();
    } else {
        loginContainer.classList.remove("hidden");
        appContainer.classList.add("hidden");
    }
});

// Clear, robust intelligent error-handling sign-in system
document.getElementById("email-auth-btn").addEventListener("click", () => {
    const email = document.getElementById("email-input").value.trim();
    const password = document.getElementById("password-input").value;
    if (!email || !password) return;
    
    authMessage.innerText = "Processing workspace verification...";

    auth.signInWithEmailAndPassword(email, password).catch((error) => {
        // If user doesn't exist, route to auto-registration pipeline natively
        if (error.code === 'auth/user-not-found') {
            auth.createUserWithEmailAndPassword(email, password).catch(err => {
                authMessage.innerText = err.message;
            });
        } else {
            // Explicitly catches wrong passwords/account issues without hiding them
            authMessage.innerText = error.message;
        }
    });
});

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut());

// STRICT VIEWPORT NAVIGATION TAB ROUTER
window.switchWidget = function(targetWidget) {
    currentWidget = targetWidget;
    
    document.getElementById("tab-todo-btn").classList.remove("active");
    document.getElementById("tab-chat-btn").classList.remove("active");
    document.getElementById("tab-resources-btn").classList.remove("active");
    
    document.getElementById("widget-todo").classList.add("hidden");
    document.getElementById("widget-chat").classList.add("hidden");
    document.getElementById("widget-resources").classList.add("hidden");

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
    } else if (targetWidget === 'resources') {
        document.getElementById("tab-resources-btn").classList.add("active");
        document.getElementById("widget-resources").classList.remove("hidden");
    }
};

window.togglePinsView = function() {
    pinnedDrawer.classList.toggle("hidden");
};

// ==========================================
// 3. TO-DO WORKSPACE MANAGEMENT
// ==========================================
function buildTodoUI() {
    sectionsWrapper.innerHTML = "";
    CATEGORIES.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category-card";
        div.innerHTML = `
            <h3>${cat}</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
                <tbody id="tbody-${cat}"></tbody>
            </table>
            <div style="display:flex; gap:6px;">
                <input type="text" id="new-task-${cat}" placeholder="Add ${cat.toLowerCase()} task..." style="flex-grow:1; padding:6px; background:var(--bg-input-fields); border:1px solid var(--border-subtle); color:white; border-radius:4px;" autocomplete="off">
                <select id="new-priority-${cat}" style="padding:6px; background:var(--bg-input-fields); border:1px solid var(--border-subtle); color:white; border-radius:4px;">
                    <option value="Low">Low</option>
                    <option value="Medium" selected>Medium</option>
                    <option value="High">High</option>
                </select>
                <button class="btn secondary-btn" style="padding:4px 10px;" onclick="addNewTask('${cat}')">+</button>
            </div>
        `;
        sectionsWrapper.appendChild(div);
        
        setTimeout(() => {
            const inputEl = document.getElementById(`new-task-${cat}`);
            if (inputEl) {
                inputEl.addEventListener("keypress", (e) => { if (e.key === "Enter") addNewTask(cat); });
            }
        }, 0);
    });
}

function initializeTodoSync() {
    buildTodoUI();
    TODO_REF.onSnapshot((doc) => {
        // Safe database document generation bootstrap if missing
        if (!doc.exists) {
            TODO_REF.set({ robotName: "", Design: [], Mechanical: [], Electrical: [], Software: [], Media: [] }, { merge: true });
            return;
        }
        
        const data = doc.data();
        if (document.activeElement !== robotNameInput) {
            robotNameInput.value = data.robotName || "";
        }
        
        CATEGORIES.forEach(cat => {
            const tbody = document.getElementById(`tbody-${cat}`);
            if (!tbody) return;
            const rows = (data[cat] || []).filter(row => row && row.id);

            tbody.innerHTML = "";
            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td style="color:var(--text-muted); padding:10px; text-align:center; font-size:0.85rem;">No active items</td></tr>`;
                return;
            }

            rows.forEach((row) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="padding:6px 0;">
                        <input type="text" style="width:100%; background:transparent; border:none; color:white; outline:none; text-decoration:${row.completed ? 'line-through' : 'none'}; opacity:${row.completed ? 0.5 : 1}" 
                               value="${escapeHTML(row.task)}" 
                               onblur="updateTodoData('${cat}', '${row.id}', 'task', this.value)">
                    </td>
                    <td style="width:70px; text-align:right;">
                        <span style="font-size:0.75rem; font-weight:700; color:${row.priority==='High'?'var(--accent-red)':row.priority==='Medium'?'var(--accent-gold)':'var(--accent-blue)'}">${row.priority}</span>
                    </td>
                    <td style="width:30px; text-align:right;">
                        <input type="checkbox" ${row.completed ? "checked" : ""} onchange="updateTodoData('${cat}', '${row.id}', 'completed', this.checked)">
                    </td>
                    <td style="width:25px; text-align:right;">
                        <button style="background:transparent; border:none; color:var(--accent-red); cursor:pointer;" onclick="removeTodoRow('${cat}', '${row.id}')">×</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    });
}

robotNameInput.addEventListener("input", (e) => {
    TODO_REF.set({ robotName: e.target.value.trim() }, { merge: true });
});

window.addNewTask = function(cat) {
    const inputEl = document.getElementById(`new-task-${cat}`);
    const priorityEl = document.getElementById(`new-priority-${cat}`);
    if (!inputEl || !inputEl.value.trim()) return;

    const rowId = "row-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    TODO_REF.update({ 
        [cat]: firebase.firestore.FieldValue.arrayUnion({ id: rowId, task: inputEl.value.trim(), completed: false, priority: priorityEl.value }) 
    }).then(() => {
        inputEl.value = "";
        inputEl.focus();
    });
};

window.updateTodoData = function(cat, rowId, field, val) {
    TODO_REF.get().then(doc => {
        if (!doc.exists) return;
        const list = doc.data()[cat] || [];
        const idx = list.findIndex(item => item.id === rowId);
        if (idx !== -1 && list[idx][field] !== val) {
            list[idx][field] = val;
            TODO_REF.update({ [cat]: list });
        }
    });
};

window.removeTodoRow = function(cat, rowId) {
    TODO_REF.get().then(doc => {
        if (!doc.exists) return;
        const list = doc.data()[cat] || [];
        TODO_REF.update({ [cat]: list.filter(item => item.id !== rowId) });
    });
};

// ==========================================
// 4. COMMUNICATIONS CORE STREAM (CLIENT-SIDE SORT SAFEGUARD)
// ==========================================
function initializeChatSync() {
    CHAT_REF.onSnapshot((snapshot) => {
        chatMessages.innerHTML = "";
        pinnedList.innerHTML = "";
        
        let messagesArray = [];
        snapshot.forEach(doc => {
            messagesArray.push({ id: doc.id, ...doc.data() });
        });

        // Safe Client-Side Array Sort handles missing Firestore index crashes completely
        messagesArray.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) : 0;
            const tB = b.timestamp ? (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp) : 0;
            return tA - tB;
        });

        messagesArray.forEach((msg) => {
            const msTime = msg.timestamp ? (msg.timestamp.toMillis ? msg.timestamp.toMillis() : msg.timestamp) : Date.now();
            if (msTime > highestMessageTimestamp) highestMessageTimestamp = msTime;
            
            renderChatMessage(msg.id, msg);
            if (msg.pinned) renderPinnedMessage(msg.id, msg);
        });

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
    wrapper.style = `margin-bottom:12px; text-align:${isOutgoing?'right':'left'}`;
    
    let replyHTML = msg.replyTo ? `<div style="font-size:0.8rem; color:var(--text-muted);">↩ Replying: "${escapeHTML(msg.replyTo.text)}"</div>` : "";

    wrapper.innerHTML = `
        <div style="font-size:0.75rem; color:var(--text-muted);">${msg.sender.split('@')[0]} ${msg.pinned ? '📌' : ''}</div>
        ${replyHTML}
        <div id="bubble-${msgId}" style="display:inline-block; padding:10px 14px; border-radius:8px; background:${isOutgoing?'var(--accent-red)':'var(--bg-card-interior)'}; color:white; max-width:70%; text-align:left; cursor:context-menu;">
            ${escapeHTML(msg.text)}
        </div>
    `;
    chatMessages.appendChild(wrapper);

    const bubble = document.getElementById(`bubble-${msgId}`);
    bubble.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMessageMenu(msgId, msg, isOutgoing, msg.pinned, e.clientX, e.clientY);
    });
}

function renderPinnedMessage(msgId, msg) {
    const item = document.createElement("div");
    item.style = "padding:6px; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;";
    item.innerHTML = `📌 <strong>${msg.sender.split('@')[0]}</strong>: ${escapeHTML(msg.text)}`;
    pinnedList.appendChild(item);
}

// ==========================================
// 5. BANNER ENGINE (CLIENT-SIDE SORT SAFEGUARD)
// ==========================================
function initializeAnnouncementSync() {
    ANNOUNCEMENTS_COLLECTION.onSnapshot((snapshot) => {
        Object.values(activeAnnouncementTimers).forEach(clearTimeout);
        activeAnnouncementTimers = {};
        announcementContainer.innerHTML = "";

        let announcementsArray = [];
        snapshot.forEach(doc => announcementsArray.push({ id: doc.id, ...doc.data() }));
        
        announcementsArray.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) : 0;
            const tB = b.timestamp ? (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp) : 0;
            return tB - tA;
        });

        announcementsArray.forEach((data) => {
            const id = data.id;
            if (dismissedAnnouncements.has(id)) return;

            const timestampMs = data.timestamp ? (data.timestamp.toMillis ? data.timestamp.toMillis() : data.timestamp) : Date.now();
            const difference = Date.now() - timestampMs;
            const fifteenMinutes = 15 * 60 * 1000;

            if (difference < fifteenMinutes) {
                const banner = document.createElement("div");
                banner.style = "background:var(--accent-gold); color:black; padding:10px 20px; font-weight:600; display:flex; justify-content:between; align-items:center; border-radius:6px; margin-bottom:10px;";
                banner.id = `banner-${id}`;
                banner.innerHTML = `
                    <span style="flex-grow:1;">📢 Broadcast: ${escapeHTML(data.text)}</span>
                    <button style="background:transparent; border:none; font-size:1.2rem; cursor:pointer;" onclick="manualDismissBanner('${id}')">&times;</button>
                `;
                
                announcementContainer.appendChild(banner);
                activeAnnouncementTimers[id] = setTimeout(() => {
                    const el = document.getElementById(`banner-${id}`);
                    if (el) el.remove();
                }, fifteenMinutes - difference);
            }
        });
    });
}

window.manualDismissBanner = function(id) {
    dismissedAnnouncements.add(id);
    const el = document.getElementById(`banner-${id}`);
    if (el) el.remove();
};

// ==========================================
// 6. MESSAGING OPERATIONS & UTILITIES
// ==========================================
function openMessageMenu(msgId, msgData, isOwner, isPinned, clientX, clientY) {
    activeSelectedMsgId = msgId;
    activeSelectedMsgData = msgData;
    contextMenu.classList.remove("hidden");
    contextMenu.style.left = `${clientX + window.scrollX}px`;
    contextMenu.style.top = `${clientY + window.scrollY}px`;

    menuReplyBtn.onclick = () => { setupReplyState(msgId, msgData); closeCustomMenu(); };
    menuPinBtn.onclick = () => { CHAT_REF.doc(msgId).update({ pinned: !isPinned }); closeCustomMenu(); };

    if (isOwner) {
        menuDeleteBtn.classList.remove("hidden");
        menuDeleteBtn.onclick = () => { if (confirm("Delete message?")) CHAT_REF.doc(msgId).delete(); closeCustomMenu(); };
    } else {
        menuDeleteBtn.classList.add("hidden");
    }
}

function closeCustomMenu() { contextMenu.classList.add("hidden"); }
document.addEventListener("click", (e) => { if (!contextMenu.contains(e.target)) closeCustomMenu(); });

window.handleMenuReaction = function(emoji) {
    if (!activeSelectedMsgId) return;
    CHAT_REF.doc(activeSelectedMsgId).get().then(doc => {
        if (!doc.exists) return;
        let map = doc.data().reactionsMap || {};
        map[currentUserEmail] = (map[currentUserEmail] === emoji) ? firebase.firestore.FieldValue.delete() : emoji;
        CHAT_REF.doc(activeSelectedMsgId).update({ reactionsMap: map });
    });
    closeCustomMenu();
};

function setupReplyState(msgId, msgData) {
    activeReplyTarget = { id: msgId, sender: msgData.sender, text: msgData.text };
    replyPreviewText.innerHTML = `Replying to <strong>${msgData.sender.split('@')[0]}</strong>: "<em>${escapeHTML(msgData.text)}</em>"`;
    replyPreviewBar.classList.remove("hidden");
    chatInput.focus();
}

window.cancelReplyState = function() { activeReplyTarget = null; replyPreviewBar.classList.add("hidden"); };

function sendMsg() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";

    if (text.startsWith('/announce ')) {
        ANNOUNCEMENTS_COLLECTION.add({ text: text.substring(10).trim(), timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        return; 
    }

    const payload = { text: text, sender: currentUserEmail, timestamp: firebase.firestore.FieldValue.serverTimestamp(), pinned: false, reactionsMap: {} };
    if (activeReplyTarget) payload.replyTo = activeReplyTarget;

    CHAT_REF.add(payload).then(() => cancelReplyState());
}

chatSendBtn.addEventListener("click", sendMsg);
chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMsg(); });

function escapeHTML(str) { return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""; }

// ==========================================
// 7. MULTIMEDIA REPOSITORY RUNTIME
// ==========================================
window.toggleResourceType = function() {
    const type = document.getElementById("res-type").value;
    document.getElementById("url-input-group").style.display = type === "file" ? "none" : "block";
    document.getElementById("file-input-group").style.display = type === "file" ? "block" : "none";
};

window.submitResource = async function() {
    const title = document.getElementById("res-title").value.trim();
    const type = document.getElementById("res-type").value;
    const statusText = document.getElementById("upload-status");
    
    if (!title) return alert("Resource requires a descriptive title entry!");

    let fileUrl = "";
    let fileName = "";
    let fileCategory = "link";

    try {
        if (type === "link") {
            fileUrl = document.getElementById("res-url").value.trim();
            if (!fileUrl) return alert("Please specify absolute resource link path coordinates!");
        } else {
            const file = document.getElementById("res-file").files[0];
            if (!file) return alert("Please attach a document data resource element.");

            fileName = file.name;
            const ext = fileName.split('.').pop().toLowerCase();
            fileCategory = ext === "stl" ? "stl" : ["png", "jpg", "jpeg", "webp"].includes(ext) ? "image" : "file";

            statusText.innerText = "⏳ Routing file asset arrays to cloud database matrices...";
            const snapshot = await firebase.storage().ref(`resources/${Date.now()}_${fileName}`).put(file);
            fileUrl = await snapshot.ref.getDownloadURL();
        }

        await resourcesCollection.add({
            title: title,
            url: fileUrl,
            type: fileCategory,
            fileName: fileName || title,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById("res-title").value = "";
        document.getElementById("res-url").value = "";
        document.getElementById("res-file").value = "";
        statusText.innerText = "";
        alert("Repository entry saved successfully!");
    } catch (e) {
        alert("Repository system pipeline error: " + e.message);
        statusText.innerText = "";
    }
};

function initializeResourceSync() {
    resourcesCollection.onSnapshot((snapshot) => {
        const container = document.getElementById("resources-list");
        if (!container) return;
        
        container.innerHTML = "";
        let resourcesArray = [];
        snapshot.forEach(doc => resourcesArray.push({ id: doc.id, ...doc.data() }));

        // Safe Client-Side Array Sort handles missing Firestore index crashes completely
        resourcesArray.sort((a, b) => {
            const tA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : a.createdAt) : 0;
            const tB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : b.createdAt) : 0;
            return tB - tA;
        });

        if (resourcesArray.length === 0) {
            container.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:20px 0;">No resources added yet.</p>`;
            return;
        }

        resourcesArray.forEach((data) => {
            const card = document.createElement("div");
            card.className = `resource-card ${data.type}-card`;

            let visualAsset = data.type === "image" ? `<img src="${data.url}" class="resource-preview-img" loading="lazy">` : 
                              data.type === "stl" ? `<span class="stl-badge">🧊 3D MODEL (.STL)</span>` : `<span class="stl-badge">🌐 REFERENCE LINK</span>`;

            card.innerHTML = `
                <div>
                    ${visualAsset}
                    <h4 class="resource-title">${escapeHTML(data.title)}</h4>
                    <p class="resource-meta">${data.fileName !== data.title ? escapeHTML(data.fileName) : 'External Path'}</p>
                </div>
                <div class="resource-actions">
                    <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="btn btn-link">${data.type === 'link' ? '🔗 Open URL' : '⬇️ Download'}</a>
                    <button onclick="deleteResource('${data.id}')" class="btn btn-delete">✕</button>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

window.deleteResource = function(id) {
    if (confirm("Permanently clear this file registry link from data stores?")) resourcesCollection.doc(id).delete();
};
