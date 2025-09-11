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

        // LOG para diagnóstico
        console.log('Ruta de archivo recibida:', filePath);

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.log('Error: Las variables de entorno no están configuradas.');
            return {
                statusCode: 500,
                body: 'Supabase keys are not set as environment variables',
            };
        }

        // LOG para diagnóstico
        console.log('Variables de entorno cargadas correctamente.');


        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await supabase.storage
            .from('comprobantes')
            .createSignedUrl(filePath, 60);

        if (error) {
            console.error('Error de Supabase:', error.message);
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
        console.error('Error en la función:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};