import express from 'express';
const app = express();
const PORT = 8000;

// server-node: backend api
import api from './routes/api/api-controller';
app.use("/api/", api);

// serve
app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
});