Backend Xploit

Backend de Xploit, una plataforma educativa de laboratorios vulnerables. Este servicio administra usuarios, escenarios, objetivos, progreso y despliegue de laboratorios dentro de Kubernetes.

Tecnologías utilizadas
Node.js
Express
PostgreSQL
Docker
Kubernetes
kubectl
Cloudflare Tunnel
http-proxy-middleware
Funcionalidades principales
API REST para el frontend.
Registro e inicio de sesión de usuarios.
Gestión de escenarios disponibles.
Obtención de contexto educativo por escenario.
Gestión de objetivos guiados.
Validación de respuestas.
Registro de progreso y puntaje.
Despliegue de laboratorios vulnerables en Kubernetes.
Detención de escenarios activos.
Proxy hacia los laboratorios desplegados en Kubernetes.

El backend utiliza las siguientes variables para conectarse a PostgreSQL:

DB_HOST
DB_NAME
DB_USER
DB_PASSWORD
DB_PORT

Ejemplo:

DB_HOST=host.docker.internal
DB_NAME=plataforma_ctf
DB_USER=postgres
DB_PASSWORD=tu_password
DB_PORT=5432
Instalación local
npm install
Construir imagen Docker
docker build --no-cache -t backend-proyecto:local .

Se recomienda usar etiquetas distintas para cada versión:

docker build --no-cache -t backend-proyecto:v1 .
docker build --no-cache -t backend-proyecto:v2 .
Actualizar backend en Kubernetes
kubectl set image deployment/backend-proyecto backend-proyecto=backend-proyecto:local
kubectl rollout status deployment/backend-proyecto
Ver logs
kubectl logs deployment/backend-proyecto -f
Exponer backend localmente
kubectl port-forward svc/backend-service 3000:3000

El backend quedará disponible en:

http://localhost:3000
Exponer backend con Cloudflare Tunnel

Con el port-forward activo:

cloudflared tunnel --url http://127.0.0.1:3000

Cloudflare entregará una URL pública temporal que debe configurarse en el frontend.

Endpoints principales
GET  /desafios
GET  /desafios/:id
POST /lanzar-escenario
POST /detener-escenario
GET  /check-escenario
GET  /objetivos/:scenarioId
POST /objetivos/validar
GET  /usuarios/:id
Escenario implementado

Actualmente se encuentra implementado el laboratorio:

Apache Struts2 S2-045 / CVE-2017-5638

Este escenario despliega una aplicación vulnerable en Kubernetes y permite practicar objetivos guiados relacionados con reconocimiento, peticiones HTTP, ejecución remota de comandos y captura de una flag en un entorno aislado.

Consideraciones éticas

Los laboratorios están diseñados exclusivamente con fines educativos. No deben utilizarse para atacar sistemas externos ni practicar fuera de entornos autorizados.