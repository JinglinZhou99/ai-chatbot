require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');

const Interaction = require('./models/Interaction');
const EventLog = require('./models/EventLog');

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.static('public'));

// MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));

// index.html (Homepage)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// (/chat.html，express.static)

// chat
app.post('/chat', async (req, res) => {
    const { message, participantID } = req.body;

    if (!participantID) {
        return res.status(400).json({ error: "Participant ID is required" });
    }

    try {
        // 1. OpenAI API
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // 或者使用 gpt-4
            messages: [{ role: "user", content: message }],
        });

        const botReply = completion.choices[0].message.content;

        // 2. MongoDB
        const newInteraction = new Interaction({
            participantID: participantID,
            userInput: message,
            botResponse: botReply
        });
        await newInteraction.save();

        // 3. frontend
        res.json({ userMessage: message, botReply: botReply });
    } catch (error) {
        console.error("OpenAI/DB Error:", error);
        res.status(500).json({ error: "Failed to process chat" });
    }
});

// history
app.post('/history', async (req, res) => {
    const { participantID } = req.body;
    try {
        const history = await Interaction.find({ participantID }).sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// event
app.post('/log-event', async (req, res) => {
    const { participantID, eventType, elementName } = req.body;
    try {
        const newEvent = new EventLog({
            participantID,
            eventType,
            elementName
        });
        await newEvent.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to log event" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});