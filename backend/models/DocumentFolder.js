/* ============================================================
   LockDoc — Document Folder Model (Mongoose)
   Categories/folders for organizing documents.
   ============================================================ */
const mongoose = require('mongoose');

const documentFolderSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  folderName: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true
  },
  icon: {
    type: String,
    default: 'folder'
  },
  color: {
    type: String,
    default: 'blue'
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

documentFolderSchema.index({ ownerId: 1, folderName: 1 }, { unique: true });

module.exports = mongoose.model('DocumentFolder', documentFolderSchema);

