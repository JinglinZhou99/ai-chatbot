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
        await retrievalService.initialize(); // Build TF-IDF index on startup
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
        // 1. Extract text and chunks using the complete multer file object
        const extracted = await documentProcessor.processDocument(req.file); 

        // 2. Generate embeddings for the chunks
        const chunksWithEmbeddings = await embeddingService.generateEmbeddings(extracted.chunks);

        // 3. Store in MongoDB
        const newDoc = new Document({
            filename: req.file.originalname,
            text: extracted.fullText,
            chunks: chunksWithEmbeddings,
            processingStatus: 'completed'
        });
        await newDoc.save();

        // 4. Rebuild TF-IDF index so new chunks are searchable via TF-IDF
        await retrievalService.rebuildIndex();

        res.json({ message: "Document uploaded and processed successfully", docId: newDoc._id });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Failed to process document" });
    }
});

// --- RAG: Chat Interface ---
app.post('/chat', async (req, res) => {
    const { message, participantID, retrievalMethod } = req.body;

    if (!participantID) {
        return res.status(400).json({ error: "Participant ID is required" });
    }

    try {
        // 1. Retrieve Evidence
        const retrievedDocs = await retrievalService.retrieve(message, { 
            method: retrievalMethod, 
            topK: 3 
        });

        // 2. Build Augmented Prompt
        let systemPrompt = "You are a helpful assistant.";
        if (retrievedDocs && retrievedDocs.length > 0) {
            const contextText = retrievedDocs.map(doc => doc.chunkText).join('\n\n');
            systemPrompt += ` Use the following retrieved context to answer the user's question. If the answer is not in the context, just say you don't know based on the documents.\n\nContext:\n${contextText}`;
        }

        // 3. Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
        });
        const botReply = completion.choices[0].message.content;

        // 4. Calculate Confidence
        const confidenceMetrics = confidenceCalculator.calculate({
            retrievedDocs,
            retrievalMethod,
            responseLogprobs: null 
        });

        // 5. Store Interaction in DB
        const newInteraction = new Interaction({
            participantID,
            userInput: message,
            botResponse: botReply,
            retrievalMethod,
            retrievedEvidence: retrievedDocs,
            confidence: confidenceMetrics
        });
        await newInteraction.save();

        // 6. Return response to Frontend
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

// --- History ---
app.post('/history', async (req, res) => {
    const { participantID } = req.body;
    try {
        const history = await Interaction.find({ participantID }).sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// --- Events ---
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