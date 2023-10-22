
import api from './routes/api/index.js';

import express from 'express';
const app = express();
const PORT = 8080;
 
// Static Middleware
app.use(express.static('./public'));
 
app.get('/', function (req, res, next) { // TODO: Use EJS?
    res.render('home.ejs');
});

app.use("/api/", api);
 
app.listen(PORT, function (err) {
    if (err) console.log(err);
    console.log(`http://localhost:${PORT}`);
});