const path = require('path');

const cargarEscenario = (scenarioId) => {
    try {
        const deployment = require(
            path.join(
                __dirname,
                `../escenarios/${scenarioId}/deployment.js`
            )
        );

        const service = require(
            path.join(
                __dirname,
                `../escenarios/${scenarioId}/service.js`
            )
        )

        const metadata = require(
            path.join(
                __dirname,
                `../escenarios/${scenarioId}/metadata.json`
            )
        );

        const flags = require(
            path.join(
                __dirname,
                `../escenarios/${scenarioId}/flags.js`
            )
        );

        return {
            deployment,
            service,
            metadata,
            flags
        };

    } catch (err) {
        console.error("Error cargando escenario:", err);
        return null;
    }
};

module.exports = {
    cargarEscenario
};