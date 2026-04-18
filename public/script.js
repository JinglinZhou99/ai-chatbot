const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethodDropdown = document.getElementById('retrieval-method');

// 1. Get Participant ID and System ID from URL (Fallback to localStorage)
const urlParams = new URLSearchParams(window.location.search);
let participantID = urlParams.get('participantID') || localStorage.getItem('participantID');
let systemID = urlParams.get('systemID');

if (!participantID) {
    alert("No Participant ID found. Redirecting to home page.");
    window.location.href = '/';
}
if (!systemID && participantID) {
    systemID = parseInt(participantID) % 2 === 1 ? 1 : 2; // Calculate if missing
}

// 2. Global variable to store the last N conversation turns
let conversationHistory = [];
const HISTORY_LIMIT = 5; // Store last 5 interactions

// Update UI to show which system is active
window.addEventListener('DOMContentLoaded', () => {
    const chatTitle = document.querySelector('#chat-container h2');
    if (chatTitle) {
        chatTitle.textContent = `AI Chat (System ${systemID})`;
    }
});

async function loadDocuments() {
    try {
        const res = await fetch('/documents');
        const docs = await res.json();
        const docsContainer = document.getElementById('uploaded-docs');
        
        if (docs.length === 0) {
            docsContainer.innerHTML = '<p class="empty-state">No documents uploaded yet</p>';
            return;
        }
        
        docsContainer.innerHTML = docs.map(doc => 
            `<div style="margin-bottom: 5px; font-size: 14px;">
                📄 <strong>${doc.filename}</strong> <span style="color: green; font-size: 12px;">(${doc.processingStatus})</span>
            </div>`
        ).join('');
    } catch (err) {
        console.error("Failed to load documents", err);
    }
}

// 3. Load Conversation History (Only the last N)
async function loadConversationHistory() {
    try {
        const response = await fetch('/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantID })
        });
        const history = await response.json();
        
        history.forEach(interaction => {
            appendMessage(interaction.userInput, 'user-msg-bubble');
            
            let botContent = `Bot: "${interaction.botResponse}"`;
            if (interaction.retrievedEvidence && interaction.retrievedEvidence.length > 0) {
                const evidenceHtml = interaction.retrievedEvidence.map((e, idx) => 
                    `<div style="font-size: 11px; background: #e5e7eb; padding: 4px; margin-top: 4px; border-radius: 4px;">
                        <strong>[E${idx + 1}]</strong> ${e.chunkText.substring(0, 80)}... <em>(Score: ${e.relevanceScore.toFixed(2)})</em>
                    </div>`
                ).join('');
                
                let confidenceHtml = '';
                if (interaction.confidence) {
                    confidenceHtml = `<div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                        System Confidence: ${(interaction.confidence.overallConfidence * 100).toFixed(1)}% | Method: ${interaction.retrievalMethod}
                    </div>`;
                }
                
                botContent = `<div>Bot: "${interaction.botResponse}"</div><hr style="margin: 8px 0; border-top: 1px solid #d1d5db;">` + evidenceHtml + confidenceHtml;
            }
            
            appendHtmlMessage(botContent, 'bot-msg-bubble');

            // Add to client-side history memory
            conversationHistory.push({ role: "user", content: interaction.userInput });
            conversationHistory.push({ role: "assistant", content: interaction.botResponse });
        });

        // Ensure we only keep the last N*2 messages (user + assistant per interaction)
        if (conversationHistory.length > HISTORY_LIMIT * 2) {
            conversationHistory = conversationHistory.slice(-(HISTORY_LIMIT * 2));
        }

    } catch (error) {
        console.error("Failed to load history:", error);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadDocuments(); 
    loadConversationHistory();
});

function appendMessage(text, className) {
    const msgElement = document.createElement('div');
    msgElement.textContent = text;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendHtmlMessage(htmlContent, className) {
    const msgElement = document.createElement('div');
    msgElement.innerHTML = htmlContent;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

document.getElementById('upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length === 0) {
        alert("Please select a file first!");
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const btn = document.getElementById('upload-btn');
    btn.textContent = "Uploading...";
    btn.disabled = true;

    try {
        const response = await fetch('/upload-document', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alert("Document uploaded and indexed successfully!");
            fileInput.value = ""; 
            await loadDocuments(); 
        } else {
            alert("Failed to upload document.");
        }
    } catch (err) {
        console.error("Upload error:", err);
    } finally {
        btn.textContent = "Upload";
        btn.disabled = false;
    }
});

// 4. Chat Submission with History and SystemID
async function sendMessage() {
    const messageText = inputField.value.trim();
    if (messageText === "") return;

    appendMessage(messageText, 'user-msg-bubble');
    inputField.value = "";

    const requestData = {
        message: messageText,
        retrievalMethod: retrievalMethodDropdown.value,
        participantID: participantID,
        systemID: systemID, // Include systemID
        history: conversationHistory // Include the recent history
    };

    // Add current user message to local history
    conversationHistory.push({ role: "user", content: messageText });

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const data = await response.json();
        
        let botContent = `<div>Bot: "${data.botReply}"</div>`;
        
        if (data.evidence && data.evidence.length > 0) {
            botContent += `<hr style="margin: 8px 0; border-top: 1px solid #d1d5db;">`;
            data.evidence.forEach((e, idx) => {
                botContent += `<div style="font-size: 11px; background: #e5e7eb; padding: 4px; margin-top: 4px; border-radius: 4px;">
                    <strong>[E${idx + 1}]</strong> ${e.chunkText.substring(0, 80)}... <em>(Score: ${e.relevanceScore.toFixed(2)})</em>
                </div>`;
            });
        }

        if (data.confidence) {
            botContent += `<div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                System Confidence: ${(data.confidence.overallConfidence * 100).toFixed(1)}% | Method: ${data.confidence.retrievalMethod}
            </div>`;
        }

        appendHtmlMessage(botContent, 'bot-msg-bubble');

        // Add bot reply to local history and trim if necessary
        conversationHistory.push({ role: "assistant", content: data.botReply });
        if (conversationHistory.length > HISTORY_LIMIT * 2) {
            conversationHistory = conversationHistory.slice(-(HISTORY_LIMIT * 2));
        }

    } catch (error) {
        console.error("Error communicating with server:", error);
    }
}

sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') sendMessage();
});

function logInteraction(eventType, elementName) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID, systemID, eventType, elementName }) // Send systemID with events too
    }).catch(err => console.error("Event log failed:", err));
}

inputField.addEventListener('focus', () => logInteraction('focus', 'user-input'));
sendBtn.addEventListener('click', () => logInteraction('click', 'send-btn'));
document.getElementById('upload-btn').addEventListener('click', () => logInteraction('click', 'upload-btn'));

let hoverTimer;
document.querySelectorAll('.panel-section, #chat-container').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
            const elementName = e.target.id || e.target.className.split(' ')[0];
            logInteraction('hover', elementName);
        }, 500); 
    });
});