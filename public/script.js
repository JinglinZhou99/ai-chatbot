const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethodDropdown = document.getElementById('retrieval-method');

async function sendMessage() {
    const messageText = inputField.value.trim();

    if (messageText === "") {
        alert("Message cannot be empty. Please type something!");
        return;
    }

    const userMsgElement = document.createElement('div');
    userMsgElement.textContent = messageText;
    userMsgElement.classList.add('user-msg-bubble');
    messagesContainer.appendChild(userMsgElement);

    inputField.value = "";
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const selectedMethod = retrievalMethodDropdown.value;
    const requestData = {
        message: messageText,
        retrievalMethod: selectedMethod
    };

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        console.log("Server response:", data);

        const botMsgElement = document.createElement('div');
        botMsgElement.textContent = `Bot: "${data.botReply}"`;
        botMsgElement.classList.add('bot-msg-bubble');
        messagesContainer.appendChild(botMsgElement);

        messagesContainer.scrollTop = messagesContainer.scrollHeight;

    } catch (error) {
        console.error("Error communicating with server:", error);
    }
}

sendBtn.addEventListener('click', sendMessage);

inputField.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

retrievalMethodDropdown.addEventListener('change', function() {
    console.log(`Retrieval method: ${this.value}`);
});

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');

uploadBtn.addEventListener('click', function() {
    if (fileInput.files.length > 0) {
        console.log(`Selected file: ${fileInput.files[0].name}`);
    } else {
        console.log("No file selected.");
    }
});