const tbody = document.getElementById('tbody');
const dlg = document.getElementById('dlg');
const frm = document.getElementById('frm');
const buscar = document.getElementById('buscar');
const estado = document.getElementById('estado');
let editId = null;

function esc(t=''){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function api(url, options={}){
  const r=await fetch(url,options); const data=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/login.html';throw new Error('Sesión vencida');}
  if(!r.ok) throw new Error(data.error||'Error de solicitud'); return data;
}
async function cargar(){
  const q=new URLSearchParams(); if(estado.value!=='Todos') q.set('estado',estado.value); if(buscar.value.trim()) q.set('buscar',buscar.value.trim());
  const rows=await api('/api/estudiantes?'+q.toString());
  tbody.innerHTML=rows.map(x=>`<tr><td>${esc(x.nombre)}<br><small>${esc(x.cedula)}</small></td><td>${esc(x.programa)}</td><td>${esc(x.etapa)}</td><td><span class="tag ${x.estado==='Retraso'?'retraso':x.estado==='Completado'?'completado':''}">${esc(x.estado)}</span></td><td><button class="btn" onclick="editar(${x.id})">Editar</button> <button class="btn" onclick="eliminar(${x.id}, '${esc(x.nombre).replace(/'/g,"\\'")}')">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="5">No hay registros.</td></tr>';
  const k=await api('/api/kpis'); document.getElementById('kpiActivos').textContent=k.activos;document.getElementById('kpiRetraso').textContent=k.retraso;
}

document.getElementById('btnRegistrar').onclick=()=>{editId=null;frm.reset();document.getElementById('formTitle').textContent='Registrar estudiante';dlg.showModal();};
document.getElementById('btnCancelar').onclick=()=>dlg.close();
frm.addEventListener('submit',async e=>{e.preventDefault();const payload={nombre:document.getElementById('nombre').value,cedula:document.getElementById('cedula').value,programa:document.getElementById('programa').value,etapa:document.getElementById('etapa').value,estado:document.getElementById('nuevoEstado').value};try{if(editId) await api('/api/estudiantes/'+editId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});else await api('/api/estudiantes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});dlg.close();await cargar();alert(editId?'Registro actualizado correctamente.':'Registro creado correctamente.');}catch(err){alert(err.message);}});
window.editar=async id=>{const x=await api('/api/estudiantes/'+id);editId=id;document.getElementById('formTitle').textContent='Editar estudiante';nombre.value=x.nombre;cedula.value=x.cedula;programa.value=x.programa;etapa.value=x.etapa;nuevoEstado.value=x.estado;dlg.showModal();};
window.eliminar=async(id,nombre)=>{if(!confirm(`¿Eliminar a ${nombre}?`))return;try{await api('/api/estudiantes/'+id,{method:'DELETE'});await cargar();alert('Registro eliminado correctamente.');}catch(e){alert(e.message);}};
[buscar,estado].forEach(el=>el.addEventListener(el===buscar?'input':'change',cargar));
document.querySelectorAll('[data-estado]').forEach(b=>b.addEventListener('click',()=>{estado.value=b.dataset.estado;cargar();}));
document.getElementById('btnResaltar').onclick=()=>document.querySelectorAll('.tag.retraso').forEach(x=>x.closest('tr').classList.toggle('resaltado'));
document.getElementById('btnExportar').onclick=async()=>{const data=await api('/api/estudiantes');const csv=['Nombre,Cedula,Programa,Etapa,Estado',...data.map(x=>[x.nombre,x.cedula,x.programa,x.etapa,x.estado].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='reporte_estudiantes.csv';a.click();};
window.addEventListener('scroll',()=>document.getElementById('scrollMsg').classList.toggle('visible',scrollY>250));
(async()=>{try{const s=await api('/api/session');document.getElementById('userLabel').textContent=`Usuario: ${s.user.usuario} (${s.user.rol})`;await cargar();}catch(e){}})();
