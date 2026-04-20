const mongoose = require('mongoose');

const eventLogSchema = new mongoose.Schema({
    participantID: { type: String, required: true },
    systemID: { type: Number, required: true }, 
    eventType: { type: String, required: true },
    elementName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EventLog', eventLogSchema);