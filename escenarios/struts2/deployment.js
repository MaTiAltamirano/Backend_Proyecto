module.exports = {
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name: 'struts2' },
            spec: {
                replicas: 1,
                selector: {
                    matchLabels: { app: 'struts2' }
                },
                template: {
                    metadata: { labels: { app: 'struts2' } },
                    spec: {
                        containers: [
                        {
                            name: 'struts2',
                            image: 'vulhub/struts2:2.3.30',
                            imagePullPolicy: 'IfNotPresent',
                            ports: [{ containerPort: 8080 }]
                        }
                        ]
                    }
                }
            }
        }
    ]
};