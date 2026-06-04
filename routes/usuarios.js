const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const db = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'plataforma_ctf',
    password: 'abreteSesamo',
    port: 5432,
});

//REGISTRO DE USUARIO
router.post("/registro", async (req, res) => {
    const { nombre, correo, password } = req.body;

    try {
        // 1. Verificar si el usuario ya existe
        const userExist = await db.query("SELECT * FROM usuario WHERE correo = $1", [correo]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insertar en la base de datos
        const nuevoUsuario = await db.query(
            "INSERT INTO usuario (nombre, correo, password_hash) VALUES ($1, $2, $3) RETURNING id_usuario, nombre, correo",
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
        const result = await db.query("SELECT * FROM usuario WHERE correo = $1", [correo]);
        
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
                correo: usuario.correo
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
