
import express from 'express';
const app = express();
const PORT = 8080;

// server-node: backend api
import api from './server-node/routes/api/index.js';
app.use("/api/", api);
 
// client-vanilla: frontend
app.use(express.static('./client-vanilla'));
app.use(express.static('./shared-operations'));

// serve
app.listen(PORT, function (err) {
    if (err) console.log(err);
    console.log(`http://localhost:${PORT}`);
});