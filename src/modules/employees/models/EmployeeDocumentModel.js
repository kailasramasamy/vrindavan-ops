import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

export class EmployeeDocumentModel {
  static async listDocumentsByEmployeeId(employeeId) {
    try {
      const [rows] = await opsDb.query(
        `SELECT * FROM employee_documents 
         WHERE employee_id = ? 
         ORDER BY created_at DESC`,
        [employeeId]
      );

      return {
        success: true,
        documents: rows,
      };
    } catch (error) {
      console.error("EmployeeDocumentModel.listDocumentsByEmployeeId error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async getDocumentById(documentId) {
    try {
      const [rows] = await opsDb.query(
        `SELECT * FROM employee_documents WHERE id = ?`,
        [documentId]
      );

      if (rows.length === 0) {
        return {
          success: false,
          error: "Document not found",
        };
      }

      return {
        success: true,
        document: rows[0],
      };
    } catch (error) {
      console.error("EmployeeDocumentModel.getDocumentById error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async createDocument(data) {
    try {
      const {
        employee_id,
        document_type,
        document_name,
        file_path,
        file_size,
        mime_type,
        expiry_date,
        notes,
      } = data;

      if (!employee_id || !document_type || !document_name || !file_path) {
        return {
          success: false,
          error: "Missing required fields: employee_id, document_type, document_name, file_path",
        };
      }

      const [result] = await opsDb.query(
        `INSERT INTO employee_documents 
         (employee_id, document_type, document_name, file_path, file_size, mime_type, expiry_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee_id,
          document_type,
          document_name,
          file_path,
          file_size || null,
          mime_type || null,
          expiry_date || null,
          notes || null,
        ]
      );

      const [rows] = await opsDb.query(
        `SELECT * FROM employee_documents WHERE id = ?`,
        [result.insertId]
      );

      return {
        success: true,
        document: rows[0],
      };
    } catch (error) {
      console.error("EmployeeDocumentModel.createDocument error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async updateDocument(documentId, data) {
    try {
      const fields = [];
      const values = [];

      Object.keys(data).forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      });

      if (fields.length === 0) {
        return {
          success: false,
          error: "No fields to update",
        };
      }

      values.push(documentId);

      await opsDb.query(
        `UPDATE employee_documents SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      const [rows] = await opsDb.query(
        `SELECT * FROM employee_documents WHERE id = ?`,
        [documentId]
      );

      return {
        success: true,
        document: rows[0],
      };
    } catch (error) {
      console.error("EmployeeDocumentModel.updateDocument error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async deleteDocument(documentId) {
    try {
      const [result] = await opsDb.query(
        `DELETE FROM employee_documents WHERE id = ?`,
        [documentId]
      );

      if (result.affectedRows === 0) {
        return {
          success: false,
          error: "Document not found",
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("EmployeeDocumentModel.deleteDocument error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default EmployeeDocumentModel;

