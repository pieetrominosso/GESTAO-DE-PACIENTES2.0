// ============================================
// API CRUD (crudcrud.com)
// ============================================
// Cada "endpoint" do crudcrud.com tem uma chave única (32 caracteres) que você
// pega em https://crudcrud.com. A chave fica salva no localStorage do navegador.
// Atenção (plano gratuito): o endpoint expira em ~24h e aceita ~100 requisições.

const CRUDCRUD_BASE = "https://crudcrud.com/api";
const RECURSO = "pacientes";
const STORAGE_KEY = "crudcrud_endpoint_key";

let pacientesEmMemoria = [];
let filtroAtual = 'todos';
let termoPesquisa = '';
let confirmCallback = null;

// ---------- Configuração do endpoint ----------

function obterChave() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
}

function salvarChave(chave) {
    try { localStorage.setItem(STORAGE_KEY, chave); } catch (e) { /* ignora */ }
}

function extrairChave(texto) {
    // Aceita a URL completa (https://crudcrud.com/api/abc...) ou só a chave
    const match = (texto || '').match(/[a-f0-9]{32}/i);
    return match ? match[0].toLowerCase() : '';
}

function urlRecurso(id) {
    const chave = obterChave();
    if (!chave) throw new Error('SEM_CHAVE');
    return `${CRUDCRUD_BASE}/${chave}/${RECURSO}${id ? '/' + encodeURIComponent(id) : ''}`;
}

// ---------- Cliente HTTP ----------

async function apiFetch(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
    });

    if (!resposta.ok) {
        const erro = new Error(`HTTP ${resposta.status}`);
        erro.status = resposta.status;
        throw erro;
    }

    // PUT e DELETE no crudcrud retornam corpo vazio
    const texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
}

function tratarErroApi(erro, mensagemPadrao) {
    console.error(mensagemPadrao, erro);
    if (erro.message === 'SEM_CHAVE') {
        mostrarToast('🔗 Configure o endpoint da API primeiro.', 'error');
        abrirModalConfig();
    } else if (erro.status === 404) {
        mostrarToast('❌ Endpoint não encontrado ou expirado. Gere um novo no crudcrud.com.', 'error');
        abrirModalConfig();
    } else if (erro.status === 429) {
        mostrarToast('❌ Limite de requisições do crudcrud atingido.', 'error');
    } else {
        mostrarToast(mensagemPadrao, 'error');
    }
}

// ============================================
// OPERAÇÕES DA API (CRUD)
// ============================================

// Cria (POST) ou atualiza (PUT) conforme existir _id
async function salvarNoBanco(paciente) {
    const { _id, id, ...dados } = paciente; // o servidor gera o _id; ele não vai no corpo
    if (_id) {
        await apiFetch(urlRecurso(_id), { method: 'PUT', body: JSON.stringify(dados) });
        return { ...dados, _id };
    }
    return apiFetch(urlRecurso(), { method: 'POST', body: JSON.stringify(dados) });
}

async function excluirDoBanco(_id) {
    await apiFetch(urlRecurso(_id), { method: 'DELETE' });
}

async function carregarTodosPacientes() {
    if (!obterChave()) {
        pacientesEmMemoria = [];
        atualizarLista();
        atualizarDashboard();
        return;
    }
    try {
        const lista = await apiFetch(urlRecurso());
        // Mantém o campo "id" usado pela interface, apontando para o _id do servidor
        pacientesEmMemoria = (lista || []).map(p => ({ ...p, id: p._id }));
        atualizarLista();
        atualizarDashboard();
    } catch (erro) {
        tratarErroApi(erro, '❌ Erro ao carregar pacientes da API');
    }
}

async function limparBancoDeDados() {
    // O crudcrud não tem "apagar tudo": exclui um por um
    const lista = await apiFetch(urlRecurso());
    for (const p of (lista || [])) {
        await excluirDoBanco(p._id);
    }
}

// ============================================
// LÓGICA DE NEGÓCIOS
// ============================================

function calcularProximaVisita(ultimaVisita, periodicidade) {
    if (!ultimaVisita) return null;
    const data = new Date(ultimaVisita);
    data.setMonth(data.getMonth() + parseInt(periodicidade));
    return data.toISOString().split('T')[0];
}

function calcularStatus(proximaVisita) {
    if (!proximaVisita) return 'indefinido';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataProxima = new Date(proximaVisita);
    dataProxima.setHours(0, 0, 0, 0);
    
    const diffDias = Math.ceil((dataProxima - hoje) / (1000 * 60 * 60 * 24));
    
    if (diffDias < 0) return 'atrasado';
    if (diffDias <= 30) return 'proximo';
    return 'dia';
}

