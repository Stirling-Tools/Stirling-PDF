import express from 'express';
const app = express();
const PORT = 80;

// Server Frontend TODO: Make this typescript compatible
app.use(express.static('./public'));
app.use(express.static('../shared-operations'));

// serve
app.listen(PORT, function (err) {
    if (err) console.log(err);
    console.log(`http://localhost:${PORT}`);
});