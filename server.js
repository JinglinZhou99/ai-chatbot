require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const multer = require('multer');

// Models
const Interaction = require('./models/Interaction');
const EventLog = require('./models/EventLog');
const Document = require('./models/Document');

// Services
const documentProcessor = require('./services/documentProcessor'); 
const embeddingService = require('./services/embeddingService');
const retrievalService = require('./services/retrievalService');
const confidenceCalculator = require('./services/confidenceCalculator');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// OpenAI Setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection & Retrieval Initialization
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('Successfully connected to MongoDB Atlas');
        await retrievalService.initialize(); 
    })
    .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- RAG: Get Document List ---
app.get('/documents', async (req, res) => {
    try {
        const docs = await Document.find({}, 'filename processingStatus processedAt');
        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch documents" });
    }
});

// --- RAG: Upload & Process Document ---
app.post('/upload-document', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
        const extracted = await documentProcessor.processDocument(req.file); 
        const chunksWithEmbeddings = await embeddingService.generateEmbeddings(extracted.chunks);

        const newDoc = new Document({
            filename: req.file.originalname,
            text: extracted.fullText,
            chunks: chunksWithEmbeddings,
            processingStatus: 'completed'
        });
        await newDoc.save();
        await retrievalService.rebuildIndex();

        res.json({ message: "Document uploaded and processed successfully", docId: newDoc._id });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Failed to process document" });
    }
});

// --- RAG: Chat Interface (With History Injection) ---
app.post('/chat', async (req, res) => {
    // Extract history and systemID from req.body
    const { message, participantID, retrievalMethod, systemID, history } = req.body;

    if (!participantID) {
        return res.status(400).json({ error: "Participant ID is required" });
    }

    try {
        const retrievedDocs = await retrievalService.retrieve(message, { 
            method: retrievalMethod, 
            topK: 3 
        });

        let systemPrompt = "You are a helpful assistant.";
        if (retrievedDocs && retrievedDocs.length > 0) {
            const contextText = retrievedDocs.map(doc => doc.chunkText).join('\n\n');
            systemPrompt += ` Use the following retrieved context to answer the user's question. If the answer is not in the context, just say you don't know based on the documents.\n\nContext:\n${contextText}`;
        }

        // Combine System Prompt + Past Conversation History + Current User Message
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...(history || []), // Spread the past N interactions into the array
            { role: "user", content: message }
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: openAiMessages,
        });
        const botReply = completion.choices[0].message.content;

        const confidenceMetrics = confidenceCalculator.calculate({
            retrievedDocs,
            retrievalMethod,
            responseLogprobs: null 
        });

        // Save systemID to DB
        const newInteraction = new Interaction({
            participantID,
            systemID,
            userInput: message,
            botResponse: botReply,
            retrievalMethod,
            retrievedEvidence: retrievedDocs,
            confidence: confidenceMetrics
        });
        await newInteraction.save();

        res.json({ 
            userMessage: message, 
            botReply: botReply,
            evidence: retrievedDocs,
            confidence: confidenceMetrics
        });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Failed to process chat" });
    }
});

// --- Qualtrics Survey Redirect ---
app.post('/redirect-to-survey', (req, res) => {
    const { participantID } = req.body;

    const qualtricsBaseUrl = 'https://qualtricsxmxjnf7f797.qualtrics.com/jfe/form/SV_6XWSTPN572uWFEO';

    const surveyUrl = `${qualtricsBaseUrl}?participantID=${encodeURIComponent(participantID)}`;

    res.send(surveyUrl);
});

// --- History (Return ONLY last 5) ---
app.post('/history', async (req, res) => {
    const { participantID } = req.body;
    try {
        // Sort descending (-1) to get newest, limit to 5, then reverse back to chronological order
        let history = await Interaction.find({ participantID })
                                       .sort({ timestamp: -1 })
                                       .limit(5);
        history = history.reverse(); 
        
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// --- Events ---
app.post('/log-event', async (req, res) => {
    const { participantID, systemID, eventType, elementName } = req.body;
    try {
        const newEvent = new EventLog({
            participantID,
            systemID,
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