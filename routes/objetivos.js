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

// Normaliza texto para validaciones flexibles
const normalizarTexto = (texto = "") => {
    return texto
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

const obtenerRespuestasAceptadas = (objetivo) => {
    const respuestas = [];

    if (objetivo.respuesta_esperada) {
        respuestas.push(objetivo.respuesta_esperada);
    }

    if (Array.isArray(objetivo.respuestas_aceptadas)) {
        respuestas.push(...objetivo.respuestas_aceptadas);
    }

    return respuestas.filter(Boolean);
};

const validarRespuesta = (objetivo, respuestaUsuario) => {
    const respuestaOriginal = respuestaUsuario?.toString().trim() || "";
    const respuestaNormalizada = normalizarTexto(respuestaOriginal);

    const respuestasAceptadas = obtenerRespuestasAceptadas(objetivo);
    const respuestasNormalizadas = respuestasAceptadas.map(normalizarTexto);

    switch (objetivo.tipo_validacion) {
        case "texto_exacto":
            return respuestaOriginal === objetivo.respuesta_esperada;

        case "flag":
            return respuestaOriginal === objetivo.respuesta_esperada;

        case "contiene":
            return respuestasNormalizadas.some((respuesta) =>
                respuestaNormalizada.includes(respuesta)
            );

        case "regex":
            try {
                const regex = new RegExp(objetivo.respuesta_esperada, "i");
                return regex.test(respuestaOriginal);
            } catch (error) {
                console.error("Regex inválida:", error);
                return false;
            }

        case "texto_flexible":
            return respuestasNormalizadas.some((respuesta) =>
                respuestaNormalizada === respuesta ||
                respuestaNormalizada.includes(respuesta) ||
                respuesta.includes(respuestaNormalizada)
            );

        case "sin_validacion":
            return true;

        default:
            return respuestasNormalizadas.includes(respuestaNormalizada);
    }
};

// =====================================================
// GET /objetivos/:scenarioId?userId=1
// Lista objetivos del escenario + progreso del usuario
// =====================================================
router.get("/:scenarioId", async (req, res) => {
    try {
        const { scenarioId } = req.params;
        const { userId } = req.query;

        if (!scenarioId || !userId) {
            return res.status(400).json({
                success: false,
                message: "Falta scenarioId o userId"
            });
        }

        const escenarioResult = await db.query(
            `
            SELECT id_escenario, slug, titulo, puntaje_total
            FROM escenario
            WHERE slug = $1
              AND activo = true
            `,
            [scenarioId]
        );

        if (escenarioResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Escenario no encontrado"
            });
        }

        const escenario = escenarioResult.rows[0];

        const objetivosResult = await db.query(
            `
            SELECT
                o.id_objetivo,
                o.id_escenario,
                o.orden,
                o.titulo,
                o.descripcion,
                o.explicacion,
                o.instrucciones,
                o.pista,
                o.tipo_objetivo,
                o.requiere_respuesta,
                o.label_respuesta,
                o.placeholder_respuesta,
                o.tipo_validacion,
                o.puntaje,
                o.es_final,
                COALESCE(p.completado, false) AS completado,
                COALESCE(p.correcto, false) AS correcto,
                COALESCE(p.puntaje_obtenido, 0) AS puntaje_obtenido,
                COALESCE(p.intentos, 0) AS intentos,
                p.respuesta_usuario,
                p.tiempo_desde_inicio_segundos,
                p.tiempo_fin
            FROM objetivo o
            LEFT JOIN progreso_objetivo p
                ON p.id_objetivo = o.id_objetivo
               AND p.id_usuario = $2
            WHERE o.id_escenario = $1
              AND o.activo = true
            ORDER BY o.orden ASC
            `,
            [escenario.id_escenario, userId]
        );

        let objetivoAnteriorCompletado = true;

        const objetivos = objetivosResult.rows.map((objetivo) => {
            const bloqueado = !objetivoAnteriorCompletado;

            if (!objetivo.completado) {
                objetivoAnteriorCompletado = false;
            }

            return {
                ...objetivo,
                bloqueado,
                desbloqueado: !bloqueado
            };
        });

        const totalObjetivos = objetivos.length;
        const objetivosCompletados = objetivos.filter(o => o.completado).length;
        const puntajeObtenido = objetivos.reduce(
            (total, obj) => total + Number(obj.puntaje_obtenido || 0),
            0
        );

        res.json({
            success: true,
            escenario,
            resumen: {
                totalObjetivos,
                objetivosCompletados,
                puntajeObtenido,
                puntajeTotal: escenario.puntaje_total || 0
            },
            objetivos
        });

    } catch (error) {
        console.error("Error obteniendo objetivos:", error);

        res.status(500).json({
            success: false,
            message: "Error obteniendo objetivos",
            error: error.message
        });
    }
});

