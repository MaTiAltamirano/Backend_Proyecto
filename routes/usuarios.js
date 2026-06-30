const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const db = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'plataforma_ctf',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 5432,
});

//REGISTRO DE USUARIO
router.post("/registro", async (req, res) => {
    const { nombre, correo, password } = req.body;

    try {
        // Verificar si el usuario ya existe
        const userExist = await db.query("SELECT * FROM usuario WHERE correo = $1 AND activo = true", [correo]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }

        //Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insertar en la base de datos
        const nuevoUsuario = await db.query(
            "INSERT INTO usuario (nombre, correo, password_hash) VALUES ($1, $2, $3) RETURNING id_usuario, nombre, correo, foto_url, rol",
            [nombre, correo, passwordHash]
        );

        res.status(201).json({
            message: "Usuario creado con éxito",
            user: nuevoUsuario.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// LOGIN DE USUARIO
router.post("/login", async (req, res) => {
    const { correo, password } = req.body;

    try {
        const result = await db.query("SELECT * FROM usuario WHERE correo = $1 AND activo = true", [correo]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const usuario = result.rows[0];

        // Validar contraseña
        const validPassword = await bcrypt.compare(password, usuario.password_hash);
        if (!validPassword) {
            return res.status(401).json({ message: "Contraseña incorrecta" });
        }

        // Enviar datos del usuario (menos la contraseña)
        res.json({
            message: "Login exitoso",
            user: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                foto_url: usuario.foto_url,
                rol: usuario.rol
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// OBTENER USUARIO POR ID
router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            `
            SELECT id_usuario, nombre, correo, foto_url, rol, fecha_registro
            FROM usuario
            WHERE id_usuario = $1
              AND activo = true
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const usuario = result.rows[0];

        res.json({
            user: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                foto_url: usuario.foto_url,
                rol: usuario.rol,
                fecha_registro: usuario.fecha_registro
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ACTUALIZAR PERFIL
router.put("/:id/perfil", async (req, res) => {
    const { id } = req.params;
    const { nombre, correo } = req.body;

    try {
        if (!nombre || !correo) {
            return res.status(400).json({
                message: "Nombre y correo son obligatorios"
            });
        }

        const correoExistente = await db.query(
            `
            SELECT id_usuario
            FROM usuario
            WHERE correo = $1
              AND id_usuario <> $2
              AND activo = true
            `,
            [correo, id]
        );

        if (correoExistente.rows.length > 0) {
            return res.status(400).json({
                message: "Ese correo ya está siendo usado por otro usuario"
            });
        }

        const result = await db.query(
            `
            UPDATE usuario
            SET nombre = $1,
                correo = $2
            WHERE id_usuario = $3
              AND activo = true
            RETURNING id_usuario, nombre, correo, foto_url, rol, fecha_registro
            `,
            [nombre, correo, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        const usuario = result.rows[0];

        res.json({
            message: "Perfil actualizado correctamente",
            user: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                foto_url: usuario.foto_url,
                rol: usuario.rol,
                fecha_registro: usuario.fecha_registro
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/// ACTUALIZAR FOTO DE PERFIL
router.put("/:id/foto", async (req, res) => {
    const { id } = req.params;
    const { foto_url } = req.body;

    try {
        if (!foto_url || String(foto_url).trim() === "") {
            const result = await db.query(
                `
                UPDATE usuario
                SET foto_url = NULL
                WHERE id_usuario = $1
                  AND activo = true
                RETURNING id_usuario, nombre, correo, foto_url, rol, fecha_registro
                `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Usuario no encontrado"
                });
            }

            const usuario = result.rows[0];

            return res.json({
                message: "Foto eliminada correctamente",
                user: {
                    id: usuario.id_usuario,
                    nombre: usuario.nombre,
                    correo: usuario.correo,
                    foto_url: usuario.foto_url,
                    rol: usuario.rol,
                    fecha_registro: usuario.fecha_registro
                }
            });
        }

        const fotoFinal = String(foto_url).trim();

        // Acepta dos formatos
        const esUrlImagen = /^https?:\/\/.+/i.test(fotoFinal);
        const esBase64Imagen = /^data:image\/(png|jpg|jpeg|webp);base64,/i.test(fotoFinal);

        if (!esUrlImagen && !esBase64Imagen) {
            return res.status(400).json({
                message: "Formato de imagen no válido. Debe ser una URL o una imagen seleccionada desde el computador."
            });
        }

        // Límite de seguridad para evitar guardar datos excesivamente grandes.
        const maxSizeMB = 8;
        const maxLength = maxSizeMB * 1024 * 1024;

        if (fotoFinal.length > maxLength) {
            return res.status(400).json({
                message: `La imagen es demasiado pesada. El máximo permitido es ${maxSizeMB} MB.`
            });
        }

        const result = await db.query(
            `
            UPDATE usuario
            SET foto_url = $1
            WHERE id_usuario = $2
              AND activo = true
            RETURNING id_usuario, nombre, correo, foto_url, rol, fecha_registro
            `,
            [fotoFinal, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Usuario no encontrado"
            });
        }

        const usuario = result.rows[0];

        res.json({
            message: "Foto actualizada correctamente",
            user: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                foto_url: usuario.foto_url,
                rol: usuario.rol,
                fecha_registro: usuario.fecha_registro
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// BORRADO LÓGICO DE CUENTA
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            `
            UPDATE usuario
            SET activo = false,
                fecha_eliminacion = CURRENT_TIMESTAMP
            WHERE id_usuario = $1
              AND activo = true
            RETURNING id_usuario
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Usuario no encontrado o ya fue eliminado"
            });
        }

        res.json({
            message: "Cuenta eliminada correctamente"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
