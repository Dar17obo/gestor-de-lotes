// Este es el código para la función de Netlify
const { createClient } = require('@supabase/supabase-js');

// Las variables de entorno de Supabase se cargan automáticamente en Netlify
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// No uses la clave anon, usa la clave de rol de servicio para seguridad
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    // Solo permitimos solicitudes POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed',
        };
    }

    try {
        const { filePath } = JSON.parse(event.body);

        // Genera la URL firmada con una expiración de 60 segundos
        const { data, error } = await supabase.storage
            .from('comprobantes')
            .createSignedUrl(filePath, 60);

        if (error) {
            console.error('Error creating signed URL:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ signedUrl: data.signedUrl }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};