const express = require("express");
const { Pool } = require("pg");

const router = express.Router();

const db = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "plataforma_ctf",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT) || 5432,
});

router.get("/", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                id_escenario,
                slug,
                titulo,
                descripcion,
                dificultad,
                puntaje_total,
                objetivo_general,
                aprendizajes,
                herramientas_recomendadas,
                conocimientos_previos,
                contexto_real,
                resumen_final
            FROM escenario
            WHERE activo = true
            ORDER BY id_escenario ASC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error("Error al cargar los escenarios desde BD:", err);

        res.status(500).json({
            error: "Error al cargar los escenarios"
        });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `
            SELECT
                id_escenario,
                slug,
                titulo,
                descripcion,
                dificultad,
                puntaje_total,
                objetivo_general,
                aprendizajes,
                herramientas_recomendadas,
                conocimientos_previos,
                contexto_real,
                resumen_final
            FROM escenario
            WHERE slug = $1
              AND activo = true
            LIMIT 1
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Escenario no encontrado"
            });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error al cargar detalle del escenario:", err);

        res.status(500).json({
            error: "Error al cargar el escenario"
        });
    }
});

module.exports = router;