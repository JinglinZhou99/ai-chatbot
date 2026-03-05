const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.post('/chat', (req, res) => {
    const userMessage = req.body.message;
    const retrievalMethod = req.body.retrievalMethod;

    console.log(`[Server Log] User Message: ${userMessage}`);
    console.log(`[Server Log] Retrieval Method: ${retrievalMethod}`);

    res.json({
        userMessage: userMessage,
        botReply: "Message Received!"
    });
});

app.listen(PORT, () => {
    console.log(`Server is successfully running on http://localhost:${PORT}`);
});