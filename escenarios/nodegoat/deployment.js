module.exports = {
    deployments: [
        {
            metadata: { name: 'mongo' },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'mongo' } },
                template: { 
                    metadata: { labels: { app: 'mongo' } },
                    spec: {
                        containers: [{
                                name: 'mongo',
                                image: 'mongo:4.4',
                                imagePullPolicy: 'IfNotPresent',
                                ports: [{ containerPort: 27017 }]
                        }]
                    }
                }
            }
        },

        {
            metadata: { name: 'nodegoat' },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'nodegoat' } },
                template: {
                    metadata: { labels: { app: 'nodegoat' } },
                    spec: {
                        containers: [{
                                name: 'nodegoat',
                                image: 'nirocr/nodegoat',
                                imagePullPolicy: 'IfNotPresent',
                                env: [{
                                        name: 'MONGO_URL',
                                        value: 'mongodb://mongo-service:27017/nodegoat'
                                }],
                                ports: [{ containerPort: 4000 }]    
                        }]
                    }
                }
            }
        }
    ],

    services: [
        {
            metadata: {
                name: 'mongo-service'
            },

            spec: {
                selector: { app: 'mongo'},
                ports: [
                    {
                        port: 27017,
                        targetPort: 27017
                    }
                ]
            }
        },

        {
            metadata: { name: 'nodegoat' },
            spec: { 
                selector: { app: 'nodegoat' },
                ports: [
                    {
                        port: 4000,
                        targetPort: 4000
                    }
                ]
            }
        }
    ]
};