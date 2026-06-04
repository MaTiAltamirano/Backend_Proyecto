const express = require('express');
const router = express.Router();

// Datos simulados (luego será base de datos)
let progresos = [
    { usuarioID: 1, desafiosCompletados: [1] }
];

//GET /progresos/:usuarioID
router.get("/:usuarioID", (req, res) => {
    const progreso = progresos.find(
        p => p.usuarioID == req.params.usuarioID
    );

    res.json(progreso);
});

module.exports = router;