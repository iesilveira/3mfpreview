const form=document.querySelector('#setup'),notice=document.querySelector('#notice');
const login=document.querySelector('#login');
function message(text,error=false){notice.textContent=text;notice.classList.toggle('error',error);}
async function request(url,options={}){
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
  let value={};
  try{value=await response.json();}catch{}
  if(!response.ok){
    const suffix=typeof value.code==='string'&&/^[A-Z0-9_]+$/.test(value.code)?` [${value.code}]`:'';
    throw new Error((typeof value.error==='string'?value.error:'Não foi possível consultar a instalação.')+suffix);
  }
  return value;
}
async function load(){
  try{
    const state=await request('/api/installation/status');
    if(state.installed){
      form.hidden=true;login.hidden=false;
      message('O administrador já está cadastrado. A instalação está encerrada. Entre com seu e-mail e senha.');
      return;
    }
    if(!state.keyConfigured){
      message('Configure INSTALLATION_KEY nas variáveis da aplicação da Hostinger e reinicie/republique. Use a chave exibida pelo atualizador no seu computador.',true);
      return;
    }
    if(!state.canInstall){message('A instalação está indisponível. Consulte o diagnóstico do servidor.',true);return;}
    message('Conexão verificada. Preencha os campos para concluir a instalação.');
    form.hidden=false;form.elements.key.focus();
  }catch(error){message(error.message,true);}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=new FormData(form),button=form.querySelector('button');
  if(data.get('password')!==data.get('confirmPassword')){
    message('As senhas não coincidem.',true);return;
  }
  button.disabled=true;message('Preparando o banco e cadastrando o administrador. Aguarde…');
  try{
    await request('/api/installation',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:data.get('key'),email:data.get('email'),password:data.get('password'),
        confirmPassword:data.get('confirmPassword'),confirmEmpty:data.get('confirmEmpty')==='on'})});
    form.reset();form.hidden=true;login.hidden=false;login.focus();
    message('Administrador cadastrado. Clique em “Ir para o login” e entre com o e-mail e a senha que acabou de escolher.');
  }catch(error){message(error.message,true);}
  finally{button.disabled=false;}
});
load();
