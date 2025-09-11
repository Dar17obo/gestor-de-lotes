const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    // Acepta solo solicitudes POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed',
        };
    }

    try {
        const { filePath } = JSON.parse(event.body);

        // Lee las claves de Supabase desde las variables de entorno de Netlify
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            return {
                statusCode: 500,
                body: 'Supabase keys are not set as environment variables',
            };
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await supabase.storage
            .from('comprobantes')
            .createSignedUrl(filePath, 60); // La URL es válida por 60 segundos

        if (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ signedUrl: data.signedUrl }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};