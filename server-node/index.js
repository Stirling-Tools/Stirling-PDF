import express from 'express';
const app = express();
const PORT = 8080;

// server-node: backend api
import api from './routes/api/index.js';
app.use("/api/", api);

// serve
app.listen(PORT, function (err) {
    if (err) console.log(err);
    console.log(`http://localhost:${PORT}`);
});