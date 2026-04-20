// ==========================================
// 1. Shared Variables & Initialization
// ==========================================
const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethodDropdown = document.getElementById('retrieval-method');

// Get Participant ID and System ID from URL (Fallback to localStorage)
const urlParams = new URLSearchParams(window.location.search);
let participantID = urlParams.get('participantID') || localStorage.getItem('participantID');
let systemID = urlParams.get('systemID');

if (!participantID && window.location.pathname !== '/') {
    alert("No Participant ID found. Redirecting to home page.");
    window.location.href = '/';
}
if (!systemID && participantID) {
    systemID = parseInt(participantID) % 2 === 1 ? 1 : 2; 
}

// Global variable to store the last N conversation turns
let conversationHistory = [];
const HISTORY_LIMIT = 5; 

// Update UI to show which system is active (Only if on chat.html)
window.addEventListener('DOMContentLoaded', () => {
    const chatTitle = document.querySelector('#chat-container h2');
    if (chatTitle) {
        chatTitle.textContent = `AI Chat (System ${systemID})`;
    }
});


// ==========================================
// 2. Document & History Loading (For chat.html)
// ==========================================
async function loadDocuments() {
    try {
        const docsContainer = document.getElementById('uploaded-docs');
        // DEFENSIVE CHECK: If not on chat page, stop here.
        if (!docsContainer) return; 

        const res = await fetch('/documents');
        const docs = await res.json();
        
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

async function loadConversationHistory() {
    // DEFENSIVE CHECK: If no message container, we aren't on chat page.
    if (!messagesContainer) return;

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

            conversationHistory.push({ role: "user", content: interaction.userInput });
            conversationHistory.push({ role: "assistant", content: interaction.botResponse });
        });

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

// Helper Functions
function appendMessage(text, className) {
    if (!messagesContainer) return;
    const msgElement = document.createElement('div');
    msgElement.textContent = text;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendHtmlMessage(htmlContent, className) {
    if (!messagesContainer) return;
    const msgElement = document.createElement('div');
    msgElement.innerHTML = htmlContent;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// ==========================================
// 3. Chat & Upload Handlers (For chat.html)
// ==========================================
const uploadBtn = document.getElementById('upload-btn');
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('file-input');
        if (fileInput.files.length === 0) {
            alert("Please select a file first!");
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        uploadBtn.textContent = "Uploading...";
        uploadBtn.disabled = true;

        try {
            const response = await fetch('/upload-document', { method: 'POST', body: formData });
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
            uploadBtn.textContent = "Upload";
            uploadBtn.disabled = false;
        }
    });
}

async function sendMessage() {
    if (!inputField) return;
    const messageText = inputField.value.trim();
    if (messageText === "") return;

    appendMessage(messageText, 'user-msg-bubble');
    inputField.value = "";

    const requestData = {
        message: messageText,
        retrievalMethod: retrievalMethodDropdown ? retrievalMethodDropdown.value : 'semantic',
        participantID: participantID,
        systemID: systemID,
        history: conversationHistory 
    };

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

        conversationHistory.push({ role: "assistant", content: data.botReply });
        if (conversationHistory.length > HISTORY_LIMIT * 2) {
            conversationHistory = conversationHistory.slice(-(HISTORY_LIMIT * 2));
        }

    } catch (error) {
        console.error("Error communicating with server:", error);
    }
}

// Attach event listeners ONLY if elements exist
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}
if (inputField) {
    inputField.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') sendMessage();
    });
}


// ==========================================
// 4. Logging Events
// ==========================================
function logInteraction(eventType, elementName) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID, systemID, eventType, elementName }) 
    }).catch(err => console.error("Event log failed:", err));
}

if (inputField) inputField.addEventListener('focus', () => logInteraction('focus', 'user-input'));
if (sendBtn) sendBtn.addEventListener('click', () => logInteraction('click', 'send-btn'));
if (uploadBtn) uploadBtn.addEventListener('click', () => logInteraction('click', 'upload-btn'));

let hoverTimer;
const hoverPanels = document.querySelectorAll('.panel-section, #chat-container');
if (hoverPanels.length > 0) {
    hoverPanels.forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                const elementName = e.target.id || e.target.className.split(' ')[0];
                logInteraction('hover', elementName);
            }, 500); 
        });
    });
}


// ==========================================
// 5. Study Workflow Page Logic (For study-workflow.html)
// ==========================================
const surveyBtn = document.getElementById('survey-btn');
const taskBtn = document.getElementById('task-btn');
const prototypeBtn = document.getElementById('prototype-btn');

if (surveyBtn) {
    surveyBtn.addEventListener('click', () => {
        fetch('/redirect-to-survey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantID })
        })
        .then(response => response.text())
        .then(url => {
            logInteraction('redirect', 'Qualtrics Survey');
            window.location.href = url; // Jump to survey
        })
        .catch(error => {
            console.error('Error redirecting to survey:', error);
            alert('There was an error redirecting to the survey. Please try again.');
        });
    });
}

if (taskBtn) {
    taskBtn.addEventListener('click', () => {
        alert('Please carefully read the provided task instructions before continuing.');
    });
}

if (prototypeBtn) {
    prototypeBtn.addEventListener('click', () => {
        window.location.href = `/chat.html?participantID=${participantID}&systemID=${systemID}`;
    });
}