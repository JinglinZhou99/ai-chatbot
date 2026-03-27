const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema({
    participantID: { type: String, required: true },
    userInput: { type: String, required: true },
    botResponse: { type: String, required: true },
    retrievalMethod: String,
    retrievedEvidence: Array, 
    confidence: Object, 
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Interaction', interactionSchema);