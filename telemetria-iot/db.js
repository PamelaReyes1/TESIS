const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "telemetria",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((error, conexion) => {
    if (error) {
        console.error("❌ Error al conectar con el pool de MySQL:");
        console.error(error);
        return;
    }

    console.log("✅ Base de datos conectada correctamente mediante pool.");
    conexion.release();
});

module.exports = pool;