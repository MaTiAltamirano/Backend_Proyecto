const k8s = require('@kubernetes/client-node');
const { cargarEscenario } = require('./services/scenarioServices');

const kc = new k8s.KubeConfig();
kc.loadFromDefault(); //carga archivo ~/.kube/config 

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

//FUNCION PARA PARSEAR ERRORES A JSON
const parseK8sError = (err) => {
    let errorBody = err.body;
    if (typeof errorBody === "string") {
        try {
            errorBody = JSON.parse(errorBody);
        }catch {
            errorBody = {};
        }
    }
    return errorBody;
};

const obtenerCodigoError = (err) =>{
    const errorBodyParsed = parseK8sError(err);
    return err.code || err.statusCode || errorBodyParsed.code;
};

const imprimirErrorK8s = (err) => {
    console.log("\n========== ERROR KUBERNETES ==========");

    console.log("Mensaje:");
    console.log(err.message);

    console.log("\nBody:");
    console.log(JSON.stringify(err.body, null, 2));

    console.log("\nResponse body:");
    console.log(JSON.stringify(err.response?.body, null, 2));

    console.log("\nError completo:");
    console.dir(err, { depth: 5 });

    console.log("======================================\n");
};

//==========================
//       NAMESPACE
//==========================

//FUNCION PARA VERIFICAR SI NAMESPACE YA EXISTE
const namespaceExiste = async (nsName) => {
    try {
        await k8sCoreApi.readNamespace({ name: nsName });
        return true

    }catch (err) {
        const code = obtenerCodigoError(err);
        if (code === 404) {
            return false;
        }
        throw err;
    }
};

//CREAR NAMESPACE
const crearNamespace = async (nsName) => {
    await k8sCoreApi.createNamespace({
        body: {metadata: {name: nsName}}
    });
    console.log(`Namespace ${nsName} creado`);
};

//CREAR NAMESPACE PARA EL USUARIO SI ES QUE NO TIENE
const asegurarNamespacePorUsuario = async (nsName) => {
    const existeNamespace = await namespaceExiste(nsName);

    if (existeNamespace){
        console.log(`Name space ${nsName} ya existe`);
        return;
    }
    
    await crearNamespace(nsName);
};

//==========================
//       DEPLOYMENTS
//==========================

const deploymentExiste = async (namespace, deploymentName) => {
    try {
        await k8sAppsApi.readNamespacedDeployment({
            name: deploymentName,
            namespace
        });
        return true;

    } catch(err) {
        const code = obtenerCodigoError(err);
        if (code === 404){
            return false;
        }

        throw err;
    }
};

const crearDeployment = async (namespace, deployment) => {
    await k8sAppsApi.createNamespacedDeployment({
        namespace,
        body: deployment
    });

    console.log(`Deployment ${deployment.metadata.name} creado`);
};

const borrarDeployment = async (namespace, deploymentName) => {
    await k8sAppsApi.deleteNamespacedDeployment({
        name: deploymentName,
        namespace
    });

    console.log(`Deployment ${deploymentName} eliminado`);
};

//==========================
//       SERVICES
//==========================

const serviceExiste = async (namespace, serviceName) => {
    try {
        await k8sCoreApi.readNamespacedService({
            name: serviceName,
            namespace
        });
        return true;

    } catch (err) {
        const code = obtenerCodigoError(err);
        if (code === 404) {
            return false;
        }

        throw err;
    }
};

const crearService = async (namespace, service) => {
    await k8sCoreApi.createNamespacedService({
        namespace,
        body: service
    });

    console.log(`Service ${service.metadata.name} creado`);
};

const borrarService = async (namespace, serviceName) => {
    await k8sCoreApi.deleteNamespacedService({
        name: serviceName,
        namespace
    });

    console.log(`Service ${serviceName} eliminado`);
};


//==========================
//    INICIAR ESCENARIO
//==========================

//LANZA ESCENARIO UNICO POR USUARIO
const iniciarEscenarioK8s = async (scenarioID, userId) => {

    const escenario = cargarEscenario(scenarioID);

    if(!escenario){
        throw new Error("Escenario no encontrado");
    }

    const nsName = `lab-user${userId}`;

    try {
        await asegurarNamespacePorUsuario(nsName);

        for (const deployment of escenario.deployment.deployments) {
            const deploymentName = deployment.metadata.name;
            const existe = await deploymentExiste(nsName, deploymentName);

            if (existe) {
                console.log(`Deployment ${deploymentName} ya existe`);
                continue;
            }

            await crearDeployment(nsName, deployment);
        }

        for (const service of escenario.service.services) {
            const serviceName = service.metadata.name;
            const existe = await serviceExiste(nsName, serviceName);

            if (existe){
                console.log(`Servicio ${serviceName} ya existe`);
                continue;
            }

            await crearService(nsName, service);
        }
        return `Escenario ${scenarioID} en namespace ${nsName} para el usuario ${userId} iniciado exitosamente`;

    }catch (err) {
        imprimirErrorK8s(err);
        throw err;
    }
};