function formatarDataBR(dataIso) {
    if (!dataIso) return '-';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// AÇÕES DA INTERFACE (CRUD)
// ============================================

async function salvarPacienteSubmit(event) {
    event.preventDefault();
    
    const idAtual = document.getElementById('pacienteId').value;
    const ehEdicao = !!idAtual;
    
    const paciente = {
        _id: ehEdicao ? idAtual : undefined,
        nome: document.getElementById('nome').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        ultimaVisita: document.getElementById('ultimaVisita').value,
        periodicidade: document.getElementById('periodicidade').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        dataCadastro: ehEdicao ? pacientesEmMemoria.find(p => p.id === idAtual).dataCadastro : new Date().toISOString()
    };

    paciente.proximaVisita = calcularProximaVisita(paciente.ultimaVisita, paciente.periodicidade);

    try {
        await salvarNoBanco(paciente); 
        await carregarTodosPacientes(); 
        fecharModalPaciente();
        mostrarToast(ehEdicao ? '✅ Atualizado com sucesso!' : '✅ Cadastrado com sucesso!', 'success');
    } catch (erro) {
        tratarErroApi(erro, '❌ Erro ao salvar na API');
    }
}

function editarPaciente(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;
    
    document.getElementById('modalTitle').textContent = '✏️ Editar Paciente';
    document.getElementById('pacienteId').value = paciente.id;
    
    document.getElementById('nome').value = paciente.nome;
    document.getElementById('telefone').value = paciente.telefone || '';
    document.getElementById('ultimaVisita').value = paciente.ultimaVisita;
    document.getElementById('periodicidade').value = paciente.periodicidade;
    document.getElementById('observacoes').value = paciente.observacoes || '';
    
    document.getElementById('modalPaciente').style.display = 'block';
}

function confirmarExcluir(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;
    
    document.getElementById('confirmMessage').innerHTML = `Tem certeza que deseja excluir <strong>${escapeHtml(paciente.nome)}</strong>?<br><br>Esta ação removerá o paciente permanentemente da API e não poderá ser desfeita.`;
    
    confirmCallback = async () => {
        try {
            await excluirDoBanco(id); 
            await carregarTodosPacientes();
            mostrarToast('🗑️ Paciente excluído permanentemente!', 'info');
        } catch (e) {
            tratarErroApi(e, '❌ Erro ao excluir');
        }
    };
    
    document.getElementById('modalConfirm').style.display = 'block';
}

function visualizarPaciente(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;

    const div = document.getElementById('dadosVisuais');
    div.innerHTML = `
        <div class="full-width">
            <strong>Nome Completo</strong>
            <p>${escapeHtml(paciente.nome)}</p>
        </div>
        <div class="full-width">
            <strong>Telefone</strong>
            <p>${escapeHtml(paciente.telefone) || 'Não informado'}</p>
        </div>
        <div>
            <strong>Última Visita</strong>
            <p>${formatarDataBR(paciente.ultimaVisita)}</p>
        </div>
        <div>
            <strong>Próxima Visita</strong>
            <p>${formatarDataBR(paciente.proximaVisita)}</p>
        </div>
        <div class="full-width">
            <strong>Observações Médicas</strong>
            <p>${escapeHtml(paciente.observacoes) || 'Nenhuma observação cadastrada.'}</p>
        </div>
        <div class="full-width">
            <strong>Data de Cadastro no Sistema</strong>
            <p>${formatarDataBR(paciente.dataCadastro?.split('T')[0])}</p>
        </div>
    `;
    
    document.getElementById('modalVisualizar').style.display = 'block';
}

// ============================================
// ATUALIZAÇÃO DA TELA
// ============================================

function atualizarLista() {
    const tbody = document.getElementById('pacientesTableBody');
    
    let filtrados = pacientesEmMemoria;
    
    if (filtroAtual !== 'todos') {
        filtrados = filtrados.filter(p => calcularStatus(p.proximaVisita) === filtroAtual);
    }
    
    if (termoPesquisa.trim()) {
        const termo = termoPesquisa.toLowerCase().trim();
        filtrados = filtrados.filter(p => 
            (p.nome && p.nome.toLowerCase().includes(termo)) ||
            (p.telefone && p.telefone.includes(termo))
        );
    }
    
    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="emoji">📭</span><h3>Nenhum paciente encontrado</h3></div></td></tr>`;
        return;
    }
    
    let html = '';
    filtrados.forEach(p => {
        const status = calcularStatus(p.proximaVisita);
        let badgeClass = '';
        let badgeText = '';
        
        if(status === 'dia') { badgeClass = 'status-dia-badge'; badgeText = '🟢 Em dia'; }
        else if(status === 'proximo') { badgeClass = 'status-proximo-badge'; badgeText = '🟡 Próximo'; }
        else { badgeClass = 'status-atrasado-badge'; badgeText = '🔴 Atrasado'; }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(p.nome)}</strong></td>
                <td>${escapeHtml(p.telefone) || '-'}</td>
                <td>${formatarDataBR(p.ultimaVisita)}</td>
                <td>${formatarDataBR(p.proximaVisita)}</td>
                <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="acoes">
                        <button class="btn-view" onclick="visualizarPaciente('${p.id}')">👁️ Ver</button>
                        <button class="btn-edit" onclick="editarPaciente('${p.id}')">✏️ Editar</button>
                        <button class="btn-delete" onclick="confirmarExcluir('${p.id}')">🗑️ Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function atualizarDashboard() {
    let vencidos = 0, proximos = 0, emDia = 0;
    
    pacientesEmMemoria.forEach(p => {
        const status = calcularStatus(p.proximaVisita);
        if (status === 'atrasado') vencidos++;
        else if (status === 'proximo') proximos++;
        else if (status === 'dia') emDia++;
    });
    
    document.getElementById('totalPacientes').textContent = pacientesEmMemoria.length;
    document.getElementById('visitasVencidas').textContent = vencidos;
    document.getElementById('visitasProximas').textContent = proximos;
    document.getElementById('pacientesEmDia').textContent = emDia;
}

// ============================================
// BACKUP E RESTAURAÇÃO
// ============================================
// Útil também para migrar os dados quando o endpoint do crudcrud expirar.

function exportarDados() {
    if (pacientesEmMemoria.length === 0) {
        mostrarToast('Não há dados para exportar!', 'error');
        return;
    }
    // Remove os ids do servidor: eles não servem em outro endpoint
    const limpos = pacientesEmMemoria.map(({ _id, id, ...resto }) => resto);
    const dados = JSON.stringify(limpos, null, 2);
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_pacientes_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('📤 Backup gerado com sucesso!', 'success');
}

function importarDados() {
    document.getElementById('fileInput').click();
}

function processarImportacao(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (!Array.isArray(dados)) throw new Error("Formato inválido");
            
            document.getElementById('confirmMessage').innerHTML = `Atenção: A importação irá apagar os dados atuais da API e restaurar os <strong>${dados.length} pacientes</strong> do backup. Isso consome várias requisições do crudcrud. Deseja continuar?`;
            
            confirmCallback = async () => {
                try {
                    mostrarToast('⏳ Restaurando backup...', 'info');
                    await limparBancoDeDados();
                    for (const p of dados) {
                        const { _id, id, ...semIds } = p;
                        await salvarNoBanco(semIds);
                    }
                    await carregarTodosPacientes();
                    mostrarToast('📥 Backup restaurado com sucesso!', 'success');
                } catch (err) {
                    tratarErroApi(err, '❌ Erro ao restaurar na API');
                }
            };
            document.getElementById('modalConfirm').style.display = 'block';

        } catch (error) {
            mostrarToast('❌ Arquivo de backup inválido!', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================
// CONFIGURAÇÃO DA API (modal)
// ============================================

function abrirModalConfig() {
    const chave = obterChave();
    document.getElementById('apiEndpoint').value = chave ? `${CRUDCRUD_BASE}/${chave}` : '';
    document.getElementById('modalConfig').style.display = 'block';
}

function fecharModalConfig() {
    document.getElementById('modalConfig').style.display = 'none';
}

async function salvarConfigSubmit(event) {
    event.preventDefault();
    const chave = extrairChave(document.getElementById('apiEndpoint').value);
    if (!chave) {
        mostrarToast('❌ Endpoint inválido. Cole a URL completa do crudcrud.com.', 'error');
        return;
    }
    salvarChave(chave);
    fecharModalConfig();
    mostrarToast('🔗 Endpoint salvo!', 'success');
    await carregarTodosPacientes();
}

// ============================================
// UTILITÁRIOS E EVENTOS
// ============================================

function mostrarToast(mensagem, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function fecharModalPaciente() {
    document.getElementById('modalPaciente').style.display = 'none';
    document.getElementById('formPaciente').reset();
    document.getElementById('pacienteId').value = '';
}

function fecharModalVisualizar() {
    document.getElementById('modalVisualizar').style.display = 'none';
}

document.getElementById('formPaciente').addEventListener('submit', salvarPacienteSubmit);
document.getElementById('formConfig').addEventListener('submit', salvarConfigSubmit);

document.getElementById('btnNovoPaciente').addEventListener('click', () => {
    document.getElementById('modalTitle').textContent = '📝 Cadastrar Paciente';
    document.getElementById('formPaciente').reset();
    document.getElementById('pacienteId').value = '';
    document.getElementById('modalPaciente').style.display = 'block';
});

document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalPaciente();
        fecharModalVisualizar();
        fecharModalConfig();
        document.getElementById('modalConfirm').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});

document.getElementById('confirmYes').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    document.getElementById('modalConfirm').style.display = 'none';
});

document.getElementById('confirmNo').addEventListener('click', () => {
    document.getElementById('modalConfirm').style.display = 'none';
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    termoPesquisa = e.target.value;
    atualizarLista();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filtroAtual = btn.dataset.filter;
        atualizarLista();
    });
});

window.onload = () => {
    if (!obterChave()) {
        atualizarLista();
        atualizarDashboard();
        abrirModalConfig();
    } else {
        carregarTodosPacientes();
    }
};
