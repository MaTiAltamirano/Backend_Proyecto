const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const escenariosPath = path.join(__dirname, "../escenarios");

//GET /desafios
router.get("/", (req, res)=> {
    try {
        const carpetas = fs.readdirSync(escenariosPath);

        const desafios = carpetas.filter(carpeta => {
            const metadataPath = path.join(
                escenariosPath,
                carpeta,
                "metadata.json"
            );

            return fs.existsSync(metadataPath);
        })
        .map(carpeta => {
            const metadataPath = path.join(
                escenariosPath,
                carpeta,
                "metadata.json"
            );

            return require(metadataPath);
        });

        console.log(desafios);
        res.json(desafios);

    } catch (err) {
        console.error("Error al cargar los escenarios:", err);

        res.status(500).json({
            error: "Error al cargar los escenarios"
        });
    }
});

//GET/ desafios/:id
router.get("/:id", (req, res) => {
    try {

        const metadata = require(
            path.join(
                escenariosPath,
                req.params.id,
                "metadata.json"
            )
        );

        res.json(metadata);

    } catch(err){
        res.status(404).json({
            error: "Escenario no encontrado"
        });
    }
});

module.exports = router;