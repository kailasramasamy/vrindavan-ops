import pool from "../../../db/pool.js";

class MachineDocumentModel {
  // Create a new document record
  static async createDocument(documentData) {
    const { machine_id, title, document_type, file_name, file_path, file_size, mime_type, description = null, uploaded_by = null } = documentData;

    const sql = `
      INSERT INTO machine_documents 
      (machine_id, title, document_type, file_name, file_path, file_size, mime_type, description, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id, title, document_type, file_name, file_path, file_size, mime_type, description, uploaded_by]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating document:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all documents for a machine
  static async getDocumentsByMachineId(machineId) {
    const sql = `
      SELECT 
        md.*,
        u.name as uploaded_by_name
      FROM machine_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.machine_id = ?
      ORDER BY md.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [machineId]);
      return { success: true, documents: rows };
    } catch (error) {
      console.error("Error fetching documents:", error);
      return { success: false, error: error.message };
    }
  }

  // Get document by ID
  static async getDocumentById(documentId) {
    const sql = `
      SELECT 
        md.*,
        u.name as uploaded_by_name,
        m.name as machine_name
      FROM machine_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      LEFT JOIN machines m ON md.machine_id = m.id
      WHERE md.id = ?
    `;

    try {
      const [rows] = await pool.execute(sql, [documentId]);
      return { success: true, document: rows[0] || null };
    } catch (error) {
      console.error("Error fetching document:", error);
      return { success: false, error: error.message };
    }
  }

  // Update document details
  static async updateDocument(documentId, updateData) {
    const { title, document_type, description = null } = updateData;

    const sql = `
      UPDATE machine_documents 
      SET title = ?, document_type = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [title, document_type, description, documentId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating document:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete document
  static async deleteDocument(documentId) {
    const sql = "DELETE FROM machine_documents WHERE id = ?";

    try {
      const [result] = await pool.execute(sql, [documentId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting document:", error);
      return { success: false, error: error.message };
    }
  }

  // Get documents by type for a machine
  static async getDocumentsByType(machineId, documentType) {
    const sql = `
      SELECT 
        md.*,
        u.name as uploaded_by_name
      FROM machine_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.machine_id = ? AND md.document_type = ?
      ORDER BY md.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [machineId, documentType]);
      return { success: true, documents: rows };
    } catch (error) {
      console.error("Error fetching documents by type:", error);
      return { success: false, error: error.message };
    }
  }

  // Get document statistics for a machine
  static async getDocumentStats(machineId) {
    const sql = `
      SELECT 
        document_type,
        COUNT(*) as count
      FROM machine_documents 
      WHERE machine_id = ?
      GROUP BY document_type
    `;

    try {
      const [rows] = await pool.execute(sql, [machineId]);
      return { success: true, stats: rows };
    } catch (error) {
      console.error("Error fetching document stats:", error);
      return { success: false, error: error.message };
    }
  }

  // Format file size for display
  static formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Get file extension from filename
  static getFileExtension(filename) {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
  }

  // Check if file type is allowed
  static isAllowedFileType(mimeType) {
    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "image/jpeg", "image/png", "image/gif", "image/webp"];
    return allowedTypes.includes(mimeType);
  }
}

export default MachineDocumentModel;












