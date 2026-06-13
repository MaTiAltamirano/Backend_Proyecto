const express = require("express");
const cors = require("cors");
const { Pool } = require('pg');
const {
    iniciarEscenarioK8s,
    detenerEscenarioK8s,
    verificarEscenarioK8s,
    obtenerLogsPod
} = require("./k8sController");
const { createProxyMiddleware } = require('http-proxy-middleware');
const { cargarEscenario } = require("./services/scenarioServices");

const app = express();

//Middleware
app.use(cors());    
app.use(express.json());

// Proxy para redirigir tráfico a los escenarios en Kubernetes 
app.use('/escenario/:scenarioId/:userId', (req, res, next) => {
    const { scenarioId, userId } = req.params;

    const escenario = cargarEscenario(scenarioId);
    if (!escenario) {
        return res.status(404).send("Escenario no encontrado");
    }

    // URL dinámica basada en el nombre del servicio y el ID del usuario
    const targetUrl = `http://${escenario.metadata.serviceName}.lab-user${userId}.svc.cluster.local:${escenario.metadata.puerto}`;
    console.log(`Redirigiendo tráfico a: ${targetUrl}`);

    createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        pathRewrite: {
            [`^/escenario/${scenarioId}/${userId}`]: '', // lipmia la ruta
        },
        onProxyRes: (proxyRes) => {
            delete proxyRes.headers["x-frame-options"];
            delete proxyRes.headers["content-security-policy"];
            delete proxyRes.headers["content-security-policy-report-only"];
        },
        onError: (err, req, res) => {
            console.error("Error del proxy:", err.message);
            res.status(500).send("Escenario no disponible");
        }
    })(req, res, next);
});


//BASE DE DATOS
const db = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'plataforma_ctf',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 5432,
});

db.connect((err) => {
    if (err) {
        console.error("Error al conectar a la base de datos:", err.message);
    } else {
        console.log("Conexión a la base de datos establecida exitosamente");
    }
});

//CAMBIAR O REINICIAR LABORATORIO ACTIVO EN BD
const registrarLaboratorioActivo = async (scenarioId, userId) => {
    const escenarioResult = await db.query(
        `
        SELECT id_escenario
        FROM escenario
        WHERE slug = $1
        `,
        [scenarioId]
    );

    if (escenarioResult.rows.length === 0) {
        console.log("Escenario no encontrado en BD:", scenarioId);
        return;
    }

    const idEscenario = escenarioResult.rows[0].id_escenario;
    const namespace = `lab-user${userId}`;

    const existente = await db.query(
        `
        SELECT id_lab
        FROM laboratorio_activo
        WHERE id_usuario = $1
          AND id_escenario = $2
          AND estado IN ('activo', 'iniciado', 'listo')
        ORDER BY fecha_inicio DESC
        LIMIT 1
        `,
        [userId, idEscenario]
    );

    if (existente.rows.length > 0) {
        await db.query(
            `
            UPDATE laboratorio_activo
            SET estado = 'activo',
                namespace = $1,
                fecha_inicio = CURRENT_TIMESTAMP,
                fecha_fin = NULL,
                tiempo_total_segundos = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id_lab = $2
            `,
            [namespace, existente.rows[0].id_lab]
        );

        return;
    }

    await db.query(
        `
        INSERT INTO laboratorio_activo (
            id_usuario,
            id_escenario,
            namespace,
            estado,
            fecha_inicio
        )
        VALUES ($1, $2, $3, 'activo', CURRENT_TIMESTAMP)
        `,
        [userId, idEscenario, namespace]
    );
};

//IMPORTAR RUTAS
const desafiosRoutes = require("./routes/desafios");
const usuariosRoutes = require("./routes/usuarios");
const respuestasRoutes = require("./routes/respuestas");
const progresosRoutes = require("./routes/progresos");
const objetivosRoutes = require("./routes/objetivos");

//USAR RUTAS
app.use("/desafios", desafiosRoutes);
app.use("/usuarios", usuariosRoutes);
app.use("/respuestas", respuestasRoutes);
app.use("/progresos", progresosRoutes);
app.use("/objetivos", objetivosRoutes);
 
