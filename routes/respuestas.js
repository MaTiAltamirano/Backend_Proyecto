const express = require('express');
const router = express.Router();

//POST /respuestas
router.post("/", (req, res) => {
    const { respuesta } = req.body;

    if (respuesta === true){
        res.json({ resultado: "Respuesta correcta" });
    } else {
        res.json({ resultado: "Respuesta incorrecta" });
    }
});

module.exports = router;