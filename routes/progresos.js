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

// Solo considera progreso consolidado, no progreso temporal.
router.get("/resumen/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Falta userId"
            });
        }

        // Suma puntos y objetivos desde progreso definitivo.
        const progresoResult = await db.query(
            `
            SELECT
                COALESCE(SUM(puntaje_obtenido), 0) AS puntos_obtenidos,
                COUNT(*) FILTER (WHERE completado = true) AS objetivos_completados
            FROM progreso_objetivo
            WHERE id_usuario = $1
            `,
            [userId]
        );

        // Cuenta escenarios completados desde laboratorio_activo.
        const laboratoriosResult = await db.query(
            `
            SELECT
                COUNT(DISTINCT id_escenario) FILTER (WHERE estado = 'completado') AS escenarios_completados,
                COALESCE(SUM(tiempo_total_segundos) FILTER (WHERE estado = 'completado'), 0) AS tiempo_total_segundos
            FROM laboratorio_activo
            WHERE id_usuario = $1
            `,
            [userId]
        );

        const progreso = progresoResult.rows[0];
        const laboratorios = laboratoriosResult.rows[0];

        res.json({
            success: true,
            resumen: {
                puntos_obtenidos: Number(progreso.puntos_obtenidos || 0),
                objetivos_completados: Number(progreso.objetivos_completados || 0),
                escenarios_completados: Number(laboratorios.escenarios_completados || 0),
                tiempo_total_segundos: Number(laboratorios.tiempo_total_segundos || 0)
            }
        });

    } catch (error) {
        console.error("Error obteniendo resumen de progreso:", error);

        res.status(500).json({
            success: false,
            message: "Error obteniendo resumen de progreso",
            error: error.message
        });
    }
});

module.exports = router;