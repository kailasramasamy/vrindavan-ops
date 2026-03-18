import express from "express";
import pool from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { createNotification } from "./notifications.js";
import { notifyAdminNewTicket } from "../../../services/interaktService.js";

const router = express.Router();

// Get all tickets for a CP
router.get("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "cp" || !req.user.cp_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [tickets] = await pool.execute(
      `SELECT 
        t.*,
        (SELECT COUNT(*) FROM cp_ticket_messages WHERE ticket_id = t.id AND sender_type = 'admin' AND is_read = FALSE) as unread_count,
        (SELECT message FROM cp_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM cp_tickets t
       WHERE t.cp_id = ?
       ORDER BY t.updated_at DESC`,
      [req.user.cp_id]
    );

    res.json(tickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Get single ticket with messages
router.get("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "cp" || !req.user.cp_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;

    // Get ticket
    const [tickets] = await pool.execute(
      "SELECT * FROM cp_tickets WHERE id = ? AND cp_id = ?",
      [id, req.user.cp_id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Get messages
    const [messages] = await pool.execute(
      `SELECT * FROM cp_ticket_messages 
       WHERE ticket_id = ?
       ORDER BY created_at ASC`,
      [id]
    );

    // Mark admin messages as read
    await pool.execute(
      `UPDATE cp_ticket_messages 
       SET is_read = TRUE, read_at = NOW() 
       WHERE ticket_id = ? AND sender_type = 'admin' AND is_read = FALSE`,
      [id]
    );

    res.json({
      ticket: tickets[0],
      messages: messages
    });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// Create new ticket
router.post("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "cp" || !req.user.cp_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { ticket_type, subject, message, priority = "medium" } = req.body;

    if (!ticket_type || !subject || !message) {
      return res.status(400).json({ error: "Ticket type, subject, and message are required" });
    }

    // Create ticket
    const [result] = await pool.execute(
      `INSERT INTO cp_tickets (cp_id, ticket_type, subject, status, priority)
       VALUES (?, ?, ?, 'open', ?)`,
      [req.user.cp_id, ticket_type, subject, priority]
    );

    const ticketId = result.insertId;

    // Generate ticket number if not auto-generated
    const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(ticketId).padStart(4, '0')}`;
    await pool.execute(
      "UPDATE cp_tickets SET ticket_number = ? WHERE id = ?",
      [ticketNumber, ticketId]
    );

    // Add initial message
    await pool.execute(
      `INSERT INTO cp_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, 'cp', ?, ?)`,
      [ticketId, req.user.cp_id, message]
    );

    // Send WhatsApp notification to admin
    try {
      // Get CP details
      const [cpRows] = await pool.execute(
        "SELECT name FROM community_partners WHERE id = ?",
        [req.user.cp_id]
      );
      const cpName = cpRows[0]?.name || "Community Partner";

      // Get admin phone number
      const [adminRows] = await pool.execute(
        "SELECT phone FROM cp_users WHERE role = 'admin' AND phone IS NOT NULL AND phone != '' LIMIT 1"
      );

      if (adminRows.length > 0 && adminRows[0].phone) {
        // Construct the ticket link URL
        const ticketLink = `${process.env.APP_URL || 'http://localhost:3000'}/cp/admin/tickets/${ticketId}`;
        
        await notifyAdminNewTicket(adminRows[0].phone, {
          cp_name: cpName,
          ticket_id: ticketId,
          ticket_number: ticketNumber,
          subject: subject,
          priority: priority,
          ticket_link: ticketLink
        });
      }
    } catch (whatsappError) {
      console.error("Error sending WhatsApp notification to admin for new ticket:", whatsappError);
      // Don't fail the ticket creation if WhatsApp sending fails
    }

    res.json({ success: true, ticket_id: ticketId, ticket_number: ticketNumber });
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// Add message to ticket (CP reply)
router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "cp" || !req.user.cp_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Verify ticket belongs to CP
    const [tickets] = await pool.execute(
      "SELECT id FROM cp_tickets WHERE id = ? AND cp_id = ?",
      [id, req.user.cp_id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Add message
    await pool.execute(
      `INSERT INTO cp_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, 'cp', ?, ?)`,
      [id, req.user.cp_id, message]
    );

    // Update ticket status if it was resolved/closed
    await pool.execute(
      "UPDATE cp_tickets SET status = 'open', updated_at = NOW() WHERE id = ? AND status IN ('resolved', 'closed')",
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

export default router;

