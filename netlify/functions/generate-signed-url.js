const { createClient } = require('@supabase/supabase-js');

// Configuración del cliente Supabase con la clave de servicio
// Estas claves se deben configurar en las variables de entorno de Netlify
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // ¡IMPORTANTE! Usar la clave de servicio

const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event, context) => {
  // Solo procesamos solicitudes POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Método no permitido' }),
    };
  }

  try {
    const { filePath } = JSON.parse(event.body);

    if (!filePath) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Se requiere la ruta del archivo (filePath)' }),
      };
    }

    // Generar la URL firmada, válida por 60 segundos
    const { data, error } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(filePath, 60); // 60 segundos de validez

    if (error) {
      console.error('Error al generar URL firmada:', error);
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
    console.error('Error inesperado:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Ocurrió un error inesperado', error: error.message }),
    };
  }
};