// ===================================
// GESTOR DE LOTES - MIS APUNTES
// ===================================

// MACHETE: Funciones de ayuda para los números y la plata.
const parseFlexibleFloat = (value) => {
    if (typeof value !== 'string') value = String(value);
    return parseFloat(value.replace(',', '.')) || 0;
};
const formatARS = (number) => {
    return (number || 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

// MACHETE: Cuando la página HTML se carga, empieza a correr todo mi código.
document.addEventListener('DOMContentLoaded', () => {

    // MACHETE: Variables que necesito tener a mano en toda la app.
    let currentUser = null;
    let precioCemento = 0;
    let lotes = [];
    let clientes = [];
    let pagos = [];
    let comprobantesPendientes = [];
    let editandoLote = false;
    let editandoCliente = false;
    let clienteParaAsignar = null;
    let clienteParaPagos = null;
    let editandoPagoId = null;
    let comprobanteParaEditar = null;
    let comprobantesAdjuntos = []; // NUEVO: Lista de comprobantes para adjuntar a un pago

    // MACHETE: Acá agarro los pedazos del HTML para poder manipularlos.
    const loginView = document.getElementById('login-view');
    const adminView = document.getElementById('admin-view');
    const contentViews = document.querySelectorAll('.content-view');
    const navButtons = document.querySelectorAll('.nav-button');
    const modalContainer = document.getElementById('modal-container');
    const modals = document.querySelectorAll('.modal-content');
    
    const editComprobanteModal = document.getElementById('edit-comprobante-modal');
    const editComprobanteForm = document.getElementById('edit-comprobante-form');
    const editComprobanteMesSelect = document.getElementById('edit-comprobante-mes-pago');

    // MACHETE: Esta es la función principal que arranca todo. Ahora recibe la sesión.
    const initApp = async (session) => {
        if (session) {
            currentUser = session.user;
            loginView.classList.add('hidden');
            adminView.classList.remove('hidden');
            await cargarDatos();
        } else {
            currentUser = null;
            loginView.classList.remove('hidden');
            adminView.classList.add('hidden');
        }
    };

    // MACHETE: Esta es la forma correcta de iniciar la app.
    // onAuthStateChange se encarga de todo: se ejecuta al cargar la página,
    // al iniciar sesión y al cerrar sesión. Es el único que debe llamar a initApp.
    sb.auth.onAuthStateChange((_event, session) => {
        initApp(session);
    });

    // MACHETE: Función de carga de datos más robusta.
    const cargarDatos = async () => {
        try {
            await cargarConfig();
            await cargarPagos();
            await cargarClientes();
            await cargarLotes();
            await cargarComprobantesPendientes();
            renderizarTodo();
        } catch (error) {
            console.error("Error fatal durante la carga de datos:", error);
            alert("Hubo un error al cargar la información. Revisa la consola (F12).");
        }
    };

    // MACHETE: Las funciones que traen la info de cada tabla.
    async function cargarConfig() {
        let { data, error } = await sb.from('configuracion').select('valor').eq('nombre', 'precio_cemento').eq('vendedor_id', currentUser.id).limit(1).single();

        if (error && error.code === 'PGRST116') {
            const { error: insertError } = await sb.from('configuracion').insert({ nombre: 'precio_cemento', valor: '0', vendedor_id: currentUser.id });
            if (insertError) {
                console.error('Error al crear el registro de configuración:', insertError);
                precioCemento = 0;
            } else {
                precioCemento = 0;
            }
        } else if (error) {
             console.error('Error al cargar configuración:', error);
             precioCemento = 0;
        } else {
            precioCemento = data ? parseFlexibleFloat(data.valor) : 0;
        }
        
        document.getElementById('precio-cemento').value = String(precioCemento).replace('.', ',');
        document.getElementById('cemento-valor-display-lotes').textContent = formatARS(precioCemento);
    }
    
    async function cargarLotes() {
        const { data, error } = await sb.from('lotes').select('*').eq('vendedor_id', currentUser.id);
        if (error) throw error;
        lotes = data || [];
    }
    async function cargarClientes() {
        const { data, error } = await sb.from('clientes').select('*, id_lote_asignado').eq('vendedor_id', currentUser.id);
        if (error) throw error;
        clientes = data || [];
        
        const ultimoPagoPorCliente = pagos.reduce((acc, pago) => {
            if (!acc[pago.id_cliente] || new Date(pago.created_at) > new Date(acc[pago.id_cliente].created_at)) {
                acc[pago.id_cliente] = pago;
            }
            return acc;
        }, {});
        
        clientes = clientes.map(cliente => {
            const pago = ultimoPagoPorCliente[cliente.id] || null;
            return {
                ...cliente,
                fecha_ultimo_pago: pago ? pago.created_at : null
            };
        });
    }

    async function cargarPagos() {
        const { data, error } = await sb.from('pagos').select('*, concepto, id_comprobante').eq('vendedor_id', currentUser.id);
        if (error) throw error;
        pagos = data || [];
    }

    // CORRECCIÓN: Ahora también busca el id_lote_asignado del cliente para poder validar al aprobar el pago.
    async function cargarComprobantesPendientes() {
        const { data, error } = await sb.from('comprobantes_subidos')
            .select(`
                *,
                clientes (
                    nombre_apellido,
                    dni,
                    id_lote_asignado
                )
            `)
            .eq('estado_verificacion', 'Pendiente')
            .eq('vendedor_id', currentUser.id);
    
        if (error) {
            console.error('Error al cargar comprobantes pendientes:', error);
            comprobantesPendientes = [];
        } else {
            comprobantesPendientes = data || [];
        }
    }

    // MACHETE: Lógica para el formulario de Login.
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) document.getElementById('login-error-message').textContent = 'Error: Email o contraseña incorrectos.';
    });

    // MACHETE: El botón de cerrar sesión.
    document.getElementById('logout-button').addEventListener('click', () => sb.auth.signOut());

    // MACHETE: La lógica para que funcionen los botones de navegación (Lotes, Clientes, etc.).
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetView = button.dataset.view;
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            contentViews.forEach(view => {
                view.classList.toggle('hidden', view.id !== `${targetView}-content`);
            });
            if (targetView === 'comprobantes') {
                document.querySelector('[data-view="comprobantes"]').classList.remove('notificacion');
            }
        });
    });

    const renderizarTodo = () => {
        renderizarLotes();
        renderizarClientes();
        renderizarComprobantes();
    };

    function renderizarLotes() {
        const container = document.getElementById('lotes-list');
        container.innerHTML = lotes.length ? '' : '<p>No hay lotes registrados.</p>';
        lotes.forEach(lote => {
            const valorCalculado = (lote.cantidad_bolsas_cemento || 0) * precioCemento;
            const clienteAsignado = clientes.find(c => c.id_lote_asignado === lote.id);
            const card = document.createElement('div');
            card.className = `card ${lote.estado}`;
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-info">
                        <h4>Manzana ${lote.numero_manzana} - Lote ${lote.numero_lote}</h4>
                        <p><strong>Metros:</strong> ${lote.metros_cuadrados} m²</p>
                        <p><strong>Valor:</strong> ${String(lote.cantidad_bolsas_cemento || 0).replace('.',',')} bolsas (~${formatARS(valorCalculado)})</p>
                        ${clienteAsignado ? `<p><strong>Propietario:</strong> ${clienteAsignado.nombre_apellido}</p>` : ''}
                    </div>
                    <span class="status-badge">${lote.estado}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-edit-lote" data-id="${lote.id}">Editar</button>
                    <button class="btn-delete-lote" data-id="${lote.id}">Eliminar</button>
                </div>`;
            container.appendChild(card);
        });
    }
    
    function getEstadoPago(cliente) {
        if (!cliente.id_lote_asignado) return 'Sin Lote';
        if (!cliente.fecha_ultimo_pago) return 'Atrasado';

        const hoy = new Date();
        const fechaUltimoPago = new Date(cliente.fecha_ultimo_pago);
        const diffTime = hoy.getTime() - fechaUltimoPago.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diaDelMes = hoy.getDate();

        if (diffDays <= 30 && diaDelMes <= 23) {
            return 'AlDia';
        } else if (diffDays <= 30 && diaDelMes > 23) {
            return 'Demorado';
        } else {
            return 'Atrasado';
        }
    }
    
    function renderizarClientes(clientesFiltrados = clientes) {
        const container = document.getElementById('clientes-list');
        container.innerHTML = clientesFiltrados.length ? '' : '<p>No se encontraron clientes.</p>';
        
        clientesFiltrados.sort((a, b) => {
            const estadoA = getEstadoPago(a);
            const estadoB = getEstadoPago(b);
            const orden = { 'Atrasado': 1, 'Demorado': 2, 'AlDia': 3, 'Sin Lote': 4 };
            return orden[estadoA] - orden[estadoB];
        });

        clientesFiltrados.forEach(cliente => {
            const loteAsignado = lotes.find(l => l.id === cliente.id_lote_asignado);
            const estadoPago = getEstadoPago(cliente);
            const card = document.createElement('div');
            card.className = `card ${estadoPago}`; 
            card.innerHTML = `
                <div class="card-info">
                    <h4>${cliente.nombre_apellido}</h4>
                    <p><strong>DNI:</strong> ${cliente.dni}</p>
                    <p><strong>Tel:</strong> ${cliente.telefono}</p>
                    <p><strong>Lote Asignado:</strong> ${loteAsignado ? `Manzana ${loteAsignado.numero_manzana} - Lote ${loteAsignado.numero_lote}` : 'Ninguno'}</p>
                </div>
                <div class="card-actions">
                    ${!loteAsignado ? `<button class="btn-asignar-lote" data-id="${cliente.id}">Asignar Lote</button>` : ''}
                    ${loteAsignado ? `<button class="btn-gestionar-pagos" data-id="${cliente.id}">Gestionar Pagos</button>` : ''}
                    <button class="btn-edit-cliente" data-id="${cliente.id}">Editar</button>
                    <button class="btn-delete-cliente" data-id="${cliente.id}">Eliminar</button>
                </div>`;
            container.appendChild(card);
        });
    }

    function renderizarComprobantes() {
        const container = document.getElementById('comprobantes-list');
        container.innerHTML = comprobantesPendientes.length ? '' : '<p>No hay comprobantes pendientes de verificación.</p>';
        
        const comprobantesButton = document.querySelector('[data-view="comprobantes"]');
        if (comprobantesPendientes.length > 0) {
            comprobantesButton.classList.add('notificacion');
        } else {
            comprobantesButton.classList.remove('notificacion');
        }

        comprobantesPendientes.forEach(comprobante => {
            const card = document.createElement('div');
            card.className = `card Demorado`;
            card.innerHTML = `
                <div class="card-info">
                    <h4>Cliente: ${comprobante.clientes.nombre_apellido}</h4>
                    <p><strong>DNI:</strong> ${comprobante.clientes.dni}</p>
                    <p><strong>Mes de Pago:</strong> ${comprobante.mes_pago}</p>
                    <p><strong>Subido:</strong> ${new Date(comprobante.created_at).toLocaleDateString()}</p>
                </div>
                <div class="card-actions">
                    <button class="btn-ver-comprobante" data-id="${comprobante.id}">Ver Comprobante</button>
                    <button class="btn-aprobar-comprobante" data-id="${comprobante.id}" data-cliente-id="${comprobante.id_cliente}" data-mes-pago="${comprobante.mes_pago}">Aprobar Pago</button>
                    <button class="btn-eliminar-comprobante" data-id="${comprobante.id}">Eliminar</button>
                </div>`;
            container.appendChild(card);
        });
    }
    
    document.getElementById('config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevoPrecio = parseFlexibleFloat(document.getElementById('precio-cemento').value);
        const { error } = await sb.from('configuracion').upsert({ nombre: 'precio_cemento', valor: String(nuevoPrecio), vendedor_id: currentUser.id });
        
        if (error) {
            return alert('Error al actualizar el precio: ' + error.message);
        }
        
        alert('Precio actualizado con éxito.');
        precioCemento = nuevoPrecio;
        document.getElementById('cemento-valor-display-lotes').textContent = formatARS(precioCemento);
        renderizarTodo();
    });

    document.getElementById('lote-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const loteData = {
            numero_manzana: document.getElementById('lote-manzana').value,
            numero_lote: document.getElementById('lote-numero').value,
            metros_cuadrados: parseInt(document.getElementById('lote-metros').value, 10),
            cantidad_bolsas_cemento: parseFlexibleFloat(document.getElementById('lote-bolsas').value),
            estado: document.getElementById('lote-estado').value,
            vendedor_id: currentUser.id
        };
        const { error } = editandoLote ? await sb.from('lotes').update(loteData).eq('id', document.getElementById('lote-id').value).eq('vendedor_id', currentUser.id) : await sb.from('lotes').insert([loteData]);
        if (error) return alert('Error al guardar el lote: ' + error.message);
        document.getElementById('lote-form').reset();
        editandoLote = false;
        document.getElementById('lote-form-title').textContent = 'Agregar Nuevo Lote';
        await cargarLotes();
        renderizarLotes();
    });

    document.getElementById('cliente-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const clienteData = {
            nombre_apellido: document.getElementById('cliente-nombre').value,
            dni: document.getElementById('cliente-dni').value,
            telefono: document.getElementById('cliente-telefono').value,
            telefono_alternativo: document.getElementById('cliente-telefono-alt').value,
            mail: document.getElementById('cliente-email').value,
            lugar_residencia: document.getElementById('cliente-residencia').value,
            vendedor_id: currentUser.id
        };
        const { error } = editandoCliente ? await sb.from('clientes').update(clienteData).eq('id', document.getElementById('cliente-id').value).eq('vendedor_id', currentUser.id) : await sb.from('clientes').insert([clienteData]);
        if (error) return alert('Error al guardar el cliente: ' + error.message);
        document.getElementById('cliente-form').reset();
        editandoCliente = false;
        document.getElementById('cliente-form-title').textContent = 'Agregar Nuevo Cliente';
        await cargarClientes();
        renderizarClientes();
    });

    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (target.matches('.btn-edit-lote')) {
            const lote = lotes.find(l => l.id == id);
            document.getElementById('lote-id').value = lote.id;
            document.getElementById('lote-manzana').value = lote.numero_manzana;
            document.getElementById('lote-numero').value = lote.numero_lote;
            document.getElementById('lote-metros').value = lote.metros_cuadrados;
            document.getElementById('lote-bolsas').value = String(lote.cantidad_bolsas_cemento).replace('.', ',');
            document.getElementById('lote-estado').value = lote.estado;
            editandoLote = true;
            document.getElementById('lote-form-title').textContent = 'Editando Lote';
            window.scrollTo(0, 0);
        }
        if (target.matches('.btn-delete-lote')) {
            if (confirm('¿Estás seguro de que quieres eliminar este lote?')) {
                await sb.from('lotes').delete().eq('id', id).eq('vendedor_id', currentUser.id);
                await cargarLotes();
                renderizarLotes();
            }
        }
        if (target.matches('.btn-edit-cliente')) {
            const cliente = clientes.find(c => c.id == id);
            document.getElementById('cliente-id').value = cliente.id;
            document.getElementById('cliente-nombre').value = cliente.nombre_apellido;
            document.getElementById('cliente-dni').value = cliente.dni;
            document.getElementById('cliente-telefono').value = cliente.telefono;
            document.getElementById('cliente-telefono-alt').value = cliente.telefono_alternativo;
            document.getElementById('cliente-email').value = cliente.mail;
            document.getElementById('cliente-residencia').value = cliente.lugar_residencia;
            editandoCliente = true;
            document.getElementById('cliente-form-title').textContent = 'Editando Cliente';
            document.querySelector('[data-view="clientes"]').click();
            window.scrollTo(0, 0);
        }
        if (target.matches('.btn-delete-cliente')) {
            if (confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
                await sb.from('clientes').delete().eq('id', id).eq('vendedor_id', currentUser.id);
                await cargarClientes();
                renderizarClientes();
            }
        }
        if (target.matches('.btn-asignar-lote')) {
            clienteParaAsignar = clientes.find(c => c.id == id);
            abrirModal('asignar-lote-modal');
        }
        if (target.matches('.btn-gestionar-pagos')) {
            clienteParaPagos = clientes.find(c => c.id == id);
            
            // CORRECCIÓN: Buscamos todos los comprobantes de este cliente,
            // sin importar si están Pendientes o Aprobados, para tener la lista completa
            const { data: comprobantesCliente, error: compError } = await sb.from('comprobantes_subidos').select('*').eq('id_cliente', clienteParaPagos.id);

            if (compError) {
                console.error('Error al cargar comprobantes del cliente:', compError);
                comprobantesAdjuntos = [];
            } else {
                comprobantesAdjuntos = comprobantesCliente || [];
            }
            
            abrirModal('pagos-modal');
        }
        if (target.matches('.btn-edit-pago')) {
            const pago = pagos.find(p => p.id == id);
            editandoPagoId = id;
            document.getElementById('pago-concepto').value = pago.concepto;
            document.getElementById('pago-bolsas').value = String(pago.cantidad_bolsas).replace('.', ',');
            document.getElementById('pago-bolsas').dispatchEvent(new Event('input'));
            document.querySelector('#pago-form button').textContent = 'Actualizar Pago';
        }
        if (target.matches('.btn-imprimir-recibo')) {
            const pago = pagos.find(p => p.id == id);
            const cliente = clientes.find(c => c.id === pago.id_cliente);
            const lote = lotes.find(l => l.id === cliente.id_lote_asignado);
            imprimirRecibo(pago, cliente, lote);
        }
        if (target.matches('.close-modal-button')) {
            cerrarModales();
        }

        // --- MANEJO DE EVENTOS DE COMPROBANTES ---

        if (target.matches('.btn-ver-comprobante')) {
            const comprobanteId = target.dataset.id;
            comprobanteParaEditar = comprobantesPendientes.find(c => c.id == comprobanteId);
            
            if (!comprobanteParaEditar) return alert('Comprobante no encontrado.');

            // CORRECCIÓN: Llama a la nueva función de Netlify para obtener una URL segura
            try {
                const response = await fetch('/.netlify/functions/generate-signed-url', {
                    method: 'POST',
                    body: JSON.stringify({ filePath: comprobanteParaEditar.url_comprobante.split('/storage/v1/object/public/')[1] })
                });

                if (!response.ok) {
                    throw new Error('La función de Netlify devolvió un error: ' + response.statusText);
                }

                const data = await response.json();
                const signedUrl = data.signedUrl;

                document.getElementById('comprobante-viewer-content').innerHTML = comprobanteParaEditar.url_comprobante.endsWith('.pdf')
                    ? `<embed src="${signedUrl}" type="application/pdf" width="100%" height="500px">`
                    : `<img src="${signedUrl}" alt="Comprobante de Pago" style="max-width: 100%; height: auto;">`;
                
                document.getElementById('btn-editar-info-comprobante').dataset.id = comprobanteParaEditar.id;
                document.getElementById('btn-editar-info-comprobante').dataset.mesPago = comprobanteParaEditar.mes_pago;
                
                abrirModal('comprobante-viewer-modal');
            } catch (error) {
                console.error('Error al obtener URL firmada:', error);
                return alert('Hubo un error al obtener el comprobante.');
            }
        }

        // CORRECCIÓN: Ahora la validación de si tiene lote asignado es más precisa.
        if (target.matches('.btn-aprobar-comprobante')) {
            const comprobanteId = target.dataset.id;
            
            const comprobante = comprobantesPendientes.find(c => c.id == comprobanteId);
            if (!comprobante) return alert('Comprobante no encontrado.');

            if (!comprobante.clientes.id_lote_asignado) return alert('El cliente no tiene un lote asignado. No se puede aprobar el pago.');

            // Actualizamos el estado del comprobante en la base de datos
            const { error } = await sb.from('comprobantes_subidos').update({ estado_verificacion: 'Aprobado' }).eq('id', comprobanteId);

            if (error) {
                console.error('Error al aprobar el comprobante:', error);
                return alert('Hubo un error al aprobar el comprobante.');
            }
            
            // Eliminamos el comprobante del array local y volvemos a renderizar
            comprobantesPendientes = comprobantesPendientes.filter(c => c.id !== comprobanteId);
            renderizarComprobantes();
            
            alert('Comprobante aprobado y listo para adjuntar en la gestión de pagos.');
        }

        // CORRECCIÓN: El botón Eliminar ya tiene la lógica para recargar y renderizar, asegurando que se elimine correctamente de la vista.
        if (target.matches('.btn-eliminar-comprobante')) {
            const comprobanteId = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este comprobante?')) {
                const { error } = await sb.from('comprobantes_subidos').delete().eq('id', comprobanteId);
                if (error) {
                    console.error('Error al eliminar el comprobante:', error);
                    return alert('Hubo un error al eliminar el comprobante.');
                }
                
                // Eliminamos el comprobante del array local y volvemos a renderizar
                comprobantesPendientes = comprobantesPendientes.filter(c => c.id !== comprobanteId);
                renderizarComprobantes();

                alert('Comprobante eliminado con éxito.');
            }
        }
        
        if (target.matches('.btn-ver-comprobante-historial')) {
            const comprobanteId = target.dataset.comprobanteId;
            const comprobante = comprobantesPendientes.find(c => c.id == comprobanteId);

            if (!comprobante) return alert('Comprobante no encontrado en los pendientes. Si se necesita ver, se debe buscar en la base de datos de comprobantes.');

            document.getElementById('comprobante-viewer-content').innerHTML = comprobante.url_comprobante.endsWith('.pdf')
                ? `<embed src="${comprobante.url_comprobante}" type="application/pdf" width="100%" height="500px">`
                : `<img src="${comprobante.url_comprobante}" alt="Comprobante de Pago" style="max-width: 100%; height: auto;">`;
            
            abrirModal('comprobante-viewer-modal');
        }
        
    });

    // --- MANEJO DE MODALES ---
    function abrirModal(idModal) {
        modalContainer.classList.remove('hidden');
        modals.forEach(m => m.classList.add('hidden'));
        document.getElementById(idModal).classList.remove('hidden');
        if (idModal === 'asignar-lote-modal') {
            document.getElementById('asignar-cliente-nombre').textContent = clienteParaAsignar.nombre_apellido;
            const selectLotes = document.getElementById('select-lote-disponible');
            const lotesDisponibles = lotes.filter(l => l.estado === 'Disponible');
            selectLotes.innerHTML = lotesDisponibles.length ? lotesDisponibles.map(l => `<option value="${l.id}">Manzana ${l.numero_manzana} - Lote ${l.numero_lote}</option>`).join('') : '<option value="">No hay lotes disponibles</option>';
        }
        if (idModal === 'pagos-modal') {
            renderizarInfoPagos();
        }
        if (idModal === 'edit-comprobante-modal') {
            document.getElementById('edit-comprobante-mes-pago').value = comprobanteParaEditar.mes_pago;
        }
    }

    document.getElementById('btn-editar-info-comprobante').addEventListener('click', () => {
        cerrarModales();
        abrirModal('edit-comprobante-modal');
    });

    document.getElementById('edit-comprobante-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nuevoMes = document.getElementById('edit-comprobante-mes-pago').value;
        const comprobanteId = comprobanteParaEditar.id;
        
        const { error } = await sb.from('comprobantes_subidos').update({ mes_pago: nuevoMes }).eq('id', comprobanteId);
        
        if (error) {
            console.error("Error al actualizar comprobante:", error);
            return alert("Hubo un error al actualizar el comprobante.");
        }
        
        alert("Información del comprobante actualizada con éxito.");
        await cargarComprobantesPendientes();
        renderizarComprobantes();
        cerrarModales();
    });

    function cerrarModales() {
        modalContainer.classList.add('hidden');
        modals.forEach(m => m.classList.add('hidden'));
        resetearFormularioPagos();
    }
    
    function resetearFormularioPagos() {
        document.getElementById('pago-form').reset();
        document.getElementById('pago-monto-calculado').textContent = formatARS(0);
        document.querySelector('#pago-form button').textContent = 'Registrar Pago';
        editandoPagoId = null;
    }

    document.getElementById('asignar-lote-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const idLote = document.getElementById('select-lote-disponible').value;
        if (!idLote) return;
        await sb.from('clientes').update({ id_lote_asignado: idLote }).eq('id', clienteParaAsignar.id);
        await sb.from('lotes').update({ estado: 'Vendido' }).eq('id', idLote);
        alert('Lote asignado con éxito');
        cerrarModales();
        await cargarDatos();
    });
    
    document.getElementById('pago-bolsas').addEventListener('input', (e) => {
        const bolsas = parseFlexibleFloat(e.target.value);
        const monto = bolsas * precioCemento;
        document.getElementById('pago-monto-calculado').textContent = formatARS(monto);
    });

    // NUEVO: Lógica para registrar un pago y adjuntar un comprobante
    document.getElementById('pago-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const idComprobanteAdjunto = document.getElementById('select-comprobante-disponible').value;
        const concepto = document.getElementById('pago-concepto').value;
        const cantidadBolsas = parseFlexibleFloat(document.getElementById('pago-bolsas').value);
        
        if (idComprobanteAdjunto && concepto.indexOf(`(Comprobante`) === -1) {
            const comprobante = comprobantesAdjuntos.find(c => c.id == idComprobanteAdjunto);
            if (comprobante) {
                // Si se adjunta un comprobante, ajustamos el concepto
                document.getElementById('pago-concepto').value = `${concepto} (Comprobante ${comprobante.mes_pago})`;
            }
        }
        
        const pagoData = {
            id_cliente: clienteParaPagos.id,
            id_lote: clienteParaPagos.id_lote_asignado,
            concepto: document.getElementById('pago-concepto').value,
            cantidad_bolsas: cantidadBolsas,
            monto_usd_momento: parseFlexibleFloat(document.getElementById('pago-monto-calculado').textContent.replace(/[$. ARS]/g, '').trim()),
            precio_cemento_momento: precioCemento,
            vendedor_id: currentUser.id,
            id_comprobante: idComprobanteAdjunto || null
        };
        
        const { error } = editandoPagoId ? await sb.from('pagos').update(pagoData).eq('id', editandoPagoId).eq('vendedor_id', currentUser.id) : await sb.from('pagos').insert([pagoData]);
        if (error) return alert('Error al procesar el pago: ' + error.message);
        
        // Si el pago se registró con éxito y tenía un comprobante adjunto, lo marcamos como verificado
        if (idComprobanteAdjunto) {
            await sb.from('comprobantes_subidos').update({ estado_verificacion: 'Verificado' }).eq('id', idComprobanteAdjunto);
        }
        
        alert(editandoPagoId ? '¡Pago actualizado con éxito!' : '¡Pago registrado con éxito!');
        resetearFormularioPagos();
        await cargarPagos();
        await cargarClientes();
        await cargarComprobantesPendientes();
        renderizarInfoPagos();
        renderizarClientes();
        renderizarComprobantes();
    });

    // CORRECCIÓN: La función renderizarInfoPagos ahora recarga la lista de comprobantes aprobados para garantizar la sincronización de datos.
    async function renderizarInfoPagos() {
        const lote = lotes.find(l => l.id === clienteParaPagos.id_lote_asignado);
        const pagosCliente = pagos.filter(p => p.id_cliente === clienteParaPagos.id);
        const bolsasPagadas = pagosCliente.reduce((sum, p) => sum + (p.cantidad_bolsas || 0), 0);
        const bolsasRestantes = Math.max(0, (lote.cantidad_bolsas_cemento || 0) - bolsasPagadas);
        const deudaActualARS = bolsasRestantes * precioCemento;
        
        document.getElementById('pago-info-cliente').innerHTML = `<p><strong>Cliente:</strong> ${clienteParaPagos.nombre_apellido}</p>`;
        document.getElementById('pago-info-lote').innerHTML = `
            <p><strong>Deuda Total:</strong> ${String(lote.cantidad_bolsas_cemento || 0).replace('.',',')} bolsas.</p>
            <p><strong>Deuda Restante:</strong> ${bolsasRestantes.toFixed(2).replace('.', ',')} bolsas (~${formatARS(deudaActualARS)})</p>`;
        
        // RE-CORRECCIÓN: Buscamos los comprobantes aprobados directamente de la base de datos
        // para garantizar que la lista esté siempre actualizada.
        const { data: comprobantesAprobados, error: compAprobadosError } = await sb.from('comprobantes_subidos').select('*').eq('id_cliente', clienteParaPagos.id).eq('estado_verificacion', 'Aprobado');

        if (compAprobadosError) {
             console.error('Error al cargar comprobantes aprobados:', compAprobadosError);
             comprobantesAdjuntos = [];
        } else {
             comprobantesAdjuntos = comprobantesAprobados || [];
        }
        
        const selectComprobantes = document.getElementById('select-comprobante-disponible');
        selectComprobantes.innerHTML = '<option value="">-- No adjuntar --</option>' + comprobantesAdjuntos.map(c => `<option value="${c.id}">Comprobante de ${c.mes_pago} (${new Date(c.created_at).toLocaleDateString()})</option>`).join('');
        
        const historialContainer = document.getElementById('pagos-historial');
        historialContainer.innerHTML = pagosCliente.length ? '' : '<p>No hay pagos registrados.</p>';
        pagosCliente.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(pago => {
            const comprobanteBtn = pago.id_comprobante ? `<button class="btn-ver-comprobante-historial" data-comprobante-id="${pago.id_comprobante}">Ver Comprobante</button>` : '';

            historialContainer.innerHTML += `
                <div class="pago-item">
                    <span>${new Date(pago.created_at).toLocaleDateString()}</span>
                    <span>${pago.concepto || 'Pago'}</span>
                    <span>${String(pago.cantidad_bolsas).replace('.',',')} bolsas</span>
                    <span class="monto">${formatARS(pago.monto_usd_momento)}</span>
                    <div class="card-actions">
                        ${comprobanteBtn}
                        <button class="btn-edit-pago" data-id="${pago.id}">Editar</button>
                        <button class="btn-imprimir-recibo" data-id="${pago.id}">Imprimir</button>
                    </div>
                </div>`;
        });
    }

    document.getElementById('ver-comprobante-adjuntar').addEventListener('click', async () => {
        const idComprobante = document.getElementById('select-comprobante-disponible').value;
        if (!idComprobante) {
            return alert('Selecciona un comprobante para ver.');
        }

        const comprobante = comprobantesAdjuntos.find(c => c.id == idComprobante);
        if (!comprobante) {
            return alert('Comprobante no encontrado.');
        }
        
        try {
            const response = await fetch('/.netlify/functions/generate-signed-url', {
                method: 'POST',
                body: JSON.stringify({ filePath: comprobante.url_comprobante.split('/storage/v1/object/public/')[1] })
            });

            if (!response.ok) {
                throw new Error('La función de Netlify devolvió un error: ' + response.statusText);
            }

            const data = await response.json();
            const signedUrl = data.signedUrl;

            document.getElementById('comprobante-viewer-content').innerHTML = comprobante.url_comprobante.endsWith('.pdf')
                ? `<embed src="${signedUrl}" type="application/pdf" width="100%" height="500px">`
                : `<img src="${signedUrl}" alt="Comprobante de Pago" style="max-width: 100%; height: auto;">`;
            
            abrirModal('comprobante-viewer-modal');
        } catch (error) {
            console.error('Error al obtener URL firmada:', error);
            return alert('Hubo un error al obtener el comprobante.');
        }
    });

    function imprimirRecibo(pago, cliente, lote) {
        const contenidoRecibo = `
            <html><head><title>Recibo de Pago</title>
            <style>
                body { font-family: monospace; padding: 20px; } .recibo { border: 1px solid #000; padding: 20px; max-width: 400px; margin: auto; } h2 { text-align: center; } p { margin: 10px 0; }
            </style></head><body>
            <div class="recibo"><h2>RECIBO DE PAGO</h2><hr>
                <p><strong>Fecha:</strong> ${new Date(pago.created_at).toLocaleDateString()}</p><hr>
                <p><strong>Cliente:</strong> ${cliente.nombre_apellido}</p>
                <p><strong>DNI:</strong> ${cliente.dni}</p>
                <p><strong>Lote:</strong> Manzana ${lote.numero_manzana} - Lote ${lote.numero_lote}</p><hr>
                <h3>Detalle del Pago</h3>
                <p><strong>Concepto:</strong> ${pago.concepto || 'Pago de cuota'}</p>
                <p><strong>Abonado:</strong> ${String(pago.cantidad_bolsas).replace('.',',')} bolsas de cemento</p>
                <p><strong>Monto Pagado:</strong> ${formatARS(pago.monto_usd_momento)}</p>
                <p><em>(Valor cemento al momento del pago: ${formatARS(pago.precio_cemento_momento)})</em></p>
            </div><script>window.print();</script></body></html>`;
        const ventana = window.open('', '_blank');
        ventana.document.write(contenidoRecibo);
        ventana.document.close();
    }
    
    document.getElementById('cliente-search').addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase();
        renderizarClientes(clientes.filter(c => (c.dni || '').toLowerCase().includes(busqueda) || (c.nombre_apellido || '').toLowerCase().includes(busqueda)));
    });

    // MACHETE: ACÁ EMPIEZA MI NUEVA FUNCIÓN DE REPORTES
    const openReportModalButton = document.getElementById('open-report-modal-button');
    const reportFiltersForm = document.getElementById('report-filters-form');
    
    openReportModalButton.addEventListener('click', () => {
        document.getElementById('report-filters-form').reset();
        popularClientesParaReporte();
        abrirModal('report-modal');
    });

    reportFiltersForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Generando...';

        const idCliente = document.getElementById('report-client-select').value;
        const fechaInicio = document.getElementById('report-start-date').value;
        const fechaFin = document.getElementById('report-end-date').value;

        try {
            const params = {};
            if (idCliente !== 'todos') params.p_id_cliente = idCliente;
            if (fechaInicio) params.p_fecha_inicio = `${fechaInicio}T00:00:00`;
            if (fechaFin) params.p_fecha_fin = `${fechaFin}T23:59:59`;

            const { data, error } = await sb.rpc('get_reporte_pagos', params);

            if (error) throw error;
            if (data.length === 0) {
                alert('No se encontraron ventas con los filtros seleccionados.');
                return;
            }
            
            exportToCSV(data);
            cerrarModales();

        } catch (err) { 
            alert(`Error al generar el reporte: Revisa que las relaciones (Foreign Keys) estén bien creadas y la función SQL exista.`);
            console.error(err);
        } finally {
            button.disabled = false;
            button.textContent = 'Generar y Descargar CSV';
        }
    });

    function popularClientesParaReporte() {
        const select = document.getElementById('report-client-select');
        select.length = 1;
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id;
            option.textContent = cliente.nombre_apellido;
            select.appendChild(option);
        });
    }

    function exportToCSV(data) {
        const separador = ';';
        const headers = ["Fecha", "Cliente", "Manzana", "Lote", "Concepto", "Cantidad_Bolsas", "Monto_ARS"];
        
        let csvContent = headers.join(separador) + "\n";
        data.forEach(pago => {
            const fila = [
                new Date(pago.created_at).toLocaleDateString('es-AR'),
                pago.cliente_nombre ? pago.cliente_nombre.replace(/;/g, ',') : 'N/A',
                pago.lote_manzana || '',
                pago.lote_numero || '',
                pago.concepto ? pago.concepto.replace(/;/g, ',') : '',
                String(pago.cantidad_bolsas || 0).replace('.', ','),
                String(pago.monto_usd_momento || 0).replace('.', ',')
            ];
            csvContent += fila.join(separador) + "\n";
        });

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `reporte_ventas_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});