//DETENER ESCENARIO, ELIMINAR SERVICE Y DEPLOYMENT
const detenerEscenarioK8s = async (scenarioId, userId) => {
    const escenario = cargarEscenario(scenarioId);

    if (!escenario){
        throw new Error ("Escenario no encontrado");
    }

    const nsName = `lab-user${userId}`;
    try {
        const existeNamespace = await namespaceExiste(nsName);
        if (!existeNamespace){
            return `Namespace ${nsName} no existe. No hay recursos que detener.`;
        }

        //borrar deployment
        for (const deployment of escenario.deployment.deployments) {
            const deploymentName = deployment.metadata.name;
            const existe = await deploymentExiste(nsName, deploymentName);

            if (!existe){
                console.log(`Deployment ${deploymentName} no existe, no se puede eliminar`);
                continue;
            }

            await borrarDeployment(nsName, deploymentName);
        }

        //borrar services
        for (const service of escenario.service.services) {
            const serviceName = service.metadata.name;
            const existe = await serviceExiste(nsName, serviceName);

            if (!existe){
                console.log(`Service ${serviceName} no existe, no se puede eliminar`);
                continue;
            }

            await borrarService(nsName, serviceName);
        }

        return `Escenario ${scenarioId} detenido correctamente en namespace ${nsName}`;

    } catch (err) {
        imprimirErrorK8s(err);
        throw err;
    }
};


const verificarEscenarioK8s = async (scenarioId, userId) => {
    const escenario = cargarEscenario(scenarioId);

    if (!escenario){
        return {
            ready: false,
            status: "Escenario no encontrado"
        };
    }

    const nsName = `lab-user${userId}`;
    const mainPodLabel = escenario.metadata.mainPodLabel;

    console.log("mainPodLabel esperado:", mainPodLabel);

    try {
        const existeNamespace = await namespaceExiste(nsName);
        if (!existeNamespace){
            return {
                ready: false,
                status: "Namespace del usuario no existe"
            };
        }

        console.log("Namespace en uso:", nsName);

        const podsRes = await k8sCoreApi.listNamespacedPod({
            namespace: nsName
        });

        const items = podsRes.items || [];

        if (items.length === 0){
            return {
                ready: false,
                status: "Creando recusos..."
            };
        }

        const podEscenario = items.find(pod => {
            const labels = pod.metadata?.labels || {};
            const podName = pod.metadata?.name || "";

            console.log("Pod encontrado: ",podName);
            console.log("Labels del pod: ",labels);

            return labels.app === mainPodLabel || podName.includes(mainPodLabel);
        });

        if (!podEscenario){
            return {
                ready: false,
                status: "Esperando pod del escenario..."
            };
        }

        const phase = podEscenario.status?.phase;

        const containersReady = podEscenario.status?.containerStatuses?.every(c => c.ready);

        if (phase === "Running" && containersReady){
            return{
                ready: true,
                status: "Pod en ejecución"
            };
        }

        return {
            ready: false,
            status: `Pod en estado ${phase || "desconocido"}`
        };

    }catch (err) {
        console.error("ERROR K8S:");
        console.error(err);

        return {
            ready: false,
            status: "Error de comunicacion con clúster"
        };
    }

};

//================
//     LOGS
//================

const obtenerLogsPod = async (scenarioId, userId) => {
    const escenario = cargarEscenario(scenarioId);
    if (!escenario) {
        return {
            success: false,
            message: "Escenario no encontrado"
        };
    }

    const nsName = `lab-user${userId}`;
    const mainPodLabel = escenario.metadata.mainPodLabel;

    try {
        const existeNamespace = await namespaceExiste(nsName);
        if (!existeNamespace) {
            return {
                success: false,
                message: "Namespace del usuario no existe"
            };
        }

        const podsRes = await k8sCoreApi.listNamespacedPod({ namespace: nsName });
        const items = podsRes.items || [];
        if (items.length === 0) {
            return {
                success: false,
                message: "No hay pods disponibles"
            };
        }

        const podPrincipal = items.find(pod => {
            const labels = pod.metadata?.labels || {};
            const podName = pod.metadata?.name || "";
            return labels.app === mainPodLabel || podName.includes(mainPodLabel);
        });

        if (!podPrincipal) {
            return {
                success: false,
                message: "No se encontró el pod principal"
            };
        }

        const podName = podPrincipal.metadata.name;

        console.log(`Obteniendo logs del pod ${podName} en namespace ${nsName}`);

        //obtengo logs del pod
        const logs = await k8sCoreApi.readNamespacedPodLog({
            name: podName,
            namespace: nsName
        });

        return {
            success: true,
            pod: podName,
            logs
        };

    }catch (err) {
        console.error("Error obteniendo logs:", err);

        return {
            success: false,
            message: "Error al obtener logs",
            logs: err.message
        };
    }
};

module.exports = { 
    iniciarEscenarioK8s,
    detenerEscenarioK8s,
    verificarEscenarioK8s,
    obtenerLogsPod
};