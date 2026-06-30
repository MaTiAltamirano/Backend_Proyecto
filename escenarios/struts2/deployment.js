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
                            ports: [{ containerPort: 8080 }],
                            //se crean archivos dentro del contenedor pruebas y flag final
                            command: ["/bin/sh", "-c"],
                            args: [
                                `
                                mkdir -p /uploads /secret &&
                                echo "Archivo de prueba del laboratorio Struts2" > /uploads/prueba.txt &&
                                echo "FLAG{struts2_s2_045_completado}" > /secret/flag.txt &&
                                chmod 755 /uploads /secret &&
                                chmod 644 /uploads/prueba.txt /secret/flag.txt &&
                                cd /usr/src &&
                                mvn jetty:run
                                `
                            ],

                            ports: [{ containerPort: 8080 }]
                        }
                        ]
                    }
                }
            }
        }
    ]
};