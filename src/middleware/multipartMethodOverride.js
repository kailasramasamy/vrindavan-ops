// Custom method override middleware for multipart forms
// This middleware processes the _method field from multipart forms
// and overrides the request method before the route handler

const multipartMethodOverride = (req, res, next) => {
  // Only process POST requests
  if (req.method === "POST") {
    // Check if this is a multipart form with _method field
    // The _method field will be available in req.body after multer processes it
    const originalEnd = res.end;
    const originalSend = res.send;

    // Override res.end to intercept the response
    res.end = function (...args) {
      // Check if _method exists in req.body
      if (req.body && req.body._method) {
        req.method = req.body._method.toUpperCase();
        delete req.body._method;
      }
      // Call the original end method
      return originalEnd.apply(this, args);
    };

    // Override res.send to intercept the response
    res.send = function (...args) {
      // Check if _method exists in req.body
      if (req.body && req.body._method) {
        req.method = req.body._method.toUpperCase();
        delete req.body._method;
      }
      // Call the original send method
      return originalSend.apply(this, args);
    };
  }

  next();
};

export default multipartMethodOverride;
















