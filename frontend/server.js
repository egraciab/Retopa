const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;

// Servir archivos estáticos del proyecto frontend
app.use(express.static(__dirname));

// Home simple
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Fallback opcional para /admin
app.get("/admin", (req, res) => {
  res.redirect("/admin/login.html");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Frontend running on port ${port}`);
});
