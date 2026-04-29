const bcrypt = require('bcryptjs');
const { createUser } = require('../models/users');

async function main() {
  const email = 'dev@interativa.local';
  const password = 'Dev@1234';
  const password_hash = await bcrypt.hash(password, 10);
  const user = await createUser({
    email,
    name: 'Dev Teste',
    password_hash,
    role: 'admin',
  });
  console.log('Usuário dev criado:', user);
  console.log('Login:', email);
  console.log('Senha:', password);
}

main().catch(err => {
  console.error('Erro ao criar usuário dev:', err);
  process.exit(1);
});
