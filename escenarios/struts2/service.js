module.exports = {
    services: [
        {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: { name: 'struts2-service' },
            spec: {
                selector: { app: 'struts2' },
                ports: [
                    {
                        port: 8080,
                        targetPort: 8080
                    }
                ]
            }
        }
    ]
}