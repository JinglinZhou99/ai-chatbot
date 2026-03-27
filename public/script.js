const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethodDropdown = document.getElementById('retrieval-method');

// 1. Participant ID Check
const participantID = localStorage.getItem('participantID');
if (!participantID) {
    alert("No Participant ID found. Redirecting to home page.");
    window.location.href = '/';
}

// 2. Fetch Document List
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

// 3. Initial Load (History & Documents)
window.addEventListener('DOMContentLoaded', async () => {
    loadDocuments(); // Load left panel

    try {
        const response = await fetch('/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantID })
        });
        const history = await response.json();
        
        history.forEach(interaction => {
            appendMessage(interaction.userInput, 'user-msg-bubble');
            
            // Reconstruct Bot Reply with evidence if it exists in history
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
        });
    } catch (error) {
        console.error("Failed to load history:", error);
    }
});

// Helper: Append Text Message
function appendMessage(text, className) {
    const msgElement = document.createElement('div');
    msgElement.textContent = text;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Helper: Append HTML Message (for rich evidence rendering)
function appendHtmlMessage(htmlContent, className) {
    const msgElement = document.createElement('div');
    msgElement.innerHTML = htmlContent;
    msgElement.classList.add(className);
    messagesContainer.appendChild(msgElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 4. Document Upload Handler
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
            fileInput.value = ""; // Clear input
            await loadDocuments(); // Refresh list
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

// 5. Chat Submission
async function sendMessage() {
    const messageText = inputField.value.trim();
    if (messageText === "") return;

    appendMessage(messageText, 'user-msg-bubble');
    inputField.value = "";

    const requestData = {
        message: messageText,
        retrievalMethod: retrievalMethodDropdown.value,
        participantID: participantID 
    };

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const data = await response.json();
        
        // Render Bot Reply with Evidence and Confidence
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

    } catch (error) {
        console.error("Error communicating with server:", error);
    }
}

sendBtn.addEventListener('click', sendMessage);
inputField.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') sendMessage();
});

// 6. Logging Events
function logInteraction(eventType, elementName) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID, eventType, elementName })
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