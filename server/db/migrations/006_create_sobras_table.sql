-- Create the sobras table used by the SobraUsuario entity on the frontend.
-- The existing sobras_usuario table has a different structure (usuario_id/minutos)
-- and is used by a separate endpoint (/api/usuarios/:id/sobras).

CREATE TABLE IF NOT EXISTS sobras (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(255) NOT NULL,
  empreendimento_id INTEGER REFERENCES empreendimentos(id) ON DELETE CASCADE,
  horas_sobra NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sobras_empreendimento_idx ON sobras(empreendimento_id);
CREATE INDEX IF NOT EXISTS sobras_usuario_idx ON sobras(usuario);
