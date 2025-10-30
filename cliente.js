// ===================================
// LÓGICA DEL PORTAL DEL CLIENTE
// ===================================

document.addEventListener('DOMContentLoaded', () => {

    const clienteLoginView = document.getElementById('cliente-view');
    const clienteLoginForm = document.getElementById('cliente-login-form');
    const pagoFormContainer = document.getElementById('pago-form-container');
    const subirComprobanteForm = document.getElementById('subir-comprobante-form');
    const clienteDNIInput = document.getElementById('cliente-dni');
    const nombreClienteDisplay = document.getElementById('nombre-cliente-display');
    const clienteErrorMessage = document.getElementById('cliente-error-message');
    const comprobanteFileInput = document.getElementById('comprobante-archivo');
    const pagoMesSelect = document.getElementById('pago-mes');
    
    // Las referencias al historial fueron eliminadas de forma permanente.
    const pagoPendienteMessage = document.getElementById('pago-pendiente-message');


    let clienteActual = null;

    // MACHETE: Función de ayuda para subir el archivo.
    const subirArchivo = async (archivo, filePath) => {
        const { error } = await sb.storage
            .from('comprobantes') 
            .upload(filePath, archivo, {
                cacheControl: '3600',
                upsert: false 
            });

        if (error) {
            console.error('Error al subir el archivo:', error);
            throw new Error('Error al subir el comprobante. Revisa la conexión.');
        }
    }
    
    // Función para cargar el estado del último comprobante (se mantiene)
    async function cargarEstadoUltimoPago() {
        if (!clienteActual) return;
        
        const { data: comprobantes, error } = await sb
            .from('comprobantes_subidos') 
            .select('estado_verificacion')
            .eq('id_cliente', clienteActual.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error al obtener estado del comprobante:', error);
            pagoPendienteMessage.textContent = 'Error al cargar estado.';
            pagoPendienteMessage.className = 'error-message';
            return;
        }

        if (comprobantes && comprobantes.length > 0) {
            const estado = comprobantes[0].estado_verificacion;
            pagoPendienteMessage.textContent = `Estado: ${estado}.`;
            pagoPendienteMessage.classList.remove('error-message', 'success-message');
            
            if (estado === 'Pendiente') {
                pagoPendienteMessage.classList.add('error-message'); // Resaltar pendiente
            } else if (estado === 'Verificado') {
                pagoPendienteMessage.classList.add('success-message');
            }
        } else {
            pagoPendienteMessage.textContent = 'Aún no se han enviado comprobantes.';
            pagoPendienteMessage.classList.remove('error-message', 'success-message');
        }
    }


    clienteLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dni = clienteDNIInput.value.trim();

        const { data, error } = await sb.from('clientes').select('*, id_lote_asignado').eq('dni', dni).single();

        if (error || !data) {
            console.error('Error o Cliente no encontrado:', error);
            clienteErrorMessage.textContent = 'DNI no encontrado o error en la consulta.';
            return;
        }

        clienteActual = data;
        nombreClienteDisplay.textContent = clienteActual.nombre_apellido;
        clienteErrorMessage.textContent = '';
        
        // Muestra la vista de pago
        clienteLoginForm.classList.add('hidden'); // Oculta el formulario de login

        // --- CORRECCIÓN DEL LOGO: LAS SIGUIENTES LÍNEAS FUERON ELIMINADAS O COMENTADAS ---
        // clienteLoginView.querySelector('.login-container > .logo-login').classList.add('hidden'); // ELIMINADA
        // clienteLoginView.querySelector('.login-container > #cliente-title').classList.add('hidden'); // ELIMINADA

        pagoFormContainer.classList.remove('hidden');

        // MACHETE: Carga el estado del último pago
        await cargarEstadoUltimoPago(); 
    });


    subirComprobanteForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!clienteActual) {
            alert('Error de sesión. Por favor, ingresa nuevamente.');
            return;
        }

        const archivo = comprobanteFileInput.files[0];
        const mesPago = pagoMesSelect.value;
        const submitBtn = subirComprobanteForm.querySelector('button[type="submit"]');

        if (!archivo || !mesPago) {
            alert('Debes seleccionar un archivo y el mes de pago.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Subiendo...';
        
        try {
            // MACHETE: Aseguramos la ruta estructurada ID_VENDEDOR/DNI_CLIENTE
            const filePath = `${clienteActual.vendedor_id}/${clienteActual.dni}/${mesPago}_${new Date().toISOString()}_${archivo.name}`;
            
            await subirArchivo(archivo, filePath);
            
            const { data: publicUrlData } = sb.storage.from('comprobantes').getPublicUrl(filePath);
            const publicUrl = publicUrlData.publicUrl;

            const { error: dbError } = await sb.from('comprobantes_subidos').insert({
                id_cliente: clienteActual.id,
                mes_pago: mesPago,
                url_comprobante: publicUrl,
                estado_verificacion: 'Pendiente',
                vendedor_id: clienteActual.vendedor_id
            });

            if (dbError) {
                console.error('Error al registrar el comprobante:', dbError);
                alert('El comprobante se subió, pero hubo un error al registrarlo. Contacta al vendedor.');
            } else {
                alert('¡Comprobante enviado con éxito! A la espera de la verificación del vendedor.');
                subirComprobanteForm.reset();
                
                // Actualiza el estado después de la subida
                await cargarEstadoUltimoPago();
            }

        } catch (error) {
            console.error("Hubo un error inesperado:", error);
            alert("Ocurrió un error inesperado: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Comprobante';
        }
    });
});