//RUTA PARA INICIAR ESCENARIO
app.post("/lanzar-escenario", async (req, res) => {

    console.log("\n========== NUEVA PETICIÓN ==========");
    console.log("BODY RECIBIDO:");
    console.log(req.body);

    try {
        const { scenarioId, userId } = req.body;

        console.log("scenarioId:", scenarioId);
        console.log("userId:", userId);

        if (!scenarioId || !userId) {

            console.log("Faltan datos");

            return res.status(400).json({
                status: "error",
                message: "Falta el ID del usuario"
            });
        }

        console.log("Llamando iniciarEscenarioK8s...");

        const mensaje = await iniciarEscenarioK8s(scenarioId, userId);
        await registrarLaboratorioActivo(scenarioId, userId);

        console.log("RESULTADO:");
        console.log(mensaje);

        res.json({
            status: "success",
            message: mensaje,
            info: "Escenario lanzado exitosamente."
        });

    } catch (error){

        res.status(500).json({
            status: "error",
            message: "Error al iniciar el escenario",
            error: error.message
        });
    }
});

//RUTA PARA DETENER EL ESCENARIO Y LIMPIAR RECURSOS EN KUBERNETES
app.post("/detener-escenario", async (req, res) => {
    try {
        const { scenarioId, userId } = req.body;
        
        if (!scenarioId || !userId){
            return res.status(400).json({
                status: "error",
                message: "Falta el scenarioId o el userId"
            });
        }

        const mensaje = await detenerEscenarioK8s(scenarioId, userId);
        // Actualizar el estado en la base de datos a "detenido" y calcular el tiempo total
        await db.query(
            `
            UPDATE laboratorio_activo la
            SET estado = 'detenido',
                fecha_fin = CURRENT_TIMESTAMP,
                tiempo_total_segundos = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - la.fecha_inicio))::integer,
                updated_at = CURRENT_TIMESTAMP
            FROM escenario e
            WHERE la.id_escenario = e.id_escenario
                AND e.slug = $1
                AND la.id_usuario = $2
                AND la.estado IN ('activo', 'iniciado', 'listo')
            `,
            [scenarioId, userId]
        );

        res.json({
            status: "success",
            message: mensaje
        });

    } catch (error){

        console.error("Error al detener el escenario", error);

        res.status(500).json({
            status: "error",
            message: "Error al detener el escenario NodeGoat",
            error: error.message
        });
    }
});

//RUTA PARA VERIFICAR EL ESTADO DEL ESCENARIO EN KUBERNETES
app.get("/check-escenario", async (req, res) => {
    try {
        const { scenarioId, userId } = req.query;


        if (!scenarioId || !userId){
             return res.status(400).json({ 
                status: "error",
                message: "Falta el scenarioId o el userId"
            });
        }
        
        const resultado = await verificarEscenarioK8s(scenarioId, userId);

        console.log(`[k8s Check] Usuario: ${userId} - Escenario: ${scenarioId} - Estado: ${resultado.ready? "Running" : resultado.status}`);
        res.json(resultado);

    }catch (error) {
        console.error("Error al verificar escenario:", error);
        res.status(500).json({
            ready: false, 
            status: "Error interno de servidor"
        });
    }
});

//RUTA PARA OBTENER LOGS DEL POD PRINCIPAL
app.get("/logs-pod", async (req, res) => {
    try {
        const { scenarioId, userId } = req.query;
        if (!scenarioId || !userId){
            return res.status(400).json({
                succes: false,
                message: "Falta el scenarioId o el userId"
            });
        }
        const resultado = await obtenerLogsPod(scenarioId, userId);
        res.json(resultado);

    }catch (err){
        res.status(500).json({
            succes: false,
            message: "Error en obtener logs",
            error: err.message
        });
    }
});

//ROOT
app.get("/", (req, res) => {
    res.send("<h1>¡Plataforma de Ciberseguridad funcionando!</h1>");
});


// SERVIDOR
const PORT = 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});