// =====================================================
// POST /objetivos/validar
// Valida respuesta de un objetivo
// =====================================================
router.post("/validar", async (req, res) => {
    try {
        const {
            userId,
            scenarioId,
            objetivoId,
            id_objetivo,
            respuesta
        } = req.body;

        const idObjetivo = objetivoId || id_objetivo;

        if (!userId || !scenarioId || !idObjetivo) {
            return res.status(400).json({
                success: false,
                message: "Falta userId, scenarioId u objetivoId"
            });
        }

        const objetivoResult = await db.query(
            `
            SELECT
                o.*,
                e.id_escenario,
                e.slug
            FROM objetivo o
            JOIN escenario e
                ON e.id_escenario = o.id_escenario
            WHERE o.id_objetivo = $1
              AND e.slug = $2
              AND o.activo = true
            `,
            [idObjetivo, scenarioId]
        );

        if (objetivoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Objetivo no encontrado"
            });
        }

        const objetivo = objetivoResult.rows[0];

        // Verificar si el objetivo anterior está completado
        if (objetivo.orden > 1) {
            const anteriorResult = await db.query(
                `
                SELECT
                    o.id_objetivo,
                    COALESCE(p.completado, false) AS completado
                FROM objetivo o
                LEFT JOIN progreso_objetivo p
                    ON p.id_objetivo = o.id_objetivo
                   AND p.id_usuario = $2
                WHERE o.id_escenario = $1
                  AND o.orden = $3
                `,
                [
                    objetivo.id_escenario,
                    userId,
                    objetivo.orden - 1
                ]
            );

            const objetivoAnterior = anteriorResult.rows[0];

            if (!objetivoAnterior || !objetivoAnterior.completado) {
                return res.status(403).json({
                    success: false,
                    message: "Este objetivo aún está bloqueado"
                });
            }
        }

        // Evitar dar puntaje dos veces si ya estaba completado
        const progresoExistente = await db.query(
            `
            SELECT *
            FROM progreso_objetivo
            WHERE id_usuario = $1
              AND id_objetivo = $2
            `,
            [userId, idObjetivo]
        );

        if (
            progresoExistente.rows.length > 0 &&
            progresoExistente.rows[0].completado
        ) {
            return res.json({
                success: true,
                correcto: true,
                yaCompletado: true,
                message: "Objetivo ya completado anteriormente",
                progreso: progresoExistente.rows[0]
            });
        }

        const laboratorioResult = await db.query(
            `
            SELECT *
            FROM laboratorio_activo
            WHERE id_usuario = $1
              AND id_escenario = $2
              AND estado IN ('activo', 'iniciado', 'listo')
            ORDER BY fecha_inicio DESC
            LIMIT 1
            `,
            [userId, objetivo.id_escenario]
        );

        if (laboratorioResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No hay un laboratorio activo para este usuario y escenario"
            });
        }

        const laboratorio = laboratorioResult.rows[0];

        const correcto = validarRespuesta(objetivo, respuesta);

        const tiempoResult = await db.query(
            `
            SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamp))::integer AS segundos
            `,
            [laboratorio.fecha_inicio]
        );

        const tiempoDesdeInicio = tiempoResult.rows[0].segundos || 0;

        const puntajeObtenido = correcto ? objetivo.puntaje : 0;

        const progresoResult = await db.query(
            `
            INSERT INTO progreso_objetivo (
                id_usuario,
                id_escenario,
                id_objetivo,
                completado,
                correcto,
                respuesta_usuario,
                puntaje_obtenido,
                intentos,
                tiempo_fin,
                ultimo_intento,
                tiempo_desde_inicio_segundos
            )
            VALUES (
                $1, $2, $3, $4, $4, $5, $6, 1,
                CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
                CURRENT_TIMESTAMP,
                CASE WHEN $4 THEN $7 ELSE 0 END
            )
            ON CONFLICT (id_usuario, id_objetivo)
            DO UPDATE SET
                respuesta_usuario = EXCLUDED.respuesta_usuario,
                correcto = EXCLUDED.correcto,
                completado = progreso_objetivo.completado OR EXCLUDED.completado,
                puntaje_obtenido = CASE
                    WHEN EXCLUDED.completado THEN EXCLUDED.puntaje_obtenido
                    ELSE progreso_objetivo.puntaje_obtenido
                END,
                intentos = progreso_objetivo.intentos + 1,
                ultimo_intento = CURRENT_TIMESTAMP,
                tiempo_fin = CASE
                    WHEN EXCLUDED.completado THEN CURRENT_TIMESTAMP
                    ELSE progreso_objetivo.tiempo_fin
                END,
                tiempo_desde_inicio_segundos = CASE
                    WHEN EXCLUDED.completado THEN EXCLUDED.tiempo_desde_inicio_segundos
                    ELSE progreso_objetivo.tiempo_desde_inicio_segundos
                END,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
            `,
            [
                userId,
                objetivo.id_escenario,
                idObjetivo,
                correcto,
                respuesta,
                puntajeObtenido,
                tiempoDesdeInicio
            ]
        );

        await db.query(
            `
            INSERT INTO intento_objetivo (
                id_usuario,
                id_objetivo,
                respuesta,
                correcto
            )
            VALUES ($1, $2, $3, $4)
            `,
            [userId, idObjetivo, respuesta, correcto]
        );

        if (correcto && objetivo.es_final) {
            await db.query(
                `
                UPDATE laboratorio_activo
                SET estado = 'completado',
                    fecha_fin = CURRENT_TIMESTAMP,
                    tiempo_total_segundos = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_lab = $2
                `,
                [tiempoDesdeInicio, laboratorio.id_lab]
            );
        }

        res.json({
            success: true,
            correcto,
            message: correcto
                ? "Respuesta correcta"
                : "Respuesta incorrecta",
            objetivo: {
                id_objetivo: objetivo.id_objetivo,
                titulo: objetivo.titulo,
                orden: objetivo.orden,
                es_final: objetivo.es_final
            },
            progreso: progresoResult.rows[0],
            tiempoDesdeInicio,
            puntajeObtenido
        });

    } catch (error) {
        console.error("Error validando objetivo:", error);

        res.status(500).json({
            success: false,
            message: "Error validando objetivo",
            error: error.message
        });
    }
});

module.exports = router;