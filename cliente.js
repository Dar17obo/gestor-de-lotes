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
    
    // CORRECCIÓN: Se agregó el ID al elemento p en cliente.html
    const historialPagosClienteContainer = document.getElementById('historial-pagos-cliente');
    const pagoPendienteMessage = document.getElementById('pago-pendiente-message');
    const historialPagosContainer = document.getElementById('historial-pagos-container');


    let clienteActual = null;

    clienteLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dni = clienteDNIInput.value.trim();

        const { data, error } = await sb.from('clientes').select('*, id_lote_asignado').eq('dni', dni).single();

        if (error || !data || !data.id_lote_asignado) {
            clienteErrorMessage.textContent = 'DNI no encontrado o no tiene un lote asignado.';
            pagoFormContainer.classList.add('hidden');
            return;
        }

        clienteActual = data;
        nombreClienteDisplay.textContent = clienteActual.nombre_apellido;
        // CORRECCIÓN: Se oculta el formulario de login, no toda la vista.
        clienteLoginForm.classList.add('hidden');
        pagoFormContainer.classList.remove('hidden');
        await cargarHistorialPagosCliente();
    });

    async function cargarHistorialPagosCliente() {
        const { data: pagosData, error: pagosError } = await sb.from('pagos').select('*').eq('id_cliente', clienteActual.id).order('created_at', { ascending: false });

        if (pagosError) {
            console.error('Error al cargar historial de pagos:', pagosError);
            historialPagosContainer.innerHTML = '<p>Error al cargar el historial de pagos.</p>'; 
            return;
        }
        
        const { data: comprobantesData, error: comprobantesError } = await sb.from('comprobantes_subidos').select('*, url_comprobante').eq('id_cliente', clienteActual.id).eq('estado_verificacion', 'Pendiente');

        if (comprobantesError) {
             console.error('Error al cargar comprobantes pendientes:', comprobantesError);
        }
        
        if (comprobantesData && comprobantesData.length > 0) {
            let comprobantesHTML = '<p>Tienes comprobantes pendientes de verificación:</p><ul>';
            comprobantesData.forEach(c => {
                 comprobantesHTML += `<li>Comprobante de ${c.mes_pago} - Estado: **${c.estado_verificacion}**</li>`;
            });
            comprobantesHTML += '</ul>';
            // CORRECCIÓN: Ya existe el elemento en el HTML, ahora se puede asignar el valor
            pagoPendienteMessage.innerHTML = comprobantesHTML;
            pagoPendienteMessage.classList.remove('hidden');
        } else {
             pagoPendienteMessage.classList.add('hidden');
        }
        
        if (pagosData && pagosData.length > 0) {
            let pagosHTML = '<h3>Historial de Pagos Realizados:</h3><ul class="historial-list">';
            pagosData.forEach(pago => {
                const fecha = new Date(pago.created_at).toLocaleDateString();
                const monto = pago.monto_usd_momento.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                pagosHTML += `<li>**Fecha:** ${fecha} - **Concepto:** ${pago.concepto} - **Monto:** ${monto}</li>`;
            });
            pagosHTML += '</ul>';
            historialPagosContainer.innerHTML = pagosHTML;
        } else {
            historialPagosContainer.innerHTML = '<p>No hay pagos registrados.</p>';
        }
    }
    

    subirComprobanteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const archivo = comprobanteFileInput.files[0];
        const mesPago = pagoMesSelect.value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!archivo || !mesPago) {
            alert('Por favor, selecciona un archivo y un mes de pago.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        
        try {
            // CORRECCIÓN: Se utiliza el vendedor_id como la carpeta de primer nivel.
            const filePath = `${clienteActual.vendedor_id}/${clienteActual.dni}/${mesPago}_${new Date().toISOString()}_${archivo.name}`;
            
            const { error: uploadError } = await sb.storage.from('comprobantes').upload(filePath, archivo);
            
            if (uploadError) {
                console.error('Error al subir el archivo:', uploadError);
                alert('Hubo un error al subir el comprobante. Por favor, inténtalo de nuevo.');
                return;
            }

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
                await cargarHistorialPagosCliente();
            }

        } catch (error) {
            console.error("Hubo un error inesperado:", error);
            alert("Ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Comprobante';
        }
    });
});