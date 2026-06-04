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

//IMPORTAR RUTAS
const desafiosRoutes = require("./routes/desafios");
const usuariosRoutes = require("./routes/usuarios");
const respuestasRoutes = require("./routes/respuestas");
const progresosRoutes = require("./routes/progresos");

//USAR RUTAS
app.use("/desafios", desafiosRoutes);
app.use("/usuarios", usuariosRoutes);
app.use("/respuestas", respuestasRoutes);
app.use("/progresos", progresosRoutes);
 
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