export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  // MySQL errors
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "Duplicate entry" });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};




