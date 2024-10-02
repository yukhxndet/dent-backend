const mongoose = require('mongoose');

const treatmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true }
}, { collection: 'Treatment' });

const Treatment = mongoose.model('Treatment', treatmentSchema);

module.exports = Treatment;
