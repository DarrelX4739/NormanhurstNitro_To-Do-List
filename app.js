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

const CATEGORIES = ["Design", "Mechanical", "Electrical", "Software", "Media"];
const TODO_REF = db.collection("nitro_todo").doc("season_2026");
const CHAT_REF = db.collection("nitro_workspace_chat");
const ANNOUNCEMENT_REF = db.collection("nitro_workspace_config").doc("global_announcement");

let currentUserEmail = "";
let currentWidget = "todo";
let lastReadTimestamp = 0;
let highestMessageTimestamp = 0;
let pressTimer = null;
let activeReplyTarget = null; 
let announcementExpiryTimer = null;

// DOM Selectors
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
const announcementBanner = document.getElementById("announcement-banner");

const contextMenu = document.getElementById("custom-context-menu");
const menuReplyBtn = document.getElementById("menu-reply-btn");
const menuPinBtn = document.getElementById("menu-pin-btn");
const menuDeleteBtn = document.getElementById("menu-delete-btn");
const replyPreviewBar = document.getElementById("reply-preview-bar");
const replyPreviewText = document.getElementById("reply-preview-text");

let activeSelectedMsgId = null;
let activeSelectedMsgData = null;

// ==========================================
// 2. AUTH ROUTING HOOKS
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
            <div class="task-creator-row">
                <input type="text" id="new-task-${cat}" placeholder="Add a new ${cat.toLowerCase()} task..." autocomplete="off">
                <button class="btn secondary-btn" onclick="addNewTask('${cat}')">+ Add</button>
            </div>
        `;
        sectionsWrapper.appendChild(div);
        
        setTimeout(() => {
            const inputEl = document.getElementById(`new-task-${cat}`);
            if (inputEl) {
                inputEl.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") addNewTask(cat);
                });
            }
        }, 0);
    });
}

function initializeTodoSync() {
    buildTodoUI();
    TODO_REF.onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        if (document.activeElement !== robotNameInput) {
            robotNameInput.value = data.robotName || "";
            robotWrap.setAttribute('data-value', data.robotName || "");
            triggerFailSafeWidth();
        }
        
        CATEGORIES.forEach(cat => {
            const tbody = document.getElementById(`tbody-${cat}`);
            const rows = data[cat] || [];
            
            const activeEl = document.activeElement;
            const activeRowId = activeEl && activeEl.dataset ? activeEl.dataset.rowId : null;
            
            tbody.innerHTML = "";
            rows.forEach((row) => {
                const tr = document.createElement("tr");
                if (row.completed) tr.classList.add("completed");
                tr.innerHTML = `
                    <td>
                        <input type="text" class="task-input" data-row-id="${row.id}" 
                               value="${escapeHTML(row.task)}" placeholder="Task description..."
                               onblur="updateTodoData('${cat}', '${row.id}', 'task', this.value)"
                               onkeydown="if(event.key === 'Enter') this.blur()">
                    </td>
                    <td class="status-col"><input type="checkbox" class="task-checkbox" ${row.completed ? "checked" : ""} onchange="updateTodoData('${cat}', '${row.id}', 'completed', this.checked)"></td>
                    <td class="action-col"><button class="row-delete-btn" onclick="removeTodoRow('${cat}', '${row.id}')">×</button></td>
                `;
                tbody.appendChild(tr);
            });
            
            if (activeRowId) {
                const restoredInput = tbody.querySelector(`input[data-row-id="${activeRowId}"]`);
                if (restoredInput) {
                    restoredInput.focus();
                    restoredInput.selectionStart = restoredInput.selectionEnd = restoredInput.value.length;
                }
            }
        });
    });
}

robotNameInput.addEventListener("input", (e) => {
    TODO_REF.update({ robotName: e.target.value.trim() });
    triggerFailSafeWidth();
});

window.addNewTask = function(cat) {
    const inputEl = document.getElementById(`new-task-${cat}`);
    if (!inputEl) return;
    const taskText = inputEl.value.trim();
    if (!taskText) return;

    const rowId = "row-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    TODO_REF.update({ 
        [cat]: firebase.firestore.FieldValue.arrayUnion({ id: rowId, task: taskText, completed: false }) 
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
        if (idx !== -1) {
            if (list[idx][field] !== val) {
                list[idx][field] = val;
                TODO_REF.update({ [cat]: list });
            }
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
// 4. REAL-TIME CHAT ENGINE (INTERCEPT ENABLED)
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
    
    const reactionMap = msg.reactionsMap || {};
    const emojiCounts = { '❤️': 0, '😊': 0, '🔥': 0, '💀': 0, '😭': 0 };

    Object.keys(reactionMap).forEach(user => {
        const chosenEmoji = reactionMap[user];
        if (emojiCounts[chosenEmoji] !== undefined) {
            emojiCounts[chosenEmoji]++;
        }
    });

    let reactionsHTML = "";
    Object.keys(emojiCounts).forEach(emoji => {
        if (emojiCounts[emoji] > 0) {
            const userReactedToThisOne = reactionMap[currentUserEmail] === emoji;
            reactionsHTML += `
                <span class="reaction-chip ${userReactedToThisOne ? 'user-reacted' : ''}" 
                      onclick="toggleReactionDirectly('${msgId}', '${emoji}')">
                    ${emoji} ${emojiCounts[emoji]}
                </span>`;
        }
    });

    let replyHTML = "";
    if (msg.replyTo) {
        replyHTML = `
            <div class="inline-reply-box">
                <span class="reply-sender-label">↩ ${msg.replyTo.sender.split('@')[0]}</span> 
                ${escapeHTML(msg.replyTo.text)}
            </div>
        `;
    }

    wrapper.innerHTML = `
        <div class="msg-meta">${msg.sender} ${msg.pinned ? '📌' : ''}</div>
        ${replyHTML}
        <div class="msg-bubble" id="bubble-${msgId}">
            ${escapeHTML(msg.text)}
        </div>
        <div class="msg-addons">
            <div class="reactions-row">${reactionsHTML}</div>
        </div>
    `;

    chatMessages.appendChild(wrapper);

    const bubbleElement = document.getElementById(`bubble-${msgId}`);
    
    bubbleElement.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMessageMenu(msgId, msg, isOutgoing, msg.pinned, e.clientX, e.clientY);
    });

    bubbleElement.addEventListener("touchstart", (e) => {
        pressTimer = setTimeout(() => {
            const touch = e.touches[0];
            openMessageMenu(msgId, msg, isOutgoing, msg.pinned, touch.clientX, touch.clientY);
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

// ==========================================
// 5. 15-MINUTE EXPIRES BANNER ENGINE
// ==========================================
function initializeAnnouncementSync() {
    ANNOUNCEMENT_REF.onSnapshot((doc) => {
        if (announcementExpiryTimer) clearTimeout(announcementExpiryTimer);
        
        if (!doc.exists) {
            announcementBanner.classList.add("hidden");
            return;
        }

        const data = doc.data();
        if (!data.text) {
            announcementBanner.classList.add("hidden");
            return;
        }

        // Handle case where server timestamp calculation is pending on local client echo
        const timestampMs = data.timestamp ? (data.timestamp.toMillis ? data.timestamp.toMillis() : data.timestamp) : Date.now();
        const difference = Date.now() - timestampMs;
        const fifteenMinutes = 15 * 60 * 1000;

        if (difference < fifteenMinutes) {
            announcementBanner.innerHTML = `📢 <strong>Announcement:</strong> ${escapeHTML(data.text)}`;
            announcementBanner.classList.remove("hidden");

            const remainingTime = fifteenMinutes - difference;
            announcementExpiryTimer = setTimeout(() => {
                announcementBanner.classList.add("hidden");
            }, remainingTime);
        } else {
            announcementBanner.classList.add("hidden");
        }
    });
}

// ==========================================
// 6. CONTEXT MENU & REACTIONS
// ==========================================
function openMessageMenu(msgId, msgData, isOwner, isPinned, clientX, clientY) {
    activeSelectedMsgId = msgId;
    activeSelectedMsgData = msgData;

    contextMenu.classList.remove("hidden");

    const containerRect = chatMessages.getBoundingClientRect();
    const menuRect = contextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 180;
    const menuHeight = menuRect.height || 220;

    let targetLeft = clientX;
    let targetTop = clientY;

    if (targetLeft + menuWidth > containerRect.right) targetLeft = containerRect.right - menuWidth - 12;
    if (targetLeft < containerRect.left) targetLeft = containerRect.left + 12;
    if (targetTop + menuHeight > containerRect.bottom) targetTop = containerRect.bottom - menuHeight - 12;
    if (targetTop < containerRect.top) targetTop = containerRect.top + 12;

    contextMenu.style.left = `${targetLeft + window.scrollX}px`;
    contextMenu.style.top = `${targetTop + window.scrollY}px`;

    menuReplyBtn.onclick = () => {
        setupReplyState(msgId, msgData);
        closeCustomMenu();
    };

    menuPinBtn.onclick = () => {
        CHAT_REF.doc(msgId).update({ pinned: !isPinned });
        closeCustomMenu();
    };

    if (isOwner) {
        menuDeleteBtn.classList.remove("hidden");
        menuDeleteBtn.onclick = () => {
            if (confirm("Delete this message?")) CHAT_REF.doc(msgId).delete();
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
    if (!contextMenu.contains(e.target)) closeCustomMenu();
});

window.handleMenuReaction = function(emoji) {
    if (!activeSelectedMsgId) return;
    toggleReactionDirectly(activeSelectedMsgId, emoji);
    closeCustomMenu();
};

window.toggleReactionDirectly = function(msgId, emoji) {
    CHAT_REF.doc(msgId).get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        let map = data.reactionsMap || {};

        if (map[currentUserEmail] === emoji) {
            delete map[currentUserEmail]; 
        } else {
            map[currentUserEmail] = emoji; 
        }

        CHAT_REF.doc(msgId).update({ reactionsMap: map });
    });
};

// ==========================================
// 7. REPLY HANDLING STATES
// ==========================================
function setupReplyState(msgId, msgData) {
    activeReplyTarget = {
        id: msgId,
        sender: msgData.sender,
        text: msgData.text
    };
    replyPreviewText.innerHTML = `Replying to <strong>${msgData.sender.split('@')[0]}</strong>: "<em>${escapeHTML(msgData.text)}</em>"`;
    replyPreviewBar.classList.remove("hidden");
    chatInput.focus();
}

window.cancelReplyState = function() {
    activeReplyTarget = null;
    replyPreviewBar.classList.add("hidden");
};

// ==========================================
// 8. MESSAGE DISPATCH TRANSMISSION (COMMAND INTELLIGENCE)
// ==========================================
function sendMsg() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";

    // Command Intercept Hook Engine
    if (text.startsWith('/announce ')) {
        const announcementContent = text.substring(10).trim();
        if (announcementContent) {
            ANNOUNCEMENT_REF.set({
                text: announcementContent,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                cancelReplyState();
            }).catch(err => console.error("Announcement transmission fail: ", err));
        }
        return; // Halts regular text dispatch execution
    }

    const payload = {
        text: text,
        sender: currentUserEmail,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        pinned: false,
        reactionsMap: {}
    };

    if (activeReplyTarget) {
        payload.replyTo = activeReplyTarget;
    }

    CHAT_REF.add(payload)
        .then(() => { cancelReplyState(); })
        .catch(err => console.error("Message error: ", err));
}

chatSendBtn.addEventListener("click", sendMsg);
chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMsg(); });

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ==========================================
// 9. FAIL-SAFE WIDTH ENGINE
// ==========================================
function triggerFailSafeWidth() {
    if (robotNameInput && robotWrap) {
        if (robotNameInput.value.length > 0) {
            robotWrap.style.width = (robotNameInput.value.length + 1) + "ch";
        } else {
            robotWrap.style.width = "auto";
        }
    }
}
if (robotNameInput) {
    robotNameInput.addEventListener("input", triggerFailSafeWidth);
}
