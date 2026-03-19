const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethodDropdown = document.getElementById('retrieval-method');

// 1. Participant ID
const participantID = localStorage.getItem('participantID');
if (!participantID) {
    alert("No Participant ID found. Redirecting to home page.");
    window.location.href = '/';
}

// 2. history
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantID })
        });
        const history = await response.json();
        
        history.forEach(interaction => {
            appendMessage(interaction.userInput, 'user-msg-bubble');
            appendMessage(`Bot: "${interaction.botResponse}"`, 'bot-msg-bubble');
        });
    } catch (error) {
        console.error("Failed to load history:", error);
    }
});

// message
function appendMessage(text, className) {
    const msgElement = document.createElement('div');
    msgElement.textContent = text;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 3. sendMessage contain participantID
async function sendMessage() {
    const messageText = inputField.value.trim();
    if (messageText === "") return;

    appendMessage(messageText, 'user-msg-bubble');
    inputField.value = "";

    const requestData = {
        message: messageText,
        retrievalMethod: retrievalMethodDropdown.value,
        participantID: participantID // add
    };

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const data = await response.json();
        appendMessage(`Bot: "${data.botReply}"`, 'bot-msg-bubble');
    } catch (error) {
        console.error("Error communicating with server:", error);
    }
}

sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') sendMessage();
});

// 4. Logging Events
function logInteraction(eventType, elementName) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            participantID,
            eventType,
            elementName
        })
    }).catch(err => console.error("Event log failed:", err));
}

// focus & click
inputField.addEventListener('focus', () => logInteraction('focus', 'user-input'));
sendBtn.addEventListener('click', () => logInteraction('click', 'send-btn'));
document.getElementById('upload-btn').addEventListener('click', () => logInteraction('click', 'upload-btn'));

// hover (mouseenter)
let hoverTimer;
document.querySelectorAll('.panel-section, #chat-container').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
            const elementName = e.target.id || e.target.className.split(' ')[0];
            logInteraction('hover', elementName);
        }, 500); // 500ms - hover
    });
});