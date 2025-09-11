const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
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

        // Reemplaza con tus claves de Supabase
        const supabaseUrl = 'https://jbenfvckviqdfmjzjomi.supabase.co';
        const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZW5mdmNrdmlxZGZtanpqb21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NjY2MjYsImV4cCI6MjA2ODI0MjYyNn0.f2Xqrj1XoufKQpeOkqx6_SunYs7dcyuvjBFCwWY0Ors';

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