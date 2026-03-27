const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    filename: String,
    text: String,
    chunks: [{
        chunkIndex: Number,
        text: String,
        embedding: [Number] 
    }],
    processingStatus: { type: String, default: 'processing' },
    processedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Document', documentSchema);